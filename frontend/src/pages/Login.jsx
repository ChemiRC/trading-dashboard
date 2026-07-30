import { useState } from "react";

import { login } from "../api/auth.js";

/**
 * Pantalla de login: un campo y nada más.
 *
 * No hay usuario que pedir porque no hay usuarios: una contraseña compartida
 * entre dos personas de confianza y un solo nivel de acceso. El mensaje de
 * error es el que devuelve el backend tal cual — que no distingue entre
 * "casi" y "nada que ver", a propósito.
 */
export default function Login({ onEntrar }) {
  const [password, setPassword] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState(null);

  async function enviar(e) {
    e.preventDefault();
    setEntrando(true);
    setError(null);
    try {
      await login(password);
      onEntrar();
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setEntrando(false);
      setPassword("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-6">
      <div className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-xl text-ink">Trading Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Esta herramienta es privada. Introduce la contraseña.
          </p>
        </header>

        <form
          onSubmit={enviar}
          className="rounded-lg border border-line bg-surface px-4 py-4"
        >
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-faint">
              Contraseña
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-ink-faint"
            />
          </label>

          <button
            type="submit"
            disabled={password === "" || entrando}
            className="mt-4 w-full rounded border border-ink bg-raised px-4 py-2 text-sm text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-ink-faint"
          >
            {entrando ? "Entrando…" : "Entrar"}
          </button>

          {error && (
            <div className="mt-4 rounded border border-short/40 bg-short-deep/30 px-3 py-2.5">
              <div className="text-xs text-short">{error.code}</div>
              <div className="mt-0.5 text-sm leading-relaxed text-ink">
                {error.message}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
