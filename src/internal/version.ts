import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export interface ResolvedPackageVersion {
  packageRoot: string;
  packageJsonPath: string;
  version: string;
}

export const readResolvedPackageVersion = (
  projectRoot: string,
  packageName: string,
): ResolvedPackageVersion => {
  const require = createRequire(path.join(path.resolve(projectRoot), "package.json"));
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };
  if (!packageJson.version) throw new Error(`${packageName} package.json has no version`);
  return {
    packageRoot: path.dirname(packageJsonPath),
    packageJsonPath,
    version: packageJson.version,
  };
};

export const readResolvedNaiveUiVersion = (projectRoot: string) =>
  readResolvedPackageVersion(projectRoot, "naive-ui");
