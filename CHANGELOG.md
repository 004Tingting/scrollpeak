# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] — 首个公开版本

由早期的 `codex-rail` 单文件组件重写而来，更名 **Scrollpeak** 并整理为可发布的仓库结构。

### 新增

- **双预设**：`peakStyle: 'plain'`（未处理）与 `'bold'`（已处理：峰值加粗 + 描边）
- **峰值强调参数**：`peakGainY`（纵向加粗）、`peakGainYIdle`（未触发时的保底加粗量，与触发强度无关）、`sigmaY`（纵向加粗的峰半宽）、`peakRing` / `peakRingWidth` / `peakRingGap` / `peakRingColor`（描边）、`peakGlow`（发光）
- **四条衰减曲线，各自分闲置 / 触发**：横向的 `sigmaIdle` / `sigmaActive`（放大 + 透明度）与纵向的 `sigmaYIdle` / `sigmaYActive`（加粗范围）。
  四个值默认全部跟随基准值 `sigma`，此时行为与「只有一个 sigma」完全一致；`sigmaY` 是「一次设定纵向两个值」的简写。
  状态之间按**归一化强度** `k = (t − idle) / (1 − idle)` 混合——未触发时恰好取 `*Idle`，完全触发时恰好取 `*Active`，
  中间平滑插值，所以填进去的值就是两个状态下实际看到的取值。
- **窗口化更新**：每帧只重算峰值附近 `±windowSigma × max(sigma, sigmaY)` 根条形，开销与文档长度无关
- **量化字符串缓存**：scale / opacity 先量化成整数再比较，跨级才写样式，稳态零字符串分配
- **公开 API**：`init` / `auto` / `refresh` / `setOptions` / `setTheme` / `reset` / `scrollToIndex` / `destroy` / `state`
- **多实例隔离**：每个实例的样式带独立 uid 作用域，同页可安全创建多个
- **键盘无障碍**（`keyboard: true`）：方向键 / PageUp / PageDown / Home / End / Enter，配 `role="slider"` 与 `aria-*`
- **触摸支持**：`pointerdown` 也会触发并定位
- **回调**：`onEngage` / `onLeave` / `onActive` / `onTheme`
- 四种分发格式：IIFE、压缩 IIFE、ESM、CommonJS

### 修复

- **条形几何被 `scaleY` 污染**：`_measure()` 原先用 `getBoundingClientRect()` 量第一根条形的高度与位置，
  而 `peakGainY` 会给条形加 `scaleY`——rect 返回的是**变换后**的尺寸，
  于是 `step` 与 `firstCenter` 一起算错（实测 `step` 从 12 变成 13.08），
  指针→条形的映射、描边位置、提示卡位置全部随之偏移。
  现在改用布局值（`getComputedStyle().height` + `offsetTop` 链）。
- **描边整体偏右**：条形区为描边预留的空隙被算成了两倍（`(gap + width) × 2`），
  而描边自身锚定在轨道右边缘，导致描边相对峰值条右移约 4px。
  现在内缩量与描边外扩量取同一个值，左右空隙对称。
- **提示卡配色失效**：调色板自定义属性原先只定义在轨道元素上，而提示卡是 `<body>` 的子元素，
  导致 `var(--sp-card)` 无法解析、卡片背景实际是透明的。现在调色板同时挂在轨道与提示卡上。
- **峰值指示线错位**：旧实现有一条浅蓝色指示线，因为混用了「相对轨道」与「相对条形区」
  两套坐标基准，实际比峰值条低 22px（`padY`）。该元素已整体移除。
- **rAF 回调未绑定 `this`**：`_render` 作为方法传给 `requestAnimationFrame` 时 `this` 为 undefined。
- **预设切换不彻底**：`setOptions({ peakStyle })` 原先只在旧参数上打补丁，
  从 bold 切回 plain 时 `peakGain` / `peakGainY` / `peakRing` 不会还原。现在参数整体重算。
- **视口变化漏检**：轨道高度由条目数决定，视口变化时它自身尺寸不变，
  只观察轨道会漏掉「轨道整体上下平移」的情况（移动端地址栏收起、iframe 被拉伸等）。
  现在同时观察 `document.documentElement`。

### 性能

- 合成层从「每根条形一个」改为「整条轨道一个」：1000 条目的页面上是 1000 → 1 个图层
- 窗口化更新：每帧只重算峰值附近 `±windowSigma × sigma` 根条形，与文档长度脱钩
- 量化 + 字符串查表：稳态零字符串分配，跨级才写样式
- 离开窗口的条形走一条更廉价的复位路径（先做量化值比较，无事发生就不进写入流程）
- 主题检测去抖 + 缓存，避免无谓的 `getComputedStyle`
- 提示卡位置只在切换条目时写入，不再逐帧赋值
- 指针坐标未变化时直接早退

详见 README 的「性能」一节；`bench/run.mjs` 可复现前后对比。
