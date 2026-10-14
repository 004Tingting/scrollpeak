/**
 * 构建脚本：把 src/scrollpeak.js 产出四种分发格式。
 *   dist/scrollpeak.js       IIFE（<script> 直接用，未压缩，便于调试）
 *   dist/scrollpeak.min.js   IIFE（压缩，CDN 入口）
 *   dist/scrollpeak.esm.js   ESM（import）
 *   dist/scrollpeak.cjs      CommonJS（require）
 *
 * 产物是**提交进仓库**的：jsDelivr 直接按 Git 标签读取，本项目不走 npm。
 *
 * 用法：
 *   npm install && npm run build
 * 离线环境可指定现成的 esbuild 可执行文件：
 *   ESBUILD_BIN=/path/to/esbuild node build.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, 'src', 'scrollpeak.js');
const outdir = join(root, 'dist');
mkdirSync(outdir, { recursive: true });

const bin = process.env.ESBUILD_BIN || 'esbuild';

/* 头部横幅由 Node 读取源文件后再前置：避免走命令行时被 Windows 控制台按 ANSI 转码。
   必须取完整的注释块（含收尾的星号斜杠），截断会变成未闭合注释、整份产物语法错误。 */
const srcText = readFileSync(entry, 'utf8');
const end = srcText.indexOf('*/');
const banner = (end > 0 ? srcText.slice(0, end + 2) : '') + '\n';

const targets = [
  { out: 'dist/scrollpeak.js', format: 'iife', minify: false },
  { out: 'dist/scrollpeak.min.js', format: 'iife', minify: true },
  { out: 'dist/scrollpeak.esm.js', format: 'esm', minify: true },
  { out: 'dist/scrollpeak.cjs', format: 'cjs', minify: true }
];

for (const t of targets) {
  const args = [
    entry,
    '--bundle',
    '--format=' + t.format,
    '--target=es2018',
    '--charset=utf8',
    '--legal-comments=none',
    '--outfile=' + join(root, t.out)
  ];
  if (t.format === 'iife') args.push('--global-name=Scrollpeak');
  if (t.minify) args.push('--minify');
  else args.push('--keep-names');

  const r = spawnSync(bin, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) {
    console.error('\n构建失败：' + t.out);
    process.exit(r.status || 1);
  }

  const file = join(root, t.out);
  const code = readFileSync(file, 'utf8');
  writeFileSync(file, banner + code, 'utf8');

  const raw = Buffer.byteLength(banner + code);
  const gz = gzipSync(Buffer.from(banner + code)).length;
  console.log(
    `  ${t.out.padEnd(26)} ${(raw / 1024).toFixed(1).padStart(6)} KB   gzip ${(gz / 1024).toFixed(1).padStart(5)} KB`
  );
}

/* ---------------------------------------------------------------- 单文件示例
   把 demo.css 与压缩后的组件内联进 plain.html，产出双击即可打开、
   不依赖任何外部文件的 single-file.html。 */
const plain = readFileSync(join(root, 'examples', 'plain.html'), 'utf8');
const css = readFileSync(join(root, 'examples', 'demo.css'), 'utf8');
const js = readFileSync(join(root, 'dist', 'scrollpeak.min.js'), 'utf8')
  .replace(/<\/script/gi, '<\\/script');

const single = plain
  .replace('<title>Scrollpeak · 未处理版（plain）</title>', '<title>Scrollpeak · 单文件版</title>')
  .replace('<h1>Scrollpeak · 未处理版</h1>', '<h1>Scrollpeak · 单文件版</h1>')
  .replace(
    '<p class="meta">峰值只靠长度表达，不加粗、不描边。最克制、最不抢视线的一版。</p>',
    '<p class="meta">组件、样式与演示页全部内联在本文件里，双击即可打开，不依赖任何外部文件。</p>'
  )
  .replace('<link rel="stylesheet" href="demo.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="../dist/scrollpeak.min.js"></script>', '<script>\n' + js + '\n</script>');

if (single === plain || single.indexOf('Scrollpeak.init') < 0) {
  console.error('\n单文件示例生成失败：模板里的占位字符串没匹配上。');
  process.exit(1);
}
writeFileSync(join(root, 'examples', 'single-file.html'), single, 'utf8');
console.log(`  examples/single-file.html  ${(Buffer.byteLength(single) / 1024).toFixed(1).padStart(6)} KB`);

console.log('\n构建完成。');
