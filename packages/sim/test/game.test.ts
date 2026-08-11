/**
 * ゲームとしての層の検証（ゴール・終局・突発事象・分院・借入・セーブ）。
 *
 * ★ここでも最重要は「既定シナリオが動かないこと」。
 * 突発事象は乱数を引くので、**既定シナリオで1回でも引かれたらゴールデンが再現しない。**
 * 引いていないことを直接検証している。
 *
 * 目標値・確率は**検証されていない**。実際の到達点を測ってから置いた数字であって、
 * 表計算の裏付けがあるわけではない。調整するときは docs/spec を先に直すこと。
 */
import { describe, expect, it } from 'vitest';
import {
  BANKRUPTCY_GRACE_MONTHS,
  BANK_LEVERAGE_LIMIT,
  BASELINE_SCENARIO,
  CLINIC_SITES,
  EXECUTIVE_SALARY_MAX,
  GOALS,
  PLAY_SCENARIO,
  SAVE_VERSION,
  createSave,
  doctorProcurement,
  endingTitleOf,
  parseSave,
  runSimulation,
  scenarioFromSave,
  serializeSave,
  totalOutstanding,
  type MonthDecision,
  type MonthResult,
} from '../src/index';

const at = (run: { months: MonthResult[] }, month: number) => run.months[month - 1]!;
const play = (decisions: MonthDecision[]) => runSimulation({ ...PLAY_SCENARIO, decisions });
const randomEventsIn = (run: { months: MonthResult[] }) =>
  run.months.flatMap((m) => m.events.filter((e) => e.id.startsWith('random-')));

// ==================================================================
// ★既定シナリオは乱数を引かない
// ==================================================================

describe('既定シナリオは突発事象を一度も引かない', () => {
  const baseline = runSimulation(BASELINE_SCENARIO);

  it('120ヶ月で突発事象が0件', () => {
    expect(randomEventsIn(baseline)).toHaveLength(0);
  });

  it('何度回しても同じ結果', () => {
    const again = runSimulation(BASELINE_SCENARIO);
    expect(again.months[119]!.clinics[0]!.patientStock).toBe(
      baseline.months[119]!.clinics[0]!.patientStock,
    );
  });

  it('院は3つのまま。分院の仕組みを足しても増えない', () => {
    expect(baseline.months[119]!.clinics).toHaveLength(3);
  });
});

// ==================================================================
// 分院
// ==================================================================

describe('分院を開く', () => {
  it('本編は A院 だけから始まる', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    expect(at(run, 1).clinics).toHaveLength(1);
    expect(at(run, 1).clinics[0]!.id).toBe('A');
  });

  it('開いた月から院が増え、以後ずっと残る', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
    ]);
    expect(at(run, 24).clinics).toHaveLength(1);
    expect(at(run, 25).clinics).toHaveLength(2);
    expect(at(run, 120).clinics.map((c) => c.id).sort()).toEqual(['A', 'D']);
  });

  it('★承継は患者が付いてくる。新規は0から', () => {
    const inherited = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
    ]);
    const fresh = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'B', doctorsByClinic: { B: 2 } },
    ]);
    const site = CLINIC_SITES.find((s) => s.id === 'D')!;
    expect(at(inherited, 25).clinics.find((c) => c.id === 'D')!.patientStock).toBeGreaterThan(
      site.initialPatientStock * 0.9,
    );
    expect(at(fresh, 25).clinics.find((c) => c.id === 'B')!.patientStock).toBeLessThan(100);
  });

  it('承継は高い。開院月の投資額が候補地ごとに違う', () => {
    const inherited = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'D' },
    ]);
    const fresh = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'B' },
    ]);
    const capexOf = (r: typeof fresh) => -at(r, 25).financials.cashFlow.capitalExpenditure;
    expect(capexOf(inherited)).toBeGreaterThan(capexOf(fresh));
  });

  it('ClinicTick が院の素性を持つ。UI が CLINICS 定数を読まなくて済む', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'E', doctorsByClinic: { E: 1 } },
    ]);
    const e = at(run, 30).clinics.find((c) => c.id === 'E')!;
    expect(e.name).toBe(CLINIC_SITES.find((s) => s.id === 'E')!.name);
    expect(e.openMonth).toBe(25);
    expect(e.open).toBe(true);
  });

  it('同じ院は二度開けない', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, openClinic: 'B' },
      { month: 37, openClinic: 'B' },
    ]);
    expect(at(run, 120).clinics.filter((c) => c.id === 'B')).toHaveLength(1);
  });
});

