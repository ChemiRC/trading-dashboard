import { useCallback, useState } from "react";

/**
 * Borradores de edición de la pantalla de configuración.
 *
 * Un borrador es lo que el trader ha escrito y todavía no ha guardado. Se
 * guardan por fila (`clave`) y solo con los campos que tocó, de forma que:
 *
 * - Al recargar el catálogo tras un guardado, las filas que no se guardaron
 *   conservan lo que el trader llevaba escrito -- recargar entero y perder
 *   ediciones ajenas sería castigar por guardar.
 * - Lo que se pinta es `borrador[campo] ?? servidor[campo]`: mientras no haya
 *   borrador, la pantalla enseña el estado real de la base de datos.
 *
 * El hook no sabe qué es un indicador ni un umbral: recibe la promesa ya
 * construida en `guardar` y solo gestiona el ciclo guardando → guardado/error.
 */
export function useConfigDrafts() {
  const [borradores, setBorradores] = useState({});
  const [estados, setEstados] = useState({}); // clave -> "guardando" | "guardado"
  const [errores, setErrores] = useState({}); // clave -> ApiError

  const editar = useCallback((clave, campo, valor) => {
    setBorradores((prev) => ({ ...prev, [clave]: { ...prev[clave], [campo]: valor } }));
    // Escribir después de un fallo limpia el error: el mensaje anterior ya no
    // describe lo que hay en el campo.
    setErrores((prev) => (clave in prev ? sinClave(prev, clave) : prev));
    setEstados((prev) => (clave in prev ? sinClave(prev, clave) : prev));
  }, []);

  const descartar = useCallback((clave) => {
    setBorradores((prev) => sinClave(prev, clave));
    setErrores((prev) => sinClave(prev, clave));
    setEstados((prev) => sinClave(prev, clave));
  }, []);

  /**
   * @param {string} clave      Fila que se guarda.
   * @param {() => Promise} enviar  La llamada PATCH ya montada.
   * @param {() => Promise|void} alGuardar  Recarga del catálogo y de la salud.
   */
  const guardar = useCallback(async (clave, enviar, alGuardar) => {
    setEstados((prev) => ({ ...prev, [clave]: "guardando" }));
    setErrores((prev) => sinClave(prev, clave));

    try {
      await enviar();
      // El borrador se descarta antes de recargar: a partir de aquí la verdad
      // es lo que devuelva la base de datos, no lo que se escribió.
      setBorradores((prev) => sinClave(prev, clave));
      setEstados((prev) => ({ ...prev, [clave]: "guardado" }));
      await alGuardar?.();
    } catch (fallo) {
      if (fallo.isAborted) return;
      // El borrador se conserva: el trader ve lo que escribió, lee por qué el
      // esquema lo rechazó y lo corrige sin volver a teclearlo entero.
      setErrores((prev) => ({ ...prev, [clave]: fallo }));
      setEstados((prev) => sinClave(prev, clave));
    }
  }, []);

  return { borradores, estados, errores, editar, descartar, guardar };
}

function sinClave(objeto, clave) {
  const { [clave]: _, ...resto } = objeto;
  return resto;
}

/**
 * Los campos que de verdad cambiaron, ya convertidos al tipo que espera el
 * backend. Un campo que se editó y se devolvió a su valor original no viaja:
 * un PATCH sin cambios reales solo sirve para arriesgarse a un 409.
 *
 * Los enteros mal escritos se descartan aquí y el componente lo marca. No es
 * revalidar una regla de negocio -- eso es del esquema -- sino no mandar
 * "treinta" a un campo que el contrato declara `int`.
 */
export function cambiosReales(servidor, borrador, tipos) {
  const cambios = {};
  const invalidos = [];

  for (const [campo, valor] of Object.entries(borrador ?? {})) {
    if (tipos[campo] === "int") {
      const texto = String(valor).trim();
      if (texto === "" || !Number.isInteger(Number(texto))) {
        invalidos.push(campo);
        continue;
      }
      const numero = Number(texto);
      if (numero !== servidor[campo]) cambios[campo] = numero;
      continue;
    }

    if (valor !== servidor[campo]) cambios[campo] = valor;
  }

  return { cambios, invalidos };
}
