"""Contraseña compartida y tokens de sesión.

Un solo secreto y un solo nivel de acceso: son dos personas de confianza, no
un producto multiusuario. Sin cuentas, sin roles y sin registro. Supabase Auth
queda para la Fase 6, si el multiusuario llega a existir.

El token se firma con HMAC-SHA256 de la librería estándar en vez de traer una
dependencia de JWT. La construcción es la misma que usa un JWT `HS256` —
`payload.firma`, ambos en base64url— pero recortada a lo que aquí hace falta:
una fecha de caducidad y nada más. No hay algoritmo negociable en el token, que
es de donde vienen la mitad de los fallos históricos de JWT: aquí solo existe
un algoritmo y está escrito en el código, no en el mensaje que manda el cliente.

**Fallo cerrado.** Si `APP_PASSWORD` o `APP_TOKEN_SECRET` no están configuradas,
todo lo protegido responde 503. Un despliegue al que se le olvidó una variable
de entorno se queda inaccesible, nunca abierto de par en par.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time

from fastapi import Depends, HTTPException, Request, status
from typing import Annotated

from app.core import Settings, get_settings

#: 30 días. Es una herramienta personal de un par de personas, no un banco:
#: obligar a teclear la contraseña cada hora solo conseguiría que se apuntase
#: en un post-it. Aun así caduca, para que un token filtrado no valga siempre.
DURACION_SEGUNDOS = 30 * 24 * 3600


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).decode().rstrip("=")


def _de_b64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _firma(payload: str, secreto: str) -> str:
    return _b64(hmac.new(secreto.encode(), payload.encode(), hashlib.sha256).digest())


def crear_token(secreto: str, *, ahora: float | None = None) -> str:
    """Token firmado con su caducidad dentro."""
    expira = int(ahora if ahora is not None else time.time()) + DURACION_SEGUNDOS
    payload = _b64(json.dumps({"exp": expira}, separators=(",", ":")).encode())
    return f"{payload}.{_firma(payload, secreto)}"


def token_valido(token: str, secreto: str, *, ahora: float | None = None) -> bool:
    """Comprueba firma y caducidad. Cualquier anomalía es un token inválido."""
    try:
        payload, firma = token.split(".", 1)
    except ValueError:
        return False

    # Tiempo constante: comparar firmas con `==` filtra por cuánto tarda en
    # fallar cuántos bytes iniciales acertó quien la está adivinando.
    if not hmac.compare_digest(firma, _firma(payload, secreto)):
        return False

    try:
        datos = json.loads(_de_b64(payload))
        expira = int(datos["exp"])
    except (ValueError, KeyError, TypeError):
        return False

    return (ahora if ahora is not None else time.time()) < expira


def password_correcta(intento: str, esperada: str) -> bool:
    """Comparación en tiempo constante, nunca `==`."""
    return secrets.compare_digest(intento.encode(), esperada.encode())


# ---------------------------------------------------------------------------
#  Dependencia
# ---------------------------------------------------------------------------


def configuracion_de_auth(settings: Settings) -> tuple[str, str]:
    if not settings.app_password or not settings.app_token_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La autenticacion no esta configurada: faltan APP_PASSWORD o "
            "APP_TOKEN_SECRET en el entorno. Mientras falten, esta API no "
            "atiende peticiones.",
        )
    return settings.app_password, settings.app_token_secret


def requiere_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Exige `Authorization: Bearer <token>`.

    El 401 es siempre el mismo, falte la cabecera, esté mal formada, mal
    firmada o caducada: decir cuál de las cuatro es ayuda a quien lo está
    intentando y a nadie más. El frontend no necesita distinguirlas — su
    reacción es la misma: borrar el token y volver al login.
    """
    _, secreto = configuracion_de_auth(settings)

    cabecera = request.headers.get("authorization", "")
    esquema, _, token = cabecera.partition(" ")

    if esquema.lower() != "bearer" or not token or not token_valido(token, secreto):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Sesion no valida o caducada. Vuelve a introducir la contrasena.",
            headers={"WWW-Authenticate": "Bearer"},
        )


#: Se aplica a los routers enteros de `/api/*`. `/health` y `/health/db` se
#: quedan fuera a propósito: no exponen ni un dato del trader y son lo que mira
#: el health check de Railway, que no tiene forma de autenticarse.
Protegido = Depends(requiere_token)
