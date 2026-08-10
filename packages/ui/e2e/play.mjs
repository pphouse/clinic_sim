/**
 * 本編を実際に遊んで録画する。
 *
 *   pnpm --filter @med/ui dev        # 別のシェルで起動しておく
 *   node packages/ui/e2e/play.mjs
 *
 * ★このツアーの目的は tour.mjs と違う。
 * あちらは「画面が揃っているか」、こちらは「**ゲームとして成立しているか**」。
 *
 * 見せる筋：
 *   1. 何を目指しているかが最初から見えている（ゴール帯）
 *   2. 未来は見えない。1ヶ月ずつしか進まない
 *   3. 決めたことが取り消せない
 *   4. 承継で分院を開き、借入で谷を越え、役員報酬で個人資産を積む
 *   5. 終局。称号と3本の達成率
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT_DIR ?? 'e2e-play';
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

const beat = (ms = 900) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const currentMonth = async () =>
  Number(await page.getByTestId('month-label').getAttribute('data-month'));

/**
 * 月を進める。**戻れないので、進めた分だけ確定する。**
 * 終局すると「翌月へ」が消えるので、そこで止まる（消えたことが終わりの合図）。
 */
async function advance(count) {
  for (let i = 0; i < count; i++) {
    const button = page.getByTestId('advance');
    if ((await button.count()) === 0) return i;
    await button.click();
    await page.waitForTimeout(40);
  }
  return count;
}

/** 建物を開いて何かして閉じる */
async function visit(id, action) {
  await page.getByTestId(`building-${id}`).click();
  await beat(700);
  if (action) await action();
  await page.getByLabel('閉じる').click();
  await beat(400);
}

await page.addInitScript(() => window.localStorage.clear());
await page.goto(BASE);
await page.waitForSelector('[data-testid="month-label"]');
await beat(1600);
await shot('01-start');

// --- 1. 何を目指しているかが見えている。未来は見えない
await shot('02-goals');

// --- 2. 医局へ当直を出して関係を積む。枠は落ちるが、派遣枠が増える
await visit('igyoku', async () => {
  await shot('03-igyoku');
  await page.getByRole('button', { name: '当直を出す' }).click();
  await beat(900);
  await shot('04-igyoku-duty');
});

// --- 3. 連携基幹病院。紹介の係数を立ち上げる
await visit('referralHospital', async () => {
  await page.getByRole('button', { name: /活動する/ }).click();
  await beat(900);
  await shot('05-referral');
});

await advance(6);
await beat(800);
await shot('06-m07');

// --- 4. 加算を取る
await visit('bureau', async () => {
  await shot('07-bureau');
  const acquire = page.getByRole('button', { name: /を取得（/ });
  if (await acquire.count()) {
    await acquire.first().click();
    await beat(900);
    await shot('08-bureau-acquired');
  }
});

await advance(6);
await beat(600);

// --- 5. 借入で谷を越えてから、承継で分院を開く
await visit('bank', async () => {
  await shot('09-bank');
  await page.getByRole('button', { name: /を借りる/ }).click();
  await beat(900);
  await shot('10-bank-borrowed');
});

await beat(600);
await shot('11-sites');
await page.getByTestId('open-site-D').click();
await beat(1200);
await shot('12-opened-D');

// D院を開いて医師を増やす。承継なので初日から患者がいる
await page.getByRole('button', { name: /D院（承継）/ }).first().click();
await beat(900);
await shot('12b-clinic-D');
await page.getByLabel('常勤医を増やす').click();
await beat(700);
await shot('12c-clinic-D-doctors');
await page.getByLabel('閉じる').click();
await beat(600);

await advance(24);
await beat(800);
await shot('13-m37');

// --- 6. 役員報酬。個人資産の帯が伸び、内部留保の帯が縮む
await visit('personalWealth', async () => {
  await shot('14-personal-before');
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '報酬 +50万' }).click();
    await page.waitForTimeout(120);
  }
  await beat(900);
  await shot('15-personal-after');
});
await beat(800);
await shot('16-goals-shifted');

// --- 7. 残りを一気に進めて終局まで。終わったら「翌月へ」が消える
const advanced = await advance(83);
await beat(1800);
await shot('17-ending');
console.log(`${advanced}ヶ月進めたところで終局`);

await context.close();
await browser.close();
console.log(`録画とスクリーンショットを ${OUT}/ に出力した`);
