/**
 * セーブデータ。
 *
 * ★保存するのは**意思決定の列だけ。** 状態は保存しない。
 *
 * シム核は純粋関数なので、同じ種と同じ意思決定からは必ず同じ120ヶ月が出る。
 * 患者ストックも評判も関係値も、決定列から再現できる。
 * 状態を保存すると、シムの式を直したときに古いセーブが「昔の式で計算された数字」を
 * 持ったまま復活して、どちらが正しいのか分からなくなる。
 *
 * 副作用はここには無い。localStorage を触るのは UI の仕事（CLAUDE.md §1）。
 */
import type { MonthDecision, Scenario } from './scenario';
import type { Month } from './types';

/**
 * 形が変わったら上げる。古い版は読まずに捨てる。
 *
 * 2: 本編が院を持たずに始まる形になった（docs/spec/06-opening.md）。
 *    版1のセーブは「A院が最初からある」前提の決定列なので、
 *    そのまま読むと**院を1つも持たないまま10年が始まる。**
 */
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  scenarioId: string;
  seed: number;
  totalMonths: number;
  /** どこまで進めたか。ここより先の月は見せない */
  currentMonth: Month;
  decisions: MonthDecision[];
}

export function createSave(
  scenario: Scenario,
  currentMonth: Month,
  decisions: MonthDecision[],
): SaveData {
  return {
    version: SAVE_VERSION,
    scenarioId: scenario.id,
    seed: scenario.seed,
    totalMonths: scenario.totalMonths,
    currentMonth,
    decisions,
  };
}

/**
 * 文字列からセーブを復元する。
 * **壊れていたら null を返す。** 例外を投げると、壊れたセーブでアプリが起動しなくなる。
 */
export function parseSave(raw: string): SaveData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const data = parsed as Partial<SaveData>;

  if (data.version !== SAVE_VERSION) return null;
  if (typeof data.scenarioId !== 'string') return null;
  if (typeof data.seed !== 'number' || !Number.isFinite(data.seed)) return null;
  if (typeof data.totalMonths !== 'number' || data.totalMonths < 1) return null;
  if (typeof data.currentMonth !== 'number' || data.currentMonth < 1) return null;
  if (!Array.isArray(data.decisions)) return null;
  // 意思決定は month を持っていることだけ確かめる。中身の妥当性はシムが吸収する
  // （知らないキーが来ても runSimulation は素通りする）
  if (!data.decisions.every((d) => typeof d?.month === 'number')) return null;

  return {
    version: SAVE_VERSION,
    scenarioId: data.scenarioId,
    seed: data.seed,
    totalMonths: data.totalMonths,
    currentMonth: Math.min(data.currentMonth, data.totalMonths),
    decisions: [...data.decisions].sort((a, b) => a.month - b.month),
  };
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

/**
 * セーブをシナリオに戻す。
 * シナリオの素性（院の初期構成・突発事象の有無）はコード側の定義を使い、
 * セーブからは種と決定列だけを取る。**遊び方の定義が変わったらセーブも追随する。**
 */
export function scenarioFromSave(base: Scenario, save: SaveData): Scenario {
  return { ...base, seed: save.seed, totalMonths: save.totalMonths, decisions: save.decisions };
}
