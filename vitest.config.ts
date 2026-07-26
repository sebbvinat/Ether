import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * §8 — config de vitest para los tests del engine de backtest.
 *
 * El engine (`src/lib/testing/engine.ts`) es puro: no toca DOM, red ni IDB,
 * así que corre en el environment `node` por defecto (más rápido que jsdom).
 * Sólo necesitamos resolver el alias `@/*` que usa el import de tipos.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
