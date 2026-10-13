import { computed, isRef, type ComputedRef, type MaybeRef, type Ref } from "vue";
import type { DiscreteApi, DiscreteApiOptions } from "naive-ui";
import {
  encodeNaiveUiVersion,
  mergeNamespace,
  naiveClass,
  naiveSelector as buildNaiveSelector,
} from "./shared.js";

declare const __NAIVE_STYLE_ISOLATION_VERSION__: string;
declare const __NAIVE_STYLE_ISOLATION_NAMESPACE__: string;

export const NAIVE_UI_VERSION = __NAIVE_STYLE_ISOLATION_VERSION__;
export const NAIVE_UI_CLS_PREFIX = encodeNaiveUiVersion(NAIVE_UI_VERSION);
export const NAIVE_STYLE_NAMESPACE = __NAIVE_STYLE_ISOLATION_NAMESPACE__;
export const NAIVE_ROOT_CLASS = NAIVE_STYLE_NAMESPACE;

export type NaiveConfigProviderProps = Record<string, unknown> & {
  namespace?: string;
  clsPrefix?: string;
  inlineThemeDisabled?: boolean;
};

export type NaiveContainerProviderProps = Record<string, unknown> & {
  containerClass?: string;
};

const mergeConfigProviderProps = <T extends NaiveConfigProviderProps>(props?: T) => ({
  ...props,
  clsPrefix: NAIVE_UI_CLS_PREFIX,
  namespace: mergeNamespace(NAIVE_STYLE_NAMESPACE, props?.namespace),
  inlineThemeDisabled: false,
});

const mergeContainerProviderProps = <T extends NaiveContainerProviderProps>(props?: T) => ({
  ...props,
  containerClass: mergeNamespace(NAIVE_STYLE_NAMESPACE, props?.containerClass),
});

export function withNaiveConfigProviderProps<T extends NaiveConfigProviderProps>(
  props: ComputedRef<T> | Ref<T>,
): ComputedRef<T & NaiveConfigProviderProps>;
export function withNaiveConfigProviderProps<T extends NaiveConfigProviderProps>(
  props?: T,
): T & NaiveConfigProviderProps;
export function withNaiveConfigProviderProps<T extends NaiveConfigProviderProps>(
  props?: MaybeRef<T | undefined>,
) {
  if (isRef(props)) return computed(() => mergeConfigProviderProps(props.value));
  return mergeConfigProviderProps(props);
}

const withContainerProviderProps = <T extends NaiveContainerProviderProps>(
  props?: MaybeRef<T | undefined>,
) => {
  if (isRef(props)) return computed(() => mergeContainerProviderProps(props.value));
  return mergeContainerProviderProps(props);
};

export function withNaiveMessageProviderProps<T extends NaiveContainerProviderProps>(
  props: ComputedRef<T> | Ref<T>,
): ComputedRef<T & NaiveContainerProviderProps>;
export function withNaiveMessageProviderProps<T extends NaiveContainerProviderProps>(
  props?: T,
): T & NaiveContainerProviderProps;
export function withNaiveMessageProviderProps<T extends NaiveContainerProviderProps>(
  props?: MaybeRef<T | undefined>,
) {
  return withContainerProviderProps(props);
}

export function withNaiveNotificationProviderProps<T extends NaiveContainerProviderProps>(
  props: ComputedRef<T> | Ref<T>,
): ComputedRef<T & NaiveContainerProviderProps>;
export function withNaiveNotificationProviderProps<T extends NaiveContainerProviderProps>(
  props?: T,
): T & NaiveContainerProviderProps;
export function withNaiveNotificationProviderProps<T extends NaiveContainerProviderProps>(
  props?: MaybeRef<T | undefined>,
) {
  return withContainerProviderProps(props);
}

type DiscreteApiType = "message" | "notification" | "loadingBar" | "dialog" | "modal";
type CreateNaiveDiscreteApi = <T extends DiscreteApiType>(
  includes: T[],
  options?: DiscreteApiOptions,
) => DiscreteApi<T>;

export function createIsolatedDiscreteApi<T extends DiscreteApiType>(
  createDiscreteApi: CreateNaiveDiscreteApi,
  includes: T[],
  options?: DiscreteApiOptions,
): DiscreteApi<T>;
export function createIsolatedDiscreteApi<TResult>(
  createDiscreteApi: (includes: string[], options?: Record<string, unknown>) => TResult,
  includes: string[],
  options?: Record<string, unknown>,
): TResult;
export function createIsolatedDiscreteApi(
  createDiscreteApi: (...args: any[]) => any,
  includes: string[],
  options: any = {},
) {
  const sourceOptions = options ?? {};
  return createDiscreteApi(includes, {
    ...sourceOptions,
    configProviderProps: withNaiveConfigProviderProps(sourceOptions.configProviderProps),
    messageProviderProps: withNaiveMessageProviderProps(sourceOptions.messageProviderProps),
    notificationProviderProps: withNaiveNotificationProviderProps(
      sourceOptions.notificationProviderProps,
    ),
  });
}

export const naiveClassName = (suffix: string) => naiveClass(suffix, NAIVE_UI_CLS_PREFIX);
export const naiveSelector = (suffix: string) => buildNaiveSelector(suffix, NAIVE_UI_CLS_PREFIX);
