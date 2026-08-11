/**
 * ゴールと終局。
 *
 * ★このゲームには「正解の勝ち方」を1つに絞らない。
 *
 *   資産家   ← 役員報酬。取れば取るほど法人が痩せる
 *   規模     ← 分院。出せば出すほど現金が消え、医師会の関係も落ちる
 *   内部留保 ← 利益の蓄積。個人へ移さず、分院にも使わず、貯めた分だけ増える
 *
 * 3本は同じ財布を取り合う。**同時に狙うと1本も届かない**配分にしてある。
 * 勝ち筋を1つに決めると、経営の判断がパズルの正解探しになる。
 *
 * ここは純粋関数だけ。Date も Math.random も使わない（CLAUDE.md §1）。
 */
import { BANKRUPTCY_GRACE_MONTHS, ENDING_TITLES, GOALS } from './constants';
import type {
  BalanceSheet,
  EndState,
  GoalId,
  GoalProgress,
  GoalTick,
  Man,
  Month,
  PersonalTick,
} from './types';

export interface GoalInput {
  month: Month;
  totalPatientStock: number;
  balanceSheet: BalanceSheet;
  /** その月の経常利益。**黒字なら潰さない**（下の判定を見よ） */
  ordinaryIncome: Man;
  personal: PersonalTick;
  /** 前月までの達成月。一度達成したら取り消さない */
  achievedAt: Partial<Record<GoalId, Month>>;
  /** 前月までに債務超過が続いている月数 */
  insolventMonths: number;
  /**
   * 開業据置の明ける月。この月までは債務超過を数え始めない
   * （docs/spec/06-opening.md §7）。**開業融資を組んでいない法人には無い。**
   * 既定シナリオは意思決定で開院しないので null のまま＝従来どおり。
   */
  openingGraceUntilMonth?: Month | null;
  totalMonths: number;
}

/** ゴールごとの「今の値」。何を測るかはここだけに書く */
export function goalValueOf(id: GoalId, input: GoalInput): number {
  switch (id) {
    case 'personalWealth':
      return input.personal.netWorth;
    case 'scale':
      return input.totalPatientStock;
    case 'corporate':
      // 内部留保だけを見る。資本金は「積んだもの」ではない
      return input.balanceSheet.retainedEarnings;
  }
}

/**
 * 3本のゴールの進捗と、終わったかどうか。
 *
 * 債務超過は**その月に即死ではない**。看護学校の 2.5 億は費用ではなく校舎で、
 * 検証で出た「最低現金 −1.8 億」は資金繰りの谷だった。谷で殺すと、
 * 正しい大型投資が全部悪手になる。1年沈みっぱなしなら、それはもう谷ではない。
 */
export function evaluateGoals(input: GoalInput): GoalTick {
  const goals: GoalProgress[] = GOALS.map((spec) => {
    const value = goalValueOf(spec.id, input);
    const achievedNow = value >= spec.target;
    const achievedAtMonth = input.achievedAt[spec.id] ?? (achievedNow ? input.month : null);
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      value,
      target: spec.target,
      unit: spec.unit,
      // 進捗は 0 未満に落ちうる（債務超過）。表示のために 0 で止める
      ratio: Math.max(0, Math.min(1, value / spec.target)),
      achieved: achievedAtMonth !== null,
      achievedAtMonth,
    };
  });

  /*
   * ★開業据置。
   *
   * 新規開業の診療所は1〜3年赤字で回る。これは経営の失敗ではなく開業の形そのもので、
   * 開業融資も事業計画を前提に組まれている。**そこで銀行が資金を引き上げることはない。**
   * 据置が明けるまでは債務超過を数え始めない（docs/spec/06-opening.md §7）。
   *
   * 据置は**最初の開業の1回だけ**。分院を出すたびに延びると、
   * 3年おきに安い院を建てて不死になる。
   */
  const inOpeningGrace =
    input.openingGraceUntilMonth != null && input.month <= input.openingGraceUntilMonth;
  /*
   * ★数えるのは「債務超過**かつ**経常赤字」の月だけ。
   *
   * 純資産がマイナスでも黒字で回っている法人は、**潰れているのではなく返している最中**。
   * 開業融資を借りた直後の診療所はまさにこれで、
   * 純資産が戻るまでに5年かかる一方、経常は3年目には黒字になる。
   * 債務超過だけで殺すと、正しく立ち上げた人が正しさの途中で死ぬ。
   */
  const failing = input.balanceSheet.totalEquity < 0 && input.ordinaryIncome < 0;
  const insolventMonths = !inOpeningGrace && failing ? input.insolventMonths + 1 : 0;

  const achieved = goals.filter((g) => g.achieved).map((g) => g.id);
  const bankrupt = insolventMonths >= BANKRUPTCY_GRACE_MONTHS;
  const timeUp = input.month >= input.totalMonths;

  // 順番が意味を持つ。**破綻は達成に優先する。**
  // 目標に届いた月に1年目の債務超過が満了していたら、それは勝ちではない
  const reason = bankrupt ? 'bankrupt' : achieved.length > 0 ? 'goal' : timeUp ? 'timeUp' : null;

  const end: EndState = {
    ended: reason !== null,
    reason,
    month: reason === null ? null : input.month,
    achieved: bankrupt ? [] : achieved,
    title: endingTitleOf(goals, bankrupt),
    insolventMonths,
  };

  return { goals, end };
}

/** 称号。3本の達成率の合計から引く。破綻したらいちばん下 */
export function endingTitleOf(goals: GoalProgress[], bankrupt: boolean): string {
  if (bankrupt) return ENDING_TITLES[ENDING_TITLES.length - 1]!.title;
  const score = goals.reduce((sum, g) => sum + g.ratio, 0);
  return ENDING_TITLES.find((t) => score >= t.minScore)?.title ?? ENDING_TITLES[0]!.title;
}

/** 何も達成していない初期状態。セーブデータの復元にも使う */
export function initialGoalTick(): GoalTick {
  return {
    goals: GOALS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      value: 0,
      target: spec.target,
      unit: spec.unit,
      ratio: 0,
      achieved: false,
      achievedAtMonth: null,
    })),
    end: {
      ended: false,
      reason: null,
      month: null,
      achieved: [],
      title: ENDING_TITLES[ENDING_TITLES.length - 1]!.title,
      insolventMonths: 0,
    },
  };
}
