import fs from "node:fs";
import path from "node:path";
import { createAuditReport, writeAuditReport } from "./audit-report.js";
import { assertNamespace } from "./config.js";
import { assertExplicitNaiveSelectors } from "./css-transform.js";
import { findNaiveUiRuntimes } from "./doctor.js";
import { readProductionSources, walkFiles } from "./file-system.js";
import { assertNoUnknownNaivePatterns, transformProjectNaiveDiscreteApiImports, } from "./js-transform.js";
import { encodeNaiveUiVersion } from "./shared.js";
import { createNaiveStyleIsolationAudit, mergeNaiveStyleIsolationAudit } from "./types.js";
import { readResolvedNaiveUiVersion } from "./version.js";
import { assertProductionBundleIsolation } from "./vite-plugin.js";
export const runStandaloneAudit = async ({ root, namespace, report }) => {
    assertNamespace(namespace);
    const resolvedRoot = path.resolve(root);
    const version = readResolvedNaiveUiVersion(resolvedRoot).version;
    const clsPrefix = encodeNaiveUiVersion(version);
    const audit = createNaiveStyleIsolationAudit();
    const installedRuntimes = findNaiveUiRuntimes(resolvedRoot);
    const reportPath = report ? path.resolve(resolvedRoot, report) : undefined;
    let bundleChecked = false;
    const result = (failure) => createAuditReport({
        naiveUiVersion: version,
        clsPrefix,
        namespace,
        audit,
        installedRuntimes,
        bundleChecked,
        failure,
    });
    const fail = (error) => {
        if (reportPath)
            writeAuditReport(reportPath, result(error.message));
        throw error;
    };
    const sources = readProductionSources(path.join(resolvedRoot, "src"), resolvedRoot);
    try {
        if (installedRuntimes.length !== 1) {
            throw new Error(`Expected one installed Naive UI runtime, found ${installedRuntimes.length}: ${installedRuntimes.join(", ")}`);
        }
        const manifest = JSON.parse(fs.readFileSync(path.join(resolvedRoot, "package.json"), "utf8"));
        const productionAliases = Object.entries(manifest.dependencies ?? {}).filter(([name, value]) => name !== "naive-ui" && (name.includes("naive-ui") || value.startsWith("npm:naive-ui@")));
        if (productionAliases.length) {
            throw new Error(`Naive UI production aliases bypass the single-runtime contract: ${productionAliases.map(([name]) => name).join(", ")}`);
        }
        assertExplicitNaiveSelectors(sources, true);
        for (const source of sources) {
            if (!/\.(?:vue|[cm]?[jt]sx?)$/.test(source.file) ||
                !source.source.includes("createDiscreteApi")) {
                continue;
            }
            const importAudit = transformProjectNaiveDiscreteApiImports(source.source, {
                id: path.join(resolvedRoot, source.file),
            });
            mergeNaiveStyleIsolationAudit(audit, importAudit.audit);
        }
        assertNoUnknownNaivePatterns(audit);
        const distRoot = path.join(resolvedRoot, "dist");
        const bundleFiles = walkFiles(distRoot, new Set([".js", ".css"]));
        if (bundleFiles.length) {
            const assets = Object.fromEntries(bundleFiles.map(file => [
                path.relative(distRoot, file).replaceAll("\\", "/"),
                fs.readFileSync(file, "utf8"),
            ]));
            assertProductionBundleIsolation(assets, { clsPrefix, namespace });
            bundleChecked = true;
        }
    }
    catch (error) {
        fail(error);
    }
    const completed = result();
    if (reportPath)
        writeAuditReport(reportPath, completed);
    return completed;
};
