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

/** 月次ダイジェストが出ていたら閉じる。出ていなければ何もしない */
async function dismissDigest() {
  const digest = page.getByTestId('month-digest');
  if (await digest.count()) {
    await digest.click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(60);
  }
}

/**
 * 月を進める。**戻れないので、進めた分だけ確定する。**
 * 終局すると「翌月へ」が消えるので、そこで止まる（消えたことが終わりの合図）。
 *
 * ★進めるたびにダイジェストが被さる。出来事があると自動では消えないので、
 * 次の月へ行く前に必ず閉じる。
 */
async function advance(count) {
  for (let i = 0; i < count; i++) {
    await dismissDigest();
    const button = page.getByTestId('advance');
    if ((await button.count()) === 0) return i;
    await button.click();
    await page.waitForTimeout(40);
  }
  await dismissDigest();
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

// --- 1. ★院を1つも持たずに始まる。1ヶ月目にやることは開業しかない
await shot('02-goals');

// --- 1a. 開業。立地 → 科 → 内装 の順に決める。
// 自己資金1,000万では設備投資に届かないので、足りないぶんを全部借りることになる
await page.getByTestId('open-site-A').click();
await beat(1200);
await shot('02a-opening-specialty');
await page.getByTestId('specialty-naika').click();
await beat(1200);
await shot('02b-opening-fitout');
await page.getByTestId('fitout-premium').click();
await beat(1000);
await shot('02c-opening-plan');
// こだわり内装は評判の落ち着き先が高い代わりに1億近く借りることになる。
// 1院目は標準で建てて、余力を分院に回す
await page.getByTestId('fitout-standard').click();
await beat(800);
await page.getByTestId('confirm-opening').click();
await beat(1200);
await shot('02d-opened');

// --- 1b. 常勤医を置く。開院しただけでは誰も診られない
await page.getByTestId('clinic-row-A').click();
await beat(900);
await page.getByRole('button', { name: '常勤医を増やす' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: '常勤医を増やす' }).click();
await beat(900);
await shot('02e-doctors');

// --- 1c. ★集患。**看板だけでは商圏の4割にしか届かない。**
// 評判が満点でも、知られていなければ誰も来ない
await page.getByRole('button', { name: '患者', exact: true }).click();
await beat(1000);
await shot('02e2-marketing-none');
await page.getByTestId('marketing-web').click();
await beat(1000);
await shot('02e3-marketing-web');
await page.getByRole('button', { name: '概要', exact: true }).click();
await beat(400);
await page.getByRole('button', { name: '商圏', exact: true }).click();
await beat(1400);
await shot('02f-market');
await page.getByLabel('閉じる').click();
await beat(500);

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

// --- 3b. ★月を進めた手応え。何がどれだけ動いたかをダイジェストで出す
await page.getByTestId('advance').click();
await beat(1400);
await shot('05b-digest');
await dismissDigest();

await advance(5);
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

// --- 4b. ★分院に医師を置くには枠が要る。医局の枠は埋まっているので紹介会社へ
await visit('agency', async () => {
  await shot('08b-agency');
  await page.getByRole('button', { name: /枠を1つ確保する/ }).click();
  await beat(900);
  await shot('08c-agency-hired');
});

// --- 5. 銀行。★開業直後は純資産が薄いので、そもそも貸してもらえないことがある。
// 「借りられない」もこの画面が伝える情報なので、押せなければ押さずに撮る
await visit('bank', async () => {
  await shot('09-bank');
  const borrow = page.getByRole('button', { name: /を借りる/ });
  if (await borrow.count()) {
    await borrow.first().click();
    await beat(900);
    await shot('10-bank-borrowed');
  }
});

await beat(600);
await shot('11-sites');

// --- 5b. ★2院目。立地は決まった。ここで決めるのは科。
// 「競合なし」の縁が光っている科が、この商圏で空いているセグメント。
// **本町の内科（1院目と同じ組み合わせ）に出すと自分と食い合う。**
// 駅前の皮膚科は誰も居ない
await page.getByTestId('open-site-B').click();
await beat(1400);
await shot('11b-opening-specialty');
await page.getByTestId('specialty-hifuka').click();
await beat(1000);
await page.getByTestId('fitout-standard').click();
await beat(600);
await shot('11c-opening-plan-B');
await page.getByTestId('confirm-opening').click();
await beat(1200);
await shot('12-opened-B');

// B院に医師を置いて集患も打つ。★枠を先に買っていなければ＋は落ちている
await page.getByTestId('clinic-row-B').click();
await beat(900);
const plus = page.getByRole('button', { name: '常勤医を増やす' });
if (!(await plus.isDisabled())) {
  await plus.click();
  await beat(600);
}
await shot('12b-clinic-B');
await page.getByRole('button', { name: '患者', exact: true }).click();
await beat(600);
await page.getByTestId('marketing-web').click();
await beat(600);
await page.getByRole('button', { name: '商圏', exact: true }).click();
await beat(1200);
await shot('12c-clinic-B-market');
await page.getByLabel('閉じる').click();
await beat(600);

await advance(24);
await beat(800);
await shot('13-m37');

// --- 5b2. ★競合を押すと素性が出る。勝てるのかがここで分かる
await page.getByTestId('rival-pin-honmachi-naika').click();
await beat(1400);
await shot('12d-rival-detail');
await page.getByLabel('閉じる').click();
await beat(500);

// --- 5c. 3年後。空いていたセグメントを取り切っている
await page.getByTestId('clinic-row-B').click();
await beat(800);
await page.getByRole('button', { name: '商圏', exact: true }).click();
await beat(1400);
await shot('13b-market-squeezed');
await page.getByLabel('閉じる').click();
await beat(500);

// --- 6. 役員報酬。個人資産の帯が伸び、内部留保の帯が縮む
await visit('personalWealth', async () => {
  await shot('14-personal-before');
  // ★満額まで取ると法人が持たない。集患を足してから、法人の余力は薄い
  for (let i = 0; i < 2; i++) {
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
