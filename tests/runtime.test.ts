import { ref } from "vue";
import { describe, expect, it } from "vitest";
import {
  NAIVE_ROOT_CLASS,
  NAIVE_STYLE_NAMESPACE,
  NAIVE_UI_CLS_PREFIX,
  NAIVE_UI_VERSION,
  naiveClassName,
  naiveSelector,
  withNaiveConfigProviderProps,
  withNaiveMessageProviderProps,
  withNaiveNotificationProviderProps,
} from "../src/runtime.js";

describe("runtime public interface", () => {
  it("exposes the build-resolved identity and DOM helpers", () => {
    expect(NAIVE_UI_VERSION).toBe("2.44.1");
    expect(NAIVE_UI_CLS_PREFIX).toBe("n-v2-44-1");
    expect(NAIVE_STYLE_NAMESPACE).toBe("consumer-app");
    expect(NAIVE_ROOT_CLASS).toBe("consumer-app");
    expect(naiveClassName("button")).toBe("n-v2-44-1-button");
    expect(naiveSelector("date-panel-actions")).toBe(".n-v2-44-1-date-panel-actions");
  });

  it("merges provider props without losing consumer settings", () => {
    expect(
      withNaiveConfigProviderProps({
        namespace: "print-layer",
        inlineThemeDisabled: true,
        locale: "consumer-locale",
      }),
    ).toEqual({
      namespace: "print-layer consumer-app",
      inlineThemeDisabled: false,
      locale: "consumer-locale",
      clsPrefix: "n-v2-44-1",
    });
    expect(withNaiveMessageProviderProps({ max: 5 })).toEqual({
      max: 5,
      containerClass: "consumer-app",
    });
    expect(
      withNaiveNotificationProviderProps({
        placement: "bottom-right",
        containerClass: "print-layer",
      }),
    ).toEqual({
      placement: "bottom-right",
      containerClass: "print-layer consumer-app",
    });
  });

  it("keeps reactive provider settings reactive", () => {
    const source = ref({ locale: "zh-CN", namespace: "reactive-layer" });
    const merged = withNaiveConfigProviderProps(source);

    expect(merged.value.namespace).toBe("reactive-layer consumer-app");
    source.value = { locale: "en-US", namespace: "next-layer" };
    expect(merged.value).toMatchObject({
      locale: "en-US",
      namespace: "next-layer consumer-app",
    });
  });
});
