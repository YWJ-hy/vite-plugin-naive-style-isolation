import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeTool } from "./build-tools.mjs";
import { pruneInternalDeclarations } from "./dist-files.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(packageRoot, "dist");
if (path.dirname(dist) !== packageRoot)
  throw new Error("Refusing to clean dist outside package root");
fs.rmSync(dist, { recursive: true, force: true });
runNodeTool("typescript/bin/tsc", ["-p", "tsconfig.build.json"], { cwd: packageRoot });
pruneInternalDeclarations(dist);
