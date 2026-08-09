/**
 * 診療所画面を実際に操作して録画する。
 *
 *   pnpm --filter @med/ui dev        # 別のシェルで起動しておく
 *   node packages/ui/e2e/tour.mjs
 *
 * 目的は見た目の確認ではなく、**中核ループが操作で体感できるか**の確認。
 * 13ヶ月目に医師を1名戻すと、19ヶ月目の待ち時間と33ヶ月目の患者ストックがどう変わるかを
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

/**
 * 表示中の四半期。画面のラベルは月表記なので、位置合わせは data-quarter で行う。
 * 表示文字列で待ち合わせると、文言を変えるたびにツアーが壊れる。
 */
const currentMonth = async () =>
  Number(await page.getByTestId('month-label').getAttribute('data-month'));

/** 1年送りと1ヶ月送りを組み合わせて目的の月まで動かす */
async function goToMonth(target) {
  for (let i = 0; i < 140; i++) {
    const now = await currentMonth();
    if (now === target) return;
    const gap = target - now;
    const label =
      gap >= 12 ? '1年進む' : gap <= -12 ? '1年戻る' : gap > 0 ? '次の月へ' : '前の月へ';
    await page.getByLabel(label).click();
    await page.waitForTimeout(gap >= 12 || gap <= -12 ? 320 : 180);
  }
  throw new Error(`${target}ヶ月目まで移動できなかった`);
}

await page.goto(BASE);
await page.waitForSelector('[data-testid="month-label"]');
await beat(1700);
await shot('01-map');

// --- マップから診療所へ入る。マップが根で、診療所は全画面差し替え
await page.getByTestId('clinic-row-A').click();
await beat(1500);
await shot('02-m01-overview');

// --- 平常時。待ち時間15分、評判75
await goToMonth(12);
await beat(1200);
await shot('03-m12-overview');

// --- 13ヶ月目に常勤医が1名抜ける。待ち時間が跳ねる
await goToMonth(13);
await beat(1500);
await shot('04-m13-doctor-lost');

// --- 19ヶ月目＝B院の開院月。全社の看護師が薄まり、待ち時間がピークを打つ
await goToMonth(19);
await beat(1800);
await shot('05-m19-wait-peak');

await page.getByRole('button', { name: '患者' }).click();
await beat(1800);
await shot('06-m19-patients');

// --- 患者ストックの底は32〜38ヶ月目。ピークから約1年おくれてやってくる
await goToMonth(33);
await beat(1800);
await shot('07-m33-stock-trough');

await page.getByRole('button', { name: '収支' }).click();
await beat(1600);
await shot('08-m33-income');

// --- ここから「もし13ヶ月目に医師を戻していたら」を同じ画面で比べる
await page.getByRole('button', { name: '概要' }).click();
await goToMonth(13);
await beat(1400);
await page.getByLabel('常勤医を増やす').click();
await beat(1800);
await shot('09-m13-doctor-restored');

await goToMonth(19);
await beat(1800);
await shot('10-m19-after-fix');

await goToMonth(33);
await beat(1600);
await shot('11-m33-after-fix');

// --- 既定シナリオへ戻す
await page.getByRole('button', { name: '既定シナリオに戻す' }).click();
await beat(1600);
await shot('12-m33-reset');

// --- マップへ戻る。混雑した院が赤く出ているか
await page.getByLabel('閉じる').click();
await beat(1500);
await shot('13-map-trough');

await goToMonth(19);
await beat(1800);
await shot('14-map-crisis');

// --- 分院へ。B院は19ヶ月目に開院する
await page.getByTestId('clinic-row-B').click();
await beat(1500);
await shot('15-clinic-b');
await page.getByLabel('閉じる').click();
await beat(900);

// --- 建物を一巡する。危機のあとの月で見るのが分かりやすいので34ヶ月目へ
await goToMonth(34);
await beat(1200);
for (const [id, name] of [
  ['hq', '16-hq'],
  ['accounting', '17-accounting'],
  ['personnel', '18-personnel'],
  ['igyoku', '19-igyoku'],
  ['agency', '20-agency'],
  ['nursingSchool', '21-school'],
  ['bank', '22-bank'],
  ['bureau', '23-bureau'],
]) {
  await page.getByTestId(`building-${id}`).click();
  await beat(1500);
  await shot(name);
  await page.getByLabel('閉じる').click();
  await beat(700);
}

// --- 経理は3タブ。貸借と資金も見せる
await page.getByTestId('building-accounting').click();
await beat(900);
await page.getByRole('button', { name: '貸借' }).click();
await beat(1600);
await shot('24-accounting-bs');
await page.getByRole('button', { name: '資金' }).click();
await beat(1600);
await shot('25-accounting-cf');
await page.getByLabel('閉じる').click();
await beat(1200);
await shot('26-map-final');

await context.close();
await browser.close();
console.log(`録画とスクリーンショットを ${OUT}/ に出力した`);
