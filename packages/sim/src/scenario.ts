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
import type { ClinicId, Quarter } from './types';

/** ある四半期にプレイヤーが下す意思決定。省略した項目は「前四半期のまま」 */
export interface QuarterDecision {
  quarter: Quarter;
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
   * 払わないと関係値が RELATION_DECAY_PER_QUARTER ずつ落ちる。
   */
  maintainIgyoku?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  /** 乱数の種。同じ種なら何度回しても同じ結果になる */
  seed: number;
  totalQuarters: number;
  /** 開始時点の医局関係値 */
  initialIgyokuRelation: number;
  /** 開始時点の看護師数。開院時は充足しているものとする */
  initialNurses: number;
  decisions: QuarterDecision[];
}

/**
 * 既定シナリオ。検証モデルの40四半期をそのまま再現する。
 *
 * 山場：
 *   Q5〜Q8  A院の常勤医が 3 → 2。待ち時間 Q7 に 53 分、患者ストックの底は Q11
 *   Q5      看護学校を開校（2.5億）。卒業生が出るのは Q17
 *   Q7/Q15  B院・C院を開院
 *   Q3〜Q25 加算を5つ取得。ただし要件割れで通算8四半期は失効している
 */
export const BASELINE_SCENARIO: Scenario = {
  id: 'baseline',
  name: '既定シナリオ',
  seed: 20240401,
  totalQuarters: 40,
  initialIgyokuRelation: 60,
  initialNurses: 7.5,
  decisions: [
    { quarter: 1, doctorsByClinic: { A: 3 } },
    { quarter: 3, acquireAddons: ['kinou'] },
    // 常勤医が1名抜ける。ここから4四半期が既定シナリオの山場
    { quarter: 5, doctorsByClinic: { A: 2 }, openSchool: true },
    { quarter: 7, doctorsByClinic: { B: 1 }, igyokuRelationDelta: 20 },
    { quarter: 9, doctorsByClinic: { A: 3 }, agencyHires: 1, acquireAddons: ['zaitaku'] },
    { quarter: 15, doctorsByClinic: { C: 1 }, igyokuRelationDelta: 20, acquireAddons: ['seikatsu'] },
    { quarter: 17, doctorsByClinic: { B: 2 }, agencyHires: 1 },
    { quarter: 19, acquireAddons: ['jikangai'] },
    { quarter: 25, acquireAddons: ['dx'] },
    { quarter: 27, igyokuRelationDelta: 20 },
    { quarter: 29, agencyHires: 1 },
    { quarter: 31, doctorsByClinic: { C: 2 } },
  ],
};

export function decisionAt(scenario: Scenario, quarter: Quarter): QuarterDecision | undefined {
  return scenario.decisions.find((d) => d.quarter === quarter);
}
