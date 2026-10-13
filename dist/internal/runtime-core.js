import { computed, isRef } from "vue";
import { encodeNaiveUiVersion, mergeNamespace, naiveClass, naiveSelector as buildNaiveSelector, } from "./shared.js";
export const NAIVE_UI_VERSION = __NAIVE_STYLE_ISOLATION_VERSION__;
export const NAIVE_UI_CLS_PREFIX = encodeNaiveUiVersion(NAIVE_UI_VERSION);
export const NAIVE_STYLE_NAMESPACE = __NAIVE_STYLE_ISOLATION_NAMESPACE__;
export const NAIVE_ROOT_CLASS = NAIVE_STYLE_NAMESPACE;
const mergeConfigProviderProps = (props) => ({
    ...props,
    clsPrefix: NAIVE_UI_CLS_PREFIX,
    namespace: mergeNamespace(NAIVE_STYLE_NAMESPACE, props?.namespace),
    inlineThemeDisabled: false,
});
const mergeContainerProviderProps = (props) => ({
    ...props,
    containerClass: mergeNamespace(NAIVE_STYLE_NAMESPACE, props?.containerClass),
});
export function withNaiveConfigProviderProps(props) {
    if (isRef(props))
        return computed(() => mergeConfigProviderProps(props.value));
    return mergeConfigProviderProps(props);
}
const withContainerProviderProps = (props) => {
    if (isRef(props))
        return computed(() => mergeContainerProviderProps(props.value));
    return mergeContainerProviderProps(props);
};
export function withNaiveMessageProviderProps(props) {
    return withContainerProviderProps(props);
}
export function withNaiveNotificationProviderProps(props) {
    return withContainerProviderProps(props);
}
export function createIsolatedDiscreteApi(createDiscreteApi, includes, options = {}) {
    const sourceOptions = options ?? {};
    return createDiscreteApi(includes, {
        ...sourceOptions,
        configProviderProps: withNaiveConfigProviderProps(sourceOptions.configProviderProps),
        messageProviderProps: withNaiveMessageProviderProps(sourceOptions.messageProviderProps),
        notificationProviderProps: withNaiveNotificationProviderProps(sourceOptions.notificationProviderProps),
    });
}
export const naiveClassName = (suffix) => naiveClass(suffix, NAIVE_UI_CLS_PREFIX);
export const naiveSelector = (suffix) => buildNaiveSelector(suffix, NAIVE_UI_CLS_PREFIX);
