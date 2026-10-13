import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeTool } from "./build-tools.mjs";
import { pruneInternalDeclarations } from "./dist-files.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const expectedDist = path.join(packageRoot, "dist");
const actualDist = fs.mkdtempSync(path.join(packageRoot, ".dist-check-"));

const listFiles = (directory, prefix = "") => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory()
        ? listFiles(path.join(directory, entry.name), relative)
        : [relative.replaceAll("\\", "/")];
    })
    .sort();
};

try {
  runNodeTool("typescript/bin/tsc", ["-p", "tsconfig.build.json", "--outDir", actualDist], {
    cwd: packageRoot,
    capture: true,
  });
  pruneInternalDeclarations(actualDist);
  const expectedFiles = listFiles(expectedDist);
  const actualFiles = listFiles(actualDist);
  const differences = [];
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    differences.push("dist file list differs from a clean build");
  }
  for (const file of expectedFiles.filter(file => actualFiles.includes(file))) {
    const expected = fs.readFileSync(path.join(expectedDist, file));
    const actual = fs.readFileSync(path.join(actualDist, file));
    if (!expected.equals(actual)) differences.push(file);
  }
  if (differences.length) {
    throw new Error(`dist is stale:\n${differences.map(item => `- ${item}`).join("\n")}`);
  }
  console.log(`dist is fresh (${expectedFiles.length} files)`);
} finally {
  fs.rmSync(actualDist, { recursive: true, force: true });
}
