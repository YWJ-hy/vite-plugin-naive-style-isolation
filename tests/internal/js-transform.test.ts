import { describe, expect, it } from "vitest";
import {
  transformNaiveDiscreteApiImports,
  transformProjectNaiveDiscreteApiImports,
} from "../../src/internal/js-transform.js";

describe("project createDiscreteApi import adapter", () => {
  it("rewrites script setup imports without changing other Naive UI imports", () => {
    const source = `<template><n-button /></template>
<script setup lang="ts">
import { NButton, createDiscreteApi as createApi } from "naive-ui";
const api = createApi(["message"]);
</script>`;
    const result = transformProjectNaiveDiscreteApiImports(source, {
      id: "C:/repo/src/App.vue",
    });

    expect(result.changed).toBe(true);
    expect(result.code).toContain('import { NButton } from "naive-ui"');
    expect(result.code).toContain(
      'import { createDiscreteApi as createApi } from "virtual:naive-style-isolation/discrete-api"',
    );
    expect(result.code).toContain("<template><n-button /></template>");
  });

  it("fails closed for namespace and deep imports", () => {
    const namespace = transformNaiveDiscreteApiImports(
      'import * as NaiveUI from "naive-ui"; NaiveUI.createDiscreteApi(["message"]);',
      { id: "C:/repo/src/namespace.ts" },
    );
    const deep = transformNaiveDiscreteApiImports(
      'import { createDiscreteApi } from "naive-ui/es/discrete";',
      { id: "C:/repo/src/deep.ts" },
    );

    expect(namespace.audit.unknown[0]).toContain("[discrete-api-namespace-import]");
    expect(deep.audit.unknown[0]).toContain("[discrete-api-deep-import]");
  });
});
