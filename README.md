# vite-plugin-naive-style-isolation

`vite-plugin-naive-style-isolation` 用于在共享同一 `document` 的 Vue 微应用中隔离 Naive UI 样式。它会按消费项目实际安装的 Naive UI 版本生成 class 前缀，并统一处理 CSSR 样式、组件 class、自定义 selector、Teleport 容器和 `createDiscreteApi`。

独立维护仓库：https://github.com/YWJ-hy/vite-plugin-naive-style-isolation 。npm 包包含预编译 ESM、类型声明和 CLI。源码、测试及开发脚本在 GitHub 维护。

## 兼容范围

| 依赖             | 支持范围               | 已验证版本        |
| ---------------- | ---------------------- | ----------------- |
| Node.js          | `>=20`                 | 20、22            |
| Vue              | `>=3.5 <4`             | `3.5.13`          |
| Vite             | `>=6 <7`               | `6.2.0`           |
| Naive UI         | `>=2.43 <3`            | `2.44.1`          |


## 安装

```sh
npm install -D vite-plugin-naive-style-isolation
```

消费项目自行安装 `vite`、`vue` 和 `naive-ui`，它们是 peer dependencies。npm 安装直接使用预编译的 `dist`，不会在消费项目执行构建脚本。

本地开发可使用 `file:` 指向本仓库，先执行 `npm ci` 和 `npm run build`。

## Vite 接入

在 Vue 和自动导入插件之前增加一次插件调用：

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import naiveStyleIsolation from "vite-plugin-naive-style-isolation";

export default defineConfig({
  plugins: [naiveStyleIsolation({ namespace: "billing-expense-app" }), vue()],
});
```

`namespace` 必填，必须是稳定、项目唯一的单个 CSS class token，不能包含空格，也不能带前导点号。插件会从消费项目根目录解析真实依赖版本，并合并以下配置：

- Naive UI 版本与 namespace 编译常量；
- Less `additionalData` 中的 `@naive-cls-prefix`；
- PostCSS selector 转换；
- `createDiscreteApi` import 的 AST 精确改写和小型虚拟包装模块；
- 生产构建审计和审计报告。

已有的 Less 内容、PostCSS 插件、`define`、alias、`optimizeDeps` 和 build 配置都会保留。若 PostCSS 只通过配置文件路径提供，插件无法证明可以安全合并，会明确报错而不是覆盖。


可选参数：

- `root`：命令执行目录不是消费项目根目录时显式指定项目根；
- `strict`：控制开发模式是否拒绝项目源码中的字面量 `.n-*`，默认开启；生产构建始终强制开启；
- `auditReport`：修改生产审计报告在构建目录中的相对路径。

同一份 Vite 配置只能调用一次该插件；重复调用或参数冲突时会明确报错，防止第二套 hook 进入构建。


## Naive UI 多版本策略

本插件允许共享同一 document 的不同微应用分别使用不同 Naive UI 版本。例如两个独立构建可以分别生成 `n-v2-44-1-*` 和 `n-v2-43-2-*`，各自的 DOM class、CSSR 样式、Teleport 和离散 API 使用对应版本前缀，不依赖加载顺序。

但同一个消费项目的生产依赖图必须只包含一个 Naive UI runtime。插件会在以下阶段检测：

- `doctor`：检查根依赖和直接依赖内部是否安装了多套 Naive UI；
- `audit`：检查已安装 runtime 是否唯一且版本与消费项目解析结果一致；
- 生产构建：根据实际进入 bundle 的模块再次检查 runtime 数量、版本和测试 alias；
- bundle 校验：发现 `naive-ui-legacy` 等测试 alias 标记或旧版本残留时直接失败。

因此下面两种结构的处理结果不同：

```text
同一个 document
├── 微应用 A 的独立构建：naive-ui@2.44.1  -> 允许
└── 微应用 B 的独立构建：naive-ui@2.43.2  -> 允许

