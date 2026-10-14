/**
 * 冒烟测试：不依赖浏览器，验证产物形状、导出、默认值、以及文档与产物的一致性。
 *
 *   node test/smoke.mjs
 *
 * 真正的渲染行为由 examples/ 下的示例页人工核对（几何类 bug 单元测试抓不到），
 * 性能回归由 bench/run.mjs 负责（见 README「性能」一节）。
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);

const API = ['version', 'defaults', 'presets', 'init', 'auto', 'Scrollpeak'];
let passed = 0;

function ok(name, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

function assertApi(api, label) {
  for (const key of API) {
    assert.ok(key in api, `${label} 缺少导出：${key}`);
  }
  assert.equal(typeof api.init, 'function', `${label} 的 init 不是函数`);
  assert.equal(typeof api.auto, 'function', `${label} 的 auto 不是函数`);
  assert.equal(api.version, pkg.version, `${label} 版本号与 package.json 不一致`);
  assert.equal(typeof api.defaults, 'object', `${label} 的 defaults 不是对象`);
  assert.ok(api.presets.plain && api.presets.bold, `${label} 缺少 plain / bold 预设`);
}

console.log('\nscrollpeak 冒烟测试  v' + pkg.version + '\n');

/* 1. 产物存在且非空 */
for (const f of ['dist/scrollpeak.js', 'dist/scrollpeak.min.js', 'dist/scrollpeak.esm.js', 'dist/scrollpeak.cjs']) {
  ok(f + ' 存在且非空', () => {
    assert.ok(statSync(join(root, f)).size > 1000, f + ' 太小，可能没构建成功');
  });
}

/* 2. ESM */
const esm = await import(pathToFileURL(join(root, 'dist', 'scrollpeak.esm.js')).href);
ok('ESM 导出齐全', () => assertApi(esm, 'ESM'));
ok('ESM 默认导出与具名导出一致', () => {
  assert.equal(esm.default.init, esm.init);
});

/* 3. CommonJS */
const cjs = require(join(root, 'dist', 'scrollpeak.cjs'));
ok('CJS 导出齐全', () => assertApi(cjs, 'CJS'));

/* 4. IIFE：在裸沙箱里求值应当不报错，并挂出一个全局对象 */
const iife = readFileSync(join(root, 'dist', 'scrollpeak.min.js'), 'utf8');
ok('IIFE 可在无 DOM 环境求值并挂出全局', () => {
  const sandbox = { window: {}, self: {}, globalThis: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(iife, sandbox, { filename: 'scrollpeak.min.js' });
  const api = sandbox.Scrollpeak || sandbox.window.Scrollpeak;
  assert.ok(api, 'IIFE 没有挂出 Scrollpeak 全局');
  assertApi(api, 'IIFE');
});

/* 5. 关键默认值没被改动（防止误改默认行为） */
ok('关键默认值符合预期', () => {
  const d = esm.defaults;
  assert.equal(d.peakStyle, 'plain');
  assert.equal(d.sigma, 1.8);
  assert.equal(d.peakGain, 4.5);
  assert.equal(d.peakGainY, 0);
  assert.equal(d.windowSigma, 4);
  assert.equal(d.quantScale, 256);
  assert.equal(d.quantOpacity, 170);
  assert.equal(d.container, '[data-scrollpeak]');
  assert.equal(d.layer, 'container');
});

/* 6. bold 预设必须确实改变了参数 */
ok('bold 预设生效', () => {
  const b = esm.presets.bold;
  assert.equal(b.peakRing, true);
  assert.ok(b.peakGainY > 0, 'bold 应当加粗峰值');
  assert.ok(b.peakGain > esm.defaults.peakGain, 'bold 的峰值放大应当更大');
});

/* 7. README 必须写全每一个参数（改默认值表时容易忘记同步文档） */
ok('README 覆盖了所有默认参数', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const documented = new Set(
    [...readme.matchAll(/^\|\s+`([A-Za-z]+)`/gm)].map((m) => m[1])
  );
  const missing = Object.keys(esm.defaults).filter((k) => !documented.has(k));
  assert.deepEqual(missing, [], 'README 缺少这些参数的说明：' + missing.join(', '));
});

/* 8. 包名与全局名保持一致，避免发布后对不上 */
ok('包名与全局导出名一致', () => {
  assert.equal(pkg.name, 'scrollpeak');
  assert.ok(esm.default.init, '默认导出应当带 init');
});

/* 9. README 里引用的本地文件必须存在（GitHub 上就是一堆裂图） */
ok('README 的本地链接与图片都存在', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const targets = [...readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)]
    .map((m) => m[1].split('#')[0].trim())
    .filter((t) => t && !/^[a-z]+:/i.test(t));       // 排除 http(s): 与 mailto:
  const missing = [...new Set(targets)].filter((t) => !existsSync(join(root, t)));
  assert.deepEqual(missing, [], 'README 引用了不存在的文件：' + missing.join(', '));
});

/* 10. 发布必需的元数据别缺 */
ok('package.json 元数据齐全', () => {
  assert.equal(pkg.license, 'MIT');
  assert.ok(pkg.repository && pkg.repository.url, '缺少 repository');
  assert.ok(pkg.homepage, '缺少 homepage');
  assert.ok(pkg.bugs && pkg.bugs.url, '缺少 bugs');
  assert.ok(existsSync(join(root, 'LICENSE')), '缺少 LICENSE');
  assert.ok(existsSync(join(root, 'dist', 'scrollpeak.min.js')), '缺少压缩产物');
});

/* 11. README 引用的图片必须真的在仓库里（GitHub 上是相对路径，裂图很难发现） */
ok('README 的图片都在仓库内', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const imgs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
    .map((m) => m[1].split('#')[0].trim())
    .filter((t) => !/^[a-z]+:/i.test(t));
  const missing = [...new Set(imgs)].filter((p) => !existsSync(join(root, p)));
  assert.deepEqual(missing, [], 'README 引用了不存在的图片：' + missing.join(', '));
});

/* 12. 本项目不发布 npm：不该出现指向 npm registry 的死链 */
ok('没有指向 npm 注册表的链接', () => {
  const files = ['README.md', 'CONTRIBUTING.md', 'ROADMAP.md', 'CHANGELOG.md'];
  const bad = [];
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const m of text.matchAll(/https?:\/\/[^\s)"'<>]*npmjs\.com[^\s)"'<>]*/g)) {
      bad.push(f + ': ' + m[0]);
    }
  }
  assert.deepEqual(bad, [], '出现指向 npmjs.com 的死链：\n  ' + bad.join('\n  '));
});

console.log(`\n全部通过（${passed} 项）。\n`);
