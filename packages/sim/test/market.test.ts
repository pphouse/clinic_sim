/**
 * 商圏と競合の検証。docs/spec/04-market.md
 *
 * ★最重要は「既定シナリオのシェアが常に 1」。
 * 検証モデルには競合が居ない。**シェアが 1 でなくなった瞬間に検証済みの患者数が動く。**
 *
 * 期待値は検証されていない。強さも撤退の閾値も、実際に押し出せるかを
 * 測ってから置いた数字であって、表計算の裏付けは無い。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  CLINIC_SCALE_MAX,
  CLINIC_SCALE_WEIGHT,
  COMPETITOR_EXIT_MONTHS,
  COMPETITOR_EXIT_SHARE,
  CLINICS,
  DISTRICTS,
  INITIAL_COMPETITORS,
  PLAY_SCENARIO,
  TOLERABLE_WAIT_MINUTES,
  attractivenessOf,
  districtOfClinic,
  runSimulation,
  tickMarket,
  type CompetitorState,
  type MonthDecision,
  type MonthResult,
} from '../src/index';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
const play = (decisions: MonthDecision[]) => runSimulation({ ...PLAY_SCENARIO, decisions });
const honmachi = (m: MonthResult) => m.market.districts.find((d) => d.id === 'honmachi')!;

// ==================================================================
// ★既定シナリオは競合が居ない
// ==================================================================

describe('既定シナリオのシェアは常に 1', () => {
  const baseline = runSimulation(BASELINE_SCENARIO);

  it('開院済みの院は120ヶ月ずっとシェア 1', () => {
    for (const m of baseline.months) {
      for (const c of m.clinics.filter((x) => x.open)) {
        expect(c.marketShare, `${m.month}ヶ月目 ${c.id}院`).toBe(1);
      }
    }
  });

  it('競合が1軒も居ない', () => {
    for (const m of baseline.months) {
      expect(m.market.districts.flatMap((d) => d.competitors)).toHaveLength(0);
    }
  });

  it('A・B・C は別々の商圏。同じ商圏なら食い合って数字が動く', () => {
    const ids = BASELINE_SCENARIO.decisions.length > 0 ? ['A', 'B', 'C'] : [];
    const last = at(baseline, 120);
    const districts = ids.map(
      (id) => last.market.districts.find((d) => d.clinics.some((c) => c.id === id))?.id,
    );
    expect(new Set(districts).size).toBe(ids.length);
  });
});

// ==================================================================
// 魅力
// ==================================================================

describe('魅力', () => {
  it('待ち時間が許容内なら 評判 × 規模係数', () => {
    expect(attractivenessOf(75, TOLERABLE_WAIT_MINUTES, 1)).toBeCloseTo(75, 9);
    expect(attractivenessOf(75, 10, 3)).toBeCloseTo(75 * (1 + CLINIC_SCALE_WEIGHT * 2), 9);
  });

  it('混むほど落ちる', () => {
    expect(attractivenessOf(75, 60, 1)).toBeLessThan(attractivenessOf(75, 20, 1));
  });

  it('★規模係数には上限がある。青天井だと医師を積むだけのゲームになる', () => {
    expect(attractivenessOf(75, 0, 999)).toBeCloseTo(75 * CLINIC_SCALE_MAX, 9);
  });

  it('★医師0なら魅力も0。看板だけの院に患者は来ない', () => {
    expect(attractivenessOf(75, 0, 0)).toBe(0);
  });

  it('医師0の院は競合を押し出せない。診察できないのに引力だけあるのは筋が通らない', () => {
    const empty = {
      config: { ...CLINICS[0]!, districtId: 'honmachi' },
      open: true,
      reputation: 75,
      waitMinutes: 0,
      doctors: 0,
    };
    const out = tickMarket({
      month: 1,
      clinics: [empty],
      competitors: INITIAL_COMPETITORS.filter((c) => c.districtId === 'honmachi').map((c) => ({
        ...c,
        openedAtMonth: 1,
        weakMonths: 0,
        closedAtMonth: null,
      })),
    });
    expect(out.shareByClinic['A']).toBe(0);
    const seg = out.tick.districts.find((d) => d.id === 'honmachi')!;
    expect(seg.competitors[0]!.share).toBe(1);
  });

  /**
   * ★競合の居ないセグメントに医師0の院を出したとき、
   * 0除算よけが等分に落ちてシェア1を渡していた。
   * 「看板だけの院に患者は来ない」が、独占のときだけ破れていた。
   */
  it('競合が1軒も居なくても、医師0ならシェアは0', () => {
    const out = tickMarket({
      month: 1,
      clinics: [
        {
          config: { ...CLINICS[0]!, districtId: 'ekimae', specialtyId: 'hifuka' },
          open: true,
          reputation: 75,
          waitMinutes: 0,
          doctors: 0,
        },
      ],
      competitors: [],
    });
    expect(out.shareByClinic['A']).toBe(0);
  });

  it('医師を1人置けばシェアは1に戻る。独占は独占のまま', () => {
    const out = tickMarket({
      month: 1,
      clinics: [
        {
          config: { ...CLINICS[0]!, districtId: 'ekimae', specialtyId: 'hifuka' },
          open: true,
          reputation: 75,
          waitMinutes: 0,
          doctors: 1,
        },
      ],
      competitors: [],
    });
    expect(out.shareByClinic['A']).toBe(1);
  });
});

