/**
 * プロトタイプの器。
 *
 * 実装済みの画面はマップと診療所。マップが根で、診療所は全画面差し替えのモーダル。
 * 本社も医局も銀行もまだ無い（仕様の無い画面は実装しない。CLAUDE.md §7）。
 *
 * ★重要：意思決定を変えると、120ヶ月を丸ごと計算し直している。
 * シム核は純粋関数なので差分更新は要らないし、やってはいけない。
 * 「13ヶ月目の医師を1名戻す」を押した瞬間に、10年ぶんの未来が正しく組み替わる。
 */
import { useMemo, useState } from 'react';
import {
  BASELINE_SCENARIO,
  CLINICS,
  runSimulation,
  type ClinicId,
  type MonthDecision,
  type ScreenId,
} from '@med/sim';
import { ClinicScreen, type ClinicTabId } from './screens/clinic/ClinicScreen';
import { MapScreen } from './screens/map/MapScreen';
import { BuildingScreen } from './screens/buildings/BuildingScreens';

export function App() {
  const [decisions, setDecisions] = useState<MonthDecision[]>(BASELINE_SCENARIO.decisions);
  const [month, setMonth] = useState(1);
  const [tab, setTab] = useState<ClinicTabId>('overview');
  /** 開いている診療所。null ならマップか建物 */
  const [openClinic, setOpenClinic] = useState<ClinicId | null>(null);
  /** 開いている建物。null なら診療所かマップ */
  const [openBuilding, setOpenBuilding] = useState<ScreenId | null>(null);

  const run = useMemo(
    () => runSimulation({ ...BASELINE_SCENARIO, decisions }),
    [decisions],
  );

  const modified = decisions !== BASELINE_SCENARIO.decisions;
  const result = run.months[month - 1]!;
  const previous = month > 1 ? run.months[month - 2]! : null;
  const clinicName = CLINICS.find((c) => c.id === openClinic)?.name ?? openClinic ?? '';

  const changeMonth = (delta: number) =>
    setMonth((m) => Math.min(run.months.length, Math.max(1, m + delta)));

  /** 表示中の月の医師配置を書き換える。以後の月にも効く（意思決定は据え置きが既定） */
  function setDoctors(clinicId: ClinicId, next: number) {
    setDecisions((current) => {
      const index = current.findIndex((d) => d.month === month);
      if (index >= 0) {
        const updated = [...current];
        const target = current[index]!;
        updated[index] = {
          ...target,
          doctorsByClinic: { ...target.doctorsByClinic, [clinicId]: next },
        };
        return updated;
      }
      return [...current, { month, doctorsByClinic: { [clinicId]: next } }].sort(
        (a, b) => a.month - b.month,
      );
    });
  }

  if (openBuilding !== null) {
    return (
      <BuildingScreen
        screen={openBuilding}
        result={result}
        previous={previous}
        history={run.months}
        onClose={() => setOpenBuilding(null)}
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
        onMonthChange={changeMonth}
        canGoBack={month > 1}
        canGoForward={month < run.months.length}
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
      onDoctorsChange={(next) => setDoctors(openClinic, next)}
      onMonthChange={changeMonth}
      canGoBack={month > 1}
      canGoForward={month < run.months.length}
      modified={modified}
      onReset={() => setDecisions(BASELINE_SCENARIO.decisions)}
    />
  );
}
