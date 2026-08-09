/**
 * 診療所画面を実際に操作して録画する。
 *
 *   pnpm --filter @med/ui dev        # 別のシェルで起動しておく
 *   node packages/ui/e2e/tour.mjs
 *
 * 目的は見た目の確認ではなく、**中核ループが操作で体感できるか**の確認。
 * Q5 に医師を1名戻すと、Q7 の待ち時間と Q11 の患者ストックがどう変わるかを
 * 同じ画面の中で往復して見せる。ここが面白くなければ残り15画面を作っても面白くならない。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT_DIR ?? 'e2e-out';
/** 環境に置いてある Chromium。playwright の同梱版とリビジョンが違うので明示する */
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  locale: 'ja-JP',
  recordVideo: { dir: OUT, size: VIEWPORT },
});
const page = await context.newPage();

const beat = (ms = 1100) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** 表示中の四半期ラベル。テストの主張はこれを基準にする */
const quarterLabel = () => page.getByTestId('quarter-label').innerText();
const doctorCount = () => page.getByTestId('doctor-count').innerText();
const heroValue = async (label) =>
  page.locator('div', { hasText: new RegExp(`^${label}$`) }).first().isVisible();

async function advanceTo(targetLabel) {
  for (let i = 0; i < 45; i++) {
    if ((await quarterLabel()) === targetLabel) return;
    await page.getByLabel('次の四半期へ').click();
    await page.waitForTimeout(220);
  }
  throw new Error(`${targetLabel} まで進めなかった`);
}

async function rewindTo(targetLabel) {
  for (let i = 0; i < 45; i++) {
    if ((await quarterLabel()) === targetLabel) return;
    await page.getByLabel('前の四半期へ').click();
    await page.waitForTimeout(220);
  }
  throw new Error(`${targetLabel} まで戻れなかった`);
}

await page.goto(BASE);
await page.waitForSelector('[data-testid="quarter-label"]');
await beat(1600);
await shot('01-y1q1-overview');

// --- 平常時。待ち時間15分、評判75
await advanceTo('Y1Q4');
await beat(1200);
await shot('02-y1q4-overview');

// --- Q5 に常勤医が1名抜ける。待ち時間が跳ねる
await advanceTo('Y2Q1');
await beat(1500);
await shot('03-y2q1-doctor-lost');

// --- Q7 が待ち時間のピーク。53分
await advanceTo('Y2Q3');
await beat(1800);
await shot('04-y2q3-wait-peak');

await page.getByRole('button', { name: '患者' }).click();
await beat(1800);
await shot('05-y2q3-patients');

// --- 患者ストックの底は Q11。ピークから4四半期おくれてやってくる
await advanceTo('Y3Q3');
await beat(1800);
await shot('06-y3q3-stock-trough');

await page.getByRole('button', { name: '収支' }).click();
await beat(1600);
await shot('07-y3q3-income');

// --- ここから「もし Q5 に医師を戻していたら」を同じ画面で比べる
await page.getByRole('button', { name: '概要' }).click();
await rewindTo('Y2Q1');
await beat(1400);
await page.getByLabel('常勤医を増やす').click();
await beat(1800);
await shot('08-y2q1-doctor-restored');

await advanceTo('Y2Q3');
await beat(1800);
await shot('09-y2q3-after-fix');

await advanceTo('Y3Q3');
await beat(1600);
await shot('10-y3q3-after-fix');

// --- 既定シナリオへ戻す
await page.getByRole('button', { name: '既定シナリオに戻す' }).click();
await beat(1600);
await shot('11-y3q3-reset');

// --- 分院へ。B院は Q7 に開院する
await page.getByLabel('閉じる').click();
await beat(1200);
await page.getByRole('button', { name: 'B院' }).click();
await beat(1400);
await shot('12-clinic-b');

await context.close();
await browser.close();
console.log(`録画とスクリーンショットを ${OUT}/ に出力した`);
