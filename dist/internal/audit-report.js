import fs from "node:fs";
import path from "node:path";
const uniqueSorted = (values) => [...new Set(values)].sort();
export const createAuditReport = (options) => ({
    schemaVersion: 1,
    naiveUiVersion: options.naiveUiVersion,
    clsPrefix: options.clsPrefix,
    namespace: options.namespace,
    cssClasses: uniqueSorted(options.audit.cssClasses),
    jsSelectors: uniqueSorted(options.audit.jsSelectors),
    staticClasses: uniqueSorted(options.audit.staticClasses),
    discreteApis: uniqueSorted(options.audit.discreteApis),
    unknown: uniqueSorted(options.audit.unknown),
    ...(options.productionRuntimes ? { productionRuntimes: options.productionRuntimes } : undefined),
    ...(options.installedRuntimes ? { installedRuntimes: options.installedRuntimes } : undefined),
    ...(options.bundleChecked !== undefined ? { bundleChecked: options.bundleChecked } : undefined),
    ...(options.failure ? { failure: options.failure } : undefined),
});
export const writeAuditReport = (file, report) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
};
