import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
export const readResolvedPackageVersion = (projectRoot, packageName) => {
    const require = createRequire(path.join(path.resolve(projectRoot), "package.json"));
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (!packageJson.version)
        throw new Error(`${packageName} package.json has no version`);
    return {
        packageRoot: path.dirname(packageJsonPath),
        packageJsonPath,
        version: packageJson.version,
    };
};
export const readResolvedNaiveUiVersion = (projectRoot) => readResolvedPackageVersion(projectRoot, "naive-ui");
