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
  competitorDetail,
  createSave,
  nextStopMonth,
  spanDigest,
  runSimulation,
  scenarioFromSave,
  type ClinicId,
  type ClinicSite,
  type FitoutId,
  type MarketingLevelId,
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
import { MonthDigestOverlay } from './screens/digest/MonthDigestOverlay';
import { CompetitorScreen } from './screens/map/CompetitorScreen';
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
  /**
   * ダイジェストを出す月。「翌月へ」で進んだ直後だけ立つ。
   * ★過去を見に行っただけでは出さない。月が**確定した**ときの手応えだから
   * （docs/spec/screens/month-digest.md）
   */
  const [digestMonth, setDigestMonth] = useState<Month | null>(null);
  /** ダイジェストの始点。まとめて進んだときは何ヶ月も前になる */
  const [digestFrom, setDigestFrom] = useState<Month | null>(null);
  /** 開いている競合。マップのピンから入る */
  const [openCompetitor, setOpenCompetitor] = useState<string | null>(null);

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
    setDigestFrom(save.currentMonth);
    setSave((s) => ({ ...s, currentMonth: next }));
    setViewMonth(next);
    setDigestMonth(next);
  }

  /**
   * 次に手が要る月まで一気に進める（docs/spec/08-decisions.md §3）。
   * **止まる条件は sim が持つ**（nextStopMonth）。UI に書くと画面ごとに判断がずれる。
   */
  function skipToDecision() {
    if (end.ended || save.currentMonth >= run.months.length) return;
    const target = nextStopMonth(run.months, save.currentMonth);
    if (target.month <= save.currentMonth) return;
    setDigestFrom(save.currentMonth);
    setSave((s) => ({ ...s, currentMonth: target.month }));
    setViewMonth(target.month);
    setDigestMonth(target.month);
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
          eventChoices: { ...existing.eventChoices, ...patch.eventChoices },
          marketingByClinic: { ...existing.marketingByClinic, ...patch.marketingByClinic },
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
    setDigestMonth(null);
    setDigestFrom(null);
    setOpenCompetitor(null);
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

  /**
   * 進んだ直後の1回だけ出す。終局した月には出さない（終局画面と2枚重ねない）。
   * 差分は sim が全部持ってくる。ここで引き算しない（CLAUDE.md §2）
   */
  const digest =
    digestMonth !== null &&
    digestFrom !== null &&
    digestMonth === save.currentMonth &&
    !end.ended &&
    digestMonth > 1
      ? spanDigest(run.months, digestFrom, digestMonth)
      : null;

  const overlay = digest && (
    <MonthDigestOverlay
      digest={digest}
      // ★答えられるのは「今」のイベントだけ。飛ばした月の分は確定している
      answerableMonth={save.currentMonth}
      onChoose={
        isPresent
          ? (key, choiceId) => applyDecision({ eventChoices: { [key]: choiceId } })
          : undefined
      }
      onDismiss={() => setDigestMonth(null)}
    />
  );

  const competitor =
    openCompetitor !== null ? competitorDetail(result, openCompetitor) : null;
  if (competitor) {
    return (
      <CompetitorScreen
        detail={competitor}
        currentMonth={result.month}
        onClose={() => setOpenCompetitor(null)}
      />
    );
  }

  if (openingSite !== null) {
    return (
      <OpeningScreen
        site={openingSite}
        result={result}
        cash={result.financials.balanceSheet.cash}
        onOpen={(specialty: SpecialtyId, fitout: FitoutId) => {
          applyDecision({
            openClinic: openingSite.id,
            openSpecialty: specialty,
            openFitout: fitout,
          });
          setOpeningSite(null);
        }}
        onClose={() => setOpeningSite(null)}
      />
    );
  }

  if (openBuilding !== null) {
    return (
      <>
        <BuildingScreen
          screen={openBuilding}
          result={result}
          previous={previous}
          history={run.months}
          onClose={() => setOpenBuilding(null)}
          onDecision={isPresent ? applyDecision : undefined}
        />
        {overlay}
      </>
    );
  }

  if (openClinic === null) {
    return (
      <>
        <MapScreen
          result={result}
          previous={previous}
          onOpenClinic={setOpenClinic}
          onOpenBuilding={setOpenBuilding}
          onMonthChange={(delta) => goToMonth(month + delta)}
          currentMonth={save.currentMonth}
          isPresent={isPresent}
          onAdvance={advance}
          onSkip={skipToDecision}
          onShowEnding={end.ended ? () => setEndingDismissed(false) : undefined}
          onDecision={isPresent ? applyDecision : undefined}
          onChooseSite={
            isPresent
              ? (id) => setOpeningSite(CLINIC_SITES.find((s) => s.id === id) ?? null)
              : undefined
          }
          onOpenCompetitor={setOpenCompetitor}
          canGoBack={month > 1}
          canGoForward={month < maxViewMonth}
        />
        {overlay}
      </>
    );
  }

  return (
    <>
      <ClinicScreen
        clinicId={openClinic}
        clinicName={clinicName}
        result={result}
        previous={previous}
        history={run.months}
        tab={tab}
        onTabChange={setTab}
        onClose={() => setOpenClinic(null)}
        onOpenBuilding={(id) => {
          setOpenClinic(null);
          setOpenBuilding(id);
        }}
        onDoctorsChange={isPresent ? (next) => setDoctors(openClinic, next) : undefined}
        onMarketingChange={
          isPresent
            ? (level: MarketingLevelId) =>
                applyDecision({ marketingByClinic: { [openClinic]: level } })
            : undefined
        }
        onMonthChange={(delta) => goToMonth(month + delta)}
        canGoBack={month > 1}
        canGoForward={month < maxViewMonth}
        modified={false}
        onReset={restart}
      />
      {overlay}
    </>
  );
}
