import path from "node:path";
import { createNaiveSelectorPostcssPlugin } from "./internal/css-transform.js";
import { createNaiveStyleIsolationAudit } from "./internal/types.js";
import { createNaiveIsolationPlugin } from "./internal/vite-plugin.js";
import { readResolvedNaiveUiVersion } from "./internal/version.js";
import { encodeNaiveUiVersion } from "./internal/shared.js";
import { assertNamespace } from "./internal/config.js";
import { createDevSourceAudit } from "./internal/dev-source-audit.js";
const mergeLessAdditionalData = (current, injected) => {
    if (current === undefined)
        return injected;
    if (typeof current === "string")
        return `${injected}${current}`;
    if (typeof current === "function") {
        return async (source, filename) => {
            const result = await current(source, filename);
            if (typeof result !== "string") {
                throw new Error("Cannot safely merge a non-string Less additionalData result");
            }
            return `${injected}${result}`;
        };
    }
    throw new Error("Cannot safely merge css.preprocessorOptions.less.additionalData");
};
const mergePostcssPlugins = (postcss) => {
    if (typeof postcss === "string") {
        throw new Error("Cannot merge Naive UI isolation with a PostCSS config file path");
    }
    const config = (postcss ?? {});
    if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
        throw new Error("Cannot safely merge css.postcss.plugins unless it is an array");
    }
    return config;
};
export default function naiveStyleIsolation(options) {
    assertNamespace(options.namespace);
    if (options.auditReport &&
        (path.isAbsolute(options.auditReport) || options.auditReport.split(/[\\/]/).includes(".."))) {
        throw new Error("auditReport must stay inside the Vite build output directory");
    }
    const root = path.resolve(options.root ?? process.cwd());
    const version = readResolvedNaiveUiVersion(root).version;
    const clsPrefix = encodeNaiveUiVersion(version);
    const audit = createNaiveStyleIsolationAudit();
    const adapterOptions = {
        root,
        clsPrefix,
        namespace: options.namespace,
        audit,
        explicitProjectSelectors: options.strict ?? true,
        auditReport: options.auditReport ?? "naive-style-isolation-audit.json",
    };
    const adapter = createNaiveIsolationPlugin(adapterOptions);
    const devAudit = createDevSourceAudit(root);
    const plugin = {
        ...adapter,
        name: "vite-plugin-naive-style-isolation",
        enforce: "pre",
        config(config, env) {
            adapterOptions.explicitProjectSelectors =
                env.command === "build" ? true : (options.strict ?? true);
            const configuredVersion = config.define?.__NAIVE_STYLE_ISOLATION_VERSION__;
            const configuredNamespace = config.define?.__NAIVE_STYLE_ISOLATION_NAMESPACE__;
            if (configuredVersion !== undefined || configuredNamespace !== undefined) {
                if (configuredVersion === JSON.stringify(version) &&
                    configuredNamespace === JSON.stringify(options.namespace)) {
                    throw new Error("Naive UI style isolation is already configured; keep exactly one plugin call");
                }
                throw new Error("Conflicting Naive UI style isolation plugin configuration");
            }
            mergePostcssPlugins(config.css?.postcss);
            const less = config.css?.preprocessorOptions?.less ?? {};
            return {
                define: {
                    __NAIVE_STYLE_ISOLATION_VERSION__: JSON.stringify(version),
                    __NAIVE_STYLE_ISOLATION_NAMESPACE__: JSON.stringify(options.namespace),
                },
                css: {
                    preprocessorOptions: {
                        less: {
                            additionalData: mergeLessAdditionalData(less.additionalData, `@naive-cls-prefix: ${clsPrefix};\n`),
                        },
                    },
                    postcss: {
                        plugins: [
                            createNaiveSelectorPostcssPlugin({
                                clsPrefix,
                                namespace: options.namespace,
                                audit,
                                auditSource: env.command === "serve" && (options.strict ?? true)
                                    ? devAudit.auditFile
                                    : undefined,
                            }),
                        ],
                    },
                },
                optimizeDeps: {
                    include: [
                        "naive-ui",
                        "vite-plugin-naive-style-isolation/runtime",
                    ],
                },
            };
        },
    };
    return options.strict === false ? [plugin] : [plugin, devAudit.plugin];
}