同一个微应用的生产依赖图
├── naive-ui@2.44.1
└── 某个依赖嵌套 naive-ui@2.43.2          -> 阻止构建
```

如果依赖安装后出现多个版本，推荐在消费项目根 `package.json` 强制统一到项目已验证的版本。Yarn 1 示例：

```json
{
  "dependencies": {
    "naive-ui": "2.44.1"
  },
  "resolutions": {
    "naive-ui": "2.44.1"
  }
}
```

npm 可以使用 `overrides`：

```json
{
  "overrides": {
    "naive-ui": "2.44.1"
  }
}
```

pnpm 可以使用根配置中的 overrides：

```json
{
  "pnpm": {
    "overrides": {
      "naive-ui": "2.44.1"
    }
  }
}
```

版本号应替换为消费项目已经完成组件库契约、audit 和生产构建验证的实际版本。强制覆盖传递依赖前，应确认相关依赖声明的 peer dependency 范围兼容；不要为了让检查通过而强制使用不兼容版本。

重新安装后可以先查看依赖来源，再运行插件检查：

```sh
yarn why naive-ui
yarn naive-style-isolation doctor --namespace billing-expense-app
yarn naive-style-isolation audit --namespace billing-expense-app --report artifacts/naive-style-isolation-audit.json
```

`naive-ui-legacy` 只是插件源码包运行双版本回归测试时使用的开发依赖。消费项目不需要安装、alias 或打包它。

## 消费项目配置清单

下面列出首次接入时需要人工确认的项目配置。未列出的现有 alias、`optimizeDeps.include`、build 和普通 CSS 配置由 Vite 正常合并，不需要为了本插件删除。

| 配置项              | 必须满足                                                                                          | 不要这样配置                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 插件顺序            | 在 Vue 和自动导入插件之前调用一次 `naiveStyleIsolation({ namespace })`                            | 重复调用插件，或放到可能提前处理 Naive UI 源码的插件之后                                    |
| `namespace`         | 使用稳定、项目唯一的单个 class，例如 `billing-expense-app`                                        | 包含点号、空格、随机值或随环境变化的后缀                                                    |
| 根 ConfigProvider   | 使用 `NAIVE_ROOT_CLASS` 和 `withNaiveConfigProviderProps()`，每棵独立 Vue 应用树都要配置          | 继续手工维护 `clsPrefix`、`namespace`、`inlineThemeDisabled`                                |
| Naive UI 依赖       | 让生产依赖图只解析到一个已验证版本；存在传递依赖冲突时使用 `resolutions` 或对应包管理器 overrides | alias 到 `naive-ui-legacy`、测试版本，或同时安装多套生产 runtime                            |
| `createDiscreteApi` | 从裸入口使用具名导入：`import { createDiscreteApi } from "naive-ui"`                              | namespace import、`export *` 或从 `naive-ui/...` 深路径导入                                 |
| Less selector       | 使用插件注入的 `.@{naive-cls-prefix}-*`                                                           | 手工写 `.n-*`，或在 `additionalData` 中重新定义 `@naive-cls-prefix`                         |
| TypeScript selector | 使用 `naiveSelector(suffix)` 或 `naiveClassName(suffix)`                                          | 在 DOM 查询和 class 操作中保留字面量 `.n-*`                                                 |
| PostCSS             | 如果在 Vite 配置中显式提供 `css.postcss`，应使用对象且 `plugins` 为数组                           | 将 `css.postcss` 配成字符串路径，或把 `plugins` 配成非数组值                                |
| 插件内部常量        | 由插件写入 `define`，消费项目无需声明                                                             | 手工设置 `__NAIVE_STYLE_ISOLATION_VERSION__` 或 `__NAIVE_STYLE_ISOLATION_NAMESPACE__`       |
| 本地 package        | 安装包含最新 `dist` 的完整目录，并保留消费项目自己的 peer dependencies                            | 只复制 `src`、漏提交 `dist`，或依赖安装时现场生成不同产物                                   |

最小 Vite 配置只需要显式增加插件；不要为了接入额外添加 `optimizeDeps.exclude`、内部 `define` 或 Naive UI alias：

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import naiveStyleIsolation from "vite-plugin-naive-style-isolation";

export default defineConfig({
  plugins: [naiveStyleIsolation({ namespace: "billing-expense-app" }), vue()],
});
```

