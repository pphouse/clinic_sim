/**
 * 画面まわりの取りこぼしを拾う試験。
 *
 * ここで見るのは**見た目ではなく整合性**。
 * 「マップに札は出るのに開くと真っ白」「新しい ScreenId を足したのに
 * 台帳に書き忘れた」「領域色のトークンが tokens.css に無い」――
 * どれも typecheck を通ってしまう種類の壊れ方で、
 * 実際に踏むまで気づかない。
 *
 * 描画そのものは Playwright のツアー（e2e/play.mjs）で見る。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAY_SCENARIO, runSimulation, type ScreenId } from '@med/sim';
import { BUILDINGS, BUILDING_GROUPS, buildingOf, buildingsInGroup } from '../src/screens/registry';
import { SCREEN_BODY_IDS } from '../src/screens/buildings/BuildingScreens';

const tokens = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8');

describe('訪問先の台帳', () => {
  it('★マップに出る建物は全て中身を持つ。札はあるのに開くと真っ白、を防ぐ', () => {
    for (const b of BUILDINGS) {
      expect(SCREEN_BODY_IDS, `${b.id} の中身が無い`).toContain(b.id);
    }
  });

  it('中身のある画面は全てマップに出る。行ける先を隠さない', () => {
    for (const id of SCREEN_BODY_IDS) {
      expect(buildingOf(id as ScreenId), `${id} が台帳に無い`).toBeDefined();
    }
  });

  it('領域色は tokens.css に定義されている', () => {
    for (const b of BUILDINGS) {
      expect(tokens, `--${b.domain}-surface が無い`).toContain(`--${b.domain}-surface`);
      expect(tokens, `--${b.domain}-accent が無い`).toContain(`--${b.domain}-accent`);
    }
  });

  it('全ての建物がどれかの束に入る。宙に浮いた建物を作らない', () => {
    const grouped = BUILDING_GROUPS.flatMap((g) => buildingsInGroup(g));
    expect(grouped).toHaveLength(BUILDINGS.length);
  });

  it('id が重複しない', () => {
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
  });
});

describe('通知の行き先', () => {
  it('★sim が出す通知は全て、実在する画面に宛てられている', () => {
    const run = runSimulation({
      ...PLAY_SCENARIO,
      decisions: [
        { month: 1, doctorsByClinic: { A: 3 } },
        { month: 25, openClinic: 'D', doctorsByClinic: { D: 2 } },
        { month: 37, acquireAddons: ['kinou'] },
      ],
    });
    const screens = new Set(run.months.flatMap((m) => m.events.map((e) => e.screen)));
    expect(screens.size).toBeGreaterThan(0);
    for (const screen of screens) {
      // map と clinic は建物ではないので台帳に無くてよい
      if (screen === 'map' || screen === 'clinic') continue;
      expect(buildingOf(screen), `${screen} 宛ての通知が行き場を失っている`).toBeDefined();
    }
  });
});
