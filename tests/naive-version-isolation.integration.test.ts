// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, type App, type Component } from "vue";
import {
  NButton,
  NConfigProvider,
  NDrawer,
  NGlobalStyle,
  NModal,
  createDiscreteApi,
} from "naive-ui";
import {
  NButton as LegacyButton,
  NConfigProvider as LegacyConfigProvider,
  NGlobalStyle as LegacyGlobalStyle,
} from "naive-ui-legacy";
import { readResolvedPackageVersion } from "../src/internal/version.js";
import { encodeNaiveUiVersion } from "../src/internal/shared.js";
import { createIsolatedDiscreteApi } from "../src/internal/runtime-core.js";
import { NAIVE_STYLE_NAMESPACE, NAIVE_UI_CLS_PREFIX } from "../src/runtime.js";

interface NaiveVersion {
  name: string;
  prefix: string;
  ConfigProvider: Component;
  Button: Component;
  GlobalStyle: Component;
}

const legacyVersion = readResolvedPackageVersion(process.cwd(), "naive-ui-legacy").version;
const current: NaiveVersion = {
  name: "current",
  prefix: NAIVE_UI_CLS_PREFIX,
  ConfigProvider: NConfigProvider,
  Button: NButton,
  GlobalStyle: NGlobalStyle,
};
const legacy: NaiveVersion = {
  name: "legacy",
  prefix: encodeNaiveUiVersion(legacyVersion),
  ConfigProvider: LegacyConfigProvider,
  Button: LegacyButton,
  GlobalStyle: LegacyGlobalStyle,
};

const apps: App[] = [];

const flushStyles = async () => {
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
};

const mountButton = (version: NaiveVersion, includeGlobalStyle = false) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(
        version.ConfigProvider,
        {
          clsPrefix: version.prefix,
          namespace: NAIVE_STYLE_NAMESPACE,
          inlineThemeDisabled: false,
        },
        {
          default: () => [
            includeGlobalStyle ? h(version.GlobalStyle) : null,
            h(version.Button, { id: `${version.name}-button` }, { default: () => version.name }),
          ],
        },
      ),
  });
  app.mount(host);
  apps.push(app);
  return host;
};

const versionStyleElements = (prefix: string) =>
  [...document.head.querySelectorAll<HTMLStyleElement>("style[cssr-id]")].filter(style =>
    style.getAttribute("cssr-id")?.startsWith(prefix),
  );

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[cssr-id]").forEach(style => style.remove());
});

describe("Naive UI versioned style isolation", () => {
  it.each([
    [current, legacy],
    [legacy, current],
  ])("isolates DOM classes and CSSR styles for $0.name -> $1.name", async (first, second) => {
    const firstHost = mountButton(first);
    const secondHost = mountButton(second);
    await flushStyles();

    expect(firstHost.querySelector(`.${first.prefix}-button`)).not.toBeNull();
    expect(secondHost.querySelector(`.${second.prefix}-button`)).not.toBeNull();
    expect(versionStyleElements(first.prefix).length).toBeGreaterThan(0);
    expect(versionStyleElements(second.prefix).length).toBeGreaterThan(0);
    expect(document.head.textContent).toContain(`.${first.prefix}-button`);
    expect(document.head.textContent).toContain(`.${second.prefix}-button`);
  });

  it("reuses same-version styles and leaves them available across unmount/remount", async () => {
    mountButton(current);
    await flushStyles();
    const initialCount = versionStyleElements(current.prefix).length;
    expect(initialCount).toBeGreaterThan(0);

    mountButton(current);
    await flushStyles();
    expect(versionStyleElements(current.prefix)).toHaveLength(initialCount);

    for (const app of apps.splice(0)) app.unmount();
    expect(versionStyleElements(current.prefix)).toHaveLength(initialCount);

    mountButton(current);
    await flushStyles();
    expect(versionStyleElements(current.prefix)).toHaveLength(initialCount);
  });

  it("inherits the root prefix through a nested provider and Teleport overlays", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(
          NConfigProvider,
          {
            clsPrefix: current.prefix,
            namespace: NAIVE_STYLE_NAMESPACE,
            inlineThemeDisabled: false,
          },
          {
            default: () => [
              h(NConfigProvider, null, {
                default: () => h(NButton, { id: "nested-button" }, { default: () => "nested" }),
              }),
              h(NModal, { show: true, to: "body" }, { default: () => h("div", "modal") }),
              h(NDrawer, { show: true, to: "body", width: 200 }, { default: () => "drawer" }),
            ],
          },
        ),
    });
    app.mount(host);
    apps.push(app);
    await flushStyles();

    const modal = document.body.querySelector(`.${current.prefix}-modal`);
    const drawer = document.body.querySelector(`.${current.prefix}-drawer`);
    expect(host.querySelector(`.${current.prefix}-button`)).not.toBeNull();
    expect(modal).not.toBeNull();
    expect(drawer).not.toBeNull();
    expect(modal?.closest(`.${NAIVE_STYLE_NAMESPACE}`)).not.toBeNull();
    expect(drawer?.closest(`.${NAIVE_STYLE_NAMESPACE}`)).not.toBeNull();
  });

  it("isolates project discrete Message and Notification Teleports", async () => {
    const api = createIsolatedDiscreteApi(createDiscreteApi, ["message", "notification"], {
      messageProviderProps: { duration: 10000 },
      notificationProviderProps: { placement: "bottom-right" },
    });

    api.message.info("isolated-message");
    api.notification.info({ title: "isolated-notification", content: "content" });
    await flushStyles();

    const message = document.body.querySelector(`.${current.prefix}-message`);
    const notification = document.body.querySelector(`.${current.prefix}-notification`);
    expect(message).not.toBeNull();
    expect(notification).not.toBeNull();
    expect(message?.closest(`.${NAIVE_STYLE_NAMESPACE}`)).not.toBeNull();
    expect(notification?.closest(`.${NAIVE_STYLE_NAMESPACE}`)).not.toBeNull();
    expect(document.body.textContent).toContain("isolated-message");
    expect(document.body.textContent).toContain("isolated-notification");
    api.message.destroyAll();
    api.notification.destroyAll();
  });

  it.each([
    [current, legacy],
    [legacy, current],
  ])(
    "keeps n-global as one known shared residual for $0.name -> $1.name",
    async (first, second) => {
      mountButton(first, true);
      mountButton(second, true);
      await flushStyles();

      expect(document.head.querySelectorAll('style[cssr-id="n-global"]')).toHaveLength(1);
    },
  );

  it("confirms the shared n-global CSS is identical in both test versions", async () => {
    mountButton(current, true);
    await flushStyles();
    const currentGlobalCss = document.head.querySelector('style[cssr-id="n-global"]')?.textContent;

    for (const app of apps.splice(0)) app.unmount();
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[cssr-id]").forEach(style => style.remove());

    mountButton(legacy, true);
    await flushStyles();
    const legacyGlobalCss = document.head.querySelector('style[cssr-id="n-global"]')?.textContent;

    expect(currentGlobalCss).toBeTruthy();
    expect(legacyGlobalCss).toBe(currentGlobalCss);
  });
});