以下配置需要删除：

```ts
export default defineConfig({
  resolve: {
    alias: {
      "naive-ui": "naive-ui-legacy",
    },
  },
  define: {
    __NAIVE_STYLE_ISOLATION_VERSION__: '"2.44.1"',
    __NAIVE_STYLE_ISOLATION_NAMESPACE__: '"billing-expense-app"',
  },
});
```

首次接入可以先运行 `doctor` 检查依赖、Vite 插件和根 Provider，再运行 `migrate` 检查需要迁移的 Provider 与 selector。最终仍应以独立 `audit` 和真实生产构建作为验收结果。

## Runtime 接入

每棵独立 Vue 应用树的根节点都要使用 package runtime。业务主题、语言、placement 和 provider 属性会被保留：

```vue
<template>
  <n-config-provider id="expense-app" :class="NAIVE_ROOT_CLASS" v-bind="configProviderProps">
    <n-message-provider v-bind="messageProviderProps">
      <n-notification-provider v-bind="notificationProviderProps">
        <router-view />
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  NAIVE_ROOT_CLASS,
  withNaiveConfigProviderProps,
  withNaiveMessageProviderProps,
  withNaiveNotificationProviderProps,
} from "vite-plugin-naive-style-isolation/runtime";

const configProviderProps = withNaiveConfigProviderProps(
  computed(() => ({
    themeOverrides: {},
    locale: undefined,
    dateLocale: undefined,
  })),
);
const messageProviderProps = withNaiveMessageProviderProps({ max: 5 });
const notificationProviderProps = withNaiveNotificationProviderProps({
  placement: "bottom-right",
});
</script>
```

Runtime 始终合并当前版本前缀与项目 namespace，强制 `inlineThemeDisabled: false`，并确保 Message、Notification 的 `containerClass` 包含项目 namespace。传入 `ref` 或 `computed` 时会返回响应式合并结果。

Runtime 还公开只读的 `NAIVE_UI_VERSION`、`NAIVE_UI_CLS_PREFIX`、`NAIVE_STYLE_NAMESPACE`、`NAIVE_ROOT_CLASS`，以及 `naiveClassName(suffix)`、`naiveSelector(suffix)`。

这些值不是插件写死的：Naive UI 版本来自消费项目实际安装的依赖，namespace 来自 `naiveStyleIsolation({ namespace })`。例如消费项目安装 `naive-ui@2.44.1`，并配置：

```ts
naiveStyleIsolation({ namespace: "billing-expense-app" });
```

对应的 runtime 值为：

| Runtime 导出               | 示例值                  | 用途                                       |
| -------------------------- | ----------------------- | ------------------------------------------ |
| `NAIVE_UI_VERSION`         | `"2.44.1"`              | 消费项目实际使用的 Naive UI 版本           |
| `NAIVE_UI_CLS_PREFIX`      | `"n-v2-44-1"`           | 传给 Naive UI ConfigProvider 的 class 前缀 |
| `NAIVE_STYLE_NAMESPACE`    | `"billing-expense-app"` | Vite 插件配置的项目 namespace              |
| `NAIVE_ROOT_CLASS`         | `"billing-expense-app"` | 应用根节点使用的 namespace class           |
| `naiveClassName("button")` | `"n-v2-44-1-button"`    | 生成不带点号的完整 class 名                |
| `naiveSelector("button")`  | `".n-v2-44-1-button"`   | 生成可传给 DOM 查询方法的 class selector   |

代码中可以直接使用这些导出：

```ts
import {
  NAIVE_ROOT_CLASS,
  NAIVE_STYLE_NAMESPACE,
  NAIVE_UI_CLS_PREFIX,
  NAIVE_UI_VERSION,
  naiveClassName,
  naiveSelector,
} from "vite-plugin-naive-style-isolation/runtime";

console.log(NAIVE_UI_VERSION); // "2.44.1"
console.log(NAIVE_UI_CLS_PREFIX); // "n-v2-44-1"
console.log(NAIVE_STYLE_NAMESPACE); // "billing-expense-app"
console.log(NAIVE_ROOT_CLASS); // "billing-expense-app"
console.log(naiveClassName("button")); // "n-v2-44-1-button"
document.querySelector(naiveSelector("button")); // 查询 .n-v2-44-1-button
```