// ==================================================================
// 医師の調達
// ==================================================================

describe('医師の調達', () => {
  it('★調達可能数を超えて医師は置けない。医局も紹介会社も無視できない', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 12 } }]);
    const staff = at(run, 6).staff;
    expect(staff.doctorsPlanned).toBe(12);
    expect(staff.doctorsTotal).toBe(staff.doctorsProcurable);
    expect(staff.doctorsUnfilled).toBe(12 - staff.doctorsProcurable);
    expect(staff.doctorShortfall).toBe(true);
  });

  it('置けなかった医師の人件費は出ない。診察枠にも入らない', () => {
    const over = play([{ month: 1, doctorsByClinic: { A: 12 } }]);
    const exact = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    expect(at(over, 6).financials.incomeStatement.doctorPayroll).toBeCloseTo(
      at(exact, 6).financials.incomeStatement.doctorPayroll, 6);
    expect(at(over, 6).clinics[0]!.capacity).toBeCloseTo(at(exact, 6).clinics[0]!.capacity, 6);
  });

  it('医局の関係値が上がると置ける人数が増える', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 6 } },
      { month: 13, igyokuRelationDelta: 40 },
    ]);
    expect(at(run, 12).staff.doctorsTotal).toBeLessThan(6);
    expect(at(run, 14).staff.doctorsTotal).toBeGreaterThan(at(run, 12).staff.doctorsTotal);
  });

  it('紹介会社の枠でも増える。金で買える方の経路', () => {
    const without = play([{ month: 1, doctorsByClinic: { A: 6 } }]);
    const withAgency = play([
      { month: 1, doctorsByClinic: { A: 6 } },
      { month: 13, agencyHires: 2 },
    ]);
    expect(at(withAgency, 14).staff.doctorsTotal).toBe(at(without, 14).staff.doctorsTotal + 2);
  });

  it('★足りないときは後から開いた院から削る。本院を守る', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      // 派遣枠3のまま2院目に2名置こうとする
      { month: 13, openClinic: 'B', doctorsByClinic: { B: 2 } },
    ]);
    const staff = at(run, 14).staff;
    expect(staff.doctorsByClinic['A']).toBe(3);
    expect(staff.doctorsByClinic['B']).toBe(0);
    expect(staff.doctorsUnfilled).toBe(2);
  });

  it('既定シナリオは一度も不足しない。クランプを足しても検証済みの結果が動かない', () => {
    const baseline = runSimulation(BASELINE_SCENARIO);
    expect(baseline.months.every((m) => !m.staff.doctorShortfall)).toBe(true);
    expect(baseline.months.every((m) => m.staff.doctorsUnfilled === 0)).toBe(true);
  });

  /**
   * ★プレイテストで「E院を建てたが常勤医の増やし方が分からない」と詰まった。
   * 枠が無いことは staff に出ていたが、**それを画面が読めていなかった**。
   * マップと診療所の両方が同じ数字を読めるよう derive に出す。
   */
  it('枠が空いていないことと、医師の居ない院が derive から読める', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 13, openClinic: 'B', doctorsByClinic: { B: 2 } },
    ]);
    const p = doctorProcurement(at(run, 14));
    expect(p.free).toBe(0);
    expect(p.unfilled).toBe(2);
    expect(p.emptyClinics).toEqual(['B']);
  });

  it('枠を買えば空き枠が立ち、警告の条件が消える', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 13, openClinic: 'B', agencyHires: 2, doctorsByClinic: { B: 2 } },
    ]);
    const p = doctorProcurement(at(run, 14));
    expect(p.unfilled).toBe(0);
    expect(p.emptyClinics).toEqual([]);
  });
});

// ==================================================================
// 借入
// ==================================================================

