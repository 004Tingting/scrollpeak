/*!
 * Scrollpeak v1.0.0
 * 右侧单峰滑动指示条 —— 峰值跟随鼠标 / 滚动进度，逐帧只写 transform 与 opacity。
 * MIT License
 *
 * 设计要点（性能）：
 *   1. 窗口化更新：只重算峰值 ±windowSigma×max(四个 sigma) 根条形，复杂度与文档长度无关
 *   2. 量化 + 字符串查表：scale/opacity 先量化成整数再比较，命中缓存则完全不分配字符串
 *   3. 不逐根条形加 will-change：整条轨道只提升一个合成层，避免 N 个图层
 *   4. 主题检测去抖 + 结果缓存：背景色字符串没变就不再调 getComputedStyle
 *   5. 静止即停机：阻尼收敛后 rAF 循环直接退出，主线程占用归零
 */
var Scrollpeak = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/scrollpeak.js
  var scrollpeak_exports = {};
  __export(scrollpeak_exports, {
    Scrollpeak: () => Scrollpeak,
    VERSION: () => VERSION,
    auto: () => auto,
    default: () => scrollpeak_default,
    defaults: () => DEFAULTS,
    init: () => init,
    presets: () => PRESETS,
    version: () => VERSION
  });
  var VERSION = "1.0.0";
  var PRESETS = {
    /* 未处理：峰值只靠长度表达，最克制 */
    plain: {},
    /* 已处理：峰值更短更粗，并给峰值条描一圈细边 */
    bold: {
      peakGain: 5,
      peakGainY: 1.2,
      sigma: 1.6,
      peakRing: true
    }
  };
  var DEFAULTS = {
    /* —— 内容 —— */
    container: "[data-scrollpeak]",
    // 选择器或 Element；取其直接子元素作为条目
    heading: "h2",
    // 容器没命中时的兜底扫描选择器
    items: null,
    // 直接传条目：[{el, t}] / [Element] / ['#sel']
    minItems: 3,
    // 条目少于此数不渲染
    titleAttr: "data-sp-title",
    // 单条目文案覆盖属性
    skipAttr: "data-sp-skip",
    // 带此属性的子元素跳过
    /* —— 几何 —— */
    hitWidth: 170,
    // 触发区（悬停/点击）宽度，px
    stageWidth: 72,
    // 条形可视宽度，px
    barWidth: 6,
    // 条形静止宽度，px
    barHeight: 3,
    // 条形高度，px
    barGap: 9,
    // 条形间距，px
    padY: 22,
    // 滑槽上下余量，px
    edgeGap: 9,
    // 距页面右边缘，px
    /* —— 峰形 —— */
    peakStyle: "plain",
    // 'plain' | 'bold'（预设，可被后面的参数覆盖）
    peakGain: 4.5,
    // 峰值横向放大倍数
    peakGainY: 0,
    // 峰值纵向加粗倍数（0 = 不加粗）
    peakGainYIdle: 0,
    // 未触发时峰值条的「保底」加粗量（与 t 无关，恒定叠加）
    sigma: 1.8,
    // 峰半宽基准值；下面两个没设时跟随它
    sigmaIdle: null,
    // 未触发时的横向峰半宽（放大 + 透明度）；null = 跟随 sigma
    sigmaActive: null,
    // 触发时的横向峰半宽（放大 + 透明度）；null = 跟随 sigma
    sigmaY: null,
    // 简写：一次性设定下面两个
    sigmaYIdle: null,
    // 未触发时的纵向加粗峰半宽；null = 跟随 sigmaIdle
    sigmaYActive: null,
    // 触发时的纵向加粗峰半宽；null = 跟随 sigmaActive
    idle: 0.3,
    // 未触发时的强度 0–1
    windowSigma: 4,
    // 只更新 ±windowSigma×max(四个 sigma) 根（性能开关）
    damp: 0.22,
    // 阻尼系数，越大跟手越快
    settleEps: 6e-4,
    // 收敛阈值，低于此值停机
    /* —— 外观 —— */
    theme: "auto",
    // 'auto' | 'light' | 'dark'
    inkLight: "#111318",
    // 浅色页面用的条形颜色
    inkDark: "#e9ecf1",
    // 深色页面用的条形颜色
    baseOpacityIdle: 0.1,
    // 未触发时非峰值条的透明度
    baseOpacityActive: 0.34,
    // 触发时非峰值条的透明度
    peakOpacityIdle: 0.42,
    // 未触发时峰值条透明度
    peakOpacityActive: 1,
    // 触发时峰值条透明度
    peakRing: false,
    // 峰值条描边（每帧 1 次微型布局）
    peakRingWidth: 1,
    // 描边线宽，px
    peakRingGap: 1,
    // 描边与条形之间的空隙，px
    peakRingColor: null,
    // null = 按主题自动
    peakGlow: false,
    // 峰值发光（box-shadow，随 transform 缩放）
    layer: "container",
    // 'container' | 'bar' | 'none'
    zIndex: 2147483e3,
    /* —— 交互 —— */
    clickToScroll: true,
    scrollBehavior: "smooth",
    cursor: "pointer",
    showPeek: true,
    // 提示卡
    peekGap: 18,
    // 提示卡与轨道水平间距，px
    peekMaxWidth: 240,
    // 提示卡最大宽度，px
    peekThreshold: 0.4,
    // 峰值强度超过此值才显示提示卡
    keyboard: false,
    // 方向键 / Home / End / Enter
    activeClass: "sp-active",
    // 加到当前条目标题上的类名
    activeColor: "#0b7f8c",
    // 当前条目标题颜色
    /* —— 回调 —— */
    onEngage: null,
    onLeave: null,
    onActive: null,
    onTheme: null,
    /* —— 性能微调 —— */
    quantScale: 256,
    // scale 量化级数（1/256≈0.004，约等于人眼可辨的位移下限）
    quantOpacity: 170
    // opacity 量化级数（1/170≈0.006）
  };
  function assign(target) {
    for (let i = 1; i < arguments.length; i++) {
      const src = arguments[i];
      if (!src) continue;
      for (const k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== void 0) target[k] = src[k];
      }
    }
    return target;
  }
  __name(assign, "assign");
  function textOf(el) {
    const n = el.querySelector("h1,h2,h3,h4,h5,h6");
    const raw = n ? n.textContent : el.textContent;
    return (raw || "").replace(/\s+/g, " ").trim();
  }
  __name(textOf, "textOf");
  function resolveContainer(c) {
    if (!c) return null;
    if (typeof c === "string") return document.querySelector(c);
    return c.nodeType === 1 ? c : null;
  }
  __name(resolveContainer, "resolveContainer");
  function resolveOptions(user) {
    const o = assign({}, DEFAULTS, PRESETS[user && user.peakStyle] || null, user || {});
    if (o.hitWidth < o.stageWidth) o.hitWidth = o.stageWidth;
    if (o.sigmaIdle == null) o.sigmaIdle = o.sigma;
    if (o.sigmaActive == null) o.sigmaActive = o.sigma;
    const y = o.sigmaY;
    if (o.sigmaYIdle == null) o.sigmaYIdle = y == null ? o.sigmaIdle : y;
    if (o.sigmaYActive == null) o.sigmaYActive = y == null ? o.sigmaActive : y;
    return o;
  }
  __name(resolveOptions, "resolveOptions");
  function collect(o) {
    const out = [];
    if (o.items && o.items.length) {
      for (const it of o.items) {
        let el, t;
        if (typeof it === "string") {
          el = document.querySelector(it);
        } else if (it.nodeType === 1) {
          el = it;
        } else if (it) {
          el = it.el || null;
          t = it.t || it.title;
        }
        if (!el) continue;
        out.push({ el, t: t || textOf(el) });
      }
      return out;
    }
    const box = resolveContainer(o.container);
    if (box) {
      for (const el of box.children) {
        if (!el.tagName) continue;
        if (o.skipAttr && el.hasAttribute(o.skipAttr)) continue;
        const t = el.getAttribute(o.titleAttr) || textOf(el);
        if (!t) continue;
        out.push({ el, t });
      }
    }
    if (!out.length) {
      document.querySelectorAll(o.heading).forEach((h) => {
        const t = (h.textContent || "").replace(/\s+/g, " ").trim();
        if (t) out.push({ el: h, t });
      });
    }
    return out;
  }
  __name(collect, "collect");
  var uidSeq = 0;
  var injectedGlobal = /* @__PURE__ */ new Set();
  function stylesFor(uid, o) {
    const c = "." + uid;
    const pad = o.peakRing ? o.peakRingGap + o.peakRingWidth : 0;
    const css = [
      /* 调色板必须同时挂到轨道和提示卡上：提示卡是 body 的子元素，
         只写在轨道上的话 var(--sp-card) 在提示卡里无法解析（原实现即踩此坑）。 */
      `${c},${c}-peek{--sp-ink:${o.inkLight};--sp-card:#ffffff;--sp-cardline:#e6e9ee;`,
      `--sp-cardink:#1b1f27;--sp-ring:${o.peakRingColor || "rgba(17,19,24,.42)"};}`,
      `${c}.is-dark,${c}-peek.is-dark{--sp-ink:${o.inkDark};--sp-card:#1e232a;`,
      `--sp-cardline:#333a44;--sp-cardink:#eef1f5;`,
      `--sp-ring:${o.peakRingColor || "rgba(233,236,241,.5)"};}`,
      /* 轨道：贴右固定，竖向只占条形高度 + 上下余量 */
      `${c}{position:fixed;right:${o.edgeGap}px;top:50%;transform:translateY(-50%);`,
      `width:${o.hitWidth}px;padding:${o.padY}px 0;z-index:${o.zIndex};`,
      `cursor:${o.cursor};touch-action:none;contain:layout style paint;}`,
      `${c}:focus-visible{outline:2px solid ${o.activeColor};outline-offset:4px;border-radius:8px;}`,
      /* 条形区：右对齐、从右向左生长，只有一个峰 */
      `${c} .sp-stage{position:relative;margin-left:auto;width:${o.stageWidth + pad}px;`,
      `box-sizing:border-box;padding-right:${pad}px;overflow:hidden;}`,
      `${c} .sp-bars{position:relative;display:flex;flex-direction:column;align-items:flex-end;`,
      `gap:${o.barGap}px;}`,
      `${c} .sp-bar{height:${o.barHeight}px;width:${o.barWidth}px;border-radius:99px;`,
      `background:var(--sp-ink);opacity:${o.baseOpacityIdle};transform:scale(1,1);`,
      `transform-origin:right center;}`,
      /* 峰值描边：单个覆盖元素，尺寸逐帧写入（容器已 contain:layout，影响范围极小） */
      `${c} .sp-ring{position:absolute;right:0;top:0;box-sizing:border-box;`,
      `border:${o.peakRingWidth}px solid var(--sp-ring);border-radius:99px;`,
      `pointer-events:none;opacity:0;display:none;will-change:transform,opacity;}`,
      `${c}.has-ring .sp-ring{display:block;}`,
      /* 提示卡 */
      `${c}-peek{position:fixed;top:0;right:${o.stageWidth + o.edgeGap + o.peekGap}px;`,
      `max-width:${o.peekMaxWidth}px;background:var(--sp-card);border:1px solid var(--sp-cardline);`,
      `border-radius:10px;padding:9px 12px;pointer-events:none;opacity:0;`,
      `transform:translate3d(0,0,0);transition:opacity .14s ease;z-index:${o.zIndex + 1};`,
      `will-change:transform,opacity;box-shadow:0 8px 24px -12px rgba(0,0,0,.3);}`,
      `${c}-peek.on{opacity:1;}`,
      `${c}-peek h3{margin:0;font:600 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",`,
      `"Microsoft YaHei","PingFang SC",sans-serif;color:var(--sp-cardink);white-space:nowrap;`,
      `overflow:hidden;text-overflow:ellipsis;}`,
      `@media (prefers-reduced-motion:reduce){${c}-peek{transition:none;}}`
    ];
    if (o.layer === "container") css.push(`${c} .sp-bars{will-change:transform;transform:translateZ(0);}`);
    else if (o.layer === "bar") css.push(`${c} .sp-bar{will-change:transform,opacity;}`);
    if (o.peakGlow) {
      css.push(`${c} .sp-bar{box-shadow:0 0 4px 1px var(--sp-ring);}`);
    }
    return css.join("");
  }
  __name(stylesFor, "stylesFor");
  function injectActiveStyle(cls, color) {
    const key = cls + "|" + color;
    if (injectedGlobal.has(key)) return;
    injectedGlobal.add(key);
    const s = document.createElement("style");
    s.textContent = `.${cls}>:is(h1,h2,h3,h4,h5,h6),.${cls} :is(h1,h2,h3,h4,h5,h6){color:${color} !important;transition:color .18s ease;}`;
    document.head.appendChild(s);
  }
  __name(injectActiveStyle, "injectActiveStyle");
  var _Scrollpeak = class _Scrollpeak {
    constructor(options) {
      this._user = assign({}, options || {});
      const o = this.o = resolveOptions(this._user);
      this.uid = "sp-" + (++uidSeq).toString(36) + Math.random().toString(36).slice(2, 6);
      this._raf = 0;
      this._running = false;
      this._destroyed = false;
      this._engaged = false;
      this._full = true;
      this._lo = 0;
      this._hi = -1;
      this._target = 0.5;
      this._cur = 0.5;
      this._t = o.idle;
      this._lastT = -1;
      this._active = -1;
      this._activeSec = -1;
      this._lastY = NaN;
      this._lastBg = "";
      this._ringOn = false;
      this._rw = -1;
      this._rh = -1;
      this._render = this._render.bind(this);
      this._tfCache = [];
      this._opCache = [];
      this._buildLut();
      this._build();
      if (this._aborted) return;
      this._bind();
      this._syncTheme();
      this._measure();
      this._target = this._cur = this._scrollProgress();
      this._kick();
    }
    /* ------------------------------------------------------------ 构建 */
    _buildLut() {
      const LN = 512, LMAX = 8;
      const o = this.o;
      this._lutMax = LMAX;
      this._lutN = LN;
      this._lutXIdle = this._makeLut(o.sigmaIdle, LN, LMAX);
      this._lutXActive = o.sigmaActive === o.sigmaIdle ? this._lutXIdle : this._makeLut(o.sigmaActive, LN, LMAX);
      const pickX = /* @__PURE__ */ __name((sig) => {
        if (sig === o.sigmaIdle) return this._lutXIdle;
        if (sig === o.sigmaActive) return this._lutXActive;
        return null;
      }, "pickX");
      this._lutYIdle = pickX(o.sigmaYIdle) || this._makeLut(o.sigmaYIdle, LN, LMAX);
      this._lutYActive = o.sigmaYActive === o.sigmaYIdle ? this._lutYIdle : pickX(o.sigmaYActive) || this._makeLut(o.sigmaYActive, LN, LMAX);
      this._xSame = this._lutXIdle === this._lutXActive;
      this._yMode = this._lutYIdle === this._lutXIdle && this._lutYActive === this._lutXActive ? 0 : this._lutYIdle === this._lutYActive ? 1 : 2;
    }
    _makeLut(sig, LN, LMAX) {
      const lut = new Float32Array(LN + 1);
      for (let q = 0; q <= LN; q++) {
        const d = q / LN * LMAX;
        lut[q] = Math.exp(-(d * d) / (2 * sig * sig));
      }
      return lut;
    }
    _lutAtIn(lut, d) {
      if (d >= this._lutMax) return 0;
      return lut[d / this._lutMax * this._lutN | 0];
    }
    /* 横向衰减（同时驱动横向放大与透明度） */
    _inf(d, k) {
      const a = this._lutAtIn(this._lutXIdle, d);
      if (this._xSame) return a;
      const b = this._lutAtIn(this._lutXActive, d);
      return a + (b - a) * k;
    }
    /* 纵向衰减：能复用横向结果就复用 */
    _infY(d, inf, k) {
      if (this._yMode === 0) return inf;
      const a = this._lutAtIn(this._lutYIdle, d);
      if (this._yMode === 1) return a;
      const b = this._lutAtIn(this._lutYActive, d);
      return a + (b - a) * k;
    }
    _build() {
      const o = this.o;
      const items = this.items = collect(o);
      if (items.length < o.minItems) {
        this._aborted = true;
        return;
      }
      const N = this._n = items.length;
      const rail = this.rail = document.createElement("aside");
      rail.className = "sp-rail " + this.uid + (o.peakRing ? " has-ring" : "");
      rail.setAttribute("aria-label", "文档导航");
      if (o.keyboard) {
        rail.setAttribute("role", "slider");
        rail.setAttribute("aria-orientation", "vertical");
        rail.setAttribute("aria-valuemin", "1");
        rail.setAttribute("aria-valuemax", String(N));
        rail.setAttribute("tabindex", "0");
      }
      const stage = this.stage = document.createElement("div");
      stage.className = "sp-stage";
      const barsEl = this.barsEl = document.createElement("div");
      barsEl.className = "sp-bars";
      stage.appendChild(barsEl);
      rail.appendChild(stage);
      if (o.peakRing) {
        const ring = this.ringEl = document.createElement("div");
        ring.className = "sp-ring";
        rail.appendChild(ring);
      }
      document.body.appendChild(rail);
      const peek = this.peek = document.createElement("div");
      peek.className = this.uid + "-peek";
      peek.setAttribute("role", "tooltip");
      peek.setAttribute("aria-hidden", "true");
      peek.innerHTML = "<h3></h3>";
      document.body.appendChild(peek);
      this.styleEl = document.createElement("style");
      this.styleEl.textContent = stylesFor(this.uid, o);
      document.head.appendChild(this.styleEl);
      injectActiveStyle(o.activeClass, o.activeColor);
      const frag = document.createDocumentFragment();
      this._bars = new Array(N);
      for (let i = 0; i < N; i++) {
        const b = document.createElement("div");
        b.className = "sp-bar";
        frag.appendChild(b);
        this._bars[i] = { el: b, center: 0, qx: -1, qy: -1, qo: -1 };
      }
      barsEl.appendChild(frag);
    }
    /* ------------------------------------------------------------ 几何 */
    _measure() {
      if (this._aborted) return;
      const o = this.o;
      const railRect = this.rail.getBoundingClientRect();
      this._railTop = railRect.top;
      this._railH = railRect.height || 1;
      const b0 = this._bars[0].el;
      const bH = parseFloat(getComputedStyle(b0).height) || b0.offsetHeight || o.barHeight;
      let top = 0;
      let node = b0;
      let reached = false;
      while (node) {
        if (node === this.rail) {
          reached = true;
          break;
        }
        top += node.offsetTop;
        node = node.offsetParent;
      }
      if (!reached) top = b0.getBoundingClientRect().top - railRect.top;
      const cs = getComputedStyle(this.barsEl);
      const gap = parseFloat(cs.rowGap || cs.gap) || o.barGap;
      const step = this._step = bH + gap;
      const first = this._firstCenter = top + bH / 2;
      for (let k = 0; k < this._n; k++) this._bars[k].center = first + k * step;
      this._full = true;
    }
    /* 指针像素位置 → 连续的条形序号 → 0..1
       不能用滑槽高度的比例：条形只占滑槽中间一段，上下各有 padY 留白。 */
    _posToTarget(clientY) {
      const idx = (clientY - this._railTop - this._firstCenter) / this._step;
      return Math.min(1, Math.max(0, idx / (this._n - 1)));
    }
    _scrollProgress() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop || 0) / max)) : 0.5;
    }
    /* ------------------------------------------------------------ 写入 */
    _tf(qx, qy) {
      let row = this._tfCache[qx];
      if (!row) row = this._tfCache[qx] = [];
      let s = row[qy];
      if (s === void 0) {
        const q = this.o.quantScale;
        s = row[qy] = "scale(" + (1 + qx / q).toFixed(3) + "," + (1 + qy / q).toFixed(3) + ")";
      }
      return s;
    }
    _op(q) {
      let s = this._opCache[q];
      if (s === void 0) s = this._opCache[q] = (q / this.o.quantOpacity).toFixed(3);
      return s;
    }
    _write(k, sx, sy, op) {
      const b = this._bars[k];
      const qs = this.o.quantScale;
      const qx = (sx - 1) * qs + 0.5 | 0;
      const qy = (sy - 1) * qs + 0.5 | 0;
      const qo = op * this.o.quantOpacity + 0.5 | 0;
      if (qx === b.qx && qy === b.qy && qo === b.qo) return;
      if (qx !== b.qx || qy !== b.qy) {
        b.el.style.transform = this._tf(qx, qy);
        b.qx = qx;
        b.qy = qy;
      }
      if (qo !== b.qo) {
        b.el.style.opacity = this._op(qo);
        b.qo = qo;
      }
    }
    /* 复位离开窗口的条形。绝大多数情况下它本来就停在静止值上（量化后完全相同），
       所以这里先做一次廉价的三元比较，避免为无事发生的条形付完整写入路径的代价。 */
    _rest(k, qo) {
      const b = this._bars[k];
      if (b.qx === 0 && b.qy === 0 && b.qo === qo) return;
      if (b.qx !== 0 || b.qy !== 0) {
        b.el.style.transform = this._tf(0, 0);
        b.qx = 0;
        b.qy = 0;
      }
      if (b.qo !== qo) {
        b.el.style.opacity = this._op(qo);
        b.qo = qo;
      }
    }
    /* ------------------------------------------------------------ 循环 */
    _kick() {
      if (this._running || this._destroyed) return;
      this._running = true;
      this._raf = requestAnimationFrame(this._render);
    }
    _render() {
      this._raf = 0;
      const o = this.o;
      const bars = this._bars;
      const N = this._n;
      const reduced = this._reduced;
      let cur = this._cur;
      let t = this._t;
      if (reduced) {
        cur = this._target;
        t = this._engaged ? 1 : o.idle;
      } else {
        cur += (this._target - cur) * o.damp;
        const want = this._engaged ? 1 : o.idle;
        t += (want - t) * 0.2;
      }
      const wantT = this._engaged ? 1 : o.idle;
      const baseO = o.baseOpacityIdle + (o.baseOpacityActive - o.baseOpacityIdle) * t;
      const peakO = o.peakOpacityIdle + (o.peakOpacityActive - o.peakOpacityIdle) * t;
      const span = 1 - o.idle;
      const eng = span > 1e-3 ? Math.min(1, Math.max(0, (t - o.idle) / span)) : 1;
      const full = this._full || Math.abs(t - this._lastT) > 1e-4;
      const peakPos = cur * (N - 1);
      let lo, hi;
      if (full) {
        lo = 0;
        hi = N - 1;
      } else {
        const w = o.windowSigma * Math.max(o.sigmaIdle, o.sigmaActive, o.sigmaYIdle, o.sigmaYActive) + 1;
        lo = Math.max(0, Math.floor(peakPos - w));
        hi = Math.min(N - 1, Math.ceil(peakPos + w));
        if (this._hi >= this._lo) {
          const restQo = baseO * o.quantOpacity + 0.5 | 0;
          for (let k = this._lo; k < lo; k++) this._rest(k, restQo);
          for (let k = hi + 1; k <= this._hi; k++) this._rest(k, restQo);
        }
      }
      let topIdx = lo;
      let topInf = -1;
      for (let k = lo; k <= hi; k++) {
        const d = k > peakPos ? k - peakPos : peakPos - k;
        const inf = this._inf(d, eng);
        if (inf > topInf) {
          topInf = inf;
          topIdx = k;
        }
        const infY = this._infY(d, inf, eng);
        const sx = 1 + inf * o.peakGain * t;
        const sy = 1 + infY * (o.peakGainYIdle + o.peakGainY * t);
        this._write(k, sx, sy, baseO + inf * (peakO - baseO));
      }
      if (topInf < 0) topInf = 0;
      const topSx = 1 + topInf * o.peakGain * t;
      const topD = topIdx > peakPos ? topIdx - peakPos : peakPos - topIdx;
      const topInfY = this._infY(topD, topInf, eng);
      const topSy = 1 + topInfY * (o.peakGainYIdle + o.peakGainY * t);
      this._cur = cur;
      this._t = t;
      this._lastT = t;
      this._lo = lo;
      this._hi = hi;
      this._full = false;
      const on = this._engaged && topInf > o.peekThreshold;
      if (on) {
        if (this._active !== topIdx) {
          this._active = topIdx;
          this._showPeek(topIdx);
          this._setActive(topIdx);
          this.peek.style.transform = "translate3d(0," + (this._railTop + bars[topIdx].center - 18).toFixed(0) + "px,0)";
          this.peek.classList.add("on");
          this.peek.setAttribute("aria-hidden", "false");
          if (o.keyboard) this.rail.setAttribute("aria-valuenow", String(topIdx + 1));
          if (o.onActive) o.onActive(topIdx, this.items[topIdx]);
        }
      } else if (this._active !== -1) {
        this._active = -1;
        this._hidePeek();
        this._setActive(-1);
      }
      if (o.peakRing) this._ring(topIdx, on ? topInf : 0, topSx, topSy);
      if (Math.abs(this._target - cur) < o.settleEps && Math.abs(wantT - t) < 2e-3) {
        this._cur = this._target;
        this._t = wantT;
        this._running = false;
        return;
      }
      this._raf = requestAnimationFrame(this._render);
    }
    _ring(idx, intensity, sx, sy) {
      const o = this.o;
      const r = this.ringEl;
      if (intensity <= 0.02) {
        if (this._ringOn) {
          r.style.opacity = "0";
          this._ringOn = false;
        }
        return;
      }
      const pad = o.peakRingGap + o.peakRingWidth;
      const w = Math.round(o.barWidth * sx + pad * 2);
      const h = Math.round(o.barHeight * sy + pad * 2);
      if (w !== this._rw || h !== this._rh) {
        r.style.width = w + "px";
        r.style.height = h + "px";
        this._rw = w;
        this._rh = h;
      }
      r.style.transform = "translate3d(0," + (this._bars[idx].center - h / 2).toFixed(1) + "px,0)";
      const op = intensity > 1 ? 1 : intensity;
      if (op !== this._ro) {
        r.style.opacity = op.toFixed(2);
        this._ro = op;
      }
      this._ringOn = true;
    }
    /* ------------------------------------------------------------ 提示卡 / 高亮 */
    _showPeek(idx) {
      if (!this.o.showPeek) return;
      this.peek.querySelector("h3").textContent = this.items[idx].t;
    }
    _hidePeek() {
      if (!this.o.showPeek) return;
      this.peek.classList.remove("on");
      this.peek.setAttribute("aria-hidden", "true");
    }
    _setActive(idx) {
      const o = this.o;
      if (idx === this._activeSec) return;
      if (this._activeSec >= 0 && this.items[this._activeSec].el) {
        this.items[this._activeSec].el.classList.remove(o.activeClass);
      }
      this._activeSec = idx;
      if (idx >= 0 && this.items[idx].el) this.items[idx].el.classList.add(o.activeClass);
    }
    /* ------------------------------------------------------------ 主题 */
    _bgLum() {
      const body = document.body;
      let c = body ? getComputedStyle(body).backgroundColor : "";
      let m = /rgba?\(([^)]+)\)/.exec(c || "");
      if (m) {
        const p = m[1].split(",").map(Number);
        if (p.length < 4 || p[3] > 0.5) return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
      }
      c = getComputedStyle(document.documentElement).backgroundColor;
      m = /rgba?\(([^)]+)\)/.exec(c || "");
      if (m) {
        const p = m[1].split(",").map(Number);
        return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
      }
      return 1;
    }
    _syncTheme() {
      if (this._aborted) return;
      const o = this.o;
      let dark;
      if (o.theme === "dark") dark = true;
      else if (o.theme === "light") dark = false;
      else dark = this._bgLum() < 0.5;
      this._dark = dark;
      this.rail.classList.toggle("is-dark", dark);
      this.peek.classList.toggle("is-dark", dark);
      if (o.onTheme) o.onTheme(dark ? "dark" : "light");
    }
    /* 主题变化去抖：合并到一帧，且背景没变就不重算 */
    _onMutate() {
      if (this._themeRaf) return;
      this._themeRaf = requestAnimationFrame(() => {
        this._themeRaf = 0;
        const sig = (document.documentElement.getAttribute("class") || "") + "|" + (document.documentElement.getAttribute("data-theme") || "") + "|" + (document.body ? document.body.getAttribute("class") || "" : "") + "|" + (document.body ? document.body.getAttribute("style") || "" : "");
        if (sig === this._lastBg) return;
        this._lastBg = sig;
        this._syncTheme();
      });
    }
    /* ------------------------------------------------------------ 事件 */
    _bind() {
      const passive = { passive: true };
      this._hEnter = () => {
        this._engaged = true;
        if (this.o.onEngage) this.o.onEngage();
        this._kick();
      };
      this._hLeave = () => {
        this._engaged = false;
        this._target = this._scrollProgress();
        if (this.o.onLeave) this.o.onLeave();
        this._kick();
      };
      this._hMove = (e) => {
        if (e.clientY === this._lastY) return;
        this._lastY = e.clientY;
        this._target = this._posToTarget(e.clientY);
        this._engaged = true;
        this._kick();
      };
      this._hDown = (e) => {
        this._engaged = true;
        this._lastY = e.clientY;
        this._target = this._posToTarget(e.clientY);
        this._kick();
      };
      this._hClick = (e) => {
        if (!this.o.clickToScroll) return;
        const i = Math.min(this._n - 1, Math.round(this._posToTarget(e.clientY) * (this._n - 1)));
        this.items[i].el.scrollIntoView({ behavior: this.o.scrollBehavior, block: "start" });
      };
      this._hScroll = () => {
        if (this._engaged) return;
        this._target = this._scrollProgress();
        this._kick();
      };
      this._hKey = (e) => {
        if (!this.o.keyboard) return;
        const N = this._n;
        let i = this._active < 0 ? Math.round(this._cur * (N - 1)) : this._active;
        let handled = true;
        switch (e.key) {
          case "ArrowDown":
          case "ArrowRight":
            i = Math.min(N - 1, i + 1);
            break;
          case "ArrowUp":
          case "ArrowLeft":
            i = Math.max(0, i - 1);
            break;
          case "PageDown":
            i = Math.min(N - 1, i + 5);
            break;
          case "PageUp":
            i = Math.max(0, i - 5);
            break;
          case "Home":
            i = 0;
            break;
          case "End":
            i = N - 1;
            break;
          case "Enter":
          case " ":
            this.items[Math.min(N - 1, Math.max(0, i))].el.scrollIntoView({ behavior: this.o.scrollBehavior, block: "start" });
            e.preventDefault();
            return;
          default:
            handled = false;
        }
        if (!handled) return;
        e.preventDefault();
        this._engaged = true;
        this._target = i / (N - 1);
        this._showPeek(i);
        this._setActive(i);
        this._active = i;
        this._kick();
      };
      this.rail.addEventListener("pointerenter", this._hEnter, passive);
      this.rail.addEventListener("pointerleave", this._hLeave, passive);
      this.rail.addEventListener("pointermove", this._hMove, passive);
      this.rail.addEventListener("pointerdown", this._hDown, passive);
      this.rail.addEventListener("click", this._hClick);
      this.rail.addEventListener("keydown", this._hKey);
      window.addEventListener("scroll", this._hScroll, passive);
      this._hResize = () => {
        if (this._rz) return;
        this._rz = requestAnimationFrame(() => {
          this._rz = 0;
          this._measure();
          for (let k = 0; k < this._n; k++) {
            this._bars[k].qx = this._bars[k].qy = this._bars[k].qo = -1;
          }
          if (!this._engaged) this._target = this._scrollProgress();
          this._kick();
        });
      };
      window.addEventListener("resize", this._hResize, passive);
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(this._hResize);
        this._ro.observe(this.rail);
        this._ro.observe(document.documentElement);
      }
      if (window.MutationObserver) {
        this._mo = new MutationObserver(() => this._onMutate());
        this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        this._mo.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
      }
      if (window.matchMedia) {
        this._mq = window.matchMedia("(prefers-color-scheme: dark)");
        if (this._mq.addEventListener) this._mq.addEventListener("change", this._hResize);
        this._mqm = window.matchMedia("(prefers-reduced-motion: reduce)");
        this._reduced = this._mqm.matches;
      }
    }
    /* ------------------------------------------------------------ 公开 API */
    /** 重新扫描条目并重建条形（内容变了之后调用） */
    refresh() {
      if (this._destroyed) return this;
      this.destroy({ keepOptions: true });
      this._destroyed = false;
      this._aborted = false;
      this._build();
      if (this._aborted) return this;
      this._bind();
      this._syncTheme();
      this._measure();
      this._target = this._cur = this._scrollProgress();
      this._kick();
      return this;
    }
    /** 局部改参数：重建样式与几何 */
    setOptions(patch) {
      if (this._destroyed) return this;
      assign(this._user, patch);
      const o = this.o = resolveOptions(this._user);
      this._buildLut();
      this.styleEl.textContent = stylesFor(this.uid, o);
      this.rail.classList.toggle("has-ring", !!o.peakRing);
      if (o.peakRing && !this.ringEl) {
        this.ringEl = document.createElement("div");
        this.ringEl.className = "sp-ring";
        this.rail.appendChild(this.ringEl);
      }
      this.rail.style.cursor = o.cursor;
      if (o.keyboard) {
        this.rail.setAttribute("role", "slider");
        this.rail.setAttribute("aria-orientation", "vertical");
        this.rail.setAttribute("tabindex", "0");
      } else {
        this.rail.removeAttribute("role");
        this.rail.removeAttribute("tabindex");
      }
      for (let k = 0; k < this._n; k++) {
        this._bars[k].qx = this._bars[k].qy = this._bars[k].qo = -1;
      }
      this._tfCache = [];
      this._opCache = [];
      this._measure();
      this._kick();
      return this;
    }
    /** 'auto' | 'light' | 'dark' */
    setTheme(theme) {
      this.o.theme = theme;
      this._user.theme = theme;
      this._syncTheme();
      return this;
    }
    /** 丢弃自定义参数回到默认值；传入 keep 可保留其中若干项 */
    reset(keep) {
      this._user = assign({}, keep || {});
      return this.setOptions({});
    }
    scrollToIndex(i) {
      const k = Math.min(this._n - 1, Math.max(0, i | 0));
      this.items[k].el.scrollIntoView({ behavior: this.o.scrollBehavior, block: "start" });
      return this;
    }
    get state() {
      return {
        engaged: this._engaged,
        active: this._active,
        target: this._target,
        current: this._cur,
        intensity: this._t,
        dark: !!this._dark,
        count: this._n || 0,
        title: this._active >= 0 && this.items[this._active] ? this.items[this._active].t : null
      };
    }
    destroy(opts) {
      if (this._destroyed) return;
      this._destroyed = true;
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._rz) cancelAnimationFrame(this._rz);
      if (this._themeRaf) cancelAnimationFrame(this._themeRaf);
      if (this._ro) this._ro.disconnect();
      if (this._mo) this._mo.disconnect();
      if (this.rail) {
        this.rail.removeEventListener("pointerenter", this._hEnter);
        this.rail.removeEventListener("pointerleave", this._hLeave);
        this.rail.removeEventListener("pointermove", this._hMove);
        this.rail.removeEventListener("pointerdown", this._hDown);
        this.rail.removeEventListener("click", this._hClick);
        this.rail.removeEventListener("keydown", this._hKey);
      }
      window.removeEventListener("scroll", this._hScroll);
      window.removeEventListener("resize", this._hResize);
      if (this.rail && this.rail.parentNode) this.rail.parentNode.removeChild(this.rail);
      if (this.peek && this.peek.parentNode) this.peek.parentNode.removeChild(this.peek);
      if (this.styleEl && this.styleEl.parentNode) this.styleEl.parentNode.removeChild(this.styleEl);
      this._setActive(-1);
      if (!opts || !opts.keepOptions) {
        this.rail = this.peek = this.styleEl = this.ringEl = null;
      }
      this._running = false;
    }
  };
  __name(_Scrollpeak, "Scrollpeak");
  var Scrollpeak = _Scrollpeak;
  function init(options) {
    const sp = new Scrollpeak(options);
    return sp._aborted ? null : sp;
  }
  __name(init, "init");
  function auto(options) {
    const o = options || {};
    const sel = o.container || DEFAULTS.container;
    const list = typeof sel === "string" ? document.querySelectorAll(sel) : [sel];
    const out = [];
    list.forEach((el) => {
      const sp = init(assign({}, o, { container: el }));
      if (sp) out.push(sp);
    });
    return out;
  }
  __name(auto, "auto");
  var Scrollpeak_ = Object.assign(Scrollpeak, {
    version: VERSION,
    defaults: DEFAULTS,
    presets: PRESETS,
    init,
    auto,
    Scrollpeak
  });
  var scrollpeak_default = Scrollpeak_;
  return __toCommonJS(scrollpeak_exports);
})();