升级 Naive UI 或修改 namespace 后，这些值会随下一次 Vite 启动或构建更新，业务代码不应复制示例中的字符串常量。

类型声明随 package 提供。直接导入公开接口即可获得类型，不要在消费项目中声明 package 内部编译常量。

## 动态渲染树

通过 Vue `render(createVNode(...), detachedContainer)`、`createApp()` 或类似方式创建的组件属于独立 Vue 渲染树。即使随后把它的 DOM 插入根 `<n-config-provider>` 内部，它也不会因为 DOM 层级而自动继承原应用树的 `provide/inject` 上下文。命令式弹层、遮罩、通知容器或自定义指令动态挂载的组件经常使用这种模式。

当前项目的自定义 Loading 属于这种情况，但它不是插件提供的通用组件。其他系统应按各自的独立渲染组件排查和处理。

典型表现是：项目 selector 已正确编译为版本化前缀，但独立渲染树中的 Naive UI 组件仍使用默认 `.n-*` class，导致 selector 无法匹配，并重新引入不同 Naive UI 版本之间的 class 和 CSSR 冲突。

消费项目可以提供一个中性的独立树根组件，在其内部使用 runtime helper 建立版本化 ConfigProvider。具体业务组件由 slot 提供，不需要插件知道它是弹层、遮罩还是其他内容：

```vue
<template>
  <n-config-provider v-bind="isolationProviderProps">
    <slot />
  </n-config-provider>
</template>

<script setup lang="ts">
import { withNaiveConfigProviderProps } from "vite-plugin-naive-style-isolation/runtime";

const isolationProviderProps = withNaiveConfigProviderProps({ abstract: true });
</script>
```

如果独立渲染树还需要继承现有主题、语言等 provider，消费项目应在 `setup()` 中保存 `getCurrentInstance()` 返回的内部实例，并由自己的创建器桥接所需上下文。Vue 自定义指令的 `binding.instance` 是公开组件实例；若消费项目的创建器明确接收 `ComponentInternalInstance`，应传入 `binding.instance?.$`，而不是直接强制类型转换。

根 ConfigProvider 自身上的指令仍位于该 Provider 的外侧，不能只依赖实例桥接，因此独立渲染树仍需要自己的版本化 ConfigProvider。消费项目不应逐处增加 `clsPrefix` 参数，也不要通过同时匹配 `.n-*` 和版本化 class 来掩盖上下文丢失；这两种做法都会扩大调用方接口或破坏隔离保证。

排查这类问题时同时检查编译结果和实际 DOM：selector 中的前缀与组件运行时 class 必须一致。插件负责提供编译常量、runtime helper 和 selector 转换，但不会自动改变消费项目自定义 `render/createApp` 创建的 Vue 上下文关系。

## 离散 API

插件会处理消费项目源码中从 `naive-ui` 裸入口按名称导入的 `createDiscreteApi`。处理过程如下：

1. Vite transform 使用 AST 只识别 `createDiscreteApi` import；同一条语句中的其他 Naive UI import 保持不变；
2. 该 import 被重定向到插件提供的小型虚拟包装模块；
3. 虚拟模块继续调用当前项目实际安装的 Naive UI `createDiscreteApi`，并在调用参数中合并版本化 `configProviderProps`；
4. 原有主题、语言、Message 和 Notification 配置会被保留，同时补充 class 前缀、namespace、`inlineThemeDisabled: false` 以及对应容器 namespace。

这样，离散 API 动态创建的 Message、Dialog、Notification、Modal 等节点会使用与应用根 ConfigProvider 相同的版本前缀。消费项目仍按 Naive UI 原始方式导入和调用：

```ts
import { createDiscreteApi } from "naive-ui";

export const { message, notification, dialog, modal } = createDiscreteApi(
  ["message", "notification", "dialog", "modal"],
  {
    messageProviderProps: { max: 5 },
    notificationProviderProps: { placement: "bottom-right" },
  },
);
```

