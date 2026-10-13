import type { Plugin as PostcssPlugin } from "postcss";
import selectorParser from "postcss-selector-parser";
import type { NaiveStyleIsolationAudit } from "./types.js";

interface SourceText {
  file: string;
  source: string;
}

interface NaiveSelectorPostcssOptions {
  clsPrefix: string;
  namespace: string;
  audit: NaiveStyleIsolationAudit;
}

const DEFAULT_NAIVE_CLASS_PATTERN = /^n-(?!global$)(.+)$/;
const DEFAULT_NAIVE_CLASS_LITERAL_PATTERN = /["'`]n-(?!global\b)[A-Za-z0-9_-]+/;

const uniquePush = (items: string[], item: string) => {
  if (!items.includes(item)) items.push(item);
};

const isAllowedSource = (fileName: string) => {
  const normalized = fileName.replaceAll("\\", "/");
  return !normalized.includes("/node_modules/") && normalized.includes("/src/");
};

const prependNamespaceScope = (selector: any, namespace: string, cssModule: boolean) => {
  if (selector.first) selector.first.spaces.before = "";
  const scope = selectorParser().astSync(
    `${cssModule ? `:global(.${namespace})` : `:where(.${namespace})`} `,
  ).first;
  for (const node of [...scope.nodes].reverse()) selector.prepend(node.clone());
};

export const rewriteNaiveSelector = (selector: string, clsPrefix: string) => {
  const classes: string[] = [];
  const processor = selectorParser(root => {
    root.walkClasses(classNode => {
      const match = DEFAULT_NAIVE_CLASS_PATTERN.exec(classNode.value);
      if (!match || classNode.value.startsWith(`${clsPrefix}-`)) return;
      uniquePush(classes, classNode.value);
      classNode.value = `${clsPrefix}-${match[1]}`;
    });
  });
  return { selector: processor.processSync(selector), classes };
};

export const createNaiveSelectorPostcssPlugin = ({
  clsPrefix,
  namespace,
  audit,
}: NaiveSelectorPostcssOptions): PostcssPlugin => ({
  postcssPlugin: "naive-ui-versioned-selector",
  Rule(rule) {
    const fileName = rule.source?.input.file ?? "";
    if (!isAllowedSource(fileName)) return;
    const cssModule = /\.module\.(?:css|less|scss|sass|styl)(?:$|\?)/.test(fileName);
    const vueScoped = /[?&]scoped(?:=|&|$)/.test(fileName);

    const processor = selectorParser(root => {
      root.walkClasses(classNode => {
        const match = DEFAULT_NAIVE_CLASS_PATTERN.exec(classNode.value);
        if (!match || classNode.value.startsWith(`${clsPrefix}-`)) return;
        uniquePush(audit.cssClasses, classNode.value);
        classNode.value = `${clsPrefix}-${match[1]}`;
      });

      root.each(selector => {
        let containsNaiveClass = false;
        let containsNamespace = false;
        let containsVueScope = false;
        selector.walkClasses(classNode => {
          if (classNode.value === namespace) containsNamespace = true;
          if (classNode.value === "n-global" || classNode.value.startsWith(`${clsPrefix}-`)) {
            containsNaiveClass = true;
          }
        });
        selector.walkAttributes(attributeNode => {
          if (attributeNode.attribute.startsWith("data-v-")) containsVueScope = true;
        });
        if (containsNaiveClass && !containsNamespace && !containsVueScope && !vueScoped) {
          prependNamespaceScope(selector, namespace, cssModule);
        }
      });
    });
    rule.selector = processor.processSync(rule.selector);
  },
});

createNaiveSelectorPostcssPlugin.postcss = true;

export const assertExplicitNaiveSelectors = (sources: SourceText[], enabled: boolean) => {
  if (!enabled) return;
  const violations: string[] = [];
  for (const { file, source } of sources) {
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        /\.n-(?!global\b)[A-Za-z0-9_-]+/.test(line) ||
        DEFAULT_NAIVE_CLASS_LITERAL_PATTERN.test(line)
      ) {
        violations.push(`${file}:${index + 1}`);
      }
    });
  }
  if (violations.length) {
    throw new Error(
      `Project source must use runtime helpers or the injected Less variable instead of literal Naive UI selectors and class tokens:\n${violations.join("\n")}`,
    );
  }
};
