import { describe, expect, it } from "vitest";
import {
  assertSingleNaiveUiRuntime,
  type NaiveUiRuntimeModule,
} from "../../src/internal/dependency-audit.js";

const currentRuntime: NaiveUiRuntimeModule = {
  id: "C:/repo/node_modules/naive-ui/es/button/index.mjs",
  packageRoot: "C:/repo/node_modules/naive-ui",
  packageName: "naive-ui",
  version: "2.44.1",
  testAlias: false,
};

describe("production Naive UI dependency audit", () => {
  it("accepts one resolved production runtime", () => {
    expect(assertSingleNaiveUiRuntime([currentRuntime], "2.44.1", false)).toEqual([currentRuntime]);
  });

  it("rejects a second runtime even when it comes from a controlled dependency", () => {
    const nestedRuntime: NaiveUiRuntimeModule = {
      id: "C:/repo/node_modules/cnhis-design-vue/node_modules/naive-ui/es/button/index.mjs",
      packageRoot: "C:/repo/node_modules/cnhis-design-vue/node_modules/naive-ui",
      packageName: "naive-ui",
      version: "2.43.2",
      testAlias: false,
    };

    expect(() =>
      assertSingleNaiveUiRuntime([currentRuntime, nestedRuntime], "2.44.1", false),
    ).toThrow(/2 Naive UI runtimes/);
  });

  it("allows the explicit legacy alias only in tests and rejects it in production chunks", () => {
    const legacyRuntime: NaiveUiRuntimeModule = {
      id: "C:/repo/node_modules/naive-ui-legacy/es/button/index.mjs",
      packageRoot: "C:/repo/node_modules/naive-ui-legacy",
      packageName: "naive-ui-legacy",
      version: "2.43.2",
      testAlias: true,
    };

    expect(assertSingleNaiveUiRuntime([currentRuntime, legacyRuntime], "2.44.1", true)).toEqual([
      currentRuntime,
    ]);
    expect(() =>
      assertSingleNaiveUiRuntime([currentRuntime, legacyRuntime], "2.44.1", false),
    ).toThrow(/test alias.*production/i);
  });
});
