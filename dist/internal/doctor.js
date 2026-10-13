import fs from "node:fs";
import path from "node:path";
import { assertNamespace } from "./config.js";
import { walkFiles } from "./file-system.js";
import { readResolvedPackageVersion } from "./version.js";
const PEER_PACKAGES = ["naive-ui", "vite", "vue"];
const readFiles = (files) => files.map(file => ({ file, source: fs.readFileSync(file, "utf8") }));
export const findNaiveUiRuntimes = (root) => {
    const nodeModules = path.join(root, "node_modules");
    if (!fs.existsSync(nodeModules))
        return [];
    const matches = [];
    const record = (directory) => {
        const candidate = path.join(directory, "naive-ui");
        if (fs.existsSync(path.join(candidate, "package.json")))
            matches.push(candidate);
    };
    const packageRoots = [];
    record(nodeModules);
    for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith("."))
            continue;
        const packageRoot = path.join(nodeModules, entry.name);
        if (entry.name.startsWith("@")) {
            for (const scopedEntry of fs.readdirSync(packageRoot, { withFileTypes: true })) {
                if (scopedEntry.isDirectory())
                    packageRoots.push(path.join(packageRoot, scopedEntry.name));
            }
        }
        else {
            packageRoots.push(packageRoot);
        }
    }
    for (const packageRoot of packageRoots)
        record(path.join(packageRoot, "node_modules"));
    return [...new Set(matches.map(item => path.resolve(item)))];
};
export const runDoctor = ({ root, namespace }) => {
    assertNamespace(namespace);
    const resolvedRoot = path.resolve(root);
    const findings = [];
    const versions = [];
    if (!fs.existsSync(path.join(resolvedRoot, "package.json"))) {
        findings.push("missing package.json");
    }
    for (const packageName of PEER_PACKAGES) {
        try {
            const resolved = readResolvedPackageVersion(resolvedRoot, packageName);
            versions.push(`${packageName} ${resolved.version}`);
        }
        catch {
            findings.push(`missing installed peer dependency ${packageName}`);
        }
    }
    const viteConfigs = readFiles(["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]
        .map(file => path.join(resolvedRoot, file))
        .filter(file => fs.existsSync(file)));
    if (!viteConfigs.some(({ source }) => source.includes("vite-plugin-naive-style-isolation") &&
        source.includes("naiveStyleIsolation") &&
        source.includes(namespace))) {
        findings.push("Vite plugin call with the requested namespace was not found");
    }
    const vueSources = readFiles(walkFiles(path.join(resolvedRoot, "src"), new Set([".vue"])));
    const appRoots = vueSources.filter(({ file, source }) => path.basename(file) === "App.vue" && source.includes("<n-config-provider"));
    if (!appRoots.length ||
        appRoots.some(({ source }) => !source.includes("vite-plugin-naive-style-isolation/runtime") ||
            !source.includes("withNaiveConfigProviderProps"))) {
        findings.push("root ConfigProvider is not connected to the package runtime");
    }
    const runtimes = findNaiveUiRuntimes(resolvedRoot);
    if (runtimes.length > 1) {
        findings.push(`multiple Naive UI runtimes found: ${runtimes.join(", ")}`);
    }
    if (findings.length) {
        throw new Error(`doctor: incompatible\n${findings.map(item => `- ${item}`).join("\n")}`);
    }
    return `doctor: compatible\n${versions.map(item => `- ${item}`).join("\n")}`;
};
