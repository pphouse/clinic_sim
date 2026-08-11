/**
 * ゲームの器。
 *
 * ★ここが「ビューア」と「ゲーム」を分けている場所。
 *
 * 以前はいきなり120ヶ月を計算して、タイムラインを自由に行き来していた。
 * それでは**このゲームの主題である遅延が痛みにならない。**
 * 120ヶ月目を見てから13ヶ月目に戻って医師を戻せるなら、判断は要らない。
 *
 * いまは：
 *   - `currentMonth` までしか見られない。**未来は見せない**
 *   - 意思決定は `currentMonth` にしか書けない。過去は読むだけ
 *   - 「翌月へ」で1ヶ月ずつ進める
 *   - 終わったらタイムラインを開放する（因果を確認するのは終わってからでいい）
 *
 * 計算は毎回120ヶ月まるごとやり直している。差分更新はしないし、してはいけない。
 * シム核は純粋関数なので、決定を1つ足せば10年ぶんの未来が正しく組み替わる。
 * 見せる範囲だけを currentMonth で切っている。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CLINIC_SITES,
  PLAY_SCENARIO,
  createSave,
  runSimulation,
  scenarioFromSave,
  type ClinicId,
  type ClinicSite,
  type Month,
  type SpecialtyId,
  type MonthDecision,
  type SaveData,
  type ScreenId,
} from '@med/sim';
import { ClinicScreen, type ClinicTabId } from './screens/clinic/ClinicScreen';
import { MapScreen } from './screens/map/MapScreen';
import { BuildingScreen } from './screens/buildings/BuildingScreens';
import { EndingScreen } from './screens/ending/EndingScreen';
import { OpeningScreen } from './screens/opening/OpeningScreen';
import { clearSave, loadSave, writeSave } from './game/storage';

const freshSave = (): SaveData => createSave(PLAY_SCENARIO, 1, PLAY_SCENARIO.decisions);

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave() ?? freshSave());
  /** 見ている月。currentMonth を超えられない（終局後を除く） */
  const [viewMonth, setViewMonth] = useState<Month>(save.currentMonth);
  const [tab, setTab] = useState<ClinicTabId>('overview');
  const [openClinic, setOpenClinic] = useState<ClinicId | null>(null);
  const [openBuilding, setOpenBuilding] = useState<ScreenId | null>(null);
  /** 終局の画面を出しているか。「見直す」で伏せる */
  const [endingDismissed, setEndingDismissed] = useState(false);
  /** 開院画面で選んでいる候補地。科をここで決める */
  const [openingSite, setOpeningSite] = useState<ClinicSite | null>(null);

  const run = useMemo(() => runSimulation(scenarioFromSave(PLAY_SCENARIO, save)), [save]);

  useEffect(() => writeSave(save), [save]);

  const end = run.months[save.currentMonth - 1]!.goals.end;
  /** 終わったらタイムラインを開放する。因果を確認するのは終わってからでいい */
  const maxViewMonth = end.ended ? run.months.length : save.currentMonth;
  const month = Math.min(viewMonth, maxViewMonth);
  const result = run.months[month - 1]!;
  const previous = month > 1 ? run.months[month - 2]! : null;
  /** 過去を見ているあいだは意思決定を書けない。書けるのは「今」だけ */
  const isPresent = month === save.currentMonth && !end.ended;

  const clinicName = result.clinics.find((c) => c.id === openClinic)?.name ?? openClinic ?? '';

  function goToMonth(next: Month) {
    setViewMonth(Math.min(maxViewMonth, Math.max(1, next)));
  }

  /** 1ヶ月進める。**押した瞬間に確定して、戻せない** */
  function advance() {
    if (end.ended || save.currentMonth >= run.months.length) return;
    const next = save.currentMonth + 1;
    setSave((s) => ({ ...s, currentMonth: next }));
    setViewMonth(next);
  }

  /**
   * 今月の意思決定を書き換える。以後の月にも効く（意思決定は据え置きが既定）。
   * **書けるのは currentMonth だけ。** 過去は読むだけ。
   */
  function applyDecision(patch: Partial<MonthDecision>) {
    if (!isPresent) return;
    setSave((s) => {
      const target = s.currentMonth;
      const index = s.decisions.findIndex((d) => d.month === target);
      if (index >= 0) {
        const updated = [...s.decisions];
        const existing = s.decisions[index]!;
        updated[index] = {
          ...existing,
          ...patch,
          // 書いた分だけ上書きする。丸ごと置き換えない
          doctorsByClinic: { ...existing.doctorsByClinic, ...patch.doctorsByClinic },
          relationActivity: { ...existing.relationActivity, ...patch.relationActivity },
        };
        return { ...s, decisions: updated };
      }
      return {
        ...s,
        decisions: [...s.decisions, { month: target, ...patch }].sort((a, b) => a.month - b.month),
      };
    });
  }

  function restart() {
    clearSave();
    const next = freshSave();
    setSave(next);
    setViewMonth(next.currentMonth);
    setEndingDismissed(false);
    setOpenClinic(null);
    setOpenBuilding(null);
  }

  const setDoctors = (clinicId: ClinicId, next: number) =>
    applyDecision({ doctorsByClinic: { [clinicId]: next } });

  if (end.ended && !endingDismissed) {
    return (
      <EndingScreen
        end={end}
        goals={run.months[end.month! - 1]!.goals.goals}
        onReview={() => {
          setEndingDismissed(true);
          setViewMonth(1);
        }}
        onRestart={restart}
      />
    );
  }

  if (openingSite !== null) {
    return (
      <OpeningScreen
        site={openingSite}
        result={result}
        cash={result.financials.balanceSheet.cash}
        onOpen={(specialty: SpecialtyId) => {
          applyDecision({ openClinic: openingSite.id, openSpecialty: specialty });
          setOpeningSite(null);
        }}
        onClose={() => setOpeningSite(null)}
      />
    );
  }

  if (openBuilding !== null) {
    return (
      <BuildingScreen
        screen={openBuilding}
        result={result}
        previous={previous}
        history={run.months}
        onClose={() => setOpenBuilding(null)}
        onDecision={isPresent ? applyDecision : undefined}
      />
    );
  }

  if (openClinic === null) {
    return (
      <MapScreen
        result={result}
        previous={previous}
        onOpenClinic={setOpenClinic}
        onOpenBuilding={setOpenBuilding}
        onMonthChange={(delta) => goToMonth(month + delta)}
        currentMonth={save.currentMonth}
        isPresent={isPresent}
        onAdvance={advance}
        onShowEnding={end.ended ? () => setEndingDismissed(false) : undefined}
        onDecision={isPresent ? applyDecision : undefined}
        onChooseSite={
          isPresent
            ? (id) => setOpeningSite(CLINIC_SITES.find((s) => s.id === id) ?? null)
            : undefined
        }
        canGoBack={month > 1}
        canGoForward={month < maxViewMonth}
      />
    );
  }

  return (
    <ClinicScreen
      clinicId={openClinic}
      clinicName={clinicName}
      result={result}
      previous={previous}
      history={run.months}
      tab={tab}
      onTabChange={setTab}
      onClose={() => setOpenClinic(null)}
      onDoctorsChange={isPresent ? (next) => setDoctors(openClinic, next) : undefined}
      onMonthChange={(delta) => goToMonth(month + delta)}
      canGoBack={month > 1}
      canGoForward={month < maxViewMonth}
      modified={false}
      onReset={restart}
    />
  );
}