消费项目已有的业务包装函数或全局变量可以继续保留，只要它们底层最终使用上述裸入口的 named import；插件不要求各系统采用统一的业务封装。禁止通过 `naive-ui/...` 深层路径或 namespace import 使用 `createDiscreteApi`，否则审计会 fail closed。

## Selector 迁移

TypeScript DOM 查询使用 runtime helper：

```ts
import { naiveSelector } from "vite-plugin-naive-style-isolation/runtime";

document.querySelector(naiveSelector("button"));
```

项目 Less 使用插件注入的变量：

```less
.screen .@{naive-cls-prefix}-input {
  min-width: 160px;
}
```

不要在项目源码中保留字面量 `.n-*`。Vue scoped 样式继续依赖 Vue 的 scoped 属性；未 scoped 的项目和组件库自定义 selector 会增加项目 namespace。

## 项目源码审计设计

项目源码审计的首要目的不是自动修复代码，而是让开发者显式知道某段业务逻辑依赖了 Naive UI 的内部 DOM 或 class。Naive UI 的默认 `.n-*` 不是稳定的跨应用契约；在多版本微应用共享同一 document 时，直接使用默认前缀会绕过版本隔离。

业务代码应显式表达这种依赖：

```ts
document.querySelector(naiveSelector("button"));
element.classList.add(naiveClassName("button--disabled"));
```

开发者不需要手写 `2.44.1` 或 `n-v2-44-1`。helper 会从插件 runtime 获取当前消费项目实际版本的前缀。显式 helper 的作用是暴露“这里依赖 Naive UI 内部结构”，便于代码审查、升级检索和故障定位，同时隐藏具体版本编码。

### 为什么不在正常构建中自动改写所有业务代码

本插件并非完全不使用 AST：项目 `createDiscreteApi` 和一次性 `migrate` 都使用结构化解析。没有对项目 DOM class/selector 做日常自动改写，是因为即使 AST 能识别字符串，也不一定能证明它的业务含义：

```ts
classList.add("n-input"); // class token，应使用 naiveClassName
querySelector(".n-input"); // selector，应使用 naiveSelector
resolveComponent("n-input"); // Vue 组件名，不能改
inject("n-form"); // provide key，不能改
message.info("n-input"); // 普通文本，不能改
```

复合 selector、自定义封装函数、别名调用、模板字符串和字符串拼接还需要更多上下文。若插件只改写已知模式并静默放过未知模式，会造成已经全部处理的错误信心；若对未知模式全部失败，开发者仍需显式处理。正常构建静默修改业务源码还会隐藏版本敏感依赖，并增加 Vue SFC、TSX、source map 和插件顺序风险。

因此当前边界是：

- 项目业务源码：显式 helper，并由 audit 阻止重新引入默认前缀；
- `migrate --write`：只在开发者主动执行时转换可证明安全的简单模式，修改结果可以审查；
- CSS/Less：使用 PostCSS selector parser 进行结构化转换。

### 当前扫描范围

独立 `audit` 和生产构建会递归扫描消费项目 `src` 下的 `.vue`、`.less`、`.css`、`.scss`、`.ts`、`.tsx`，排除 `node_modules`、`dist`、`external`、覆盖率目录、测试文件和 `.d.ts`。

项目源码当前采用逐行静态检查，匹配：

- 带点号的默认 selector，例如 `.n-button`、`.n-input__input-el`；
- 字符串开头的不带点号 class token，例如 `"n-button--disabled"`、`"n-message-wrapper"`；
- `n-global` 是已知共享残余，不按普通默认 class 报错。

发现问题时 audit 返回文件和行号，不自动修改源码。开发模式由 `strict` 控制，默认开启；生产构建始终强制开启。

### 可能误判

当前项目源码检查使用正则而不是 AST，以下内容即使不参与 DOM 操作也可能被报告：

```ts
// 文档示例：不要使用 .n-button
const documentation = "n-button";
const regexExample = /\.n-button/;
```

