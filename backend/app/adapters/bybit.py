"""Cliente de solo lectura de la API v5 de Bybit.

**Este módulo no puede ejecutar órdenes y nunca podrá.** Solo llama a endpoints
GET de consulta, y la API key con la que se configura es de solo lectura por
decisión de proyecto (ver README, sección Seguridad). No es una limitación
temporal a la espera de "activar el trading": es el diseño.

Sin dependencia HTTP nueva. `urllib` de la biblioteca estándar cubre lo que
hace falta —un GET firmado, con cabeceras, timeout y JSON— y el proyecto ya
tomó la misma decisión en `app/api/auth.py` con HMAC en vez de una librería de
JWT. Un cliente HTTP entero para tres peticiones al día no paga su precio, y
las rutas son síncronas (ver README), así que tampoco hace falta async.

La firma sigue el esquema v5 de Bybit:

    firma = HMAC_SHA256(secret, timestamp + api_key + recv_window + query)

y viaja en `X-BAPI-SIGN`. El `query` firmado tiene que ser **exactamente** la
misma cadena que va en la URL, mismo orden de parámetros incluido: de ahí que
se construya una sola vez y se reutilice para firmar y para pedir.
"""

import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterator

log = logging.getLogger("app.adapters.bybit")

HOST_TESTNET = "https://api-testnet.bybit.com"
HOST_REAL = "https://api.bybit.com"

#: Margen que Bybit da por bueno entre su reloj y el nuestro, en ms.
RECV_WINDOW_MS = 5_000

TIMEOUT_SEGUNDOS = 20

#: Bybit pagina de 100 en 100 como máximo en este endpoint.
LIMITE_POR_PAGINA = 100

#: Bybit no acepta un rango mayor de 7 días en `closed-pnl`, así que las
#: ventanas largas se trocean. Se deja en 7 justos y no en 6 "por si acaso"
#: porque el troceo ya es inclusivo por ambos extremos.
DIAS_POR_VENTANA = 7

#: Cuánto hacia atrás mira la PRIMERA sincronización, cuando todavía no hay
#: marca de agua. Dos años es el máximo que Bybit conserva en este endpoint, y
#: se pide entero a propósito: la primera importación es la única oportunidad
#: de traer el histórico completo. Las siguientes solo miran hacia delante, así
#: que lo que se quede fuera aquí no entra nunca.
DIAS_PRIMERA_SINCRONIZACION = 730

#: Solapamiento que se relee en cada sincronización posterior. Existe porque la
#: marca de agua es una optimización y no la verdad: si una sincronización
#: murió a medias, esta ventana recupera lo que se quedó fuera. Los duplicados
#: que genere los descarta el UNIQUE de `trades.bybit_order_id`.
MARGEN_SOLAPAMIENTO_HORAS = 24

#: Tope de páginas por ventana. Un cursor que no avanza —o una cuenta con una
#: actividad desmedida— no puede dejar la petición girando indefinidamente.
MAX_PAGINAS_POR_VENTANA = 50

#: Instrumentos que no forman parte de la operativa del trader y que no deben
#: llegar al histórico. Confirmado con él: opera pares con margen en USDT
#: (BTCUSDT, ETHUSDT, y los que use en el futuro) y **no usa perpetuos
#: inversos**. Las operaciones `...PERP` que aparecen en la cuenta son ruido
#: ajeno a su actividad, así que se descartan aquí, en el adaptador, y no
#: llegan a procesarse ni a insertarse.
#:
#: Se filtra por lo que se EXCLUYE y no por una lista blanca de sufijos
#: permitidos: el trader dio "BTCUSDT" como ejemplo, no como catálogo cerrado,
#: y una lista blanca dejaría fuera en silencio cualquier par nuevo el día que
#: lo estrene.
SUFIJOS_EXCLUIDOS = ("PERP",)


class BybitError(RuntimeError):
    """Bybit no dio una respuesta utilizable.

    Cubre las tres formas de fallar que importan y que desde fuera se tratan
    igual —no hay datos que sincronizar—: no se pudo contactar, contestó un
    HTTP de error, o contestó 200 con un `retCode` distinto de 0. Nunca se
    devuelve una lista vacía disimulando un fallo: si algo fue mal, esto se
    lanza y la sincronización se detiene con el motivo a la vista.
    """


class BybitNoConfigurado(BybitError):
    """Faltan `BYBIT_API_KEY` o `BYBIT_API_SECRET`."""


# ---------------------------------------------------------------------------
#  Firma y transporte
# ---------------------------------------------------------------------------


