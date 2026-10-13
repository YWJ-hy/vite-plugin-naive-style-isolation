const encodeCodePoints = (value) => Array.from(value)
    .map(character => character.codePointAt(0).toString(16).padStart(6, "0"))
    .join("");
export const encodeNaiveUiVersion = (version) => {
    if (!version)
        throw new Error("Naive UI version must not be empty");
    const stable = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (stable)
        return `n-v${stable[1]}-${stable[2]}-${stable[3]}`;
    const extended = /^(\d+)\.(\d+)\.(\d+)(.+)$/.exec(version);
    if (extended) {
        return `n-v${extended[1]}-${extended[2]}-${extended[3]}-x${encodeCodePoints(extended[4])}`;
    }
    return `n-vx${encodeCodePoints(version)}`;
};
export const naiveClass = (suffix, clsPrefix) => `${clsPrefix}-${suffix}`;
export const naiveSelector = (suffix, clsPrefix) => `.${naiveClass(suffix, clsPrefix)}`;
export const mergeNamespace = (namespace, current) => {
    const namespaces = new Set((current ?? "").split(/\s+/).filter(Boolean));
    namespaces.add(namespace);
    return [...namespaces].join(" ");
};
