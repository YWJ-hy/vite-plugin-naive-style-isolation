import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { assertExplicitNaiveSelectors } from "./css-transform.js";
import { isProductionSource } from "./file-system.js";

export const createDevSourceAudit = (root: string) => {
  const checkedDependencies = new Set<string>();
  const auditFile = (id: string) => {
    const file = id.split("?")[0];
    if (!isProductionSource(file, path.join(root, "src"))) return;
    assertExplicitNaiveSelectors([{
      file: path.relative(root, file).replaceAll("\\", "/"),
      source: fs.readFileSync(file, "utf8"),
    }], true);
  };
  const plugin: Plugin = {
    name: "naive-ui-development-style-dependency-audit",
    apply: "serve",
    enforce: "post",
    configureServer(server) {
      const invalidate = (file: string) => checkedDependencies.delete(file.replaceAll("\\", "/"));
      server.watcher.on("change", invalidate);
      server.watcher.on("unlink", invalidate);
    },
    buildStart() {
      checkedDependencies.clear();
    },
    transform(_code, id) {
      if (!/\.(?:css|less|scss)(?:$|\?)/.test(id) && !/[?&]type=style(?:&|$)/.test(id)) return;
      // Vite exposes preprocessor dependencies after its CSS transform. Check
      // their original text, never the selectors generated from Less variables.
      for (const file of this.getWatchFiles()) {
        const key = file.replaceAll("\\", "/");
        if (checkedDependencies.has(key)) continue;
        if (!fs.existsSync(file)) continue;
        auditFile(file);
        checkedDependencies.add(key);
      }
    },
  };
  return { auditFile, plugin };
};
