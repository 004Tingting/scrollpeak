/**
 * 基准跑分：把「重构前的旧实现」与「当前实现」放在同一页面、同一套埋点下各跑一遍。
 *
 *   node bench/run.mjs [N] [frames]
 *
 * 环境变量：
 *   CHROME_BIN   指定 Chrome / Chromium 可执行文件（不设则自动探测常见路径）
 *   BENCH_REPS   每个实现跑几轮，取中位数（默认 3）
 *   BENCH_PORT   本地服务端口（默认 8791）
 *
 * 指标含义：
 *   writes   逐帧写 transform/opacity 的次数（样式失效的直接成本）
 *   rects    getBoundingClientRect 调用次数（会触发强制布局）
 *   gcs      getComputedStyle 调用次数（会触发样式重算）
 *   cbTime   rAF 回调内 JS 的总耗时（逐帧更新的 CPU 成本）
 *   layers   带 will-change 的元素个数 ≈ 合成层数量
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.BENCH_PORT || 8791);
const N = process.argv[2] || '200';
const FRAMES = process.argv[3] || '180';
const REPS = +(process.env.BENCH_REPS || 3);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

/* ---------------------------------------------------------------- Chrome 探测 */

const CANDIDATES = [
  process.env.CHROME_BIN,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

async function findChrome() {
  for (const p of CANDIDATES) {
    try { await access(p); return p; } catch { /* 继续找 */ }
  }
  throw new Error('找不到 Chrome，请用 CHROME_BIN 指定可执行文件路径。');
}

/* ---------------------------------------------------------------- 本地服务 */

let onResult = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname === '/__result' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(204).end();
      if (onResult) onResult(JSON.parse(body));
    });
    return;
  }

  const rel = decodeURIComponent(url.pathname).replace(/^[\\/]+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) {          // 防目录穿越
    res.writeHead(403).end();
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found: ' + rel);
  }
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = await findChrome();

async function runOnce(impl) {
  const profile = await mkdtemp(join(tmpdir(), 'sp-bench-'));
  const url = `http://127.0.0.1:${PORT}/bench/bench.html?impl=${impl}&n=${N}&frames=${FRAMES}`;

  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-timer-throttling', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=900,700', url
  ], { stdio: 'ignore' });

  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 90000);
    onResult = (r) => { clearTimeout(timer); resolve(r); };
  });
  onResult = null;

  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  return result;
}

/* ---------------------------------------------------------------- 跑分 */

const fmt = (v, w = 10) => String(v).padStart(w);

const runs = { old: [], new: [] };
for (const impl of ['old', 'new']) {
  for (let i = 0; i < REPS; i++) {
    process.stdout.write(`跑 ${impl} 第 ${i + 1}/${REPS} 轮（N=${N}, frames=${FRAMES}）… `);
    const r = await runOnce(impl);
    if (r && r.error) {
      console.log('页面报错：' + r.error);
    } else {
      console.log(r ? '完成' : '超时/无结果');
      if (r) runs[impl].push(r);
    }
  }
}

server.close();

if (!runs.old.length || !runs.new.length) {
  console.error('\n结果不完整，请确认 `npm run build` 已执行。');
  process.exit(1);
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[(s.length / 2) | 0];
};
const med = (impl, path) => {
  const [group, key] = path.split('.');
  return median(runs[impl].map((r) => (group ? r[group][key] : r[key])));
};

function table(title, group) {
  console.log('\n' + title);
  console.log('  ' + '指标'.padEnd(20) + fmt('旧实现') + fmt('新实现') + fmt('变化'));
  const metrics = [
    ['style 写入 writes', 'writes'],
    ['布局读取 rects', 'rects'],
    ['样式重算 gcs', 'gcs'],
    ['rAF 回调 CPU (ms)', 'cbTimeMs'],
    ['rAF 帧数', 'frames']
  ];
  for (const [label, key] of metrics) {
    const a = med('old', group + '.' + key);
    const b = med('new', group + '.' + key);
    let pct;
    if (a === 0) pct = b === 0 ? '—' : '新增';
    else pct = ((b - a) / a * 100).toFixed(0) + '%';
    console.log('  ' + label.padEnd(18) + fmt(a) + fmt(b) + fmt(pct));
  }
}

console.log('\n============================================================');
console.log(`scrollpeak 基准对比   N=${N} 条  frames=${FRAMES}  ${REPS} 轮取中位数`);
console.log('============================================================');
table('【初始化】', 'init');
table('【场景 A：指针扫过整条轨道（稳态）】', 'sweep');
table('【场景 B：指针原地 ±1.2px 抖动】', 'jitter');

console.log('\n【静态结构】');
console.log('  ' + '指标'.padEnd(20) + fmt('旧实现') + fmt('新实现'));
for (const [label, key] of [['合成层 will-change', 'layers'], ['轨道内 DOM 节点', 'nodes'], ['注入 style 标签', 'styleTags']]) {
  console.log('  ' + label.padEnd(18) + fmt(med('old', 'static.' + key)) + fmt(med('new', 'static.' + key)));
}
console.log('');
