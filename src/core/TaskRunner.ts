import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

export interface RunTaskResponse {
    success: boolean;
    message: string;
}

const tasksDir = path.join(__dirname, '..', 'tasks');

function resolveTaskFile(name: string): string | null {
    const directPath = path.join(tasksDir, `${name}.task.ts`);
    if (fs.existsSync(directPath)) return directPath;

    const flatPath = path.join(tasksDir, `${name}.ts`);
    if (fs.existsSync(flatPath)) return flatPath;

    const dirPath = path.join(tasksDir, name);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const taskInDir = path.join(dirPath, `${name}.task.ts`);
        if (fs.existsSync(taskInDir)) return taskInDir;

        const indexInDir = path.join(dirPath, 'index.ts');
        if (fs.existsSync(indexInDir)) return indexInDir;
    }

    return null;
}

export async function runTask<T = unknown, R = unknown>(taskName: string, data: T): Promise<R> {
    const resolvedPath = resolveTaskFile(taskName);

    if (!resolvedPath) {
        throw new Error(`Task not found: ${taskName} in src/tasks/`);
    }

    const module = await import(pathToFileURL(resolvedPath).href);
    const runFn = module.run ?? module.default;

    if (typeof runFn !== 'function') {
        throw new Error(`Task ${taskName} does not export a run or default function`);
    }

    return runFn(data);
}

if (require.main === module) {
    const args = process.argv.slice(2);

    let taskName = args.find(arg => !arg.startsWith('-'));

    if (!taskName) {
        console.error('You need to specify a task name. Example: npm run task example');
        process.exit(1);
    }

    taskName = taskName.replace(/^--?/, '');

    const resolvedTaskPath = resolveTaskFile(taskName);

    if (!resolvedTaskPath) {
        console.error(`Task not found: ${taskName} in src/tasks/`);
        process.exit(1);
    }

    const taskPath = resolvedTaskPath;

    function parseArgs(rawArgs: string[]): Record<string, string | boolean> {
        const parsed: Record<string, string | boolean> = {};
        const positional: string[] = [];

        for (let i = 0; i < rawArgs.length; i++) {
            const arg = rawArgs[i];

            if (arg.startsWith('--')) {
                const [key, value] = arg.slice(2).split('=', 2);
                if (value !== undefined) {
                    parsed[key] = value;
                } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
                    parsed[key] = rawArgs[i + 1];
                    i++;
                } else {
                    parsed[key] = true;
                }
            } else if (arg.startsWith('-')) {
                const [key, value] = arg.slice(1).split('=', 2);
                if (value !== undefined) {
                    parsed[key] = value;
                } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
                    parsed[key] = rawArgs[i + 1];
                    i++;
                } else {
                    parsed[key] = true;
                }
            } else {
                positional.push(arg);
            }
        }

        if (positional.length > 0) {
            parsed['_'] = positional.join(' ');
        }

        return parsed;
    }

    function buildTaskArgs(rawArgs: string[]): Record<string, unknown> {
        const parsed = parseArgs(rawArgs);

        const positional = parsed['_'];
        if (typeof positional === 'string') {
            const trimmed = positional.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    return JSON.parse(trimmed) as Record<string, unknown>;
                } catch {
                    // Falls through to returning the parsed flags object
                }
            }
        }

        return parsed as Record<string, unknown>;
    }

    const taskArgs = buildTaskArgs(args.filter(arg => arg.replace(/^--?/, '') !== taskName));
    const hasTaskArgs = Object.keys(taskArgs).length > 0;

    async function main() {
        try {
            console.log(`Running task: ${taskName}`);
            if (hasTaskArgs) {
                console.log(`Arguments:`, taskArgs);
            } else {
                console.log('No arguments provided; relying on task side effects.');
            }

            const module = await import(pathToFileURL(taskPath).href);

            const runFn = module.run ?? module.default;

            if (typeof runFn === 'function' && hasTaskArgs) {
                await runFn(taskArgs);
            } else if (!hasTaskArgs) {
                console.log(`Task ${taskName} loaded. Side effects executed.`);
            } else {
                console.log(`Task ${taskName} loaded (no exported run/default function).`);
            }
        } catch (error) {
            console.error('Error executing task:', error);
            process.exit(1);
        }
    }

    main();
}