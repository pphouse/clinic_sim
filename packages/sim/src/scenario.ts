/**
 * シナリオ＝プレイヤーの意思決定の列。
 *
 * シム核は「状態 × 意思決定 → 次の状態」しか知らない。
 * 誰がその意思決定をするか（人間か、リプレイか、テストか）はここでは決めない。
 *
 * BASELINE_SCENARIO は検証モデル（med_sim2.xlsx）の既定シナリオを
 * そのまま意思決定として書き下したもの。ゴールデンテストの入力になる。
 * **この列を変えるとゴールデンテストが落ちる。**
 */
import type { ClinicId, Month } from './types';

/** ある月にプレイヤーが下す意思決定。省略した項目は「前月のまま」 */
export interface MonthDecision {
  month: Month;
  /**
   * 各院に配置する常勤医の数。書いた院だけが変わり、書かなかった院は据え置き。
   * 開院前の院に人を置いても無視される。
   */
  doctorsByClinic?: Partial<Record<ClinicId, number>>;
  /**
   * 医局関係値の増減。**金では買えない**ので費用の行は動かない。
   * 当直の引き受け、症例の還元といった非金銭的な貢献の結果として上がる。
   */
  igyokuRelationDelta?: number;
  /** 紹介会社経由で確保する医師枠。1枠ごとに AGENCY_FEE_PER_DOCTOR を支払う */
  agencyHires?: number;
  /** この四半期に取得する加算の id。取得費は資産計上して償却する */
  acquireAddons?: string[];
  /** 看護学校を開校する。SCHOOL_YEARS 後から毎年卒業生が出る */
  openSchool?: boolean;
  /**
   * 医局関係の維持費を払うか。既定は払う。
   * 払わないと関係値が RELATION_DECAY_PER_MONTH ずつ落ちる。
   */
  maintainIgyoku?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  /** 乱数の種。同じ種なら何度回しても同じ結果になる */
  seed: number;
  totalMonths: number;
  /** 開始時点の医局関係値 */
  initialIgyokuRelation: number;
  /** 開始時点の看護師数。開院時は充足しているものとする */
  initialNurses: number;
  decisions: MonthDecision[];
}

/**
 * 既定シナリオ。検証モデルの40四半期を月刻みに置き直したもの。
 *
 * 意思決定の月は「四半期の初月」に置いてある（Q → (Q-1)×3+1）。
 * 検証モデルは四半期の頭で意思決定していたので、同じ位置に落とすのが忠実。
 *
 * 山場：
 *   13〜24ヶ月目  A院の常勤医が 3 → 2。待ち時間のピークは 19〜21ヶ月目、
 *                 患者ストックの底は 31〜33ヶ月目。遅延はきっちり1年
 *   13ヶ月目      看護学校を開校（2.5億）。卒業生が出るのは 49ヶ月目
 *   19/43ヶ月目   B院・C院を開院
 *   7〜73ヶ月目   加算を5つ取得。ただし要件割れで落ちている期間がある
 */
export const BASELINE_SCENARIO: Scenario = {
  id: 'baseline',
  name: '既定シナリオ',
  seed: 20240401,
  totalMonths: 120,
  initialIgyokuRelation: 60,
  initialNurses: 7.5,
  decisions: [
    { month: 1, doctorsByClinic: { A: 3 } },
    { month: 7, acquireAddons: ['kinou'] },
    // 常勤医が1名抜ける。ここから1年が既定シナリオの山場
    { month: 13, doctorsByClinic: { A: 2 }, openSchool: true },
    { month: 19, doctorsByClinic: { B: 1 }, igyokuRelationDelta: 20 },
    { month: 25, doctorsByClinic: { A: 3 }, agencyHires: 1, acquireAddons: ['zaitaku'] },
    { month: 43, doctorsByClinic: { C: 1 }, igyokuRelationDelta: 20, acquireAddons: ['seikatsu'] },
    { month: 49, doctorsByClinic: { B: 2 }, agencyHires: 1 },
    { month: 55, acquireAddons: ['jikangai'] },
    { month: 73, acquireAddons: ['dx'] },
    { month: 79, igyokuRelationDelta: 20 },
    { month: 85, agencyHires: 1 },
    { month: 91, doctorsByClinic: { C: 2 } },
  ],
};

export function decisionAt(scenario: Scenario, month: Month): MonthDecision | undefined {
  return scenario.decisions.find((d) => d.month === month);
}
