import { describe, expect, it } from "vitest";
import {
  encodeNaiveUiVersion,
  mergeNamespace,
  naiveClass,
  naiveSelector,
} from "../../src/internal/shared.js";

describe("Naive UI style isolation shared contract", () => {
  it("keeps stable versions readable and encodes the complete version without collisions", () => {
    expect(encodeNaiveUiVersion("2.44.1")).toBe("n-v2-44-1");
    expect(encodeNaiveUiVersion("2.44.1-beta.1")).not.toBe(encodeNaiveUiVersion("2.44.1+beta.1"));
    expect(encodeNaiveUiVersion("2.44.1-beta.1+build.7")).toBe(
      encodeNaiveUiVersion("2.44.1-beta.1+build.7"),
    );
    expect(encodeNaiveUiVersion("release/2.44.1")).toMatch(/^n-vx[0-9a-f]+$/);
  });

  it("builds runtime class names and selectors from the shared prefix", () => {
    const prefix = "n-v2-44-1";

    expect(naiveClass("button", prefix)).toBe("n-v2-44-1-button");
    expect(naiveSelector("date-panel-actions", prefix)).toBe(".n-v2-44-1-date-panel-actions");
  });

  it("adds the project namespace once while retaining consumer namespaces", () => {
    expect(mergeNamespace("example-app", undefined)).toBe("example-app");
    expect(mergeNamespace("example-app", "consumer-layer")).toBe(
      "consumer-layer example-app",
    );
    expect(mergeNamespace("example-app", "consumer-layer example-app")).toBe(
      "consumer-layer example-app",
    );
  });
});
