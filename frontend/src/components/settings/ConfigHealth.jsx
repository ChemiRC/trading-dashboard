import Insignia from "../ui/Insignia.jsx";

/**
 * Semáforo de la vista `v_config_health`, más el estado de la Regla B.
 *
 * No calcula nada: la vista de la base de datos ya dice si los pesos suman
 * 100, si hay indicador puerta y si las bandas cubren 0..100. Sumar los pesos
 * aquí en JavaScript daría una segunda respuesta a la misma pregunta, y la
 * que importa es la de la base de datos, que es la que usa el motor.
 *
 * Existe porque el esquema permite estados coherentes fila a fila pero
 * incoherentes en conjunto: bajar un peso de 30 a 25 es legal, y deja la suma
 * en 95 y el "máximo ±100" del README convertido en mentira. Nadie se
 * enteraría sin este aviso.
 *
 * `rule_b_enabled` se pinta con el mismo tratamiento visual que los otros
 * cuatro -- ✓ verde / ⚠ ámbar, nunca gris neutro -- porque la Regla B ya está
 * confirmada por el trader: que aparezca desactivada es tan digno de mirarse
 * dos veces como que los pesos no sumen 100. Pero se queda **fuera** de
 * `todoOk` y del aviso de cabecera a propósito: ese aviso dice que el balance
 * calculado ya no significa lo que el modelo promete, y apagar la Regla B no
 * rompe eso -- solo dejaría de filtrar una contradicción, el balance en sí
 * sigue siendo válido. Mezclarlas haría que el aviso mintiera sobre el motivo.
 */

function Marca({ ok, etiqueta, valor }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{etiqueta}</div>
      {/* La insignia dice el estado y el texto dice el dato: el mismo patrón
          que «puerta · regla A» en el formulario, para que un vistazo a
          cualquier pantalla se lea igual. */}
      <div className="mt-1 flex items-center gap-2">
        <Insignia tono={ok ? "ok" : "aviso"}>{ok ? "✓ ok" : "⚠ revisar"}</Insignia>
        <span className={`text-sm ${ok ? "text-ink" : "text-cls-medium"}`}>{valor}</span>
      </div>
    </div>
  );
}

export default function ConfigHealth({ salud, error }) {
  if (error) {
    return (
      <section className="rounded-lg border border-short/40 bg-short-deep/30 px-4 py-3">
        <span className="text-short">No se pudo leer la salud de la configuración.</span>{" "}
        <span className="text-ink-dim">{error.message}</span>
      </section>
    );
  }

  if (!salud) {
    return (
      <section className="rounded-lg border border-line bg-surface px-4 py-3">
        <span className="animate-pulse text-ink-dim">Comprobando configuración…</span>
      </section>
    );
  }

  const todoOk = salud.suma_es_100 && salud.tiene_puerta && salud.umbrales_cubren_0_100;

  return (
    <section
      className={`rounded-lg border overflow-hidden transition-colors duration-300 ${
        todoOk ? "border-line bg-surface" : "border-cls-medium/50 bg-surface"
      }`}
    >
      <h2 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="text-xs uppercase tracking-widest text-ink-dim">
          Salud de la configuración
        </span>
        <span className={`text-xs transition-colors duration-300 ${todoOk ? "text-long" : "text-cls-medium"}`}>
          {todoOk ? "coherente" : "revisar"}
        </span>
      </h2>

      {!todoOk && (
        <p className="animate-fade-in border-b border-line bg-raised px-4 py-2.5 text-sm leading-relaxed text-cls-medium">
          La configuración vigente es incoherente. El motor sigue evaluando, pero el
          balance ya no significa lo que dice el modelo: revisa lo marcado abajo.
        </p>
      )}

      <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-5">
        <Marca
          ok={salud.suma_es_100}
          etiqueta="Suma de pesos"
          valor={salud.suma_pesos}
        />
        <Marca
          ok={salud.suma_es_100}
          etiqueta="¿Suma 100?"
          valor={salud.suma_es_100 ? "sí" : "no"}
        />
        <Marca
          ok={salud.tiene_puerta}
          etiqueta="Indicador puerta"
          valor={salud.tiene_puerta ? "sí" : "falta"}
        />
        <Marca
          ok={salud.umbrales_cubren_0_100}
          etiqueta="Bandas 0–100"
          valor={salud.umbrales_cubren_0_100 ? "cubiertas" : "con hueco"}
        />
        <Marca
          ok={salud.rule_b_enabled}
          etiqueta="Regla B"
          valor={salud.rule_b_enabled ? "activa" : "desactivada"}
        />
      </div>
    </section>
  );
}
