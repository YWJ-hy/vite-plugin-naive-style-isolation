import { type ComputedRef, type Ref } from "vue";
import type { DiscreteApi, DiscreteApiOptions } from "naive-ui";
export declare const NAIVE_UI_VERSION: string;
export declare const NAIVE_UI_CLS_PREFIX: string;
export declare const NAIVE_STYLE_NAMESPACE: string;
export declare const NAIVE_ROOT_CLASS: string;
export type NaiveConfigProviderProps = Record<string, unknown> & {
    namespace?: string;
    clsPrefix?: string;
    inlineThemeDisabled?: boolean;
};
export type NaiveContainerProviderProps = Record<string, unknown> & {
    containerClass?: string;
};
export declare function withNaiveConfigProviderProps<T extends NaiveConfigProviderProps>(props: ComputedRef<T> | Ref<T>): ComputedRef<T & NaiveConfigProviderProps>;
export declare function withNaiveConfigProviderProps<T extends NaiveConfigProviderProps>(props?: T): T & NaiveConfigProviderProps;
export declare function withNaiveMessageProviderProps<T extends NaiveContainerProviderProps>(props: ComputedRef<T> | Ref<T>): ComputedRef<T & NaiveContainerProviderProps>;
export declare function withNaiveMessageProviderProps<T extends NaiveContainerProviderProps>(props?: T): T & NaiveContainerProviderProps;
export declare function withNaiveNotificationProviderProps<T extends NaiveContainerProviderProps>(props: ComputedRef<T> | Ref<T>): ComputedRef<T & NaiveContainerProviderProps>;
export declare function withNaiveNotificationProviderProps<T extends NaiveContainerProviderProps>(props?: T): T & NaiveContainerProviderProps;
type DiscreteApiType = "message" | "notification" | "loadingBar" | "dialog" | "modal";
type CreateNaiveDiscreteApi = <T extends DiscreteApiType>(includes: T[], options?: DiscreteApiOptions) => DiscreteApi<T>;
export declare function createIsolatedDiscreteApi<T extends DiscreteApiType>(createDiscreteApi: CreateNaiveDiscreteApi, includes: T[], options?: DiscreteApiOptions): DiscreteApi<T>;
export declare function createIsolatedDiscreteApi<TResult>(createDiscreteApi: (includes: string[], options?: Record<string, unknown>) => TResult, includes: string[], options?: Record<string, unknown>): TResult;
export declare const naiveClassName: (suffix: string) => string;
export declare const naiveSelector: (suffix: string) => string;
export {};
