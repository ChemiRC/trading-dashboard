"""Tests del firmado de tokens y la comparación de contraseñas.

Puros: no tocan la base de datos ni levantan la app. El reloj entra por
parámetro (`ahora=`) en vez de esperar treinta días, que es justo lo que
permite probar la caducidad de verdad en lugar de confiar en que funciona.
"""

import pytest

pytest.importorskip("fastapi", reason="requirements.txt no instalado")

from app.api.auth import (  # noqa: E402
    DURACION_SEGUNDOS,
    crear_token,
    password_correcta,
    token_valido,
)

SECRETO = "un-secreto-de-prueba-suficientemente-largo"


def test_un_token_recien_creado_es_valido():
    assert token_valido(crear_token(SECRETO), SECRETO)


def test_un_token_caducado_no_vale():
    token = crear_token(SECRETO, ahora=0)
    assert token_valido(token, SECRETO, ahora=DURACION_SEGUNDOS - 1)
    assert not token_valido(token, SECRETO, ahora=DURACION_SEGUNDOS + 1)


def test_un_token_firmado_con_otro_secreto_no_vale():
    """Cambiar APP_TOKEN_SECRET invalida las sesiones abiertas, a propósito."""
    assert not token_valido(crear_token(SECRETO), "otro-secreto-distinto")


def test_un_payload_manipulado_invalida_la_firma():
    token = crear_token(SECRETO)
    payload, _, firma = token.partition(".")
    assert not token_valido(f"{payload}x.{firma}", SECRETO)


@pytest.mark.parametrize("basura", ["", ".", "sin-punto", "a.b", "a.b.c"])
def test_la_basura_no_revienta_ni_pasa(basura):
    assert not token_valido(basura, SECRETO)


def test_password_correcta_distingue():
    assert password_correcta("hola", "hola")
    assert not password_correcta("hola", "holaa")
    assert not password_correcta("", "hola")
    # Sin ASCII no debe reventar al codificar.
    assert password_correcta("contraseña", "contraseña")
