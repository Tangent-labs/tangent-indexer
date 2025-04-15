import { defineConfig } from "vitest/config"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      db: path.resolve(__dirname, "./src/db"),
      services: path.resolve(__dirname, "./src/services"),
      utils: path.resolve(__dirname, "./src/utils"),
      config: path.resolve(__dirname, "./src/config"),
      scripts: path.resolve(__dirname, "./src/scripts"),
      type: path.resolve(__dirname, "./src/type"),
    },
  },
})
