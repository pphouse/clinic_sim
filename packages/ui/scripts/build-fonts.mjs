/**
 * 書体をサブセット化して同梱する。
 *
 *   node packages/ui/scripts/build-fonts.mjs
 *
 * ★なぜ同梱するのか
 * tokens.css は最初 Google Fonts を @import していたが、**一度も当たっていなかった。**
 * 実行環境から fonts.googleapis.com へ出られず、全部 IPAGothic に落ちていた。
 * ゲームが外部CDNの生死に依存するのも筋が悪いので、必要な字だけ切り出して抱える。
 *
 * ★何を切り出すか
 * ソースに実際に現れる文字＋かな全部＋英数記号。日本語の全字を持つと1書体2〜5MBあるが、
 * この方法なら数十KBで済む。
 *
 * **新しい漢字を UI に足したら、このスクリプトを回し直すこと。**
 * 回し忘れると、その字だけ豆腐（□）になる。fonts.css と woff2 はコミットする。
 *
 * ★素体（TTF）はコミットしていない（1書体2〜5MBあるため）。回す前に取ってくる：
 *
 *   mkdir -p vendor/fonts-src && cd vendor/fonts-src
 *   base=https://raw.githubusercontent.com/google/fonts/main/ofl
 *   curl -LO $base/zenkakugothicnew/ZenKakuGothicNew-{Regular,Medium,Bold}.ttf
 *   curl -LO $base/zenoldmincho/ZenOldMincho-SemiBold.ttf
 *   curl -L -o Inter.ttf "$base/inter/Inter%5Bopsz,wght%5D.ttf"
 *
 * 依存：pip install fonttools brotli
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const ttfDir = process.env.TTF_DIR ?? join(repo, 'vendor', 'fonts-src');
const outDir = join(here, '..', 'src', 'assets', 'fonts');

/** 文字を拾うソース。UI だけでなく sim も見る（イベント文言や加算名が sim にある） */
const SOURCE_DIRS = [
  join(repo, 'packages', 'ui', 'src'),
  join(repo, 'packages', 'sim', 'src'),
];

function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, acc);
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** 常に含める字。かなは全部入れておく（新しい文言でカタカナが出ても崩れないように） */
function baseCharset() {
  const chars = new Set();
  const add = (from, to) => {
    for (let c = from; c <= to; c++) chars.add(String.fromCodePoint(c));
  };
  add(0x20, 0x7e); // ASCII
  add(0x3000, 0x303f); // 和文の約物
  add(0x3040, 0x309f); // ひらがな
  add(0x30a0, 0x30ff); // カタカナ
  add(0xff01, 0xff60); // 全角英数と約物
  for (const c of '　○●◯△▲□■◆◇★☆※→←↑↓⇒−–—…‥「」『』（）〜℃％¥円') chars.add(c);
  return chars;
}

const chars = baseCharset();
for (const dir of SOURCE_DIRS) {
  for (const file of collectFiles(dir)) {
    for (const c of readFileSync(file, 'utf8')) {
      const code = c.codePointAt(0);
      if (code === undefined) continue;
      // CJK統合漢字・互換漢字・記号
      if (
        (code >= 0x2e80 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x20000 && code <= 0x2ffff)
      ) {
        chars.add(c);
      }
    }
  }
}

const unicodes = [...chars]
  .map((c) => c.codePointAt(0).toString(16).toUpperCase())
  .join(',');

/** family, weight, style, 素体ファイル, 出力名 */
const FACES = [
  ['Zen Kaku Gothic New', 400, 'ZenKakuGothicNew-Regular.ttf', 'zen-kaku-400'],
  ['Zen Kaku Gothic New', 500, 'ZenKakuGothicNew-Medium.ttf', 'zen-kaku-500'],
  ['Zen Kaku Gothic New', 700, 'ZenKakuGothicNew-Bold.ttf', 'zen-kaku-700'],
  // 明朝は見出し用。600 しか使っていないので 700 は焼かない（1フェイス 210KB あるため）
  ['Zen Old Mincho', 600, 'ZenOldMincho-SemiBold.ttf', 'zen-mincho-600'],
];

mkdirSync(outDir, { recursive: true });

const faceCss = [];
for (const [family, weight, source, name] of FACES) {
  const out = join(outDir, `${name}.woff2`);
  execFileSync('python3', [
    '-m', 'fontTools.subset', join(ttfDir, source),
    `--unicodes=${unicodes}`,
    '--layout-features=kern,liga,palt,vert,vrt2',
    '--flavor=woff2',
    `--output-file=${out}`,
  ]);
  faceCss.push(
    `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('../assets/fonts/${name}.woff2') format('woff2');\n}`,
  );
  console.log(`${name}.woff2  ${(statSync(out).size / 1024).toFixed(1)}KB`);
}

// Inter は数字と英字だけ使う。
// **可変フォントは subset では重みを固定できない。** 先に instancer で静的化してから絞る
for (const weight of [400, 500, 600, 700]) {
  const name = `inter-${weight}`;
  const out = join(outDir, `${name}.woff2`);
  const instanced = join(outDir, `.inter-${weight}-instance.ttf`);
  execFileSync('python3', [
    '-m', 'fontTools.varLib.instancer', join(ttfDir, 'Inter.ttf'),
    `wght=${weight}`, 'opsz=16',
    '--output', instanced,
  ]);
  execFileSync('python3', [
    '-m', 'fontTools.subset', instanced,
    '--unicodes=U+0020-007E,U+00A5,U+2013,U+2014,U+2026,U+2212,U+FF00-FF5E',
    '--layout-features=kern,tnum,liga',
    '--flavor=woff2',
    `--output-file=${out}`,
  ]);
  rmSync(instanced, { force: true });
  faceCss.push(
    `@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('../assets/fonts/${name}.woff2') format('woff2');\n}`,
  );
  console.log(`${name}.woff2  ${(statSync(out).size / 1024).toFixed(1)}KB`);
}

writeFileSync(
  join(here, '..', 'src', 'design', 'fonts.css'),
  `/*\n * 自動生成。手で編集しない。\n * 作り直す: node packages/ui/scripts/build-fonts.mjs\n *\n * 収録字数 ${chars.size}。ソースに現れる漢字＋かな全部＋英数記号だけを切り出している。\n * **UI に新しい漢字を足したらこのスクリプトを回し直すこと。** 忘れるとその字が豆腐になる。\n */\n\n${faceCss.join('\n\n')}\n`,
);

console.log(`\n収録 ${chars.size} 字 / ${FACES.length + 4} フェイス`);
