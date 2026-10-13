import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, unzipSync, zipSync } from "fflate";
import { runNodeTool } from "./build-tools.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const outputArgumentIndex = process.argv.indexOf("--output-dir");
const outputDirectory = path.resolve(
  packageRoot,
  outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : "artifacts",
);
const archiveName = `${manifest.name}-${manifest.version}.zip`;
const archivePath = path.join(outputDirectory, archiveName);
const checksumPath = `${archivePath}.sha256`;

const REQUIRED_FILES = [
  ".gitignore",
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
];
const INCLUDED_DIRECTORIES = ["dist", "scripts", "src", "tests"];
const EXCLUDED_NAMES = new Set([".git", ".vitest", "artifacts", "coverage", "node_modules"]);

const collect = (directory, relative = "") => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...collect(absolute, nextRelative));
    else files.push(nextRelative.replaceAll("\\", "/"));
  }
  return files;
};

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(packageRoot, file))) throw new Error(`Missing archive file ${file}`);
}
if (fs.existsSync(archivePath) || fs.existsSync(checksumPath)) {
  throw new Error(
    `Archive ${archiveName} already exists; bump package.json version before creating another share`,
  );
}

runNodeTool("vitest#vitest", ["run", "--config", "vitest.config.ts"], { cwd: packageRoot });
runNodeTool("typescript/bin/tsc", ["-p", "tsconfig.json", "--noEmit"], { cwd: packageRoot });
runNodeTool(path.join(packageRoot, "scripts/check-dist.mjs"), [], { cwd: packageRoot });
runNodeTool(path.join(packageRoot, "scripts/build.mjs"), [], { cwd: packageRoot });
runNodeTool(path.join(packageRoot, "scripts/check-dist.mjs"), [], { cwd: packageRoot });

const relativeFiles = [
  ...REQUIRED_FILES,
  ...INCLUDED_DIRECTORIES.flatMap(directory =>
    collect(path.join(packageRoot, directory), directory),
  ),
].sort();
const entries = {};
for (const relativeFile of relativeFiles) {
  entries[`${manifest.name}/${relativeFile}`] = new Uint8Array(
    fs.readFileSync(path.join(packageRoot, relativeFile)),
  );
}

fs.mkdirSync(outputDirectory, { recursive: true });
const archive = zipSync(entries, { level: 9 });
fs.writeFileSync(archivePath, archive);
const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "naive-style-isolation-archive-"));
try {
  for (const [entry, contents] of Object.entries(unzipSync(archive))) {
    const destination = path.resolve(smokeRoot, entry);
    if (!destination.startsWith(`${smokeRoot}${path.sep}`)) {
      throw new Error(`Archive contains an unsafe path: ${entry}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  const previousPackagePath = process.env.NAIVE_ISOLATION_PACKAGE_PATH;
  process.env.NAIVE_ISOLATION_PACKAGE_PATH = path.join(smokeRoot, manifest.name);
  try {
    runNodeTool(
      "vitest#vitest",
      ["run", "tests/consumer-install.test.ts", "--config", "vitest.config.ts"],
      { cwd: packageRoot },
    );
  } finally {
    if (previousPackagePath === undefined) delete process.env.NAIVE_ISOLATION_PACKAGE_PATH;
    else process.env.NAIVE_ISOLATION_PACKAGE_PATH = previousPackagePath;
  }
} catch (error) {
  fs.rmSync(archivePath, { force: true });
  throw error;
} finally {
  fs.rmSync(smokeRoot, { recursive: true, force: true });
}
const checksum = crypto.createHash("sha256").update(archive).digest("hex");
fs.writeFileSync(checksumPath, strToU8(`${checksum}  ${archiveName}\n`));
console.log(`${archivePath}\nsha256 ${checksum}`);
