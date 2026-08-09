/**
 * プロトタイプの器。
 *
 * README の「診療所画面 1 枚で手触りを確認」のための最小構成。
 * 実装済みの画面は診療所だけ。マップも本社も無いので、ここは**足場**であって画面ではない。
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
} from '@med/sim';
import { ClinicScreen, type ClinicTabId } from './screens/clinic/ClinicScreen';

export function App() {
  const [decisions, setDecisions] = useState<MonthDecision[]>(BASELINE_SCENARIO.decisions);
  const [month, setMonth] = useState(1);
  const [clinicId, setClinicId] = useState<ClinicId>('A');
  const [tab, setTab] = useState<ClinicTabId>('overview');
  const [open, setOpen] = useState(true);

  const run = useMemo(
    () => runSimulation({ ...BASELINE_SCENARIO, decisions }),
    [decisions],
  );

  const modified = decisions !== BASELINE_SCENARIO.decisions;
  const result = run.months[month - 1]!;
  const previous = month > 1 ? run.months[month - 2]! : null;
  const clinicName = CLINICS.find((c) => c.id === clinicId)?.name ?? clinicId;

  /** 表示中の月の医師配置を書き換える。以後の月にも効く（意思決定は据え置きが既定） */
  function setDoctors(next: number) {
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

  if (!open) {
    return (
      <PrototypeHome
        onSelect={(id) => {
          setClinicId(id);
          setOpen(true);
        }}
      />
    );
  }

  return (
    <ClinicScreen
      clinicId={clinicId}
      clinicName={clinicName}
      result={result}
      previous={previous}
      tab={tab}
      onTabChange={setTab}
      onClose={() => setOpen(false)}
      onDoctorsChange={setDoctors}
      onMonthChange={(delta) =>
        setMonth((q) => Math.min(run.months.length, Math.max(1, q + delta)))
      }
      canGoBack={month > 1}
      canGoForward={month < run.months.length}
      modified={modified}
      onReset={() => setDecisions(BASELINE_SCENARIO.decisions)}
    />
  );
}

/**
 * 診療所へ入るためだけの足場。**マップ画面ではない。**
 * マップは docs/spec/screens/map.md が空のまま。仕様の無い画面は実装しない（CLAUDE.md §7）。
 */
function PrototypeHome({ onSelect }: { onSelect: (id: ClinicId) => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-6)',
        background: 'var(--ink-900)',
      }}
    >
      <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--paper-mute)' }}>
        マップ画面は未実装。仕様書が空のまま実装しない（CLAUDE.md §7）
      </p>
      {CLINICS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          style={{
            padding: 'var(--space-4)',
            textAlign: 'left',
            background: 'var(--ink-800)',
            border: '1px solid var(--ink-600)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--paper)',
            fontSize: 'var(--text-body)',
            cursor: 'pointer',
          }}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
