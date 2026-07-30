import { useMemo, useState } from "react";

import { formatNumber, formatQuantity } from "../../lib/format.js";
import { calculateAtrRatio, calculateRisk } from "../../lib/risk.js";
import AnimatedNumber from "../ui/AnimatedNumber.jsx";

/**
 * Gestión de riesgo: cuánto se puede perder y cuántas unidades comprar,
 * dados el capital, el riesgo asumido y los niveles del setup ya decidido.
 *
 * Independiente del formulario de indicadores -- no llama al backend, no
 * conoce el catálogo. Es aritmética pura sobre lo que el trader ya decidió,
 * así que vive enteramente en el cliente.
 */

const CAMPOS_VACIOS = { capital: "", riskPercent: "", entry: "", stop: "", tp: "", atr: "" };

/** `""` es "todavía no ha escrito nada" y se distingue de "escribió algo inválido". */
function aNumero(texto) {
  if (texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : NaN;
}

function validar(numeros) {
  const errores = {};

  for (const campo of ["capital", "riskPercent", "entry", "stop", "tp", "atr"]) {
    const v = numeros[campo];
    if (v === null) continue;
    if (Number.isNaN(v)) errores[campo] = "No es un número válido.";
    else if (v < 0) errores[campo] = "No puede ser negativo.";
  }

  if (!errores.entry && numeros.entry === 0) {
    errores.entry = "Tiene que ser mayor que 0.";
  }
  if (
    !errores.entry &&
    !errores.stop &&
    numeros.entry !== null &&
    numeros.stop !== null &&
    numeros.entry === numeros.stop
  ) {
    errores.stop = "No puede ser igual a la entrada: no define ningún riesgo.";
  }

  return errores;
}

function CampoNumerico({ etiqueta, valor, onChange, error, opcional }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-faint">
        {etiqueta}
        {opcional && <span className="ml-1 normal-case">(opcional)</span>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded border bg-base px-3 py-2 text-sm text-ink tabular-nums outline-none transition-colors duration-200 focus:border-ink-faint ${
          error ? "border-short/60" : "border-line"
        }`}
      />
      {error && (
        <span className="animate-fade-in mt-1 block text-xs text-short">{error}</span>
      )}
    </label>
  );
}

function Fila({ etiqueta, valor, className = "text-ink" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <span className="text-ink-dim">{etiqueta}</span>
      <span className={`tabular-nums ${className}`}>{valor}</span>
    </div>
  );
}

/** Igual que `Fila`, pero el número tween-ea hacia su valor nuevo en vez de saltar. */
function FilaAnimada({ etiqueta, valor, formatear, sufijo = "", className = "text-ink" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <span className="text-ink-dim">{etiqueta}</span>
      <span className={`tabular-nums ${className}`}>
        <AnimatedNumber valor={valor} formatear={formatear} />
        {valor != null && sufijo}
      </span>
    </div>
  );
}

/**
 * R:B como proporción visual y no solo como número. El segmento rojo es
 * siempre "1 unidad de riesgo"; el verde son las unidades de beneficio que
 * le corresponden. Se capa en 5R: pasado ese punto la barra ya no cabe
 * seguir estirándose y el número de al lado es quien manda.
 */
function BarraRiesgoBeneficio({ ratio }) {
  const clamped = ratio == null ? 0 : Math.min(ratio, 5);
  const total = 1 + clamped;
  const pctRiesgo = ratio == null ? 100 : (1 / total) * 100;
  const pctBeneficio = ratio == null ? 0 : (clamped / total) * 100;

  return (
    <div className="px-4 pb-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-raised">
        <div
          className="h-full bg-short transition-[width] duration-300 ease-out"
          style={{ width: `${pctRiesgo}%` }}
        />
        <div
          className="h-full bg-long transition-[width] duration-300 ease-out"
          style={{ width: `${pctBeneficio}%` }}
        />
      </div>
    </div>
  );
}

export default function RiskCalculator() {
  const [campos, setCampos] = useState(CAMPOS_VACIOS);

  function set(campo, valor) {
    setCampos((prev) => ({ ...prev, [campo]: valor }));
  }

  const numeros = useMemo(
    () => ({
      capital: aNumero(campos.capital),
      riskPercent: aNumero(campos.riskPercent),
      entry: aNumero(campos.entry),
      stop: aNumero(campos.stop),
      tp: aNumero(campos.tp),
      atr: aNumero(campos.atr),
    }),
    [campos],
  );

  const errores = useMemo(() => validar(numeros), [numeros]);

  const obligatoriosCompletos = ["capital", "riskPercent", "entry", "stop", "tp"].every(
    (c) => numeros[c] !== null,
  );
  const sinErrores = Object.keys(errores).length === 0;
  const listo = obligatoriosCompletos && sinErrores;

  const resultado = listo
    ? calculateRisk(numeros.capital, numeros.riskPercent, numeros.entry, numeros.stop, numeros.tp)
    : null;

  const atrValido = numeros.atr !== null && !errores.atr && numeros.atr > 0;
  const atrStopRatio =
    resultado && atrValido ? calculateAtrRatio(resultado.riskDistance, numeros.atr) : null;
  const atrTpRatio =
    resultado && atrValido ? calculateAtrRatio(resultado.rewardDistance, numeros.atr) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-lg border border-line bg-surface overflow-hidden">
        <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
          Parámetros de entrada
        </h2>
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <CampoNumerico
            etiqueta="Capital (USDT)"
            valor={campos.capital}
            onChange={(v) => set("capital", v)}
            error={errores.capital}
          />
          <CampoNumerico
            etiqueta="% riesgo"
            valor={campos.riskPercent}
            onChange={(v) => set("riskPercent", v)}
            error={errores.riskPercent}
          />
          <CampoNumerico
            etiqueta="Entrada"
            valor={campos.entry}
            onChange={(v) => set("entry", v)}
            error={errores.entry}
          />
          <CampoNumerico
            etiqueta="Stop loss"
            valor={campos.stop}
            onChange={(v) => set("stop", v)}
            error={errores.stop}
          />
          <CampoNumerico
            etiqueta="Take profit"
            valor={campos.tp}
            onChange={(v) => set("tp", v)}
            error={errores.tp}
          />
          <CampoNumerico
            etiqueta="ATR"
            valor={campos.atr}
            onChange={(v) => set("atr", v)}
            error={errores.atr}
            opcional
          />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface overflow-hidden">
        <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
          Análisis
        </h2>

        {!sinErrores && (
          <p className="animate-fade-in px-4 py-4 text-sm text-short">
            Corrige los campos marcados en rojo para ver el análisis.
          </p>
        )}

        {sinErrores && (
          <>
            {!obligatoriosCompletos && (
              <p className="animate-fade-in px-4 py-3 text-xs text-ink-faint">
                Rellena capital, % riesgo, entrada, stop y take profit para completar el
                análisis. Los resultados que ya se pueden calcular se muestran; el resto
                queda en "—".
              </p>
            )}
            <div className="divide-y divide-line/60">
              <Fila etiqueta="Entrada" valor={formatNumber(numeros.entry)} />
              <Fila etiqueta="Stop loss" valor={formatNumber(numeros.stop)} />
              <Fila etiqueta="Take profit" valor={formatNumber(numeros.tp)} />
            </div>

            <div className="border-t border-line">
              <div className="divide-y divide-line/60">
                <Fila etiqueta="Riesgo (pips)" valor={formatNumber(resultado?.riskDistance ?? null)} />
                <Fila
                  etiqueta="Beneficio (pips)"
                  valor={formatNumber(resultado?.rewardDistance ?? null)}
                />
                <FilaAnimada
                  etiqueta="R:R"
                  valor={resultado?.riskRewardRatio ?? null}
                  formatear={formatNumber}
                />
              </div>
              <BarraRiesgoBeneficio ratio={resultado?.riskRewardRatio ?? null} />
            </div>

            <div className="divide-y divide-line/60 border-t border-line">
              <Fila etiqueta="Capital" valor={`${formatNumber(numeros.capital)} USDT`} />
              <Fila
                etiqueta="% riesgo"
                valor={numeros.riskPercent === null ? "—" : `${formatNumber(numeros.riskPercent)}%`}
              />
              <FilaAnimada
                etiqueta="Pérdida máxima"
                valor={resultado?.maxLoss ?? null}
                formatear={(n) => `${formatNumber(n)} USDT`}
                className={resultado ? "text-short" : "text-ink"}
              />
              <FilaAnimada
                etiqueta="Beneficio potencial"
                valor={resultado?.potentialProfit ?? null}
                formatear={(n) => `${formatNumber(n)} USDT`}
                className={resultado?.potentialProfit != null ? "text-long" : "text-ink"}
              />
              <FilaAnimada
                etiqueta="Tamaño posición"
                valor={resultado?.positionSize ?? null}
                formatear={formatQuantity}
              />
            </div>

            <div className="divide-y divide-line/60 border-t border-line">
              <Fila etiqueta="ATR (opt.)" valor={formatNumber(numeros.atr)} />
              <FilaAnimada etiqueta="Stop vs ATR" valor={atrStopRatio} formatear={formatNumber} sufijo="x" />
              <FilaAnimada etiqueta="TP vs ATR" valor={atrTpRatio} formatear={formatNumber} sufijo="x" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
