export const createNaiveStyleIsolationAudit = () => ({
    cssClasses: [],
    jsSelectors: [],
    staticClasses: [],
    discreteApis: [],
    unknown: [],
});
export const mergeNaiveStyleIsolationAudit = (target, source) => {
    target.cssClasses.push(...source.cssClasses);
    target.jsSelectors.push(...source.jsSelectors);
    target.staticClasses.push(...source.staticClasses);
    target.discreteApis.push(...source.discreteApis);
    target.unknown.push(...source.unknown);
    return target;
};
