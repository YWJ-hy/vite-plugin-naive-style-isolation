import generateModule from "@babel/generator";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { NAIVE_DISCRETE_API_MODULE_ID } from "./ids.js";
import { createNaiveStyleIsolationAudit, mergeNaiveStyleIsolationAudit, } from "./types.js";
const traverse = (traverseModule.default ??
    traverseModule);
const generate = (generateModule.default ??
    generateModule);
const recordUnknown = (audit, options, node, category, detail, suggestion) => {
    const position = node.loc ? `${node.loc.start.line}:${node.loc.start.column + 1}` : "unknown";
    const value = `${options.id}:${position} [${category}] ${detail}; ${suggestion}`;
    if (!audit.unknown.includes(value))
        audit.unknown.push(value);
};
const getImportSpecifierName = (specifier) => t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
const getExportSpecifierName = (specifier) => specifier.local.name;
const recordDiscreteApiImport = (audit, id) => {
    if (!audit.discreteApis.includes(id))
        audit.discreteApis.push(id);
};
const rewriteNaiveDiscreteApiImports = (ast, audit, options) => {
    let changed = false;
    traverse(ast, {
        ImportDeclaration(importPath) {
            const source = importPath.node.source.value;
            if (!source.startsWith("naive-ui"))
                return;
            for (const specifier of importPath.node.specifiers) {
                if (t.isImportNamespaceSpecifier(specifier)) {
                    recordUnknown(audit, options, specifier, "discrete-api-namespace-import", `namespace import from ${source} exposes the unwrapped createDiscreteApi`, "use a named createDiscreteApi import from naive-ui");
                }
            }
            const discreteSpecifiers = importPath.node.specifiers.filter((specifier) => t.isImportSpecifier(specifier) &&
                getImportSpecifierName(specifier) === "createDiscreteApi");
            if (!discreteSpecifiers.length)
                return;
            if (source !== "naive-ui") {
                recordUnknown(audit, options, importPath.node, "discrete-api-deep-import", `createDiscreteApi imported via ${source}`, "import createDiscreteApi from the bare naive-ui entry");
                return;
            }
            recordDiscreteApiImport(audit, options.id);
            const remainingSpecifiers = importPath.node.specifiers.filter(specifier => !discreteSpecifiers.includes(specifier));
            const isolatedImport = t.importDeclaration(discreteSpecifiers.map(specifier => t.cloneNode(specifier)), t.stringLiteral(NAIVE_DISCRETE_API_MODULE_ID));
            if (remainingSpecifiers.length) {
                importPath.node.specifiers = remainingSpecifiers;
                importPath.insertAfter(isolatedImport);
            }
            else {
                importPath.replaceWith(isolatedImport);
            }
            changed = true;
        },
        ExportNamedDeclaration(exportPath) {
            const source = exportPath.node.source?.value;
            if (!source?.startsWith("naive-ui"))
                return;
            const discreteSpecifiers = exportPath.node.specifiers.filter((specifier) => t.isExportSpecifier(specifier) &&
                getExportSpecifierName(specifier) === "createDiscreteApi");
            if (!discreteSpecifiers.length)
                return;
            if (source !== "naive-ui") {
                recordUnknown(audit, options, exportPath.node, "discrete-api-deep-export", `createDiscreteApi re-exported via ${source}`, "re-export it from the bare naive-ui entry");
                return;
            }
            recordDiscreteApiImport(audit, options.id);
            const remainingSpecifiers = exportPath.node.specifiers.filter(specifier => !discreteSpecifiers.includes(specifier));
            const isolatedExport = t.exportNamedDeclaration(null, discreteSpecifiers.map(specifier => t.cloneNode(specifier)), t.stringLiteral(NAIVE_DISCRETE_API_MODULE_ID));
            if (remainingSpecifiers.length) {
                exportPath.node.specifiers = remainingSpecifiers;
                exportPath.insertAfter(isolatedExport);
            }
            else {
                exportPath.replaceWith(isolatedExport);
            }
            changed = true;
        },
        ExportAllDeclaration(exportPath) {
            if (exportPath.node.source.value !== "naive-ui")
                return;
            recordUnknown(audit, options, exportPath.node, "naive-ui-export-all", "export * also exposes the unwrapped createDiscreteApi", "replace it with explicit exports and re-export createDiscreteApi by name");
        },
    });
    return changed;
};
const parseProjectJavaScript = (source) => parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx", "decorators-legacy", "importAttributes"],
});
export const transformNaiveDiscreteApiImports = (source, options) => {
    const audit = createNaiveStyleIsolationAudit();
    const ast = parseProjectJavaScript(source);
    const changed = rewriteNaiveDiscreteApiImports(ast, audit, options);
    if (!changed)
        return { code: source, map: null, audit, changed };
    const generated = generate(ast, { sourceMaps: true, sourceFileName: options.id }, source);
    return { code: generated.code, map: generated.map, audit, changed };
};
export const transformProjectNaiveDiscreteApiImports = (source, options) => {
    if (!options.id.split("?")[0].endsWith(".vue") || options.id.includes("?")) {
        return transformNaiveDiscreteApiImports(source, options);
    }
    const parsed = parseSfc(source, { filename: options.id });
    if (parsed.errors.length)
        throw parsed.errors[0];
    const audit = createNaiveStyleIsolationAudit();
    const replacements = [];
    for (const block of [parsed.descriptor.script, parsed.descriptor.scriptSetup]) {
        if (!block?.content.includes("createDiscreteApi"))
            continue;
        const result = transformNaiveDiscreteApiImports(block.content, options);
        mergeNaiveStyleIsolationAudit(audit, result.audit);
        if (!result.changed)
            continue;
        const start = source.indexOf(block.content);
        replacements.push({ start, end: start + block.content.length, text: result.code });
    }
    const code = replacements
        .sort((left, right) => right.start - left.start)
        .reduce((current, replacement) => `${current.slice(0, replacement.start)}${replacement.text}${current.slice(replacement.end)}`, source);
    return { code, map: null, audit, changed: replacements.length > 0 };
};
export const assertNoUnknownNaivePatterns = (audit) => {
    if (!audit.unknown.length)
        return;
    throw new Error(`Unknown Naive UI import patterns:\n${audit.unknown.join("\n")}`);
};
