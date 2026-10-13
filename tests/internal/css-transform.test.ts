import postcss from "postcss";
import { describe, expect, it } from "vitest";
import {
  assertExplicitNaiveSelectors,
  createNaiveSelectorPostcssPlugin,
} from "../../src/internal/css-transform.js";

const clsPrefix = "n-v2-44-1";
const namespace = "example-app";

const transform = async (css: string, from: string) => {
  const audit = {
    cssClasses: [] as string[],
    jsSelectors: [] as string[],
    staticClasses: [] as string[],
    discreteApis: [] as string[],
    unknown: [] as string[],
  };
  const result = await postcss([
    createNaiveSelectorPostcssPlugin({ clsPrefix, namespace, audit }),
  ]).process(css, { from });
  return { css: result.css, audit };
};

describe("Naive UI selector PostCSS transform", () => {
  it("rewrites project class nodes and scopes custom CSS to this project", async () => {
    const { css, audit } = await transform(
      ".c-date-picker .n-input, .n-popover:hover { color: red }",
      "C:/repo/src/date-picker.css",
    );

    expect(css).toContain(":where(.example-app) .c-date-picker .n-v2-44-1-input");
    expect(css).toContain(":where(.example-app) .n-v2-44-1-popover:hover");
    expect(audit.cssClasses).toEqual(["n-input", "n-popover"]);
  });

  it("does not double-prefix, double-scope, or rewrite the known n-global residual", async () => {
    const { css } = await transform(
      ".example-app .n-v2-44-1-button, .n-global { display: block }",
      "C:/repo/src/assets/style/global.less",
    );

    expect(css).toContain(".example-app .n-v2-44-1-button");
    expect(css).toContain(":where(.example-app) .n-global");
    expect(css).not.toContain("n-v2-44-1-v2-44-1");
  });

  it("relies on Vue scoped attributes instead of adding a second project scope", async () => {
    const { css } = await transform(
      ".n-input[data-v-contract] { height: 32px }",
      "C:/repo/src/Component.vue?vue&type=style&scoped=contract&lang.less",
    );

    expect(css).toContain(".n-v2-44-1-input[data-v-contract]");
    expect(css).not.toContain(":where(.example-app)");
  });

  it("leaves scoped deep selectors for Vue to scope after PostCSS", async () => {
    const { css } = await transform(
      ":deep(.n-v2-44-1-spin-container) { height: 100% }",
      "C:/repo/src/Component.vue?vue&type=style&index=0&scoped=contract&lang.less",
    );

    expect(css).toContain(":deep(.n-v2-44-1-spin-container)");
    expect(css).not.toContain(":where(.example-app)");
  });

  it("keeps the project namespace global inside CSS Modules", async () => {
    const { css } = await transform(
      ".promise-drawer .n-drawer-header__main { width: 100% }",
      "C:/repo/src/hooks/styles.module.less",
    );

    expect(css).toContain(
      ":global(.example-app) .promise-drawer .n-v2-44-1-drawer-header__main",
    );
  });

  it("does not transform an unrelated dependency even when its package contains src", async () => {
    const { css, audit } = await transform(
      ".n-resize-handle { cursor: n-resize }",
      "C:/repo/node_modules/unrelated-package/src/styles.css",
    );

    expect(css).toBe(".n-resize-handle { cursor: n-resize }");
    expect(audit.cssClasses).toEqual([]);
  });

  it("leaves example-component-library CSS unchanged without special handling", async () => {
    const { css, audit } = await transform(
      ".c-date-picker .n-input { color: red }",
      "C:/repo/node_modules/example-component-library/es/date-picker.css",
    );

    expect(css).toBe(".c-date-picker .n-input { color: red }");
    expect(audit.cssClasses).toEqual([]);
  });

  it("enforces explicit project Less selectors only when the maintenance switch is enabled", () => {
    const sources = [
      {
        file: "src/Component.vue",
        source: '<style lang="less">.n-input { color: red }</style>',
      },
    ];

    expect(() => assertExplicitNaiveSelectors(sources, true)).toThrow(/src\/Component\.vue/);
    expect(() => assertExplicitNaiveSelectors(sources, false)).not.toThrow();
  });

  it("rejects default Naive UI class tokens in project JavaScript DOM operations", () => {
    const sources = [
      {
        file: "src/common/utils/create-message.ts",
        source: [
          'dom.className.includes("n-message-wrapper")',
          'el.classList.add("n-button--disabled")',
          'document.getElementsByClassName("n-base-selection-input")',
        ].join("\n"),
      },
    ];

    expect(() => assertExplicitNaiveSelectors(sources, true)).toThrow(
      /src\/common\/utils\/create-message\.ts/,
    );
  });
});
