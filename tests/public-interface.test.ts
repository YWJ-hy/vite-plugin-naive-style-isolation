import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeConfig, type UserConfig } from "vite";
import naiveStyleIsolation from "../src/index.js";

const existingPostcssPlugin = { postcssPlugin: "existing-postcss-plugin" };
const existingEsbuildPlugin = { name: "existing-esbuild-plugin", setup() {} };

describe("Vite plugin public interface", () => {
  it("rejects invalid namespaces during configuration", () => {
    expect(() => naiveStyleIsolation({ namespace: ".invalid namespace" })).toThrow(
      /one CSS class token/,
    );
  });

  it("adds isolation while preserving the consumer Vite configuration", async () => {
    const plugin = naiveStyleIsolation({
      namespace: "consumer-app",
      root: process.cwd(),
      strict: false,
    });
    const configHook = plugin.config;
    expect(typeof configHook).toBe("function");

    const consumerConfig: UserConfig = {
      define: { EXISTING_DEFINE: JSON.stringify("retained") },
      css: {
        preprocessorOptions: { less: { additionalData: "@existing-token: #fff;\n" } },
        postcss: { plugins: [existingPostcssPlugin] },
      },
      resolve: { alias: { "@consumer": "/consumer/src" } },
      optimizeDeps: {
        include: ["existing-included"],
        exclude: ["existing-dependency"],
        esbuildOptions: { plugins: [existingEsbuildPlugin] },
      },
      build: { sourcemap: true },
    };
    const result = await (configHook as Function)(consumerConfig, {
      command: "serve",
      mode: "development",
    });
    const merged = mergeConfig(consumerConfig, result);

    expect(merged.define).toMatchObject({ EXISTING_DEFINE: JSON.stringify("retained") });
    expect(merged.css?.preprocessorOptions?.less.additionalData).toContain(
      "@existing-token: #fff;",
    );
    expect(merged.css?.preprocessorOptions?.less.additionalData).toContain("@naive-cls-prefix:");
    expect(merged.css?.postcss).toMatchObject({
      plugins: expect.arrayContaining([existingPostcssPlugin]),
    });
    expect((merged.css?.postcss as { plugins: unknown[] }).plugins).toContainEqual(
      expect.objectContaining({ postcssPlugin: "naive-ui-versioned-selector" }),
    );
    expect((merged.css?.postcss as { plugins: unknown[] }).plugins).toHaveLength(2);
    expect(merged.resolve?.alias).toMatchObject({ "@consumer": "/consumer/src" });
    expect(merged.optimizeDeps?.exclude).toEqual(["existing-dependency"]);
    expect(merged.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        "existing-included",
        "naive-ui",
        "vite-plugin-naive-style-isolation/runtime",
      ]),
    );
    expect(merged.optimizeDeps?.include).toHaveLength(3);
    expect(merged.optimizeDeps?.esbuildOptions?.plugins).toEqual(
      expect.arrayContaining([
        existingEsbuildPlugin,
      ]),
    );
    expect(merged.build?.sourcemap).toBe(true);

    const duplicate = naiveStyleIsolation({
      namespace: "consumer-app",
      root: process.cwd(),
      strict: false,
    });
    expect(() =>
      (duplicate.config as Function)(merged, { command: "serve", mode: "development" }),
    ).toThrow(/keep exactly one plugin call/);
  });

  it("rewrites only createDiscreteApi imports and leaves normal Naive UI imports optimizable", () => {
    const plugin = naiveStyleIsolation({
      namespace: "consumer-app",
      root: process.cwd(),
      strict: false,
    });
    const resolveId = plugin.resolveId as (source: string, importer?: string) => string | undefined;
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string } | undefined;
    const load = plugin.load as (id: string) => string | undefined;

    expect(resolveId("naive-ui", path.join(process.cwd(), "src/feature.ts"))).toBeUndefined();
    const result = transform(
      'import { NButton, createDiscreteApi as createApi } from "naive-ui";',
      path.join(process.cwd(), "src/feature.ts"),
    );
    expect(result?.code).toContain('import { NButton } from "naive-ui"');
    expect(result?.code).toContain(
      'import { createDiscreteApi as createApi } from "virtual:naive-style-isolation/discrete-api"',
    );

    const discreteApiId = resolveId(
      "virtual:naive-style-isolation/discrete-api",
      path.join(process.cwd(), "src/feature.ts"),
    );
    expect(discreteApiId).toContain("naive-style-isolation:discrete-api");
    const source = load(discreteApiId!);
    expect(source).toContain('from "naive-ui"');
    expect(source).toContain('from "vite-plugin-naive-style-isolation/runtime"');
    expect(source).not.toContain("export *");
    expect(source).not.toMatch(/[A-Z]:[\\/].*node_modules/i);
  });

  it("leaves third-party JavaScript and optimizer configuration unchanged", async () => {
    const plugin = naiveStyleIsolation({
      namespace: "consumer-app",
      root: process.cwd(),
      strict: false,
    });
    const consumerConfig: UserConfig = {
      optimizeDeps: {
        include: ["existing-included"],
        exclude: ["example-component-library"],
        esbuildOptions: { plugins: [existingEsbuildPlugin] },
      },
    };
    const result = await (plugin.config as Function)(consumerConfig, {
      command: "serve",
      mode: "development",
    });
    const merged = mergeConfig(consumerConfig, result);

    expect(merged.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        "existing-included",
        "naive-ui",
        "vite-plugin-naive-style-isolation/runtime",
      ]),
    );
    expect(merged.optimizeDeps?.include).not.toContain("example-component-library");
    expect(merged.optimizeDeps?.exclude).toContain("example-component-library");
    expect(merged.optimizeDeps?.esbuildOptions?.plugins).toEqual([existingEsbuildPlugin]);

    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string } | undefined;
    expect(
      transform(
        'document.querySelector(".n-input");',
        path.join(process.cwd(), "node_modules/example-component-library/es/input.js"),
      ),
    ).toBeUndefined();
    expect(
      transform(
        'import { createDiscreteApi } from "naive-ui";',
        path.join(process.cwd(), "src/feature.ts"),
      )?.code,
    ).toContain('from "virtual:naive-style-isolation/discrete-api"');
  });

  it("builds without example-component-library installed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "naive-style-isolation-no-library-"));
    const write = (relativePath: string, source: string) => {
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    };
    write("package.json", JSON.stringify({ name: "no-library-fixture" }));
    write(
      "node_modules/naive-ui/package.json",
      JSON.stringify({ name: "naive-ui", version: "2.44.1", module: "index.mjs" }),
    );
    write("node_modules/naive-ui/index.mjs", "export {};\n");
    write("src/safe.ts", "export const safe = true;\n");

    try {
      const plugin = naiveStyleIsolation({
        namespace: "no-library-fixture",
        root,
      });
      await (plugin.config as Function)({}, { command: "build", mode: "production" });

      await expect((plugin.buildStart as Function).call({})).resolves.toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("forces strict selectors in production and writes a failure audit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "naive-style-isolation-build-"));
    const write = (relativePath: string, source: string) => {
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    };
    write("package.json", JSON.stringify({ name: "strict-fixture" }));
    write(
      "node_modules/naive-ui/package.json",
      JSON.stringify({ name: "naive-ui", version: "2.44.1", module: "index.mjs" }),
    );
    write("node_modules/naive-ui/index.mjs", "export {};\n");
    write("src/unsafe.less", ".n-input { color: red; }\n");

    try {
      const plugin = naiveStyleIsolation({
        namespace: "strict-fixture",
        root,
        strict: false,
        auditReport: "reports/isolation.json",
      });
      await (plugin.config as Function)({}, { command: "build", mode: "production" });
      (plugin.configResolved as Function)({
        root,
        build: { outDir: "dist", rollupOptions: { output: { dir: "dist" } } },
      });

      await expect((plugin.buildStart as Function).call({})).rejects.toThrow(
        /must use runtime helpers or the injected Less variable/,
      );
      const report = JSON.parse(
        fs.readFileSync(path.join(root, "dist/reports/isolation.json"), "utf8"),
      );
      expect(report.failure).toMatch(/must use runtime helpers or the injected Less variable/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
