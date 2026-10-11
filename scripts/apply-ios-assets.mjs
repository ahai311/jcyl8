/**
 * 将 resources/icon.png 写入 iOS AppIcon.appiconset（cap add ios 之后运行）
 * 用 macOS 自带 sips 从 1024 母图生成全套尺寸，重写 Contents.json。
 * 对应 Android 侧的 apply-android-assets.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcIcon = path.join(root, 'resources', 'icon.png');
const MIN_ICON_BYTES = 4096;

// (idiom, size pt, scale) -> pixel。覆盖 iPhone + iPad + App Store marketing。
const ICONS = [
  ['iphone', 20, '2x'], ['iphone', 20, '3x'],
  ['iphone', 29, '2x'], ['iphone', 29, '3x'],
  ['iphone', 40, '2x'], ['iphone', 40, '3x'],
  ['iphone', 60, '2x'], ['iphone', 60, '3x'],
  ['ipad', 20, '1x'], ['ipad', 20, '2x'],
  ['ipad', 29, '1x'], ['ipad', 29, '2x'],
  ['ipad', 40, '1x'], ['ipad', 40, '2x'],
  ['ipad', 76, '1x'], ['ipad', 76, '2x'],
  ['ipad', 83.5, '2x'],
  ['ios-marketing', 1024, '1x'],
];

function findAppIconset(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const p = path.join(dir, ent.name);
    if (ent.name === 'AppIcon.appiconset') return p;
    const found = findAppIconset(p);
    if (found) return found;
  }
  return null;
}

if (!fs.existsSync(srcIcon) || fs.statSync(srcIcon).size < MIN_ICON_BYTES) {
  console.warn('apply-ios-assets: resources/icon.png missing/too small, skip');
  process.exit(0);
}

const appiconset = findAppIconset(path.join(root, 'ios'));
if (!appiconset) {
  console.warn('apply-ios-assets: AppIcon.appiconset not found under ios/, skip');
  process.exit(0);
}

// 清掉 Capacitor 默认图标
for (const f of fs.readdirSync(appiconset)) {
  if (f.toLowerCase().endsWith('.png') || f.toLowerCase() === 'contents.json') {
    fs.unlinkSync(path.join(appiconset, f));
  }
}

const images = [];
let ok = 0;
for (const [idiom, sizePt, scale] of ICONS) {
  const scaleNum = parseFloat(scale);
  const px = Math.round(sizePt * scaleNum);
  const filename = `AppIcon-${idiom}-${sizePt}x${sizePt}@${scale}.png`;
  const dest = path.join(appiconset, filename);
  const r = spawnSync('sips', ['-z', String(px), String(px), srcIcon, '--out', dest], {
    encoding: 'utf8',
  });
  if (r.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size >= 128) {
    ok++;
  } else {
    console.warn(`apply-ios-assets: sips FAIL ${filename}`, (r.stderr || '').trim());
  }
  images.push({
    filename,
    idiom,
    size: `${sizePt}x${sizePt}`,
    scale,
  });
}

fs.writeFileSync(
  path.join(appiconset, 'Contents.json'),
  `${JSON.stringify({ images, info: { author: 'xcode', version: 1 }, properties: {} }, null, 2)}\n`,
);

console.log(
  `apply-ios-assets: ${ok}/${ICONS.length} icons -> ${path.relative(root, appiconset)}`,
);
if (ok === 0) {
  console.warn('apply-ios-assets: no icons generated');
  process.exit(0);
}
