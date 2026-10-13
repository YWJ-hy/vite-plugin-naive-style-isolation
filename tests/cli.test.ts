import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const namespace = "fixture-app";
let fixtureRoot = "";

const write = (relativePath: string, source: string) => {
  const file = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
};

const installFakePackage = (name: string, version: string) => {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version, module: "index.mjs" }),
  );
  write(`node_modules/${name}/index.mjs`, "export {};\n");
};

const run = (...args: string[]) =>
  execFileSync(process.execPath, [cliPath, ...args, "--root", fixtureRoot], {
    encoding: "utf8",
  });

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "naive-style-isolation-cli-"));
  write(
    "package.json",
    JSON.stringify({
      name: "fixture-consumer",
      dependencies: {
        "naive-ui": "2.44.1",
        vite: "6.2.0",
        vue: "3.5.13",
      },
      devDependencies: {
        "vite-plugin-naive-style-isolation": "file:vendor/vite-plugin-naive-style-isolation",
      },
    }),
  );
  installFakePackage("naive-ui", "2.44.1");
  installFakePackage("vite", "6.2.0");
  installFakePackage("vue", "3.5.13");
  write(
    "vite.config.ts",
    `import naiveStyleIsolation from "vite-plugin-naive-style-isolation";\nexport default { plugins: [naiveStyleIsolation({ namespace: "${namespace}" })] };\n`,
  );
  write(
    "src/App.vue",
    `<template>\n  <n-config-provider namespace="${namespace}" :cls-prefix="legacyPrefix" :inline-theme-disabled="false" :theme-overrides="themeOverrides">\n    <router-view />\n  </n-config-provider>\n</template>\n<script setup lang="ts">\nconst themeOverrides = {};\nconst legacyPrefix = "n";\n</script>\n`,
  );
  write("src/use-selector.ts", `document.querySelector(".n-button");\n`);
  write("src/styles.less", `.screen .n-input { color: red; }\n`);
});

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("CLI public interface", () => {
  it("diagnoses a compatible consumer", () => {
    run("migrate", "--namespace", namespace, "--write");
    const output = run("doctor", "--namespace", namespace);

    expect(output).toContain("doctor: compatible");
    expect(output).toContain("naive-ui 2.44.1");
  });

  it("reports missing peers and multiple installed runtimes", () => {
    run("migrate", "--namespace", namespace, "--write");
    fs.rmSync(path.join(fixtureRoot, "node_modules/vue"), { recursive: true, force: true });
    write(
      "node_modules/example-library/node_modules/naive-ui/package.json",
      JSON.stringify({ name: "naive-ui", version: "2.43.2", module: "index.mjs" }),
    );
    const doctor = spawnSync(
      process.execPath,
      [cliPath, "doctor", "--namespace", namespace, "--root", fixtureRoot],
      { encoding: "utf8" },
    );
    const audit = spawnSync(
      process.execPath,
      [cliPath, "audit", "--namespace", namespace, "--root", fixtureRoot],
      { encoding: "utf8" },
    );

    expect(doctor.status).toBe(1);
    expect(doctor.stderr).toContain("missing installed peer dependency vue");
    expect(doctor.stderr).toContain("multiple Naive UI runtimes");
    expect(audit.status).toBe(1);
    expect(audit.stderr).toContain("Expected one installed Naive UI runtime, found 2");
  });

  it("migrates standard providers and selectors only when --write is explicit", () => {
    const appBefore = fs.readFileSync(path.join(fixtureRoot, "src/App.vue"), "utf8");
    const selectorBefore = fs.readFileSync(path.join(fixtureRoot, "src/use-selector.ts"), "utf8");
    const dryRun = run("migrate", "--namespace", namespace);

    expect(dryRun).toContain("dry-run");
    expect(fs.readFileSync(path.join(fixtureRoot, "src/App.vue"), "utf8")).toBe(appBefore);
    expect(fs.readFileSync(path.join(fixtureRoot, "src/use-selector.ts"), "utf8")).toBe(
      selectorBefore,
    );

    const written = run("migrate", "--namespace", namespace, "--write");
    expect(written).toContain("updated 3 files");
    expect(fs.readFileSync(path.join(fixtureRoot, "src/App.vue"), "utf8")).toContain(
      'v-bind="withNaiveConfigProviderProps()"',
    );
    expect(fs.readFileSync(path.join(fixtureRoot, "src/App.vue"), "utf8")).toContain(
      'from "vite-plugin-naive-style-isolation/runtime"',
    );
    expect(fs.readFileSync(path.join(fixtureRoot, "src/use-selector.ts"), "utf8")).toContain(
      'naiveSelector("button")',
    );
    expect(fs.readFileSync(path.join(fixtureRoot, "src/styles.less"), "utf8")).toContain(
      ".@{naive-cls-prefix}-input",
    );
    expect(run("migrate", "--namespace", namespace, "--write")).toContain("no changes");
  });

  it("refuses to write when a dynamic selector needs manual migration", () => {
    write("src/use-selector.ts", "document.querySelector(`.n-${component}`);\n");
    const before = fs.readFileSync(path.join(fixtureRoot, "src/use-selector.ts"), "utf8");
    const result = spawnSync(
      process.execPath,
      [cliPath, "migrate", "--namespace", namespace, "--write", "--root", fixtureRoot],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("manual migration required");
    expect(fs.readFileSync(path.join(fixtureRoot, "src/use-selector.ts"), "utf8")).toBe(before);
  });

  it("runs the shared audit independently and writes a machine-readable report", () => {
    run("migrate", "--namespace", namespace, "--write");
    write("src/ignored.test.ts", 'document.querySelector(".n-test-only");\n');
    write("src/ignored.d.ts", 'declare const selector: ".n-declaration-only";\n');
    const report = path.join(fixtureRoot, "audit.json");
    const output = run("audit", "--namespace", namespace, "--report", report);

    expect(output).toContain("audit: passed");
    expect(JSON.parse(fs.readFileSync(report, "utf8"))).toMatchObject({
      schemaVersion: 1,
      naiveUiVersion: "2.44.1",
      namespace,
      unknown: [],
    });
  });
});