describe('銀行', () => {
  it('引いた月に現金が増え、借入残高が増える', () => {
    const without = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const withLoan = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, borrow: 5000 },
    ]);
    expect(at(withLoan, 25).financials.cashFlow.newBorrowing).toBe(5000);
    expect(at(withLoan, 25).financials.balanceSheet.cash).toBeGreaterThan(
      at(without, 25).financials.balanceSheet.cash,
    );
  });

  it('★純資産の倍率で頭打ちになる。青天井には借りられない', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, borrow: 9_999_999 },
    ]);
    const before = at(run, 24).financials.balanceSheet;
    const limit = before.totalEquity * BANK_LEVERAGE_LIMIT;
    expect(at(run, 25).financials.cashFlow.newBorrowing).toBeLessThanOrEqual(limit + 1);
    expect(at(run, 25).financials.cashFlow.newBorrowing).toBeGreaterThan(0);
  });

  it('利息が乗る。借りたぶんだけ毎月の経常が重くなる', () => {
    const without = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const withLoan = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, borrow: 5000 },
    ]);
    expect(at(withLoan, 30).financials.incomeStatement.interestExpense).toBeGreaterThan(
      at(without, 30).financials.incomeStatement.interestExpense,
    );
  });

  it('借入残高の合計が取れる', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, borrow: 3000 },
    ]);
    expect(totalOutstanding(run.finalState.loans)).toBeGreaterThan(0);
  });
});

// ==================================================================
// 突発事象
// ==================================================================

