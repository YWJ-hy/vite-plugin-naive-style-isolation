import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import naiveStyleIsolation from "../src/index.js";

let root: string;
let server: ViteDevServer | undefined;

const write = (file: string, source: string) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
};

const start = async (strict = true, watch = false) => {
  server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: watch ? { usePolling: true, interval: 50 } : null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      naiveStyleIsolation({ root, namespace: "fixture-app", strict }),
      {
        name: "disable-fixture-optimizer",
        configResolved(config) { config.optimizeDeps.include = []; },
      },
    ],
  });
  if (watch) await new Promise<void>(resolve => server!.watcher.once("ready", resolve));
  return server;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "naive-dev-audit-"));
  write("package.json", JSON.stringify({ name: "dev-fixture", type: "module" }));
  write("node_modules/naive-ui/package.json", JSON.stringify({
    name: "naive-ui", version: "2.44.1", module: "index.mjs",
  }));
  write("node_modules/naive-ui/index.mjs", "export {};\n");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("development source audit", () => {
  it("serves a safe module even when an unloaded source contains a forbidden selector", async () => {
    write("src/safe.ts", "export const safe = true;");
    write("src/unloaded.ts", 'document.querySelector(".n-button");');
    const dev = await start();

    await expect(dev.transformRequest("/src/safe.ts")).resolves.toMatchObject({
      code: expect.stringContaining("safe = true"),
    });
  });

  it("rejects a forbidden selector when its module is requested", async () => {
    write("src/unsafe.ts", '\n document.querySelector(".n-button");');
    const dev = await start();

    await expect(dev.transformRequest("/src/unsafe.ts")).rejects.toThrow("src/unsafe.ts:2");
  });

  it.each([
    ["component.tsx", 'export const selector = "n-button";'],
    ["styles.css", ".n-button { color: red; }"],
    ["styles.less", ".n-button { color: red; }"],
    ["styles.scss", ".n-button { color: red; }"],
    ["App.vue", '<template><div /></template>\n<style>.n-button { color: red; }</style>'],
  ])("checks %s before compilation or selector rewriting", async (file, source) => {
    write(`src/${file}`, source);
    const dev = await start();

    await expect(dev.transformRequest(`/src/${file}`)).rejects.toThrow(`src/${file}:`);
  });

  it("allows selectors with strict disabled while retaining CSS isolation", async () => {
    write("src/unsafe.ts", 'document.querySelector(".n-button");');
    write("src/styles.css", ".n-button { color: red; }");
    const dev = await start(false);

    await expect(dev.transformRequest("/src/unsafe.ts")).resolves.toBeTruthy();
    await expect(dev.transformRequest("/src/styles.css")).resolves.toMatchObject({
      code: expect.stringContaining(":where(.fixture-app) .n-v2-44-1-button"),
    });
  });

  it.each(["css", "less", "scss"])("checks project styles brought in through %s imports", async extension => {
    fs.symlinkSync(path.join(process.cwd(), "node_modules", extension === "scss" ? "sass" : "less"),
      path.join(root, "node_modules", extension === "scss" ? "sass" : "less"), "junction");
    write(`src/entry.${extension}`, `@import "./nested.${extension}";`);
    write(`src/nested.${extension}`, ".n-button { color: red; }");
    const dev = await start();

    await expect(dev.transformRequest(`/src/entry.${extension}`)).rejects.toThrow(`src/nested.${extension}:1`);
  });

  it("accepts injected Less selectors and rechecks imported files on edits", async () => {
    fs.symlinkSync(path.join(process.cwd(), "node_modules/less"), path.join(root, "node_modules/less"), "junction");
    write("src/entry.less", '@import "./nested.less";');
    const safe = ".@{naive-cls-prefix}-button { color: red; }";
    write("src/nested.less", safe);
    const dev = await start(true, true);
    const request = async () => {
      try {
        return (await dev.transformRequest("/src/entry.less"))?.code;
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(await request()).toContain(".n-v2-44-1-button");
    write("src/nested.less", ".n-input { color: red; }");
    await expect.poll(request, { timeout: 3000 }).toContain("src/nested.less:1");
    write("src/nested.less", safe);
    await expect.poll(request, { timeout: 3000 }).toContain(".n-v2-44-1-button");
  });

  it.each([
    "src/external/vendor.ts", "src/coverage/report.ts", "src/dist/output.ts",
    "src/node_modules/vendor.ts", "src/.vitest/cache.ts",
    "src/feature.test.ts", "src/feature.spec.ts", "src/types.d.ts",
    "src/legacy.js", "src-other/outside.ts",
  ])("keeps the existing source audit exclusions for %s", async file => {
    write(file, 'export const selector = ".n-button";');
    const dev = await start();

    await expect(dev.transformRequest(`/${file}`)).resolves.toBeTruthy();
  });

  it("rechecks changed modules and serves them again after a selector is fixed", async () => {
    write("src/feature.ts", "export const safe = true;");
    const dev = await start(true, true);
    await expect(dev.transformRequest("/src/feature.ts")).resolves.toBeTruthy();

    const request = async () => {
      try {
        return (await dev.transformRequest("/src/feature.ts"))?.code;
      } catch (error) {
        return (error as Error).message;
      }
    };

    write("src/feature.ts", 'document.querySelector(".n-input");');
    await expect.poll(request, { timeout: 3000 }).toContain("src/feature.ts:1");
    write("src/feature.ts", "export const fixed = true;");
    await expect.poll(request, { timeout: 3000 }).toContain("fixed = true");
  });

  it("audits original Vue source for style subrequests, including subsequent edits", async () => {
    const safe = '<template><div /></template>\n<style>.n-global { color: red; }</style>';
    write("src/App.vue", safe);
    const dev = await start();
    const plugin = dev.config.plugins.find(p => p.name === "vite-plugin-naive-style-isolation") as Plugin;
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const id = `${path.join(root, "src/App.vue")}?vue&type=style&index=0&lang.css`;

    expect(() => transform(".n-v2-44-1-button { color: red; }", id)).not.toThrow();
    write("src/App.vue", '<template><div /></template>\n<style>.n-input { color: red; }</style>');
    expect(() => transform(".n-v2-44-1-input { color: red; }", id)).toThrow("src/App.vue:2");
    write("src/App.vue", safe);
    expect(() => transform(".n-global { color: red; }", id)).not.toThrow();
  });
});
