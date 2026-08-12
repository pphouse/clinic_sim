/**
 * 診療科の検証。docs/spec/05-specialty.md
 *
 * ★最重要は「内科が恒等」。
 * 内科の値は検証済みの定数そのもので、既定シナリオは全て内科。
 * **ここが崩れたら科を足した瞬間に検証済みの数字が動く。**
 *
 * 科ごとの数値は検証されていない。実際の到達点（科 × 立地の営業利益）を
 * 測ってから置いた数字であって、表計算の裏付けは無い。
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  BASE_CHURN_RATE_PER_QUARTER,
  DISTRICTS,
  POINTS_PER_VISIT,
  PLAY_SCENARIO,
  SELF_PAY_YEN_PER_PATIENT,
  SPECIALTIES,
  VISITS_PER_DOCTOR_PER_DAY,
  VISITS_PER_PATIENT_PER_MONTH,
  districtDemand,
  runSimulation,
  specialtyOf,
  type MonthDecision,
  type MonthResult,
  type SpecialtyId,
} from '../src/index';
import { withOpeningA } from './helpers';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
/** 突発事象を切って科だけを比べる */
const quiet = (decisions: MonthDecision[]) =>
  runSimulation({ ...PLAY_SCENARIO, features: {}, decisions: withOpeningA(decisions) });

/** 科 sp を site に出して、90ヶ月目の姿を見る */
function openWith(site: string, sp: SpecialtyId) {
  const run = quiet([
    { month: 1, doctorsByClinic: { A: 3 }, igyokuRelationDelta: 40 },
    {
      month: 25, openClinic: site, openSpecialty: sp,
      doctorsByClinic: { [site]: 3 }, agencyHires: 5,
      // ★集患を打たないと認知度が 0.4 で頭打ちになり、科の差より先に
      // 「知られていない」が効いてしまう（docs/spec/07-awareness.md）
      marketingByClinic: { [site]: 'web' },
    },
  ]);
  return { run, clinic: at(run, 90).clinics.find((c) => c.id === site)! };
}

// ==================================================================
// ★内科は恒等
// ==================================================================

describe('内科は検証済みの定数そのもの', () => {
  it('倍率ではなく実数で一致している', () => {
    const naika = specialtyOf('naika');
    expect(naika.visitsPerPatientPerMonth).toBe(VISITS_PER_PATIENT_PER_MONTH);
    expect(naika.pointsPerVisit).toBe(POINTS_PER_VISIT);
    expect(naika.visitsPerDoctorPerDay).toBe(VISITS_PER_DOCTOR_PER_DAY);
    expect(naika.selfPayYenPerPatient).toBe(SELF_PAY_YEN_PER_PATIENT);
    expect(naika.baseChurnRatePerQuarter).toBe(BASE_CHURN_RATE_PER_QUARTER);
    expect(naika.capexMultiplier).toBe(1);
    expect(naika.doctorScarcity).toBe(1);
  });

  it('既定シナリオの3院は全て内科', () => {
    const baseline = runSimulation(BASELINE_SCENARIO);
    for (const m of baseline.months) {
      for (const c of m.clinics) expect(c.specialtyId).toBe('naika');
    }
  });

  it('内科の需要係数は全商圏 1.0。商圏ポテンシャルの校正を壊さない', () => {
    for (const d of DISTRICTS) {
      expect(d.demandBias.naika, d.name).toBe(1);
      expect(districtDemand(d.id, 'naika')).toBeCloseTo(d.newPatientPotential, 12);
    }
  });
});

// ==================================================================
// ★セグメントは（商圏 × 科）
// ==================================================================

