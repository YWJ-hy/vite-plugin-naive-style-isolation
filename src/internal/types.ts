export interface NaiveStyleIsolationAudit {
  cssClasses: string[];
  jsSelectors: string[];
  staticClasses: string[];
  discreteApis: string[];
  unknown: string[];
}

export const createNaiveStyleIsolationAudit = (): NaiveStyleIsolationAudit => ({
  cssClasses: [],
  jsSelectors: [],
  staticClasses: [],
  discreteApis: [],
  unknown: [],
});

export const mergeNaiveStyleIsolationAudit = (
  target: NaiveStyleIsolationAudit,
  source: NaiveStyleIsolationAudit,
) => {
  target.cssClasses.push(...source.cssClasses);
  target.jsSelectors.push(...source.jsSelectors);
  target.staticClasses.push(...source.staticClasses);
  target.discreteApis.push(...source.discreteApis);
  target.unknown.push(...source.unknown);
  return target;
};
