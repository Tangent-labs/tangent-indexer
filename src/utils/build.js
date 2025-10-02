import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const srcDir = 'src';
const outDir = 'dist';

// Récupère tous les fichiers .ts dans src (récursif)
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

// Fixe les imports relatifs et ajoute assert { type: "json" } pour les JSON
function fixImports(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            fixImports(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            let content = readFileSync(fullPath, 'utf8');

            // ⚡ Ajoute .js aux imports relatifs sans extension
            content = content.replace(
                /(from\s+['"])(\..*?)(['"])/g,
                (match, p1, p2, p3) => {
                    if (/\.[a-zA-Z0-9]+$/.test(p2)) {
                        return match; // chemin déjà avec extension
                    }
                    return `${p1}${p2}.js${p3}`;
                }
            );

            // ⚡ Ajoute assert { type: "json" } pour les imports JSON
            content = content.replace(
                /(from\s+['"].*?\.json)(['"])/g,
                '$1$2 assert { type: "json" }'
            );

            writeFileSync(fullPath, content);
        }
    }
}

// Copie tous les fichiers non-TS de src → dist
function copyAssets(src, dest) {
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory()) {
            copyAssets(srcPath, destPath);
        } else if (!entry.name.endsWith('.ts')) {
            if (!existsSync(dirname(destPath))) {
                mkdirSync(dirname(destPath), { recursive: true });
            }
            cpSync(srcPath, destPath);
        }
    }
}

// Build principal
async function buildTS() {
    await build({
        entryPoints,
        outdir: outDir,
        bundle: false,      // pas de bundle = faible mémoire
        platform: 'node',
        format: 'esm',       // Node ESM
        sourcemap: true,
        minify: false,
        target: ['node16'],
    });

    fixImports(outDir);
    copyAssets(srcDir, outDir);
}

buildTS()
    .then(() => console.log('Build completed successfully!'))
    .catch((err) => {
        console.error('Build failed:', err);
        process.exit(1);
    });
