import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

export const resolveTool = specifier => {
  const separator = specifier.lastIndexOf("#");
  if (separator < 0) return require.resolve(specifier);
  const packageName = specifier.slice(0, separator);
  const binName = specifier.slice(separator + 1);
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binName];
  if (!bin) throw new Error(`${packageName} does not declare the ${binName} binary`);
  return path.resolve(path.dirname(manifestPath), bin);
};

export const runNodeTool = (specifier, args, options = {}) => {
  const result = spawnSync(process.execPath, [resolveTool(specifier), ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    throw new Error(`${specifier} failed with exit code ${result.status}${details}`);
  }
  return result;
};
