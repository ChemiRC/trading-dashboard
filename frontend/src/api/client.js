/**
 * Cliente HTTP contra el backend.
 *
 * Único sitio del frontend que llama a `fetch` y el único que sabe cómo tiene
 * forma un error del backend. Todo lo que sale de aquí es o bien los datos ya
 * parseados, o bien un `ApiError` con un `code` y un `message` listos para
 * enseñar. Ningún componente debería mirar nunca un `response.ok` ni un
 * `body.error.message`.
 */

/**
 * La URL del backend llega por variable de entorno para que el mismo bundle
 * sirva en local y en producción. Se recorta la barra final: si alguien pone
 * `http://localhost:8000/`, concatenar `/api/...` daría `//api/...`.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/** Códigos que fabrica el cliente; el resto vienen del backend tal cual. */
export const CLIENT_ERROR_CODES = {
  /** No hubo respuesta: backend caído, URL mal, o CORS bloqueando. */
  NETWORK: "NETWORK_UNREACHABLE",
  /** El backend tardó más de lo permitido. */
  TIMEOUT: "TIMEOUT",
  /** Petición cancelada por quien la lanzó (desmontaje del componente). */
  ABORTED: "ABORTED",
  /** Respondió, pero con algo que no es el sobre de error conocido. */
  UNEXPECTED: "UNEXPECTED_RESPONSE",
};

/**
 * Error normalizado. Siempre trae `code` y `message`; `status` solo si hubo
 * respuesta HTTP, y `details` solo en los 422 de validación de Pydantic.
 */
export class ApiError extends Error {
  constructor({ code, message, status = null, details = null, constraint = null }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.constraint = constraint;
  }

  /** Cancelado adrede: normalmente no hay que enseñarlo al usuario. */
  get isAborted() {
    return this.code === CLIENT_ERROR_CODES.ABORTED;
  }
}

/**
 * El backend envuelve TODOS sus errores igual:
 *
 *     { "error": { "code": "...", "message": "...", "details": [...] } }
 *
 * Si llega algo con esa forma, se usa. Si no —un 502 del proxy, una página
 * HTML de error, un cuerpo vacío—, se fabrica un código a partir del estado
 * en vez de enseñar "undefined".
 */
function errorFromResponse(response, body) {
  const sobre = body?.error;

  if (sobre?.message) {
    return new ApiError({
      code: sobre.code ?? `HTTP_${response.status}`,
      message: sobre.message,
      status: response.status,
      details: sobre.details ?? null,
      constraint: sobre.constraint ?? null,
    });
  }

  return new ApiError({
    code: `HTTP_${response.status}`,
    message:
      `El backend respondió ${response.status} ${response.statusText}` +
      " con un cuerpo que no reconozco.",
    status: response.status,
  });
}

/**
 * Lanza una petición y devuelve el JSON ya parseado.
 *
 * @param {string} path      Ruta absoluta del backend, p. ej. "/api/config/catalog".
 * @param {object} [options]
 * @param {string} [options.method]      Verbo HTTP. Por defecto GET.
 * @param {unknown} [options.body]       Se serializa a JSON si viene.
 * @param {AbortSignal} [options.signal] Para cancelar desde fuera.
 * @param {number} [options.timeoutMs]   Corte por tiempo. Por defecto 15 s.
 * @returns {Promise<any>}
 * @throws {ApiError} Siempre ApiError: nunca un TypeError de fetch suelto.
 */
export async function request(path, options = {}) {
  const { method = "GET", body, signal, timeoutMs = 15000 } = options;

  // Dos motivos para abortar —el reloj y quien llamó— sobre un solo
  // controlador, para distinguir después "ha tardado demasiado" de "ya no me
  // interesa": el primero es un problema, el segundo no.
  const controller = new AbortController();
  let expiro = false;

  const temporizador = setTimeout(() => {
    expiro = true;
    controller.abort();
  }, timeoutMs);

  const cancelaExterna = () => controller.abort();
  signal?.addEventListener("abort", cancelaExterna, { once: true });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (causa) {
    if (causa?.name === "AbortError") {
      throw expiro
        ? new ApiError({
            code: CLIENT_ERROR_CODES.TIMEOUT,
            message: `El backend no respondió en ${timeoutMs / 1000} s.`,
          })
        : new ApiError({
            code: CLIENT_ERROR_CODES.ABORTED,
            message: "Petición cancelada.",
          });
    }

    // fetch solo lanza TypeError cuando no ha llegado a haber respuesta. Desde
    // el navegador los tres motivos son indistinguibles —da el mismo error por
    // seguridad—, así que se nombran los tres en vez de adivinar uno.
    throw new ApiError({
      code: CLIENT_ERROR_CODES.NETWORK,
      message:
        `No se pudo contactar con el backend en ${API_BASE_URL}. ` +
        "Comprueba que está levantado, que la URL de VITE_API_BASE_URL es " +
        "correcta y que este origen está en CORS_ORIGINS.",
    });
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", cancelaExterna);
  }

  // 204/205 no traen cuerpo; leerlo como JSON reventaría.
  if (response.status === 204 || response.status === 205) {
    if (!response.ok) throw errorFromResponse(response, null);
    return null;
  }

  const texto = await response.text();
  let cuerpo = null;
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = null;
    }
  }

  if (!response.ok) throw errorFromResponse(response, cuerpo);

  if (cuerpo === null && texto) {
    throw new ApiError({
      code: CLIENT_ERROR_CODES.UNEXPECTED,
      message: "El backend respondió 200 con algo que no es JSON.",
      status: response.status,
    });
  }

  return cuerpo;
}
