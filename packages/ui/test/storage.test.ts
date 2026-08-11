/**
 * @vitest-environment jsdom
 *
 * セーブの置き場。**壊れたセーブでアプリが起動しなくなるのがいちばん怖い。**
 * 保存できないこと（プライベートブラウジング・容量超過）も遊べない理由にはならない。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAY_SCENARIO, createSave } from '@med/sim';
import { clearSave, loadSave, writeSave } from '../src/game/storage';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('セーブの読み書き', () => {
  it('書いたものが読める', () => {
    const save = createSave(PLAY_SCENARIO, 12, [
      { month: 1, doctorsByClinic: { A: 3 } },
      { month: 12, borrow: 5000 },
    ]);
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it('何も無ければ null', () => {
    expect(loadSave()).toBeNull();
  });

  it('★壊れたセーブは null。例外を投げるとアプリが起動しなくなる', () => {
    window.localStorage.setItem('med-sim:save:v1', 'これはJSONではない');
    expect(loadSave()).toBeNull();
  });

  it('★別の版のセーブは読まずに捨てる', () => {
    window.localStorage.setItem(
      'med-sim:save:v1',
      JSON.stringify({ ...createSave(PLAY_SCENARIO, 1, []), version: 999 }),
    );
    expect(loadSave()).toBeNull();
  });

  it('消せる', () => {
    writeSave(createSave(PLAY_SCENARIO, 1, []));
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('★保存できなくても落ちない。保存できないことは遊べない理由にならない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeSave(createSave(PLAY_SCENARIO, 1, []))).not.toThrow();
  });

  it('読めなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadSave()).toBeNull();
  });
});