项目自行定义但恰好使用 `n-*` 命名的 class 也会被视为 Naive UI class。硬编码 `.n-v2-44-1-*` 同样会被拒绝，因为业务源码不应固定复制某个版本前缀。遇到误判时应人工确认该行；如果它不是运行时依赖，应调整示例、注释或命名，而不是长期关闭生产审计。

### 可能漏判

以下动态或非标准形式可能无法被当前正则识别：

```ts
const className = "n" + "-button";
const className = `n-${suffix}`;
const className = "custom n-button";
element.classList.add(classNameFromServer);
```

当前项目源码扫描也不包含 `.js`、`.jsx`、`.mjs`、`.mts` 等扩展名，动态从接口或配置读取的 class 无法通过静态扫描证明安全。因此 audit 是防止已知静态字面量回归的保护网，不是完整的形式化证明。

验收仍需组合使用：

```text
显式 helper + 项目源码 audit
+ 生产 bundle 校验 + 运行时业务验证
```

后续可以将项目 TypeScript/Vue script 的“识别和报告”升级为 AST，减少注释和普通字符串造成的误判，并覆盖更多 DOM API。即使升级为 AST，也建议保留显式 helper，不在正常构建中静默自动改写业务代码。

## CLI

CLI 不是应用运行时依赖，不执行 CLI 也不会影响 Vite 插件工作。但首次接入和升级时建议运行 `doctor`、`audit`，这样可以在生产构建前发现配置或依赖问题。新项目如果没有旧 Provider 和 `.n-*` selector，可以跳过 `migrate`。

本 package 的 `package.json` 通过 `bin` 字段声明了 `naive-style-isolation`。安装依赖时，包管理器会在消费项目的 `node_modules/.bin` 中创建对应命令入口，因此 Yarn 1 可以直接执行：

```sh
yarn naive-style-isolation doctor --namespace billing-expense-app
yarn naive-style-isolation migrate --namespace billing-expense-app
yarn naive-style-isolation migrate --namespace billing-expense-app --write
yarn naive-style-isolation audit --namespace billing-expense-app --report artifacts/naive-style-isolation-audit.json
```

这个过程不会修改消费项目根 `package.json`，也不会自动向 `scripts` 写入任何命令。上面的内容是直接调用 package bin 的示例。如果团队希望固定命令名称，需要自行在消费项目根 `package.json` 中增加 scripts，例如：

```json
{
  "scripts": {
    "naive:doctor": "naive-style-isolation doctor --namespace billing-expense-app",
    "naive:audit": "naive-style-isolation audit --namespace billing-expense-app --report artifacts/naive-style-isolation-audit.json"
  }
}
```

之后执行 `yarn naive:doctor` 或 `yarn naive:audit`。不需要全局安装 CLI。

### doctor 做什么

`doctor` 是只读诊断，不修改文件。它检查：

- Vite 配置是否调用插件并使用指定 namespace；
- 每个包含根 ConfigProvider 的 `App.vue` 是否接入 package runtime；
- 是否存在多个已安装的 Naive UI runtime。

检查失败时命令返回非零退出码，可用于首次接入检查。

### migrate 做什么

不带 `--write` 时是 dry-run，只列出将要修改的文件，不写入任何内容：

```sh
yarn naive-style-isolation migrate --namespace billing-expense-app
```

带 `--write` 时，只会扫描并写入消费项目 `src` 下的 `.ts`、`.tsx`、`.vue`、`.less` 文件：

```sh
yarn naive-style-isolation migrate --namespace billing-expense-app --write
```

它会执行以下三类修改。

1. 标准 Vue ConfigProvider

删除根 `<n-config-provider>` 上由 package 接管的 `namespace`、`:cls-prefix`、`:inline-theme-disabled`，增加 runtime props 绑定，并在 `<script setup>` 中补充 import。其他业务属性保持不变。

修改前：

```vue
<n-config-provider
  namespace="billing-expense-app"
  :cls-prefix="clsPrefix"
  :inline-theme-disabled="false"
  :theme-overrides="themeOverrides"
>
```

修改后：