// ==================================================================
// カニバリ
// ==================================================================

describe('同じ商圏の自院同士', () => {
  it('★隣に出すと本院のシェアが落ちる。これが検証モデルに無かった穴', () => {
    const alone = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    // D院（承継）は A院と同じ本町
    const paired = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
    ]);
    const shareA = (r: typeof alone, m: number) =>
      at(r, m).clinics.find((c) => c.id === 'A')!.marketShare;
    expect(shareA(paired, 30)).toBeLessThan(shareA(alone, 30));
  });

  it('自社の合計シェアは増える。食い合っても取り分は増える', () => {
    const alone = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const paired = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
    ]);
    expect(honmachi(at(paired, 30)).ownShare).toBeGreaterThan(honmachi(at(alone, 30)).ownShare);
  });

  /**
   * ★ここは tickMarket を直接呼ぶ。
   *
   * 通しで回すと「別の商圏に出しても A院のシェアが動く」。バグではなく、
   * **看護師が全社で共有されている**ため（分院を出すと充足率が落ち、
   * A院の待ち時間が延び、魅力が落ちる）。市場の結合ではないので、
   * 市場だけを見たいこの試験では純粋関数を直接叩いて切り分ける。
   */
  it('別の商圏なら市場としては食い合わない', () => {
    const clinicA = {
      config: CLINICS[0]!,
      open: true,
      reputation: 75,
      waitMinutes: 15,
      doctors: 3,
    };
    const clinicB = {
      config: { ...CLINICS[1]!, openMonth: 1 },
      open: true,
      reputation: 75,
      waitMinutes: 15,
      doctors: 2,
    };
    const competitors = INITIAL_COMPETITORS.map((c) => ({
      ...c,
      openedAtMonth: 1,
      weakMonths: 0,
      closedAtMonth: null,
    }));
    const alone = tickMarket({ month: 1, clinics: [clinicA], competitors });
    const both = tickMarket({ month: 1, clinics: [clinicA, clinicB], competitors });
    expect(both.shareByClinic['A']).toBeCloseTo(alone.shareByClinic['A']!, 12);
  });
});

// ==================================================================
// 競合
// ==================================================================

