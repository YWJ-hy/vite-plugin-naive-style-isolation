export const assertSingleNaiveUiRuntime = (modules, expectedVersion, allowTestAliases) => {
    const testAliases = modules.filter(module => module.testAlias);
    if (testAliases.length && !allowTestAliases) {
        throw new Error(`Naive UI test alias entered a production chunk: ${testAliases.map(module => module.id).join(", ")}`);
    }
    const productionModules = modules.filter(module => !module.testAlias);
    const runtimes = [
        ...new Map(productionModules.map(module => [module.packageRoot, module])).values(),
    ];
    if (runtimes.length !== 1) {
        throw new Error(`Expected one production Naive UI runtime, found ${runtimes.length} Naive UI runtimes: ${runtimes
            .map(runtime => `${runtime.version} at ${runtime.packageRoot}`)
            .join(", ")}`);
    }
    if (runtimes[0].version !== expectedVersion) {
        throw new Error(`Expected Naive UI ${expectedVersion}, found ${runtimes[0].version} at ${runtimes[0].packageRoot}`);
    }
    return runtimes;
};
