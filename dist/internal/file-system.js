import fs from "node:fs";
import path from "node:path";
const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules", "coverage", ".vitest"]);
export const walkFiles = (directory, extensions) => {
    if (!fs.existsSync(directory))
        return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!SKIPPED_DIRECTORIES.has(entry.name) && entry.name !== "external") {
                files.push(...walkFiles(file, extensions));
            }
            continue;
        }
        if (!extensions || extensions.has(path.extname(entry.name)))
            files.push(file);
    }
    return files;
};
export const readProductionSources = (directory, projectRoot) => walkFiles(directory, new Set([".vue", ".less", ".css", ".scss", ".ts", ".tsx"]))
    .filter(file => !/\.(?:test|spec)\.[^.]+$/.test(file) && !file.endsWith(".d.ts"))
    .map(file => ({
    file: path.relative(projectRoot, file).replaceAll("\\", "/"),
    source: fs.readFileSync(file, "utf8"),
}));
export const lineNumberAt = (source, offset) => source.slice(0, offset).split(/\r?\n/).length;
export const applyReplacements = (source, replacements) => [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce((current, replacement) => `${current.slice(0, replacement.start)}${replacement.text}${current.slice(replacement.end)}`, source);
