import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // strictPort: si el 5173 está ocupado, fallar en vez de saltar al 5174.
    // El backend autoriza por CORS una lista blanca de orígenes concreta
    // (CORS_ORIGINS en backend/.env), así que cambiar de puerto en silencio
    // convertiría un "puerto ocupado" en un error de CORS incomprensible.
    strictPort: true,
  },
});
