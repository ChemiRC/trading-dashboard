/**
 * Login con la contraseña compartida.
 *
 * Un solo nivel de acceso y sin cuentas: dos personas de confianza comparten
 * la misma contraseña. La sesión (guardar y limpiar el token) vive en
 * `client.js`, que es el único que la conoce.
 */

import { clearToken, request, setToken } from "./client";

/**
 * Canjea la contraseña por un token y lo deja guardado.
 *
 * @throws {ApiError} 401 si la contraseña no es correcta; 503 si el backend
 *   no tiene configuradas `APP_PASSWORD` / `APP_TOKEN_SECRET`.
 */
export async function login(password, options) {
  const { token } = await request("/auth/login", {
    method: "POST",
    body: { password },
    ...options,
  });
  setToken(token);
  return token;
}

/** Cierra la sesión en el cliente. El token caduca solo en el servidor. */
export function logout() {
  clearToken();
}
