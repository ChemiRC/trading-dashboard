"""Lectura de variables de entorno.

Único sitio del backend que toca `os.environ`. Si algo obligatorio falta, la
aplicación no arranca: es preferible un fallo ruidoso al arrancar que un 500
la primera vez que alguien pulsa "evaluar".
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: backend/ — se calcula desde este fichero y no desde el directorio actual:
#: uvicorn, pytest y el hosting arrancan desde sitios distintos, y un .env
#: "no encontrado" se manifiesta como un error de credenciales que despista.
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Base de datos -------------------------------------------------------
    #: Cadena del pooler de Supabase. Session pooler (5432) o transaction
    #: pooler (6543): ambos valen, ver `prepare_threshold` en app/db/pool.py.
    database_url: str

    # --- Supabase ------------------------------------------------------------
    #: Solo las usará la Fase 2 (Storage para las capturas). El acceso a datos
    #: va por `database_url`, no por la API REST de Supabase.
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # --- Aplicación ----------------------------------------------------------
    app_env: str = "development"
    log_level: str = "info"

    #: Orígenes permitidos por CORS, separados por comas.
    cors_origins: str = "http://localhost:5173"

    #: REGLA B — confirmada por el trader y activa por defecto.
    #: Sigue siendo un interruptor, y no una constante cableada, porque apagarla
    #: es la única forma de medir cuánto filtra: se pone a false y se compara el
    #: histórico. Ver README.
    rule_b_enabled: bool = True

    #: Tamaño del pool. Un dashboard de un solo usuario no necesita más.
    db_pool_min_size: int = Field(default=1, ge=1)
    db_pool_max_size: int = Field(default=4, ge=1)

    @field_validator("database_url")
    @classmethod
    def _database_url_no_vacia(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError(
                "DATABASE_URL esta vacia. Copia la cadena de conexion del panel "
                "Connect de Supabase en backend/.env."
            )
        if not v.startswith(("postgresql://", "postgres://")):
            raise ValueError(
                "DATABASE_URL debe empezar por postgresql:// — revisa que hayas "
                "copiado la URI y no los parametros sueltos."
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    """Se cachea: leer y validar el entorno una vez por proceso, no por petición."""
    return Settings()