describe('市場のセグメント', () => {
  it('★内科の隣に皮膚科を出しても食い合わない。ここが科を選ぶ楽しさの要', () => {
    // 本町には本町内科クリニック（内科）が居る
    const asNaika = openWith('D', 'naika');
    const asHifuka = openWith('D', 'hifuka');
    expect(asNaika.clinic.marketShare).toBeLessThan(1);
    expect(asHifuka.clinic.marketShare).toBe(1);
  });

  it('同じ科なら食い合う。A院（内科）と D院（内科）は同じ本町', () => {
    const alone = quiet([{ month: 1, doctorsByClinic: { A: 3 }, igyokuRelationDelta: 40 }]);
    const paired = openWith('D', 'naika');
    const shareA = (r: { months: MonthResult[] }) =>
      at(r, 90).clinics.find((c) => c.id === 'A')!.marketShare;
    expect(shareA(paired.run)).toBeLessThan(shareA(alone));
  });

  /**
   * 市場としては食い合わないが、通しで回すと A院のシェアが 0.4% ほど動く。
   * バグではなく**看護師が全社で共有されている**ため（分院を出すと充足率が落ち、
   * A院の待ち時間が延びて魅力が落ちる）。同じ科で食い合ったときの落ち幅は
   * 桁が違うので、そこと区別できる幅で見る。
   */
  it('科が違えば自院同士もほとんど食い合わない', () => {
    const alone = quiet([{ month: 1, doctorsByClinic: { A: 3 }, igyokuRelationDelta: 40 }]);
    const sameSpecialty = openWith('D', 'naika');
    const otherSpecialty = openWith('D', 'ganka');
    const shareA = (r: { months: MonthResult[] }) =>
      at(r, 90).clinics.find((c) => c.id === 'A')!.marketShare;
    const base = shareA(alone);
    const otherDrop = Math.abs(shareA(otherSpecialty.run) - base);
    const sameDrop = base - shareA(sameSpecialty.run);
    // 別の科：1% 未満のズレ（看護師の共有ぶん）
    expect(otherDrop).toBeLessThan(base * 0.01);
    // 同じ科：桁が違う
    expect(sameDrop).toBeGreaterThan(otherDrop * 10);
  });

  it('セグメントごとにシェアの合計が 1 になる', () => {
    const { run } = openWith('B', 'hifuka');
    for (const seg of at(run, 90).market.districts) {
      const total =
        seg.clinics.reduce((s, c) => s + c.share, 0) +
        seg.competitors.reduce((s, c) => s + c.share, 0);
      expect(total, `${seg.name}${seg.specialtyName}`).toBeCloseTo(1, 9);
    }
  });
});

// ==================================================================
// 科ごとの性格
// ==================================================================

describe('科の性格', () => {
  it('★どの科にも成立する立地がある。死に科を作らない', () => {
    for (const sp of SPECIALTIES) {
      const best = ['B', 'C', 'D', 'E']
        .map((site) => openWith(site, sp.id).clinic.operatingIncome)
        .reduce((a, b) => Math.max(a, b));
      expect(best, `${sp.name}がどこでも赤字`).toBeGreaterThan(0);
    }
  });

  it('★どの科にも合わない立地がある。どこでも正解の科を作らない', () => {
    for (const sp of SPECIALTIES) {
      const results = ['B', 'C', 'D', 'E'].map(
        (site) => openWith(site, sp.id).clinic.patientStock,
      );
      const spread = Math.max(...results) - Math.min(...results);
      expect(spread, `${sp.name}が立地を選ばない`).toBeGreaterThan(500);
    }
  });

  /**
   * ★立地の差が「利益」に出るのは、枠が余っている科だけ。
   *
   * 精神科は常勤医3名では常に枠が足りない（利用率 > 1）。
   * 満員の院は、商圏がどれだけ大きくても捌ける数までしか稼げないので、
   * どこに出しても同じ利益になる。**これはバグではなく、詰まった院の性質。**
   * 立地の差は患者数（＝将来の伸びしろ）の側に出る。
   */
  it('枠が余っている科は立地が利益にも出る。詰まっている科はどこでも満員', () => {
    const sites = ['B', 'C', 'D', 'E'];
    const jammed = SPECIALTIES.filter((sp) =>
      sites.every((site) => openWith(site, sp.id).clinic.utilization > 1),
    ).map((sp) => sp.id);
    expect(jammed.sort()).toEqual(['seishin']);

    for (const sp of SPECIALTIES.filter((s) => !jammed.includes(s.id))) {
      const results = sites.map((site) => openWith(site, sp.id).clinic.operatingIncome);
      const spread = Math.max(...results) - Math.min(...results);
      expect(spread, `${sp.name}が立地を選ばない`).toBeGreaterThan(100);
    }
  });

  it('皮膚科は医師1人で多くを抱えられる。整形は枠を食う', () => {
    const hifuka = openWith('E', 'hifuka').clinic;
    const seikei = openWith('E', 'seikei').clinic;
    expect(hifuka.capacity / hifuka.demandVisits).toBeGreaterThan(
      seikei.capacity / seikei.demandVisits,
    );
  });

  it('精神科は患者が離れない。小児科は卒業していく', () => {
    expect(specialtyOf('seishin').baseChurnRatePerQuarter).toBeLessThan(
      BASE_CHURN_RATE_PER_QUARTER,
    );
    expect(specialtyOf('shonika').baseChurnRatePerQuarter).toBeGreaterThan(
      BASE_CHURN_RATE_PER_QUARTER,
    );
  });

  it('皮膚科は自費で稼ぐ', () => {
    const hifuka = openWith('E', 'hifuka').clinic;
    const naika = openWith('E', 'naika').clinic;
    expect(hifuka.selfPayRevenue / hifuka.patientStock).toBeGreaterThan(
      naika.selfPayRevenue / naika.patientStock,
    );
  });

  it('★眼科は設備が重い。開院月の投資が跳ねる', () => {
    const ganka = quiet([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', openSpecialty: 'ganka' },
    ]);
    const seishin = quiet([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', openSpecialty: 'seishin' },
    ]);
    const capex = (r: typeof ganka) => -at(r, 25).financials.cashFlow.capitalExpenditure;
    expect(capex(ganka)).toBeGreaterThan(capex(seishin) * 3);
  });
});

