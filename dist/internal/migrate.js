import fs from "node:fs";
import path from "node:path";
import generateModule from "@babel/generator";
import { parse as parseJavaScript } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { baseParse, NodeTypes } from "@vue/compiler-dom";
import { parse as parseSfc } from "@vue/compiler-sfc";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { assertNamespace } from "./config.js";
import { applyReplacements, lineNumberAt, walkFiles } from "./file-system.js";
const traverse = (traverseModule.default ??
    traverseModule);
const generate = (generateModule.default ??
    generateModule);
const SELECTOR_METHODS = new Set(["querySelector", "querySelectorAll", "closest", "matches"]);
const RUNTIME_IMPORT = 'import { naiveSelector } from "vite-plugin-naive-style-isolation/runtime";\n';
const PROVIDER_IMPORT = 'import { withNaiveConfigProviderProps } from "vite-plugin-naive-style-isolation/runtime";\n';
const getMemberName = (node) => {
    if (!t.isMemberExpression(node) && !t.isOptionalMemberExpression(node))
        return undefined;
    if (!node.computed && t.isIdentifier(node.property))
        return node.property.name;
    if (t.isStringLiteral(node.property))
        return node.property.value;
    return undefined;
};
const migrateTypeScript = (file, source) => {
    const ast = parseJavaScript(source, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "importAttributes"],
    });
    const replacements = [];
    const manual = [];
    let needsImport = false;
    let hasRuntimeImport = false;
    let selectorBindingConflict = false;
    traverse(ast, {
        Program(programPath) {
            const binding = programPath.scope.getBinding("naiveSelector");
            if (binding) {
                selectorBindingConflict = !(binding.path.parentPath?.isImportDeclaration() &&
                    binding.path.parentPath.node.source.value === "vite-plugin-naive-style-isolation/runtime");
            }
        },
        ImportDeclaration(importPath) {
            if (importPath.node.source.value !== "vite-plugin-naive-style-isolation/runtime")
                return;
            hasRuntimeImport = importPath.node.specifiers.some(specifier => t.isImportSpecifier(specifier) && specifier.local.name === "naiveSelector");
        },
        CallExpression(callPath) {
            if (!SELECTOR_METHODS.has(getMemberName(callPath.node.callee) ?? ""))
                return;
            const argument = callPath.node.arguments[0];
            if (t.isStringLiteral(argument)) {
                const match = /^\.n-(?!global$)([A-Za-z0-9_-]+)$/.exec(argument.value);
                if (match && typeof argument.start === "number" && typeof argument.end === "number") {
                    replacements.push({
                        start: argument.start,
                        end: argument.end,
                        text: `naiveSelector(${JSON.stringify(match[1])})`,
                    });
                    needsImport = true;
                }
                else if (/\.n-(?!global\b)/.test(argument.value)) {
                    manual.push(`${file}:${argument.loc?.start.line ?? 1}: compound selector`);
                }
            }
            else if (argument && /\.n-(?!global\b)/.test(generate(argument).code)) {
                manual.push(`${file}:${argument.loc?.start.line ?? 1}: dynamic selector`);
            }
        },
    });
    if (needsImport && selectorBindingConflict) {
        manual.push(`${file}: naiveSelector is already bound to another value`);
    }
    if (manual.length)
        return { source, manual };
    let migrated = applyReplacements(source, replacements);
    if (needsImport && !hasRuntimeImport)
        migrated = `${RUNTIME_IMPORT}${migrated}`;
    return { source: migrated, manual };
};
const findElements = (root, tag) => {
    const matches = [];
    const visit = (node) => {
        if (node.type === NodeTypes.ELEMENT && node.tag === tag)
            matches.push(node);
        for (const child of node.children ?? [])
            visit(child);
    };
    visit(root);
    return matches;
};
const migrateVue = (file, source) => {
    const parsed = parseSfc(source, { filename: file });
    if (parsed.errors.length)
        return { source, manual: [`${file}: Vue SFC parse failed`] };
    const { template, scriptSetup } = parsed.descriptor;
    if (!template || !scriptSetup)
        return { source, manual: [] };
    const templateAst = baseParse(template.content);
    const providers = findElements(templateAst, "n-config-provider");
    if (!providers.length)
        return { source, manual: [] };
    const replacements = [];
    const manual = [];
    const templateStart = source.indexOf(template.content);
    for (const provider of providers) {
        const alreadyMigrated = provider.props.some(prop => prop.type === NodeTypes.DIRECTIVE &&
            prop.name === "bind" &&
            !prop.arg &&
            prop.exp?.loc.source.includes("withNaiveConfigProviderProps"));
        if (alreadyMigrated)
            continue;
        const controlled = provider.props.filter(prop => {
            if (prop.type === NodeTypes.ATTRIBUTE)
                return prop.name === "namespace";
            if (prop.type !== NodeTypes.DIRECTIVE || prop.name !== "bind")
                return false;
            return (prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
                ["cls-prefix", "inline-theme-disabled"].includes(prop.arg.content));
        });
        if (!controlled.length) {
            manual.push(`${file}:${lineNumberAt(source, templateStart + provider.loc.start.offset)}: non-standard ConfigProvider`);
            continue;
        }
        for (const prop of controlled) {
            let start = templateStart + prop.loc.start.offset;
            while (start > templateStart && /[ \t]/.test(source[start - 1]))
                start -= 1;
            replacements.push({ start, end: templateStart + prop.loc.end.offset, text: "" });
        }
        const insertion = templateStart + provider.loc.start.offset + 1 + provider.tag.length;
        replacements.push({
            start: insertion,
            end: insertion,
            text: ' v-bind="withNaiveConfigProviderProps()"',
        });
    }
    if (manual.length || !replacements.length)
        return { source, manual };
    if (!scriptSetup.content.includes("withNaiveConfigProviderProps")) {
        const scriptStart = source.indexOf(scriptSetup.content, templateStart + template.content.length);
        replacements.push({ start: scriptStart, end: scriptStart, text: PROVIDER_IMPORT });
    }
    return { source: applyReplacements(source, replacements), manual };
};
const migrateLess = (file, source) => {
    if (!/\.n-(?!global\b)[A-Za-z0-9_-]+/.test(source))
        return { source, manual: [] };
    const root = postcss.parse(source, { from: file });
    const manual = [];
    root.walkRules(rule => {
        const replacements = [];
        selectorParser(selectors => {
            selectors.walkClasses(classNode => {
                if (classNode.value === "n-global" || classNode.value.startsWith("n-v"))
                    return;
                if (!classNode.value.startsWith("n-"))
                    return;
                if (classNode.sourceIndex === undefined) {
                    manual.push(`${file}: selector location unavailable`);
                    return;
                }
                replacements.push({
                    start: classNode.sourceIndex,
                    end: classNode.sourceIndex + classNode.value.length + 1,
                    text: `.@{naive-cls-prefix}-${classNode.value.slice(2)}`,
                });
            });
        }).processSync(rule.selector);
        rule.selector = applyReplacements(rule.selector, replacements);
    });
    return { source: root.toString(), manual };
};
export const runMigrate = ({ root, namespace, write }) => {
    assertNamespace(namespace);
    const sourceRoot = path.join(path.resolve(root), "src");
    const files = walkFiles(sourceRoot, new Set([".ts", ".tsx", ".vue", ".less"]));
    const changes = [];
    const manual = [];
    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        const extension = path.extname(file);
        const result = extension === ".vue"
            ? migrateVue(file, source)
            : extension === ".less"
                ? migrateLess(file, source)
                : migrateTypeScript(file, source);
        manual.push(...result.manual);
        if (result.source !== source)
            changes.push({ file, source: result.source });
    }
    if (manual.length) {
        const error = new Error(`manual migration required\n${manual.map(item => `- ${item}`).join("\n")}`);
        Object.assign(error, { exitCode: 2 });
        throw error;
    }
    if (!changes.length)
        return "migrate: no changes";
    if (!write) {
        return `migrate: dry-run\n${changes.map(change => `- would update ${path.relative(root, change.file)}`).join("\n")}`;
    }
    for (const change of changes)
        fs.writeFileSync(change.file, change.source);
    return `migrate: updated ${changes.length} files`;
};
