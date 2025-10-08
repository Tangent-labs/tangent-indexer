import { build } from "esbuild"
import { readdirSync, cpSync, mkdirSync, existsSync } from "fs"
import { join, dirname } from "path"

const srcDir = "src"
const outDir = "dist"

// Récupère tous les fichiers .ts dans src (récursif)
function getAllFiles(dir, ext = ".ts") {
  const entries = readdirSync(dir, { withFileTypes: true })
  let files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, ext))
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      files.push(fullPath)
    }
  }
  return files
}

const entryPoints = getAllFiles(srcDir)

// Copie tous les fichiers non-TS de src → dist
function copyAssets(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyAssets(srcPath, destPath)
    } else if (!entry.name.endsWith(".ts")) {
      if (!existsSync(dirname(destPath))) {
        mkdirSync(dirname(destPath), { recursive: true })
      }
      cpSync(srcPath, destPath)
    }
  }
}

// Build principal
async function buildTS() {
  await build({
    entryPoints,
    outdir: outDir,
    bundle: false, // pas de bundle = faible mémoire
    platform: "node",
    format: "esm",
    target: ["node22"],
    sourcemap: true,
    minify: false,
    loader: {
      ".json": "json", // <-- IMPORTANT : permet d'importer les JSON
    },
  })

  // Copie des assets (JSON, .env, etc.)
  copyAssets(srcDir, outDir)
}

buildTS()
  .then(() => console.log("Build completed successfully!"))
  .catch((err) => {
    console.error("Build failed:", err)
    process.exit(1)
  })