def _firma(secret: str, timestamp_ms: int, api_key: str, query: str) -> str:
    payload = f"{timestamp_ms}{api_key}{RECV_WINDOW_MS}{query}"
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def host(testnet: bool) -> str:
    """El host nunca está escrito en la llamada: sale de aquí y solo de aquí."""
    return HOST_TESTNET if testnet else HOST_REAL


def _get(
    ruta: str,
    parametros: dict[str, Any],
    *,
    api_key: str,
    api_secret: str,
    testnet: bool,
    ahora_ms: int | None = None,
) -> dict[str, Any]:
    """Un GET firmado. Devuelve el `result` de Bybit ya desenvuelto."""
    if not api_key or not api_secret:
        raise BybitNoConfigurado(
            "Faltan BYBIT_API_KEY o BYBIT_API_SECRET en el entorno. La "
            "sincronizacion con Bybit necesita una API key de SOLO LECTURA."
        )

    # Se construye una vez y se usa dos: firmar una cadena distinta de la que
    # se envía es el fallo clásico de esta API, y así no puede pasar.
    query = urllib.parse.urlencode(parametros)
    ts = ahora_ms if ahora_ms is not None else int(time.time() * 1000)

    peticion = urllib.request.Request(
        f"{host(testnet)}{ruta}?{query}",
        method="GET",
        headers={
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-TIMESTAMP": str(ts),
            "X-BAPI-RECV-WINDOW": str(RECV_WINDOW_MS),
            "X-BAPI-SIGN": _firma(api_secret, ts, api_key, query),
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_SEGUNDOS) as respuesta:
            cuerpo = json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # El cuerpo de un error de Bybit suele explicar el motivo mejor que el
        # código HTTP (rate limit, firma inválida, IP no autorizada).
        detalle = ""
        try:
            detalle = e.read().decode("utf-8", errors="replace")[:400]
        except Exception:  # noqa: BLE001 - leer el detalle no puede tapar el error real
            pass
        raise BybitError(f"Bybit respondio HTTP {e.code} a {ruta}. {detalle}") from e
    except urllib.error.URLError as e:
        raise BybitError(f"No se pudo contactar con Bybit ({host(testnet)}): {e.reason}") from e
    except json.JSONDecodeError as e:
        raise BybitError(f"Bybit respondio algo que no es JSON en {ruta}.") from e

    # Bybit devuelve 200 con retCode != 0 para casi todos sus errores de
    # negocio, así que un 200 no basta para dar la respuesta por buena.
    if cuerpo.get("retCode") != 0:
        raise BybitError(
            f"Bybit rechazo la peticion a {ruta}: "
            f"retCode={cuerpo.get('retCode')} retMsg={cuerpo.get('retMsg')!r}"
        )

    return cuerpo.get("result") or {}


# ---------------------------------------------------------------------------
#  Historial de operaciones cerradas
# ---------------------------------------------------------------------------


def _ventanas(desde: datetime, hasta: datetime) -> Iterator[tuple[datetime, datetime]]:
    """Trocea [desde, hasta] en tramos que Bybit acepte."""
    from datetime import timedelta

    paso = timedelta(days=DIAS_POR_VENTANA)
    inicio = desde
    while inicio < hasta:
        fin = min(inicio + paso, hasta)
        yield inicio, fin
        inicio = fin


def es_operativa_del_trader(symbol: Any) -> bool:
    """¿Este instrumento forma parte de lo que el trader opera?

    Lo que no lo es no entra en el histórico. No es que "no vincule con ningún
    setup" —eso ya lo resolvería el `setup_id = NULL`—: es que no debería
    figurar en su registro en absoluto, y colarlo falsearía las estadísticas
    de la Fase 3 con operaciones que no son suyas.
    """
    limpio = str(symbol or "").strip().upper()
    if not limpio:
        return False
    return not limpio.endswith(SUFIJOS_EXCLUIDOS)


@dataclass(frozen=True)
class Descarga:
    """Lo que trajo una consulta al historial, ya cribado.

    `excluidas` no es un detalle interno: sin él, alguien que compare el
    dashboard con la interfaz de Bybit vería 201 frente a 228 y no tendría
    forma de saber si falta algo o si se descartó a propósito.
    """

    operaciones: list[dict[str, Any]]
    excluidas: int


def fetch_closed_pnl(
    *,
    api_key: str,
    api_secret: str,
    testnet: bool,
    desde: datetime,
    hasta: datetime,
    category: str = "linear",
) -> Descarga:
    """Todas las posiciones cerradas entre dos fechas, ya paginadas y cribadas.

    Recorre `nextPageCursor` hasta agotarlo y trocea el rango en ventanas de
    `DIAS_POR_VENTANA`, que es el máximo que admite este endpoint. Devuelve
    los diccionarios **crudos** de Bybit: traducirlos es cosa de `a_trade()`,
    y separarlo permite probar la traducción sin red de por medio.

    El descarte de lo que no opera el trader (ver `es_operativa_del_trader`)
    ocurre **aquí dentro** y no en quien llama: así ninguna ruta futura puede
    olvidarse de aplicarlo y acabar metiendo en el histórico operaciones
    ajenas a su actividad.
    """
    filas: list[dict[str, Any]] = []
    excluidas = 0

    for inicio, fin in _ventanas(desde, hasta):
        cursor = ""
        for pagina in range(MAX_PAGINAS_POR_VENTANA):
            parametros: dict[str, Any] = {
                "category": category,
                "startTime": int(inicio.timestamp() * 1000),
                "endTime": int(fin.timestamp() * 1000),
                "limit": LIMITE_POR_PAGINA,
            }
            if cursor:
                parametros["cursor"] = cursor

            resultado = _get(
                "/v5/position/closed-pnl",
                parametros,
                api_key=api_key,
                api_secret=api_secret,
                testnet=testnet,
            )
            for fila in resultado.get("list") or []:
                if es_operativa_del_trader(fila.get("symbol")):
                    filas.append(fila)
                else:
                    excluidas += 1

            cursor = resultado.get("nextPageCursor") or ""
            if not cursor:
                break
        else:
            log.warning(
                "Bybit devolvio mas de %s paginas para la ventana %s..%s; se corta ahi.",
                MAX_PAGINAS_POR_VENTANA,
                inicio,
                fin,
            )

    if excluidas:
        log.info(
            "Descartadas %s operaciones ajenas a la operativa del trader (%s).",
            excluidas,
            ", ".join(SUFIJOS_EXCLUIDOS),
        )

    return Descarga(operaciones=filas, excluidas=excluidas)


# ---------------------------------------------------------------------------
#  Traducción a nuestro modelo
# ---------------------------------------------------------------------------


def _decimal(valor: Any) -> Decimal | None:
    if valor in (None, ""):
        return None
    try:
        return Decimal(str(valor))
    except (InvalidOperation, ValueError):
        return None


def _fecha(ms: Any) -> datetime | None:
    if ms in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=UTC)
    except (ValueError, TypeError, OSError):
        return None