// ==================================================================
// 医師の採りにくさ
// ==================================================================

describe('科ごとの医師の採りにくさ', () => {
  it('★精神科の医師は派遣枠を余分に食う', () => {
    // 派遣枠3（関係値60）のところへ、A院を空けて2名置こうとする
    const naika = quiet([
      { month: 1, doctorsByClinic: { A: 0 } },
      { month: 13, openClinic: 'D', openSpecialty: 'naika', doctorsByClinic: { D: 3 } },
    ]);
    const seishin = quiet([
      { month: 1, doctorsByClinic: { A: 0 } },
      { month: 13, openClinic: 'D', openSpecialty: 'seishin', doctorsByClinic: { D: 3 } },
    ]);
    expect(at(naika, 14).staff.doctorsByClinic['D']).toBe(3);
    // 3名 × 1.6 = 4.8枠 > 3枠 なので置けるのは1名
    expect(at(seishin, 14).staff.doctorsByClinic['D']).toBe(1);
    expect(at(seishin, 14).staff.doctorsUnfilled).toBe(2);
  });

  it('内科は枠をそのまま消費する。恒等', () => {
    const run = quiet([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 13, openClinic: 'D', openSpecialty: 'naika', doctorsByClinic: { D: 5 } },
      { month: 14, igyokuRelationDelta: 60 },
    ]);
    const staff = at(run, 15).staff;
    expect(staff.doctorsTotal).toBe(Math.min(8, staff.doctorsProcurable));
  });
});

// ==================================================================
// 商圏ごとの需要
// ==================================================================

describe('商圏ごとの需要', () => {
  it('小児科は子育て世帯の商圏でしか成立しない', () => {
    expect(districtDemand('shinko', 'shonika')).toBeGreaterThan(
      districtDemand('honmachi', 'shonika'),
    );
    expect(openWith('E', 'shonika').clinic.operatingIncome).toBeGreaterThan(
      openWith('D', 'shonika').clinic.operatingIncome,
    );
  });

  it('皮膚科は駅前が強い', () => {
    expect(openWith('B', 'hifuka').clinic.operatingIncome).toBeGreaterThan(
      openWith('C', 'hifuka').clinic.operatingIncome,
    );
  });

  it('眼科は高齢の多い下町が強い', () => {
    expect(districtDemand('honmachi', 'ganka')).toBeGreaterThan(
      districtDemand('shinko', 'ganka'),
    );
  });
});

// ==================================================================
// 競合の入り方
// ==================================================================

describe('競合は儲かっているところに来る', () => {
  it('★空いたセグメントを見つけて放置、はできない', () => {
    // 本町の眼科は最初は無風。だが育つと競合が来る。
    // ★種を振る。参入は乱数なので、1本の種に張り付けると
    // 別の変更で乱数の並びがずれた瞬間に落ちる（実際そうなった）。
    // 見たいのは「10年放置しても誰も来ない、が起きない」ことの方。
    const seeds = [20240401, 7, 99, 1234, 555];
    const invaded = seeds.filter((seed) => {
      const run = runSimulation({
        ...PLAY_SCENARIO,
        seed,
        decisions: withOpeningA([
          { month: 1, doctorsByClinic: { A: 3 }, igyokuRelationDelta: 40 },
          { month: 25, openClinic: 'D', openSpecialty: 'ganka', doctorsByClinic: { D: 3 }, agencyHires: 5 },
        ]),
      });
      const seg = (m: number) =>
        at(run, m).market.districts.find((d) => d.id === 'honmachi' && d.specialtyId === 'ganka');
      expect(seg(25)?.competitors ?? []).toHaveLength(0);
      return (seg(120)?.competitors ?? []).length > 0;
    });
    expect(invaded.length).toBeGreaterThan(0);
  });

  it('新しい競合も科を持つ', () => {
    const run = runSimulation({
      ...PLAY_SCENARIO,
      decisions: [
        { month: 1, doctorsByClinic: { A: 3 }, igyokuRelationDelta: 40 },
        { month: 25, openClinic: 'D', openSpecialty: 'ganka', doctorsByClinic: { D: 3 }, agencyHires: 5 },
      ],
    });
    const ids = SPECIALTIES.map((s) => s.id);
    for (const seg of at(run, 120).market.districts) {
      for (const rival of seg.competitors) {
        expect(ids).toContain(rival.specialtyId);
        expect(rival.specialtyId).toBe(seg.specialtyId);
      }
    }
  });
});
