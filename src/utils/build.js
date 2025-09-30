import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

const srcDir = 'src';
const outDir = 'dist';

// Récupère tous les fichiers .ts dans src (récursif si besoin)
function getAllFiles(dir, ext = '.ts') {
    const entries = readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getAllFiles(fullPath, ext));
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            files.push(fullPath);
        }
    }
    return files;
}

const entryPoints = getAllFiles(srcDir);

build({
    entryPoints,
    outdir: outDir,
    bundle: false,      // ne pas tout mettre dans un seul fichier
    platform: 'node',
    sourcemap: true,
    minify: false,
})
    .then(() => console.log('Build completed successfully!'))
    .catch((err) => {
        console.error('Build failed:', err);
        process.exit(1);
    });