def lado_de_la_posicion(side_de_cierre: str | None) -> str | None:
    """Traduce el `side` de Bybit al lado de la POSICIÓN.

    En `closed-pnl`, `side` es el lado de la orden que **cerró** la posición,
    no el de la posición en sí: una posición larga se cierra vendiendo. Así
    que se invierte. Sin esta inversión todo el histórico entraría con la
    dirección al revés, que es justo el tipo de error que no se nota hasta que
    las estadísticas de la Fase 3 salen absurdas.
    """
    if side_de_cierre is None:
        return None
    normalizado = side_de_cierre.strip().lower()
    if normalizado == "sell":
        return "LONG"
    if normalizado == "buy":
        return "SHORT"
    return None


def a_trade(fila: dict[str, Any]) -> dict[str, Any]:
    """Un resultado de `closed-pnl` traducido a columnas de `trades`.

    Lo que Bybit no da, no se inventa: `fees` y `funding` se quedan a NULL
    porque este endpoint devuelve el PnL ya neto y desglosarlo a ojo
    produciría discrepancias con el extracto real -- la misma razón por la que
    `pnl_net` no es una columna calculada (ver sql/README.md).
    """
    return {
        "bybit_order_id": (fila.get("orderId") or "").strip() or None,
        "bybit_exec_id": (fila.get("execType") or "").strip() or None,
        "symbol": (fila.get("symbol") or "").strip().upper(),
        "side": lado_de_la_posicion(fila.get("side")),
        "entry_price": _decimal(fila.get("avgEntryPrice")),
        "exit_price": _decimal(fila.get("avgExitPrice")),
        "quantity": _decimal(fila.get("qty")),
        "leverage": _decimal(fila.get("leverage")),
        "opened_at": _fecha(fila.get("createdTime")),
        "closed_at": _fecha(fila.get("updatedTime")),
        "pnl_net": _decimal(fila.get("closedPnl")),
        "source": "bybit",
    }
