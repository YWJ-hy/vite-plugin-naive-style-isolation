import fs from "node:fs";
import path from "node:path";

const PUBLIC_DECLARATIONS = new Set(["index.d.ts", "runtime.d.ts", "internal/runtime-core.d.ts"]);

export const pruneInternalDeclarations = dist => {
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith(".d.ts")) {
        const relative = path.relative(dist, file).replaceAll("\\", "/");
        if (!PUBLIC_DECLARATIONS.has(relative)) fs.rmSync(file);
      }
    }
  };
  visit(dist);
};
