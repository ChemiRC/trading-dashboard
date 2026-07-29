"""Motor de decisión.

Una única función pura: `evaluate(selections, config) -> Evaluation`.

Pura de verdad: no toca la base de datos, no sabe qué es HTTP, no lee la hora ni
usa aleatoriedad. Las mismas entradas dan siempre la misma salida. Por eso se
puede testear con una tabla de casos y por eso, en la Fase 5, el backtesting
puede reusarla tal cual sobre datos históricos.

No hay ni un peso, ni una opción, ni un umbral escrito en este fichero. Todo
entra por `config`.
"""

from collections.abc import Mapping

from .catalog import EngineConfig, Indicator
from .errors import ConfigError, SelectionError
from .result import Contribution, Evaluation


def _sign(value: int) -> int:
    return (value > 0) - (value < 0)


def _validate_config(config: EngineConfig) -> Indicator:
    """Comprueba la configuración y devuelve el indicador puerta.

    Duplica a propósito las restricciones que ya vigila la base de datos
    (un solo `is_gate`, |points| <= max_weight). El motor también corre en
    backtesting con configuraciones construidas a mano, donde no hay Postgres
    detrás que las valide.
    """
    if not config.indicators:
        raise ConfigError("La configuracion no tiene ningun indicador.")

    gates = [ind for ind in config.indicators if ind.is_gate]
    if len(gates) != 1:
        raise ConfigError(
            f"Debe haber exactamente un indicador puerta (is_gate); hay {len(gates)}."
        )

    seen: set[str] = set()
    for ind in config.indicators:
        if ind.code in seen:
            raise ConfigError(f"Indicador duplicado: '{ind.code}'.")
        seen.add(ind.code)

        if ind.max_weight <= 0:
            raise ConfigError(f"El indicador '{ind.code}' tiene peso {ind.max_weight}.")
        if not ind.options:
            raise ConfigError(f"El indicador '{ind.code}' no tiene opciones.")

        for opt in ind.options:
            if abs(opt.points) > ind.max_weight:
                raise ConfigError(
                    f"La opcion '{opt.code}' aporta {opt.points} puntos, "
                    f"pero '{ind.code}' tiene peso maximo {ind.max_weight}."
                )

    if not config.thresholds:
        raise ConfigError("La configuracion no tiene umbrales de clasificacion.")

    return gates[0]


def _classify(config: EngineConfig, abs_balance: int):
    matches = [t for t in config.thresholds if t.covers(abs_balance)]
    if not matches:
        raise ConfigError(
            f"Ningun umbral cubre un balance absoluto de {abs_balance}. "
            "Los umbrales dejan un hueco; revisa v_config_health."
        )
    if len(matches) > 1:
        raise ConfigError(
            f"El balance absoluto {abs_balance} cae en {len(matches)} umbrales a la vez: "
            + ", ".join(t.code for t in matches)
        )
    return matches[0]


def evaluate(
    selections: Mapping[str, str],
    config: EngineConfig,
) -> Evaluation:
    """Evalúa un setup.

    Args:
        selections: `{indicator_code: option_code}`. Tiene que traer una entrada
            por cada indicador de la configuración. **No incluye la dirección**:
            el formulario no la pregunta, el motor la deduce.
        config: catálogo, pesos y umbrales vigentes, tal cual salen de la BD.

    Returns:
        La evaluación completa: balance con signo, dirección deducida,
        clasificación y desglose.

    Raises:
        ConfigError: la configuración es incoherente.
        SelectionError: las opciones elegidas no encajan con el catálogo.
    """
    gate = _validate_config(config)

    # ---- 1. Traducir las elecciones a aportaciones -------------------------
    known = {ind.code for ind in config.indicators}
    if extra := set(selections) - known:
        raise SelectionError(
            "Indicadores desconocidos en la seleccion: " + ", ".join(sorted(extra))
        )
    if missing := known - set(selections):
        raise SelectionError(
            "Faltan indicadores por responder: " + ", ".join(sorted(missing))
        )

    contributions: list[Contribution] = []
    gate_points: int | None = None

    for ind in sorted(config.indicators, key=lambda i: (i.display_order, i.code)):
        option = ind.option(selections[ind.code])
        if option is None:
            raise SelectionError(
                f"La opcion '{selections[ind.code]}' no existe en '{ind.code}'."
            )

        contributions.append(
            Contribution(
                indicator_code=ind.code,
                indicator_name=ind.name,
                option_code=option.code,
                option_label=option.label,
                points=option.points,
                max_weight=ind.max_weight,
            )
        )
        if ind.code == gate.code:
            gate_points = option.points

    frozen = tuple(contributions)

    # ---- 2. REGLA A — puerta de entrada ------------------------------------
    # Si el disparador está en su lectura neutra (0 puntos), NO TRADE inmediato:
    # no se calcula balance ni se evalúa nada más. El trader no busca
    # operaciones sin divergencia.
    #
    # Se devuelven igualmente las contribuciones: son sus respuestas al
    # formulario, no el resultado de una evaluación que aquí no ha ocurrido.
    if gate_points == 0:
        return Evaluation(
            decision="NO_TRADE",
            direction=None,
            raw_balance=None,
            no_trade_reason="GATE_NO_DIVERGENCE",
            classification_code=None,
            classification_label=None,
            contributions=frozen,
        )

    # ---- 3. Balance con signo ----------------------------------------------
    raw_balance = sum(c.points for c in frozen)
    classification = _classify(config, abs(raw_balance))

    def result(decision, direction, reason) -> Evaluation:
        return Evaluation(
            decision=decision,
            direction=direction,
            raw_balance=raw_balance,
            no_trade_reason=reason,
            classification_code=classification.code,
            classification_label=classification.label,
            contributions=frozen,
        )

    # ---- 4. Balance exactamente 0 ------------------------------------------
    # Ocurre de verdad: +10 -20 +15 -15 +10 +0 = 0. No hay signo, luego no hay
    # dirección que deducir. Fuera.
    if raw_balance == 0:
        return result("NO_TRADE", None, "ZERO_BALANCE")

    direction = "LONG" if raw_balance > 0 else "SHORT"

    # ---- 5. REGLA B — contradicción disparador vs. evidencia ---------------
    # ##################################################################
    # ##  PENDIENTE DE CONFIRMACION FINAL CON EL TRADER.              ##
    # ##  Si la descarta: config.rule_b_enabled = False y ya está.    ##
    # ##  Ni este fichero ni el esquema SQL necesitan cambiar.        ##
    # ##################################################################
    #
    # El disparador apunta a un lado y la suma de la evidencia al otro
    # (divergencia alcista +30, balance total -40). Es justamente el caso en el
    # que hay que quedarse fuera.
    #
    # Va después del balance porque necesita conocerlo, y antes del umbral
    # porque "la evidencia contradice al disparador" es un motivo más
    # informativo que "no llega al minimo".
    if config.rule_b_enabled and _sign(raw_balance) != _sign(gate_points or 0):
        return result("NO_TRADE", direction, "TRIGGER_CONTRADICTION")

    # ---- 6. Magnitud suficiente --------------------------------------------
    # El "menos de 50 no se opera" no está aquí: está en la columna
    # `is_tradeable` de la tabla de umbrales.
    if not classification.is_tradeable:
        return result("NO_TRADE", direction, "BELOW_THRESHOLD")

    # ---- 7. Operable --------------------------------------------------------
    return result(direction, direction, None)
