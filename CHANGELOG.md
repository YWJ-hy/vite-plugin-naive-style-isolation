# 变更记录

## 0.1.8 - 2026-10-13

- 迁移到独立 GitHub 仓库并发布 npm，新增自动递增版本及 OIDC 可信发布流程。
- 移除 cnhis-design-vue 专用处理、预构建适配、整包审计及依赖；第三方组件库自行负责前缀适配。
- 保留项目源码、离散 API、运行时前缀及通用生产隔离校验。

## 0.1.7 - 2026-08-20

- 新增默认开启的 `cnhisDesignVue` 兼容开关；关闭后不再转换、预构建或整包审计 `cnhis-design-vue`。
- 说明组件库具备 Naive UI 版本适配能力后，应由组件库内部维护 selector、class 和离散 API 的转换。

## 0.1.6 - 2026-08-20

- 补充项目源码审计的设计目的、显式 runtime helper 的版本依赖语义，以及不在正常构建中自动改写业务代码的原因。
- 记录当前正则审计的扫描范围、可能误判和漏判，并明确 audit 需要与生产 bundle 校验及运行时验证组合使用。

## 0.1.5 - 2026-08-20

- 项目源码审计新增不带点号的默认 Naive UI class token 检查，覆盖 `className`、`classList` 和 `getElementsByClassName` 等 DOM 操作。
- 将项目中残留的 Message、按钮禁用状态和下拉输入 class 操作改为显式使用 `naiveClassName()`。

## 0.1.4 - 2026-08-19

- 完善消费项目接入文档，补充 `cnhis-design-vue` 处理、多版本策略、配置清单、动态渲染树和 CLI 说明。
- 补充 Runtime 导出值、组件库验证方式以及 `optimizeDeps.exclude` 禁用原因示例。
- 归档脚本拒绝覆盖同版本 zip 和校验文件，要求每次分享前先升级 package version。

## 0.1.3 - 2026-08-19

- 修复 Vue scoped `:deep()` selector 在 scoped 编译前被错误添加项目 namespace 的问题。
- scoped 样式继续执行 Naive UI 版本前缀改写，但由 Vue 负责生成组件作用域后代 selector。

## 0.1.2 - 2026-08-19

- 在 Vite esbuild dependency optimizer 中复用 `cnhis-design-vue` JavaScript AST 转换。
- 将组件库从预构建排除项改为显式预构建入口，避免开发环境逐个请求数千个 `es` 模块。
- 保留 CSS PostCSS 转换、离散 API 包装和未知模式 fail-closed 契约。

## 0.1.1 - 2026-08-18

- 改为只用 AST 精确改写 `createDiscreteApi` import，普通 Naive UI import 恢复 Vite 标准依赖预构建。
- 移除全量 Naive UI facade 和绝对真实入口，避免开发环境展开全部 locale、date-fns 和 icon 模块图。
- 对混合 import、alias、Vue SFC、深路径和 namespace import 增加契约测试与 fail-closed 诊断。

## 0.1.0 - 2026-08-18

- 新增单一 Vite 插件、浏览器 runtime 和 fail-closed 的 `cnhis-design-vue` Adapter。
- 新增 doctor、dry-run/写入迁移、独立审计、dist 新鲜度和归档工具。
- 随包提供源码、类型声明、公开接口测试、组件库契约和双版本 runtime 覆盖。
