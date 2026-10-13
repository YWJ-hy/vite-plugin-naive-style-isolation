import fs from "node:fs";
import path from "node:path";
import type { NaiveUiRuntimeModule } from "./dependency-audit.js";
import type { NaiveStyleIsolationAudit } from "./types.js";

export interface CreateAuditReportOptions {
  naiveUiVersion: string;
  clsPrefix: string;
  namespace: string;
  audit: NaiveStyleIsolationAudit;
  productionRuntimes?: NaiveUiRuntimeModule[];
  installedRuntimes?: string[];
  bundleChecked?: boolean;
  failure?: string;
}

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

export const createAuditReport = (options: CreateAuditReportOptions) => ({
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

export const writeAuditReport = (file: string, report: ReturnType<typeof createAuditReport>) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
};
