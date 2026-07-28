import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);

let startName = args.find(arg => !arg.startsWith('-'));

if (!startName) {
    console.error('You need to specify a start entry name. Example: npm run start:siamo siamo');
    process.exit(1);
}

startName = startName.replace(/^--?/, '');

const startsDir = path.join(__dirname, '..', 'start');

function resolveStartFile(name: string): string | null {
    const directPath = path.join(startsDir, `${name}.ts`);
    if (fs.existsSync(directPath)) return directPath;

    const indexPath = path.join(startsDir, `${name}.index.ts`);
    if (fs.existsSync(indexPath)) return indexPath;

    const dirPath = path.join(startsDir, name);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const indexInDir = path.join(dirPath, 'index.ts');
        if (fs.existsSync(indexInDir)) return indexInDir;
    }

    return null;
}

const resolvedStartPath = resolveStartFile(startName);

if (!resolvedStartPath) {
    console.error(`Start entry not found: ${startName} in src/start/`);
    process.exit(1);
}

const startPath = resolvedStartPath;

const remainingArgs = args.filter(arg => {
    const normalized = arg.replace(/^--?/, '');
    return normalized !== startName;
});

async function main() {
    try {
        const module = await import(pathToFileURL(startPath).href);

        const startFn = module.start ?? module.default;

        if (typeof startFn === 'function') {
            await startFn(...remainingArgs);
        } else {
            console.log(`Entry ${startName} loaded (no exported start/default function).`);
        }
    } catch (error) {
        console.error('Error executing start entry:', error);
        process.exit(1);
    }
}

main();
