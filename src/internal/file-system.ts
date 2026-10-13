import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules", "coverage", ".vitest"]);

export const walkFiles = (directory: string, extensions?: Set<string>): string[] => {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && entry.name !== "external") {
        files.push(...walkFiles(file, extensions));
      }
      continue;
    }
    if (!extensions || extensions.has(path.extname(entry.name))) files.push(file);
  }
  return files;
};

export const readProductionSources = (directory: string, projectRoot: string) =>
  walkFiles(directory, new Set([".vue", ".less", ".css", ".scss", ".ts", ".tsx"]))
    .filter(file => !/\.(?:test|spec)\.[^.]+$/.test(file) && !file.endsWith(".d.ts"))
    .map(file => ({
      file: path.relative(projectRoot, file).replaceAll("\\", "/"),
      source: fs.readFileSync(file, "utf8"),
    }));

export const lineNumberAt = (source: string, offset: number) =>
  source.slice(0, offset).split(/\r?\n/).length;

export interface TextReplacement {
  start: number;
  end: number;
  text: string;
}

export const applyReplacements = (source: string, replacements: TextReplacement[]) =>
  [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.start)}${replacement.text}${current.slice(replacement.end)}`,
      source,
    );
