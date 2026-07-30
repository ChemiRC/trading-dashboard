"""Login con la contraseña compartida."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.auth import DURACION_SEGUNDOS, configuracion_de_auth, crear_token, password_correcta
from app.api.deps import Config

router = APIRouter(prefix="/auth", tags=["autenticacion"])


class LoginRequest(BaseModel):
    model_config = {"extra": "forbid"}

    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    token: str
    expires_in: int = Field(description="Segundos de validez del token.")


@router.post("/login", response_model=LoginResponse, summary="Canjear la contrasena por un token")
def login(body: LoginRequest, settings: Config) -> LoginResponse:
    """Devuelve un token firmado si la contraseña es la correcta.

    El 401 no dice nada más que "contraseña incorrecta": ni si estuvo cerca, ni
    cuántos intentos quedan, ni si el usuario existe —aquí no hay usuarios—.
    Cualquier detalle extra solo le sirve a quien la esté adivinando.
    """
    esperada, secreto = configuracion_de_auth(settings)

    if not password_correcta(body.password, esperada):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Contrasena incorrecta."
        )

    return LoginResponse(token=crear_token(secreto), expires_in=DURACION_SEGUNDOS)
