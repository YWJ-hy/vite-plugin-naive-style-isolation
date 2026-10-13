import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const readFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? readFiles(file) : [fs.readFileSync(file, "utf8")];
  });

describe("package exports", () => {
  it("resolves the plugin and runtime from committed dist", async () => {
    const plugin = await import("vite-plugin-naive-style-isolation");
    const runtime = await import("vite-plugin-naive-style-isolation/runtime");
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

    expect(plugin.default).toBeTypeOf("function");
    expect(runtime.naiveSelector("button")).toBe(".n-v2-44-1-button");
    expect(manifest).toMatchObject({
      name: "vite-plugin-naive-style-isolation",
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
      bin: { "naive-style-isolation": "dist/cli.js" },
    });
    expect(fs.existsSync(path.join(packageRoot, "dist/cli.js"))).toBe(true);
  });

  it("does not embed the maintenance repository path in dist", () => {
    const distRoot = path.join(packageRoot, "dist");
    const dist = readFiles(distRoot).join("\n").replaceAll("\\", "/");
    const maps = fs
      .readdirSync(distRoot, { recursive: true })
      .filter(file => String(file).endsWith(".map"));
    const declarations = fs
      .readdirSync(distRoot, { recursive: true })
      .map(String)
      .filter(file => file.endsWith(".d.ts"))
      .map(file => file.replaceAll("\\", "/"))
      .sort();

    expect(dist).not.toContain(packageRoot.replaceAll("\\", "/"));
    expect(dist).not.toMatch(/[A-Z]:\/projects\//i);
    expect(maps).toEqual([]);
    expect(declarations).toEqual(["index.d.ts", "internal/runtime-core.d.ts", "runtime.d.ts"]);
  });
});
