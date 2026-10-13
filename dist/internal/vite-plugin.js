import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { createAuditReport, writeAuditReport } from "./audit-report.js";
import { assertExplicitNaiveSelectors } from "./css-transform.js";
import { assertSingleNaiveUiRuntime } from "./dependency-audit.js";
import { assertNoUnknownNaivePatterns, transformProjectNaiveDiscreteApiImports, } from "./js-transform.js";
import { isProductionSource, readProductionSources } from "./file-system.js";
import { createNaiveDiscreteApiModuleSource } from "./discrete-api-module.js";
import { NAIVE_DISCRETE_API_MODULE_ID, RESOLVED_NAIVE_DISCRETE_API_MODULE_ID } from "./ids.js";
import { mergeNaiveStyleIsolationAudit } from "./types.js";
import { readResolvedNaiveUiVersion } from "./version.js";
const normalizePath = (fileName) => fileName.replaceAll("\\", "/");
const isProjectModule = (id, projectRoot) => {
    const sourceRoot = `${normalizePath(path.join(projectRoot, "src"))}/`;
    const file = normalizePath(id.split("?")[0]);
    return file.startsWith(sourceRoot) && /\.(?:vue|[cm]?[jt]sx?)$/.test(file);
};
export const assertProductionBundleIsolation = (assets, options) => {
    const violations = [];
    for (const [fileName, source] of Object.entries(assets)) {
        if (fileName.endsWith(".css")) {
            const defaultClasses = new Set();
            const unscopedSelectors = new Set();
            const root = postcss.parse(source, { from: fileName });
            root.walkRules(rule => {
                selectorParser(selectors => {
                    selectors.walkClasses(classNode => {
                        if (/^n-(?!global$)/.test(classNode.value) &&
                            !classNode.value.startsWith(`${options.clsPrefix}-`)) {
                            defaultClasses.add(classNode.value);
                        }
                    });
                    selectors.each(selector => {
                        let containsVersionedClass = false;
                        let containsNamespace = false;
                        let containsVueScope = false;
                        selector.walkClasses(classNode => {
                            if (classNode.value.startsWith(`${options.clsPrefix}-`)) {
                                containsVersionedClass = true;
                            }
                            if (classNode.value === options.namespace)
                                containsNamespace = true;
                        });
                        selector.walkAttributes(attributeNode => {
                            if (attributeNode.attribute.startsWith("data-v-"))
                                containsVueScope = true;
                        });
                        if (containsVersionedClass && !containsNamespace && !containsVueScope) {
                            unscopedSelectors.add(selector.toString());
                        }
                    });
                }).processSync(rule.selector);
            });
            if (defaultClasses.size) {
                violations.push(`${fileName}: default classes ${[...defaultClasses].join(", ")}`);
            }
            if (unscopedSelectors.size) {
                violations.push(`${fileName}: unscoped custom selector ${[...unscopedSelectors].join(", ")}`);
            }
            continue;
        }
        if (!fileName.endsWith(".js"))
            continue;
        const defaultSelectors = [
            ...source.matchAll(/["'`]\.n-(?!global\b)(?!v[0-9-]+-)[A-Za-z0-9_-]+/g),
        ].map(match => match[0].slice(1));
        if (defaultSelectors.length) {
            violations.push(`${fileName}: default selectors ${[...new Set(defaultSelectors)].join(", ")}`);
        }
        if (options.legacyVersion && source.includes(options.legacyVersion)) {
            violations.push(`${fileName}: legacy version ${options.legacyVersion}`);
        }
        if (source.includes("naive-ui-legacy")) {
            violations.push(`${fileName}: naive-ui-legacy alias marker`);
        }
    }
    if (violations.length) {
        throw new Error(`Production bundle violates Naive UI isolation:\n${violations.join("\n")}`);
    }
};
export const resolveNaiveUiRuntimeModule = (id) => {
    const normalized = normalizePath(id.split("?")[0]);
    const segments = normalized.split("/");
    let packageIndex = -1;
    for (let index = 0; index < segments.length - 1; index += 1) {
        if (segments[index] === "node_modules" &&
            (segments[index + 1] === "naive-ui" || segments[index + 1] === "naive-ui-legacy")) {
            packageIndex = index + 1;
        }
    }
    if (packageIndex < 0)
        return undefined;
    const packageName = segments[packageIndex];
    const packageRoot = segments.slice(0, packageIndex + 1).join("/");
    const packageJsonPath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(packageJsonPath))
        return undefined;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (!packageJson.version)
        return undefined;
    return {
        id,
        packageRoot,
        packageName,
        version: packageJson.version,
        testAlias: packageName === "naive-ui-legacy",
    };
};
export const createNaiveIsolationPlugin = (options) => {
    const expectedVersion = readResolvedNaiveUiVersion(options.root).version;
    const runtimeModules = new Map();
    let failureReportPath;
    let development = false;
    const report = (failure, runtimes = [...runtimeModules.values()]) => createAuditReport({
        naiveUiVersion: expectedVersion,
        clsPrefix: options.clsPrefix,
        namespace: options.namespace,
        audit: options.audit,
        productionRuntimes: runtimes,
        failure,
    });
    const writeFailureReport = (error) => {
        if (!failureReportPath)
            return;
        writeAuditReport(failureReportPath, report(error.message));
    };
    const failWithReport = (error) => {
        writeFailureReport(error);
        throw error;
    };
    return {
        name: "naive-ui-versioned-style-isolation",
        enforce: "pre",
        configResolved(config) {
            development = config.command === "serve";
            const output = Array.isArray(config.build.rollupOptions.output)
                ? config.build.rollupOptions.output[0]
                : config.build.rollupOptions.output;
            const outputDirectory = output?.dir
                ? path.resolve(options.root, output.dir)
                : path.resolve(config.root, config.build.outDir);
            failureReportPath = path.join(outputDirectory, options.auditReport);
        },
        resolveId(source) {
            if (source === NAIVE_DISCRETE_API_MODULE_ID) {
                return RESOLVED_NAIVE_DISCRETE_API_MODULE_ID;
            }
        },
        load(id) {
            if (id !== RESOLVED_NAIVE_DISCRETE_API_MODULE_ID)
                return;
            return createNaiveDiscreteApiModuleSource();
        },
        async buildStart() {
            if (development)
                return;
            try {
                assertExplicitNaiveSelectors(readProductionSources(path.join(options.root, "src"), options.root), options.explicitProjectSelectors);
            }
            catch (error) {
                failWithReport(error);
            }
        },
        transform(code, id) {
            if (development && options.explicitProjectSelectors) {
                const file = id.split("?")[0];
                if (isProductionSource(file, path.join(options.root, "src"))) {
                    // Vue subrequests may already contain generated selectors. Audit the
                    // original SFC so style-only HMR also checks current source and line numbers.
                    const source = file.endsWith(".vue") && id.includes("?")
                        ? fs.readFileSync(file, "utf8")
                        : code;
                    assertExplicitNaiveSelectors([
                        { file: normalizePath(path.relative(options.root, file)), source },
                    ], true);
                }
            }
            const projectModule = isProjectModule(id, options.root);
            if (!projectModule || !code.includes("createDiscreteApi"))
                return;
            const result = transformProjectNaiveDiscreteApiImports(code, { id });
            mergeNaiveStyleIsolationAudit(options.audit, result.audit);
            try {
                assertNoUnknownNaivePatterns(result.audit);
            }
            catch (error) {
                failWithReport(error);
            }
            if (result.changed) {
                return { code: result.code, map: result.map };
            }
        },
        moduleParsed(moduleInfo) {
            const runtime = resolveNaiveUiRuntimeModule(moduleInfo.id);
            if (runtime)
                runtimeModules.set(runtime.packageRoot, runtime);
        },
        generateBundle(_outputOptions, bundle) {
            let runtimes = [];
            try {
                assertNoUnknownNaivePatterns(options.audit);
                runtimes = assertSingleNaiveUiRuntime([...runtimeModules.values()], expectedVersion, false);
                const assets = {};
                for (const [fileName, output] of Object.entries(bundle)) {
                    if (output.type === "chunk")
                        assets[fileName] = output.code;
                    else if (typeof output.source === "string")
                        assets[fileName] = output.source;
                    else
                        assets[fileName] = Buffer.from(output.source).toString("utf8");
                }
                assertProductionBundleIsolation(assets, {
                    clsPrefix: options.clsPrefix,
                    namespace: options.namespace,
                });
            }
            catch (error) {
                failWithReport(error);
            }
            this.emitFile({
                type: "asset",
                fileName: options.auditReport,
                source: JSON.stringify(report(undefined, runtimes), null, 2),
            });
        },
    };
};
