import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules", "coverage", ".vitest", "external"]);
const SOURCE_EXTENSIONS = new Set([".vue", ".less", ".css", ".scss", ".ts", ".tsx"]);

export const isProductionSource = (file: string, sourceRoot: string) => {
  const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
  const segments = relative.split("/");
  return relative !== ".." && !relative.startsWith("../") && !path.isAbsolute(relative) &&
    !segments.slice(0, -1).some(segment => SKIPPED_DIRECTORIES.has(segment)) &&
    SOURCE_EXTENSIONS.has(path.extname(file)) &&
    !/\.(?:test|spec)\.[^.]+$/.test(file) && !file.endsWith(".d.ts");
};

export const walkFiles = (directory: string, extensions?: Set<string>): string[] => {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...walkFiles(file, extensions));
      }
      continue;
    }
    if (!extensions || extensions.has(path.extname(entry.name))) files.push(file);
  }
  return files;
};

export const readProductionSources = (directory: string, projectRoot: string) =>
  walkFiles(directory, SOURCE_EXTENSIONS)
    .filter(file => isProductionSource(file, directory))
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
