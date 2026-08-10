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
import { CLINICS } from './constants';
import type { ClinicConfig, ClinicId, EmrTier, ExternalRelationId, Man, Month } from './types';

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

  // ---- ここから下は拡張系（docs/spec/screens/ の未着手7画面）。
  // **省略時は「何もしない」。** 既定シナリオは1つも書いていないので、
  // 追加しても検証済みの結果は動かない。

  /**
   * 外部関係の活動を続けるか。書いた相手だけが変わり、書かなかった相手は据え置き。
   * 活動していない相手は関係値が毎月落ちる（一度も上げていなければ 0 のまま）。
   */
  relationActivity?: Partial<Record<ExternalRelationId, boolean>>;
  /** 電子カルテを乗り換える。移行中は診察枠が落ちる */
  migrateEmr?: EmrTier;
  /** 導入する AI の id。枠は増えるが施設基準の医師数には数えない */
  adoptAiTools?: string[];
  /** 医療機器を入れる。lease なら B/S に載らない代わりに総額が高い */
  buyEquipment?: { id: string; lease?: boolean }[];
  /** 保守契約に入るか。切ると故障が起きて自費の上乗せを失う */
  maintenanceContract?: boolean;
  /** 門前薬局を誘致する院 */
  invitePharmacy?: ClinicId[];
  /** テナントから自社保有に切り替える院 */
  buyProperty?: ClinicId[];
  /** 役員報酬（万円/月）。EXECUTIVE_SALARY_MAX で頭打ち */
  executiveSalary?: Man;
  /** 個人で買うもの。法人の数字には効かない */
  buyPersonalAssets?: string[];

  /** 分院を開く。CLINIC_SITES の id を渡す */
  openClinic?: ClinicId;
  /** 銀行から引く額（万円）。純資産の BANK_LEVERAGE_LIMIT 倍を超えると断られる */
  borrow?: Man;
  /**
   * 医局へ当直を出すか。続けているあいだ関係値が上がり、診察枠が落ちる。
   * **金では買えない関係を、枠で買う。**
   */
  igyokuDuty?: boolean;
}

/**
 * シナリオ単位で入り切る機構。**既定は全てオフ。**
 *
 * 突発事象だけはここで切り替える必要がある。意思決定で起こすものではないので、
 * 「使わなければ眠っている」形にできない。既定シナリオがオフである限り、
 * 検証済みの 120 ヶ月は一度も乱数を引かない。
 */
export interface ScenarioFeatures {
  randomEvents?: boolean;
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
  /**
   * 最初から存在する院。省略すると検証モデルの3院（A/B/C）。
   * プレイ用のシナリオは A 院だけを置き、残りはプレイヤーが開く。
   */
  clinics?: ClinicConfig[];
  features?: ScenarioFeatures;
}

/** シナリオが持つ院。省略時は検証モデルの3院 */
export function clinicsOf(scenario: Scenario): ClinicConfig[] {
  return scenario.clinics ?? CLINICS;
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


/**
 * プレイ用のシナリオ。
 *
 * 検証モデルと違うのは3点だけ：
 *   1. 最初は A 院だけ。**分院はプレイヤーが開く**
 *   2. 突発事象が入る
 *   3. 意思決定は空。全部プレイヤーが決める
 *
 * 数式は既定シナリオと同じものを通る。**別のゲームにはしていない。**
 */
export const PLAY_SCENARIO: Scenario = {
  id: 'play',
  name: '本編',
  seed: 20240401,
  totalMonths: 120,
  initialIgyokuRelation: 60,
  initialNurses: 7.5,
  clinics: [CLINICS[0]!],
  features: { randomEvents: true },
  decisions: [{ month: 1, doctorsByClinic: { A: 3 } }],
};