```vue
<n-config-provider
  v-bind="withNaiveConfigProviderProps()"
  :theme-overrides="themeOverrides"
>

<script setup lang="ts">
import { withNaiveConfigProviderProps } from "vite-plugin-naive-style-isolation/runtime";
</script>
```

2. TypeScript DOM selector

只自动处理 `querySelector`、`querySelectorAll`、`closest`、`matches` 中完整且单一的 `.n-*` 字面量，并自动补充 `naiveSelector` import。

修改前：

```ts
document.querySelector(".n-button");
```

修改后：

```ts
import { naiveSelector } from "vite-plugin-naive-style-isolation/runtime";

document.querySelector(naiveSelector("button"));
```

3. Less selector

将 Less selector 中的默认 Naive UI class 改为插件注入的版本前缀变量；`n-global` 和已经版本化的 class 不会重复修改。

修改前：

```less
.screen .n-input {
  color: red;
}
```

修改后：

```less
.screen .@{naive-cls-prefix}-input {
  color: red;
}
```

`migrate --write` 不会修改 `package.json`、Vite 配置、`node_modules`、`dist` 或 `src` 之外的文件。遇到动态 selector、复合 selector、同名变量冲突、非标准 ConfigProvider 或语法无法解析时，会列出需要人工处理的文件和位置，并停止整批写入，不会出现一部分文件已写、一部分文件失败的状态。

建议在 Git 工作区干净时先运行 dry-run，检查列表后再执行 `--write`，最后查看 `git diff` 并运行 typecheck、audit 和生产构建。重复执行迁移不会重复修改已经迁移的代码。

### audit 做什么

`audit` 默认只读，复用生产插件的组件库转换、未知模式、依赖和 bundle 不变量检查。只有传入 `--report` 时才会写入指定的 JSON 报告。它适合首次接入、组件库升级和 CI：

```sh
yarn naive-style-isolation audit \
  --namespace billing-expense-app \
  --report artifacts/naive-style-isolation-audit.json
```

以上命令不在项目根执行时，可统一传入 `--root <目录>`。

## 生产验证

首次接入或升级后至少执行：

```sh
yarn naive-style-isolation doctor --namespace billing-expense-app
yarn naive-style-isolation audit --namespace billing-expense-app --report artifacts/naive-style-isolation-audit.json
yarn build
```

存在多个应用入口时，每个入口都要执行真实生产构建。未识别模式、第二个 Naive UI runtime、测试 alias、默认 selector、缺少 namespace 的自定义 selector 或离散 API AST 改写绕过都会阻止构建。

Package 维护者在本目录执行：

源码包的开发和测试使用 Vitest `5.0.0`、Vite `^6.4.0`，需要 Node.js
`^22.12.0 || ^24.0.0 || >=26.0.0`。上方兼容表描述的是消费项目运行预编译插件的范围。

```sh
yarn test
yarn typecheck
yarn build
yarn check:dist
yarn archive
```

`archive` 会先执行测试、类型检查和 dist 新鲜度检查，再重新构建、复查 dist、生成 zip，并解压该 zip 完成一次真实 `file:` 安装和 Vite smoke build。任一前置条件失败时不会保留新的分享包。

归档文件名来自 package `name` 和 `version`。脚本不会自动递增版本；如果同版本 zip 或 `.sha256` 已存在，会直接报错而不是覆盖。每次生成新的团队分享包前，先升级 package `version` 并更新 `CHANGELOG.md`。

## 审计报告

生产构建默认生成 `naive-style-isolation-audit.json`。报告包含 schema 版本、Naive UI 版本、class prefix、namespace、转换位置、未知模式的文件/行列/类别/处理建议、runtime 证据、现有 bundle 检查状态和构建失败原因。


## 升级与缓存

每次对外分享必须递增 package version，并更新 `CHANGELOG.md`。升级时完整替换源码 package 目录，不要只覆盖 `src` 或 `dist`；重新安装后执行 doctor、audit、package 测试和所有生产构建，并核对安装后的版本。

Yarn 1 可能在版本号不变时继续使用旧 `file:` 缓存。若安装内容与复制目录不一致，只删除项目中已安装的 `vite-plugin-naive-style-isolation` 和对应 Yarn 缓存，再执行 `yarn install --force`。不要清理无关项目或全局目录。

