/*!
 * 基准用的「重构前实现」—— 冻结快照，不随库更新，也不属于 Scrollpeak 的发布内容。
 * 保留它是为了让 bench/run.mjs 能跑出可复现的前后对比。
 * 原始来源：早期的 codex-rail 单文件组件（去掉峰值指示线之后的版本）。
 */

(function () {
  'use strict';
  if (window.__codexRailLoaded) return;
  window.__codexRailLoaded = true;

  var CFG = Object.assign({
    container: '[data-rail]',
    heading: 'h2',
    hitWidth: 170,      // 触发区宽度（右侧）
    stageWidth: 72,     // 可视宽度
    barHeight: 3,
    barGap: 9,
    barWidth: 6,        // 静止宽度（统一值 → 只有一个峰）
    peakGain: 4.5,      // 峰值放大倍数
    sigma: 1.8,         // 峰半宽（单位：根）
    padY: 22,           // 滑槽上下余量（范围 = 条形总高 + 2×padY）
    edgeGap: 9,         // 距页面右边缘的距离（默认等于一个 bar 间距）
    idle: 0.3           // 未触发时的强度
  }, window.CODEX_RAIL || {});

  /* ---------------------------------------------------------- 样式 */
  var CSS = [
    /* 滑槽：竖向只占条形高度 + 上下余量，水平贴右 */
    '.cxr-rail{position:fixed;right:' + CFG.edgeGap + 'px;top:50%;transform:translateY(-50%);',
      'width:' + CFG.hitWidth + 'px;padding:' + CFG.padY + 'px 0;z-index:2147483000;',
      'cursor:pointer;touch-action:none;contain:layout style;',
      '--cxr-ink:#111318;--cxr-card:#ffffff;--cxr-cardline:#e6e9ee;--cxr-cardink:#1b1f27;}',
    '.cxr-rail.is-dark{--cxr-ink:#e9ecf1;--cxr-card:#1e232a;--cxr-cardline:#333a44;--cxr-cardink:#eef1f5;}',
    '.cxr-stage{position:relative;margin-left:auto;width:' + CFG.stageWidth + 'px;overflow:hidden;}',
    /* 单向：右对齐 + 从右侧向左生长 */
    '.cxr-bars{position:relative;display:flex;flex-direction:column;align-items:flex-end;',
      'gap:' + CFG.barGap + 'px;transform:translateZ(0);backface-visibility:hidden;}',
    '.cxr-bar{height:' + CFG.barHeight + 'px;width:' + CFG.barWidth + 'px;border-radius:99px;',
      'background:var(--cxr-ink);opacity:.3;transform:scaleX(1);transform-origin:right center;',
      'will-change:transform,opacity;}',
    /* 提示卡：只含标题 */
    '.cxr-peek{position:fixed;top:0;right:' + (CFG.stageWidth + CFG.edgeGap + 18) + 'px;max-width:240px;',
      'background:var(--cxr-card);border:1px solid var(--cxr-cardline);border-radius:10px;',
      'padding:9px 12px;pointer-events:none;opacity:0;transform:translate3d(0,0,0);',
      'transition:opacity .14s ease;z-index:2147483001;will-change:transform,opacity;',
      'box-shadow:0 8px 24px -12px rgba(0,0,0,.3);}',
    '.cxr-peek.on{opacity:1;}',
    '.cxr-peek h3{margin:0;font:600 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",',
      '"Microsoft YaHei","PingFang SC",sans-serif;color:var(--cxr-cardink);white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
    '@media (prefers-reduced-motion:reduce){.cxr-peek{transition:none;}}'
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ---------------------------------------------------------- 条目 */
  function textOf(el, sel) {
    var n = el.querySelector(sel);
    return n ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function collect() {
    var out = [], box = document.querySelector(CFG.container);
    if (box) {
      Array.prototype.forEach.call(box.children, function (el) {
        if (!el.tagName) return;
        var t = el.getAttribute('data-rail-title') || textOf(el, 'h1,h2,h3,h4,h5,h6');
        if (!t) return;
        out.push({ el: el, t: t });
      });
    }
    if (!out.length) {
      Array.prototype.forEach.call(document.querySelectorAll(CFG.heading), function (h) {
        out.push({ el: h, t: (h.textContent || '').trim() });
      });
    }
    return out;
  }

  var ITEMS = collect();
  if (ITEMS.length < 3) return;
  var N = ITEMS.length;

  /* ---------------------------------------------------------- DOM */
  var rail = document.createElement('aside');
  rail.className = 'cxr-rail';
  rail.setAttribute('aria-label', '文档导航');

  var stage = document.createElement('div');
  stage.className = 'cxr-stage';
  stage.innerHTML = '<div class="cxr-bars"></div>';
  rail.appendChild(stage);
  document.body.appendChild(rail);

  var barsEl = stage.querySelector('.cxr-bars');

  var peek = document.createElement('div');
  peek.className = 'cxr-peek';
  peek.setAttribute('role', 'tooltip');
  peek.setAttribute('aria-hidden', 'true');
  peek.innerHTML = '<h3></h3>';
  document.body.appendChild(peek);

  var bars = new Array(N);
  var frag = document.createDocumentFragment();
  for (var i = 0; i < N; i++) {
    var b = document.createElement('div');
    b.className = 'cxr-bar';
    frag.appendChild(b);
    bars[i] = { el: b, center: 0, lastS: -1, lastO: -1 };
  }
  barsEl.appendChild(frag);

  /* ---------------------------------------------------------- 明暗自适应 */
  function bgLum() {
    var el = document.body;
    while (el) {
      var c = getComputedStyle(el).backgroundColor;
      var m = /rgba?\(([^)]+)\)/.exec(c);
      if (m) {
        var p = m[1].split(',').map(Number);
        if (p.length < 4 || p[3] > 0.5) {
          return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
        }
      }
      el = el.parentElement;
    }
    return 1;
  }
  function syncTheme() {
    var dark = bgLum() < 0.5;
    rail.classList.toggle('is-dark', dark);
    peek.classList.toggle('is-dark', dark);
    if (window.__cxrHudTheme) window.__cxrHudTheme(dark ? '深色（灰白滑条）' : '浅色（灰黑滑条）');
  }

  /* ---------------------------------------------------------- 几何 */
  var railTop = 0, railH = 1, firstCenter = 0, step = 1;
  function measure() {
    var rr = rail.getBoundingClientRect();
    railTop = rr.top; railH = rr.height || 1;
    var b0 = bars[0].el.getBoundingClientRect();
    var bH = b0.height || CFG.barHeight;
    var cs = getComputedStyle(barsEl);
    var gap = parseFloat(cs.rowGap || cs.gap) || CFG.barGap;
    step = bH + gap;
    firstCenter = (b0.top - rr.top) + bH / 2;
    for (var k = 0; k < N; k++) bars[k].center = firstCenter + k * step;
    if (window.__cxrHudRange) {
      window.__cxrHudRange(Math.round(rr.height) + ' px（条形 + 上下 ' + CFG.padY + '）');
    }
  }

  /* 把鼠标的像素位置换算成「连续的条形序号」，再归一化到 0..1。
     不能用滑槽高度的比例：条形只占滑槽中间一段，上下各有 padY 留白，
     按高度取比例会让上下两端的指针与条形错位。 */
  function posToTarget(clientY) {
    var idx = (clientY - railTop - firstCenter) / step;
    return Math.min(1, Math.max(0, idx / (N - 1)));
  }

  /* ---------------------------------------------------------- 高斯查表 */
  var LN = 512, LMAX = 8, LUT = new Float32Array(LN + 1);
  for (var q = 0; q <= LN; q++) {
    var dd = q / LN * LMAX;
    LUT[q] = Math.exp(-(dd * dd) / (2 * CFG.sigma * CFG.sigma));
  }
  function lutAt(d) { return LUT[d >= LMAX ? LN : (d / LMAX * LN) | 0]; }

  /* ---------------------------------------------------------- 状态 */
  var target = 0.5, cur = 0.5, t = CFG.idle;
  var engaged = false, running = false, raf = 0, active = -1, activeSec = -1;
  var EPS = 0.0006, EPST = 0.002;

  function scrollProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop || 0) / max)) : 0.5;
  }

  function setActiveSection(idx) {
    if (idx === activeSec) return;
    if (activeSec >= 0 && ITEMS[activeSec].el) ITEMS[activeSec].el.classList.remove('cxr-active');
    activeSec = idx;
    if (idx >= 0 && ITEMS[idx].el) ITEMS[idx].el.classList.add('cxr-active');
  }

  function showPeek(idx) {
    peek.querySelector('h3').textContent = ITEMS[idx].t;
    var y = Math.min(Math.max(railTop + bars[idx].center - 18, 10), window.innerHeight - 52);
    peek.style.transform = 'translate3d(0,' + y.toFixed(0) + 'px,0)';
    peek.classList.add('on');
    peek.setAttribute('aria-hidden', 'false');
  }
  function hidePeek() {
    peek.classList.remove('on');
    peek.setAttribute('aria-hidden', 'true');
  }

  /* ---------------------------------------------------------- 循环 */
  function render() {
    raf = 0;
    cur += (target - cur) * 0.22;
    var wantT = engaged ? 1 : CFG.idle;
    t += (wantT - t) * 0.20;

    var baseO = 0.10 + 0.24 * t;
    var peakO = 0.42 + 0.58 * t;

    var peakPos = cur * (N - 1), topIdx = 0, topInf = -1;
    for (var k = 0; k < N; k++) {
      var bk = bars[k];
      var inf = lutAt(Math.abs(k - peakPos));
      if (inf > topInf) { topInf = inf; topIdx = k; }
      var s = 1 + inf * CFG.peakGain * t;
      var o = baseO + inf * (peakO - baseO);
      if (Math.abs(s - bk.lastS) > 0.004 || Math.abs(o - bk.lastO) > 0.006) {
        bk.el.style.transform = 'scaleX(' + s.toFixed(3) + ')';
        bk.el.style.opacity = o.toFixed(3);
        bk.lastS = s; bk.lastO = o;
      }
    }

    if (engaged && topInf > 0.4) {
      if (active !== topIdx) { active = topIdx; showPeek(topIdx); setActiveSection(topIdx); }
    } else if (active !== -1) {
      active = -1; hidePeek(); setActiveSection(-1);
    }

    if (Math.abs(target - cur) < EPS && Math.abs(wantT - t) < EPST) {
      cur = target; t = wantT;
      running = false;
      return;
    }
    raf = requestAnimationFrame(render);
  }
  function kick() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(render);
  }

  /* ---------------------------------------------------------- 交互 */
  rail.addEventListener('pointerenter', function () {
    engaged = true;
    if (window.__cxrHudState) window.__cxrHudState('已触发');
    kick();
  }, { passive: true });

  rail.addEventListener('pointerleave', function () {
    engaged = false;
    target = scrollProgress();          // 回到跟随滚动
    if (window.__cxrHudState) window.__cxrHudState('未触发');
    kick();
  }, { passive: true });

  rail.addEventListener('pointermove', function (e) {
    target = posToTarget(e.clientY);      // 与条形位置精确对齐
    engaged = true;
    kick();
  }, { passive: true });

  rail.addEventListener('click', function (e) {
    var t = posToTarget(e.clientY);
    ITEMS[Math.min(N - 1, Math.round(t * (N - 1)))].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* 未触发时跟随页面滚动 */
  window.addEventListener('scroll', function () {
    if (engaged) return;
    target = scrollProgress();
    kick();
  }, { passive: true });

  var rz = 0;
  function onResize() {
    if (rz) return;
    rz = requestAnimationFrame(function () {
      rz = 0; measure();
      for (var k = 0; k < N; k++) bars[k].lastS = -1;
      if (!engaged) target = scrollProgress();
      kick();
    });
  }
  window.addEventListener('resize', onResize, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(rail);

  /* 主题变化：监听 html/body 的 class 与 style，以及系统主题 */
  if (window.MutationObserver) {
    var mo = new MutationObserver(syncTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', syncTheme);
  }

  /* 左侧只高亮标题 */
  var hl = document.createElement('style');
  hl.textContent = '.cxr-active>:is(h1,h2,h3,h4,h5,h6),' +
                   '.cxr-active :is(h1,h2,h3,h4,h5,h6){color:#0b7f8c !important;transition:color .18s ease;}';
  document.head.appendChild(hl);

  /* 启动 */
  window.__cxrResync = syncTheme;      // 供宿主页在就绪后重新同步一次
  syncTheme();
  measure();
  target = cur = scrollProgress();

  /* 调试/截图钩子：
     ?y=23.5        模拟鼠标位于滑槽内 23.5px 处（走真实映射路径，用于校验对齐）
     ?at=0.42       直接指定峰值位置
     ?theme=dark    强制主题 */
  var mY = /[?&]y=(-?[\d.]+)/.exec(location.search);
  if (mY) { engaged = true; t = 1; target = cur = posToTarget(railTop + parseFloat(mY[1])); }
  var mAt = /[?&]at=([\d.]+)/.exec(location.search);
  if (mAt) { target = cur = Math.min(1, Math.max(0, parseFloat(mAt[1]))); engaged = true; t = 1; }
  var mTh = /[?&]theme=(dark|light)/.exec(location.search);
  if (mTh) {
    document.documentElement.setAttribute('data-theme', mTh[1]);
    syncTheme();
  }

  kick();
})();