describe('突発事象', () => {
  const decisions: MonthDecision[] = [
    { month: 1, doctorsByClinic: { A: 3 } },
    { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
  ];

  it('本編では起きる', () => {
    expect(randomEventsIn(play(decisions)).length).toBeGreaterThan(0);
  });

  it('同じ種なら毎回まったく同じ月に同じ事象が起きる', () => {
    const a = randomEventsIn(play(decisions)).map((e) => `${e.month}:${e.id}`);
    const b = randomEventsIn(play(decisions)).map((e) => `${e.month}:${e.id}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('種が違えば違う結果になる', () => {
    const other = runSimulation({ ...PLAY_SCENARIO, seed: 99999, decisions });
    const a = randomEventsIn(play(decisions)).map((e) => `${e.month}:${e.id}`);
    const b = randomEventsIn(other).map((e) => `${e.month}:${e.id}`);
    expect(a).not.toEqual(b);
  });

  it('通知として画面に振り分けられる', () => {
    const events = randomEventsIn(play(decisions));
    for (const e of events) {
      expect(['personnel', 'map', 'bureau']).toContain(e.screen);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.body.length).toBeGreaterThan(0);
    }
  });
});

// ==================================================================
// ゴールと終局
// ==================================================================

describe('ゴール', () => {
  it('3本とも定義されている', () => {
    expect(GOALS.map((g) => g.id).sort()).toEqual(['corporate', 'personalWealth', 'scale']);
  });

  it('★何もしなければどれも届かない', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const last = at(run, 120);
    expect(last.goals.goals.every((g) => !g.achieved)).toBe(true);
    expect(last.goals.end.reason).toBe('timeUp');
  });

  it('内部留保は資本金を含めない。含めると「何もしない」が6割に見える', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const last = at(run, 120);
    const corporate = last.goals.goals.find((g) => g.id === 'corporate')!;
    expect(corporate.value).toBeCloseTo(last.financials.balanceSheet.retainedEarnings, 6);
    expect(corporate.value).toBeLessThan(last.financials.balanceSheet.totalEquity);
  });

  it('★役員報酬を取ると個人は増え、法人は痩せる。同じ財布を取り合う', () => {
    const plain = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    const paid = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 25, executiveSalary: EXECUTIVE_SALARY_MAX },
    ]);
    const goal = (r: typeof plain, id: string) =>
      at(r, 100).goals.goals.find((g) => g.id === id)!.value;
    expect(goal(paid, 'personalWealth')).toBeGreaterThan(goal(plain, 'personalWealth'));
    expect(goal(paid, 'corporate')).toBeLessThan(goal(plain, 'corporate'));
  });

  it('一度達成したゴールは取り消されない', () => {
    // 目標を跨いだあと値が下がっても achieved は残る
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 13, executiveSalary: EXECUTIVE_SALARY_MAX },
      { month: 100, buyPersonalAssets: ['watch', 'car', 'villa'] },
    ]);
    const first = run.months.find((m) => m.goals.goals.some((g) => g.achieved));
    if (first) {
      for (const m of run.months.slice(first.month)) {
        expect(m.goals.goals.some((g) => g.achieved)).toBe(true);
      }
    }
  });
});

describe('終局', () => {
  it('債務超過は1ヶ月では終わらない。谷で殺すと大型投資が全部悪手になる', () => {
    const run = play([
      { month: 1, doctorsByClinic: { A: 3 } },
      // 現金を食い潰す。学校2.5億＋分院＋役員報酬の満額。
      // ★医師を積んで潰すことはもうできない（調達可能数でクランプされる）
      { month: 13, openSchool: true, openClinic: 'B', executiveSalary: EXECUTIVE_SALARY_MAX },
      { month: 25, openClinic: 'E', buyProperty: ['A'] },
    ]);
    const firstInsolvent = run.months.find((m) => m.financials.balanceSheet.totalEquity < 0);
    const end = run.months.find((m) => m.goals.end.ended);
    expect(firstInsolvent).toBeDefined();
    expect(end?.goals.end.reason).toBe('bankrupt');
    expect(end!.month - firstInsolvent!.month).toBe(BANKRUPTCY_GRACE_MONTHS - 1);
  });

  it('債務超過から戻れば猶予は 0 に戻る', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    expect(at(run, 120).goals.end.insolventMonths).toBe(0);
  });

  it('120ヶ月まで生き残れば timeUp で終わる', () => {
    const run = play([{ month: 1, doctorsByClinic: { A: 3 } }]);
    expect(at(run, 120).goals.end.ended).toBe(true);
    expect(at(run, 120).goals.end.reason).toBe('timeUp');
    expect(at(run, 119).goals.end.ended).toBe(false);
  });

  it('★破綻は達成に優先する。落ちてからの達成は勝ちにしない', () => {
    const goals = GOALS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      value: spec.target,
      target: spec.target,
      unit: spec.unit,
      ratio: 1,
      achieved: true,
      achievedAtMonth: 1,
    }));
    expect(endingTitleOf(goals, false)).toBe('医療法人グループ総帥');
    expect(endingTitleOf(goals, true)).toBe('志半ばの院長');
  });
});

// ==================================================================
// セーブ
// ==================================================================

describe('セーブ', () => {
  const decisions: MonthDecision[] = [
    { month: 1, doctorsByClinic: { A: 3 } },
    { month: 25, openClinic: 'D', borrow: 5000 },
  ];

  it('★決定列だけを保存する。状態は保存しない', () => {
    const save = createSave(PLAY_SCENARIO, 40, decisions);
    expect(save.decisions).toEqual(decisions);
    expect(Object.keys(save).sort()).toEqual([
      'currentMonth', 'decisions', 'scenarioId', 'seed', 'totalMonths', 'version',
    ]);
  });

  it('往復して同じ120ヶ月が出る', () => {
    const save = createSave(PLAY_SCENARIO, 40, decisions);
    const restored = parseSave(serializeSave(save))!;
    const before = runSimulation({ ...PLAY_SCENARIO, decisions });
    const after = runSimulation(scenarioFromSave(PLAY_SCENARIO, restored));
    expect(after.months[119]!.clinics.map((c) => c.patientStock)).toEqual(
      before.months[119]!.clinics.map((c) => c.patientStock),
    );
    expect(restored.currentMonth).toBe(40);
  });

  it('壊れたセーブは null。例外を投げるとアプリが起動しなくなる', () => {
    expect(parseSave('')).toBeNull();
    expect(parseSave('{')).toBeNull();
    expect(parseSave('null')).toBeNull();
    expect(parseSave('{"version":999}')).toBeNull();
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION }))).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...createSave(PLAY_SCENARIO, 1, []), decisions: [{}] })),
    ).toBeNull();
  });

  it('進行が総月数を超えていたら丸める', () => {
    const save = { ...createSave(PLAY_SCENARIO, 999, decisions) };
    expect(parseSave(serializeSave(save))!.currentMonth).toBe(PLAY_SCENARIO.totalMonths);
  });
});
