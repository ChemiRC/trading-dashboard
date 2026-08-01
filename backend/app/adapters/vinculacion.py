"""Emparejar una operación de Bybit con el setup que la anticipó.

Función pura, sin base de datos ni HTTP: recibe la operación y una lista de
setups candidatos, y devuelve cuál (si alguno). Mismo criterio que
`app/scoring/engine.py` -- lo que se puede probar con una tabla de casos se
prueba con una tabla de casos, no levantando medio sistema.

**Puede equivocarse, y está asumido.** Emparejar por símbolo, precio y hora es
una heurística: dos setups del mismo par evaluados con veinte minutos de
diferencia son indistinguibles para esto. Por eso el vínculo se guarda en una
columna editable (`trades.setup_id`) y hay un endpoint para corregirlo a mano
—`PATCH /api/trades/{id}/setup`— en vez de darlo por definitivo. Un vínculo
equivocado se arregla; uno que no se puede tocar, no.
"""

import re
from datetime import timedelta
from decimal import Decimal
from typing import Any

#: Cuánto puede alejarse el precio de entrada real del que el trader anotó al
#: evaluar. Medio punto porcentual: lo bastante ancho para absorber el
#: deslizamiento entre "vi el setup" y "entré", y lo bastante estrecho para no
#: confundir dos setups distintos del mismo par en el mismo día.
TOLERANCIA_PRECIO = Decimal("0.005")

#: Cuánto puede tardar la operación en abrirse después de evaluar el setup.
#: Generoso a propósito: esto es swing trading. El trader evalúa, espera a que
#: el precio llegue a su zona, y entra un día o dos después. Una ventana de
#: dashboard intradía (una o dos horas) dejaría sin vincular la mayoría.
VENTANA_HORAS = 48

#: Sufijos de cotización que se recortan para quedarse con el activo base.
#: En orden de longitud descendente: recortar "USD" antes que "USDT" dejaría
#: "BTCT" a partir de "BTCUSDT".
#:
#: **`PERP` no está aquí a propósito.** El adaptador descarta los perpetuos
#: antes de que lleguen (ver `bybit.SUFIJOS_EXCLUIDOS`), así que recortarlo
#: solo serviría para volver indistinguibles `BTCUSDT` y `BTCPERP` —y colgar
#: un setup de BTCUSDT a una operación que el trader ni siquiera hizo—.
#: Comparación estricta: lo que no es de su operativa no llega hasta aquí.
SUFIJOS_COTIZACION = ("USDT", "USDC", "USD", "EUR")


def normaliza_simbolo(simbolo: str | None) -> str:
    """Reduce un símbolo a su activo base, para poder comparar formatos.

    El trader escribe a mano el símbolo al guardar el setup y no siempre igual
    que Bybit: "BTC", "btc", "BTC/USDT" y "BTCUSDT" son el mismo par. Esto los
    lleva todos a "BTC", que es lo que se compara.

        BTC        -> BTC
        btcusdt    -> BTC
        BTC/USDT   -> BTC
        1000PEPEUSDT -> 1000PEPE

    Recortar el sufijo tiene un límite deliberado: solo se recorta si queda
    algo detrás. "USDT" a secas se queda como "USDT" en vez de convertirse en
    la cadena vacía, que emparejaría con cualquier cosa.
    """
    if not simbolo:
        return ""

    limpio = re.sub(r"[^A-Za-z0-9]", "", simbolo).upper()

    for sufijo in SUFIJOS_COTIZACION:
        if limpio.endswith(sufijo) and len(limpio) > len(sufijo):
            return limpio[: -len(sufijo)]

    return limpio


def precio_compatible(
    precio_real: Decimal | None,
    precio_evaluado: Decimal | None,
    tolerancia: Decimal = TOLERANCIA_PRECIO,
) -> bool:
    """¿Entró al precio que había anotado, con el margen admitido?

    Si falta cualquiera de los dos, la respuesta es NO. No poder comprobar un
    criterio no es lo mismo que cumplirlo: un setup sin precio anotado se
    queda sin vincular y el trader lo empareja a mano, que es preferible a
    colgarle una operación que quizá no era suya.
    """
    if precio_real is None or precio_evaluado is None:
        return False
    if precio_evaluado == 0:
        return False
    return abs(precio_real - precio_evaluado) / abs(precio_evaluado) <= tolerancia


def elegir_setup(
    trade: dict[str, Any],
    candidatos: list[dict[str, Any]],
    *,
    tolerancia: Decimal = TOLERANCIA_PRECIO,
    ventana_horas: int = VENTANA_HORAS,
) -> dict[str, Any] | None:
    """El setup que mejor explica esta operación, o None.

    Los tres criterios se aplican como filtros —hay que cumplirlos todos— y el
    desempate es la cercanía en el tiempo:

    1. **Mismo símbolo**, comparando activos base (ver `normaliza_simbolo`).
    2. **Precio de entrada** dentro de la tolerancia del anotado al evaluar.
    3. **Apertura posterior a la evaluación** y dentro de la ventana. El orden
       importa: un setup evaluado DESPUÉS de abrir la operación no la
       anticipó, así que no la explica por muy cerca que caiga.

    Si quedan varios, gana el evaluado más cerca de la apertura.

    Args:
        trade: ya traducido por `bybit.a_trade()`.
        candidatos: setups que podrían encajar. Quien llama es responsable de
            excluir los que ya tienen operación vinculada -- `trades.setup_id`
            es UNIQUE y reutilizar uno reventaría el INSERT.
    """
    abierta_en = trade.get("opened_at")
    if abierta_en is None:
        return None

    simbolo = normaliza_simbolo(trade.get("symbol"))
    if not simbolo:
        return None

    limite = timedelta(hours=ventana_horas)
    viables = []

    for setup in candidatos:
        evaluado_en = setup.get("evaluated_at")
        if evaluado_en is None:
            continue

        # La operación tiene que abrirse DESPUÉS de evaluar, no antes.
        distancia = abierta_en - evaluado_en
        if distancia < timedelta(0) or distancia > limite:
            continue

        if normaliza_simbolo(setup.get("symbol")) != simbolo:
            continue

        if not precio_compatible(
            trade.get("entry_price"), setup.get("price_at_evaluation"), tolerancia
        ):
            continue

        viables.append((distancia, setup))

    if not viables:
        return None

    # El más cercano en el tiempo a la apertura.
    viables.sort(key=lambda par: par[0])
    return viables[0][1]
