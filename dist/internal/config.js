export const NAMESPACE_PATTERN = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
export const assertNamespace = (namespace) => {
    if (!NAMESPACE_PATTERN.test(namespace)) {
        throw new Error(`Naive UI style isolation namespace must be one CSS class token, received ${JSON.stringify(namespace)}`);
    }
};
