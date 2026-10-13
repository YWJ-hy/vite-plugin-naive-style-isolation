export const createNaiveDiscreteApiModuleSource = () => `
import { createDiscreteApi as createNaiveDiscreteApi } from "naive-ui";
import {
  withNaiveConfigProviderProps,
  withNaiveMessageProviderProps,
  withNaiveNotificationProviderProps,
} from "vite-plugin-naive-style-isolation/runtime";
export const createDiscreteApi = (includes, options = {}) => {
  const sourceOptions = options ?? {};
  return createNaiveDiscreteApi(includes, {
    ...sourceOptions,
    configProviderProps: withNaiveConfigProviderProps(sourceOptions.configProviderProps),
    messageProviderProps: withNaiveMessageProviderProps(sourceOptions.messageProviderProps),
    notificationProviderProps: withNaiveNotificationProviderProps(
      sourceOptions.notificationProviderProps,
    ),
  });
};
`;