从旧源码包迁移时，把依赖值从 `file:...` 改为 npm 版本，Vite、runtime、业务 import 和 CLI 命令都不修改。

## 回滚

恢复上一版本的完整源码 package 目录及匹配的 `file:` 依赖快照，重新安装依赖并构建全部应用入口。由于 provider、selector、离散 API import 改写和审计必须同时切换，本 package 不提供局部关闭开关。

## 常见问题

- `namespace must be one CSS class token`：去掉点号、空格和不稳定的环境后缀，改用项目唯一 class；
- `missing installed peer dependency`：在消费项目声明缺少的 peer 并重新安装，不要写入 package 内部；
- `root ConfigProvider is not connected`：检查每个 `App.vue` 是否导入 runtime 并绑定合并后的 props；
- `multiple Naive UI runtimes`：统一依赖 resolution，删除生产依赖中的嵌套版本；
- `Project source must use runtime helpers or the injected Less variable`：Less 改用 `.@{naive-cls-prefix}-*`，TypeScript selector 使用 `naiveSelector`，class token 使用 `naiveClassName`；
- `dist is stale`：先检查源码与已提交产物差异，确认后执行 `yarn build` 和 `yarn check:dist`；
- 本地 package 更新后行为没变化：核对版本号，并按“升级与缓存”处理 Yarn 1 缓存。

## 已知边界

本方案隔离 Naive UI CSSR 组件样式和受控自定义 selector，不承诺整个共享文档的全局 CSS 隔离，也不引入 Shadow DOM、iframe 或 qiankun strict style isolation。

`n-global` 和未带前缀的动画名是已知共享残余。版本化 CSSR style 在应用卸载后保留到当前 document 生命周期结束，以便同版本应用复用；package 不删除样式，也不实现引用计数。

迁移工具不会猜测处理动态或非标准源码。qiankun 基座资源转发、重复应用 base path 等环境问题不属于本 package。

## 最小示例

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import naiveStyleIsolation from "vite-plugin-naive-style-isolation";

export default defineConfig({
  plugins: [naiveStyleIsolation({ namespace: "billing-expense-app" }), vue()],
});
```

```vue
<template>
  <n-config-provider :class="NAIVE_ROOT_CLASS" v-bind="providerProps">
    <router-view />
  </n-config-provider>
</template>

<script setup lang="ts">
import {
  NAIVE_ROOT_CLASS,
  withNaiveConfigProviderProps,
} from "vite-plugin-naive-style-isolation/runtime";

const providerProps = withNaiveConfigProviderProps();
</script>
```

完成最小接入后，继续运行 doctor、迁移剩余 selector、运行独立 audit，并执行真实生产构建。

## 第三方组件库边界

插件只转换消费项目 `src` 下的 CSS 和具名 `createDiscreteApi` 导入，不转换任何第三方组件库的 JavaScript、静态 class 或 CSS，也不修改其依赖预构建配置。第三方组件库需要自行支持消费项目的 Naive UI 前缀和 namespace。最终生产 bundle 仍执行通用隔离检查，默认 selector 残留可能阻止构建。

## 自动发布

推送到 `main` 的源码、构建脚本、依赖、测试或发布流程变更，通过完整检查后自动递增 patch 版本，提交版本与构建产物，创建 `vX.Y.Z` 标签并发布 npm。纯 Markdown 文档修改不触发发布。也可在 GitHub Actions 手动运行 Publish 工作流。

发布使用 npm Trusted Publishing（OIDC），无需保存长期 npm token。可信发布者绑定 `YWJ-hy/vite-plugin-naive-style-isolation` 仓库的 `publish.yml`。仓库变量 `NPM_TRUSTED_PUBLISHING=true` 启用发布任务。首次发布由维护者本地执行，完成 npm 可信发布者绑定后启用该变量。

发布失败时可重新运行工作流：尚未发布的版本会复用，已发布的版本不会覆盖。请勿手工修改已发布版本或强推发布标签。开发环境使用 Node.js 24、`npm ci`、`npm run check`。
