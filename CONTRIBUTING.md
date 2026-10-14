# 贡献指南

感谢有兴趣改进 Scrollpeak。这个项目很小，所以流程也尽量轻。

## 开始之前

```bash
git clone https://github.com/004Tingting/scrollpeak.git
cd scrollpeak
npm install          # 只装 esbuild 一个 devDependency
npm run build        # 产出 dist/* 与 examples/single-file.html
npm test             # 冒烟测试
```

改完代码后手动看一眼示例页（`examples/index.html`），
**几何相关的改动一定要看渲染结果**——这个项目历史上出现过两次
「测试全绿但画面错位」的问题（见 `CHANGELOG.md` 的修复记录）。

## 改动的验收标准

提交前请确认：

1. `npm run check && npm run build && npm test` 全绿
2. 如果是热路径改动（`_render` / `_write` / `_rest` / `_inf` / `_infY`），
   跑一次 `node bench/run.mjs 200 200`，把前后数字贴进 PR 描述
3. 如果新增了参数，必须同步更新：
   - `src/scrollpeak.js` 的 `DEFAULTS`（带中文注释）
   - `README.md` 的参数表（`npm test` 会检查这一条，漏了就红）
   - `examples/playground.html` 的 `SPEC`（如果是可以实时调的数值型参数）
   - `CHANGELOG.md`

## 代码风格

- 纯 ES2018+，不用 TypeScript、不用框架、**零运行时依赖**（这是项目的核心卖点）
- 源码里注释用中文，与现有风格一致
- 逐帧路径上只写 `transform` 与 `opacity`；不要引入会触发布局的属性
- 不要给每根条形加 `will-change`（详见 README「性能」一节）

## 提交信息

用 `type: 简述` 的形式，例如：

```
fix: 条形几何不再受 scaleY 影响
feat: sigma 系列支持闲置 / 触发分开设置
perf: 离开窗口的条形走更廉价的复位路径
docs: 补全 sigmaY 参数说明
```

## 报告问题

请附上：复现步骤、期望表现、实际表现，以及
`Scrollpeak.version`、浏览器版本、条目数量。
几何类问题最好带一张截图。
