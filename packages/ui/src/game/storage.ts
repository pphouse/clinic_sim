/**
 * セーブの置き場。**ここだけが localStorage を触る。**
 *
 * セーブの形と検証は sim 側（`save.ts`）が持っている。純粋関数なので試験できる。
 * こちらは「読む・書く・消す」だけ。DOM API をシム核に持ち込まない（CLAUDE.md §1）。
 *
 * 保存に失敗しても落とさない。プライベートブラウジングや容量超過で
 * localStorage が投げることがあり、**保存できないことは遊べない理由にならない。**
 */
import { parseSave, serializeSave, type SaveData } from '@med/sim';

const KEY = 'med-sim:save:v1';

export function loadSave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : parseSave(raw);
  } catch {
    return null;
  }
}

export function writeSave(save: SaveData): void {
  try {
    window.localStorage.setItem(KEY, serializeSave(save));
  } catch {
    // 保存できなくても遊べる。セッション中は state が真実
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 消せなくても、新しいセーブで上書きされる
  }
}
