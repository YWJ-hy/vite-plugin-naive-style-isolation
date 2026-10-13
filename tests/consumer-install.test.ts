import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sourcePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = path.resolve(process.env.NAIVE_ISOLATION_PACKAGE_PATH ?? sourcePackageRoot);
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "naive-style-isolation-consumer-"));
const packageManager = process.env.npm_execpath;

const write = (relativePath: string, source: string) => {
  const file = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
};

const runPackageManager = (args: string[]) => {
  if (!packageManager) throw new Error("The consumer install test must run through npm or Yarn");
  return execFileSync(process.execPath, [packageManager, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    timeout: 180_000,
  });
};

const findNpmConfig = () => {
  for (const start of [process.cwd(), sourcePackageRoot]) {
    let directory = path.resolve(start);
    while (true) {
      const candidate = path.join(directory, ".npmrc");
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return undefined;
};

beforeAll(() => {
  if (!packageManager) throw new Error("Run the consumer test through npm or Yarn");
  const tarball = path.join(fixtureRoot, "plugin.tgz");
  if (path.basename(packageManager).startsWith("npm")) {
    const packed = JSON.parse(execFileSync(process.execPath, [packageManager,
      "pack", "--ignore-scripts", "--json", "--pack-destination", fixtureRoot], {
      cwd: packageRoot, encoding: "utf8", timeout: 180_000,
    }));
    fs.renameSync(path.join(fixtureRoot, packed[0].filename), tarball);
  } else {
    execFileSync(process.execPath, [packageManager, "pack", "--filename", tarball], {
      cwd: packageRoot, encoding: "utf8", timeout: 180_000,
    });
  }
  const fileDependency = `file:${tarball.replaceAll("\\", "/")}`;
  const callerNpmConfig = findNpmConfig();
  if (callerNpmConfig) {
    fs.copyFileSync(callerNpmConfig, path.join(fixtureRoot, ".npmrc"));
  }
  write(
    "package.json",
    JSON.stringify({
      name: "naive-style-isolation-consumer-fixture",
      private: true,
      type: "module",
      scripts: { build: "vite build" },
      dependencies: {
        "naive-ui": "2.44.1",
        "vite-plugin-naive-style-isolation": fileDependency,
        vite: "6.2.0",
        vue: "3.5.13",
      },
      resolutions: { vite: "6.2.0", vue: "3.5.13", "naive-ui": "2.44.1" },
    }),
  );
  write(
    "vite.config.js",
    `import { defineConfig } from "vite";\nimport naiveStyleIsolation from "vite-plugin-naive-style-isolation";\nexport default defineConfig({ plugins: [naiveStyleIsolation({ namespace: "fixture-app" })] });\n`,
  );
  write("index.html", '<div id="app"></div><script type="module" src="/src/main.js"></script>\n');
  write(
    "src/main.js",
    `import { createApp, h } from "vue";\nimport { NButton, NConfigProvider } from "naive-ui";\nimport { NAIVE_ROOT_CLASS, withNaiveConfigProviderProps } from "vite-plugin-naive-style-isolation/runtime";\ncreateApp({ render: () => h(NConfigProvider, { ...withNaiveConfigProviderProps(), class: NAIVE_ROOT_CLASS }, { default: () => h(NButton, null, { default: () => "fixture" }) }) }).mount("#app");\n`,
  );

  runPackageManager(["install", "--ignore-scripts"]);
}, 180_000);

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("installed package tarball consumer", () => {
  it("builds through only the package public interfaces", () => {
    const output = runPackageManager(["run", "build"]);
    const reportPath = path.join(fixtureRoot, "dist/naive-style-isolation-audit.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

    expect(output).toContain("built in");
    expect(report).toMatchObject({
      schemaVersion: 1,
      naiveUiVersion: "2.44.1",
      clsPrefix: "n-v2-44-1",
      namespace: "fixture-app",
      unknown: [],
    });
    expect(report.productionRuntimes).toHaveLength(1);
  }, 180_000);
});