describe('競合', () => {
  it('最初から地域に居る。地図に出せるだけの情報を持つ', () => {
    const first = at(play([{ month: 1, doctorsByClinic: { A: 3 } }]), 1);
    const rival = honmachi(first).competitors[0]!;
    expect(rival.name.length).toBeGreaterThan(0);
    expect(rival.strength).toBeGreaterThan(0);
    expect(rival.share).toBeGreaterThan(0);
    expect(rival.share).toBeLessThan(1);
  });

  it('自院が居ない商圏の競合も見える。どこが空いているかが分かる', () => {
    const first = at(play([{ month: 1, doctorsByClinic: { A: 3 } }]), 1);
    const ekimae = first.market.districts.find((d) => d.id === 'ekimae')!;
    expect(ekimae.clinics).toHaveLength(0);
    expect(ekimae.competitors.length).toBeGreaterThan(0);
    expect(ekimae.ownShare).toBe(0);
  });

  it('競合が強いほどこちらのシェアが小さい', () => {
    const first = at(play([{ month: 1, doctorsByClinic: { A: 3 } }]), 1);
    const strong = INITIAL_COMPETITORS.filter((c) => c.districtId === 'ekimae');
    const weak = INITIAL_COMPETITORS.filter((c) => c.districtId === 'honmachi');
    expect(strong.reduce((s, c) => s + c.strength, 0)).toBeGreaterThan(
      weak.reduce((s, c) => s + c.strength, 0),
    );
    expect(honmachi(first).ownShare).toBeGreaterThan(0.4);
  });

  it('★押し込み続けると撤退する。評判で押し出せる', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 }, relationActivity: { referralHospital: true } },
      { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 }, borrow: 5000 },
    ]);
    const closed = run.months.flatMap((m) => m.market.closed);
    expect(closed.length, '撤退が一度も起きないなら報酬が届いていない').toBeGreaterThan(0);
    const exit = run.months.find((m) => m.market.closed.length > 0)!;
    // 撤退の前は 18ヶ月ぶん押し込めている
    const before = at(run, exit.month - COMPETITOR_EXIT_MONTHS + 1);
    const rival = honmachi(before).competitors.find((c) => c.id === closed[0]!.id);
    expect(rival!.share).toBeLessThan(COMPETITOR_EXIT_SHARE);
  });

  /**
   * ★ここも tickMarket を直接回す。
   * 通しで回すと、撤退した月にたまたま別の競合が開業していることがあり、
   * 合計シェアの増減では撤退そのものを確かめられない。
   *
   * 撤退した月の表示には**まだ相手が載っている**（`monthsToExit: 0` で）。
   * その月の判定材料として相手のシェアが要るため。消えるのは翌月から。
   */
  it('撤退したらシェアが自社に来る', () => {
    const clinic = {
      config: CLINICS[0]!,
      open: true,
      reputation: 75,
      waitMinutes: 0,
      doctors: 9, // 規模係数を上限まで振って押し切る
    };
    let competitors: CompetitorState[] = [
      {
        id: 'weak',
        name: '弱い競合',
        districtId: 'honmachi',
        specialtyId: 'naika',
        strength: 30,
        openedAtMonth: 1,
        weakMonths: 0,
        closedAtMonth: null,
      },
    ];
    let exitMonth = 0;
    let shareAfter = 0;
    for (let month = 1; month <= COMPETITOR_EXIT_MONTHS + 2; month++) {
      const out = tickMarket({ month, clinics: [clinic], competitors });
      competitors = out.competitors;
      if (out.tick.closed.length > 0 && exitMonth === 0) exitMonth = month;
      if (exitMonth > 0 && month === exitMonth + 1) {
        shareAfter = out.shareByClinic['A']!;
        expect(out.tick.districts.find((d) => d.id === 'honmachi')!.competitors).toHaveLength(0);
      }
    }
    expect(exitMonth).toBe(COMPETITOR_EXIT_MONTHS);
    expect(shareAfter).toBe(1);
  });

  it('★押し込むのをやめるとカウンタが 0 に戻る', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    // A院1つでは 30% 未満に押し込めない。撤退の残り月数は出ない
    const rival = honmachi(at(run, 60)).competitors[0]!;
    expect(rival.share).toBeGreaterThan(COMPETITOR_EXIT_SHARE);
    expect(rival.monthsToExit).toBeNull();
  });

  it('突発事象では係数ではなく**盤上の相手**が増える', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'B', doctorsByClinic: { B: 2 } },
      { month: 49, openClinic: 'E', doctorsByClinic: { E: 2 } },
    ]);
    const opened = run.months.flatMap((m) =>
      m.events.filter((e) => e.id.includes('competitorOpened')).map((e) => m.month),
    );
    if (opened.length > 0) {
      const month = opened[0]!;
      const before = at(run, month - 1).market.districts.flatMap((d) => d.competitors).length;
      const after = at(run, month).market.districts.flatMap((d) => d.competitors).length;
      expect(after).toBe(before + 1);
    }
    // ポテンシャルを直接削る旧実装は消えている
    expect(DISTRICTS.every((d) => d.newPatientPotential > 0)).toBe(true);
  });
});

// ==================================================================
// UI が読む形
// ==================================================================

describe('画面に渡す形', () => {
  it('院から商圏を引ける', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'B', doctorsByClinic: { B: 2 } },
    ]);
    const last = at(run, 30);
    expect(districtOfClinic(last.market, 'A')!.id).toBe('honmachi');
    expect(districtOfClinic(last.market, 'B')!.id).toBe('ekimae');
    expect(districtOfClinic(last.market, 'Z')).toBeUndefined();
  });

  it('商圏のシェアは合計 1 になる', () => {
    const last = at(play([{ month: 1, doctorsByClinic: { A: 3 } }]), 30);
    for (const d of last.market.districts) {
      const total =
        d.clinics.reduce((s, c) => s + c.share, 0) + d.competitors.reduce((s, c) => s + c.share, 0);
      expect(total, `${d.name}`).toBeCloseTo(1, 9);
    }
  });
});
