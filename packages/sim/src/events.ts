/**
 * 通知イベント。
 *
 * 原則：**起きたことだけを知らせる。予告しない。**
 * このゲームの遅延（4四半期）は設計の中心なので、先回りして警告を出すと
 * 「壊すのは一瞬、直すのは何年」という手触りが消える。
 *
 * 待ち時間や充足率のように「いま観測できる異常」は出す。
 * 「このままだと4四半期後に患者が減ります」は出さない。プレイヤーが読む。
 */
import { ADDONS, REPUTATION_MIN, TOLERABLE_WAIT_MINUTES } from './constants';
import { feeRevisionAt } from './fee';
import type { AddonStatus, ClinicTick, GameEvent, Quarter, StaffTick } from './types';

/** これを超えた待ち時間は危機。検証シナリオのピークは 53 分 */
export const CRITICAL_WAIT_MINUTES = 45;

export interface EventInput {
  quarter: Quarter;
  clinics: ClinicTick[];
  clinicNames: Record<string, string>;
  staff: StaffTick;
  addons: AddonStatus[];
  previousAddons: AddonStatus[];
  /** 期末現金 */
  cash: number;
  /** 純資産 */
  equity: number;
  graduatedNurses: number;
}

export function collectEvents(input: EventInput): GameEvent[] {
  const events: GameEvent[] = [];
  const q = input.quarter;
  const push = (e: Omit<GameEvent, 'quarter'>) => events.push({ ...e, quarter: q });

  // --- 診療所：待ち時間
  for (const clinic of input.clinics) {
    if (clinic.capacity === 0) continue;
    const name = input.clinicNames[clinic.id] ?? clinic.id;
    if (clinic.waitMinutes >= CRITICAL_WAIT_MINUTES) {
      push({
        id: `wait-critical-${clinic.id}-${q}`,
        severity: 'critical',
        screen: 'clinic',
        title: `${name}：待ち時間 ${clinic.waitMinutes.toFixed(0)} 分`,
        body: '診察枠が需要に追いついていない。評判はすでに削られている。患者ストックへ効いてくるのは1年ほどあと。',
      });
    } else if (clinic.waitMinutes > TOLERABLE_WAIT_MINUTES) {
      push({
        id: `wait-warning-${clinic.id}-${q}`,
        severity: 'warning',
        screen: 'clinic',
        title: `${name}：待ち時間 ${clinic.waitMinutes.toFixed(0)} 分`,
        body: `許容 ${TOLERABLE_WAIT_MINUTES} 分を超えた。超過分だけ評判が落ち、離脱率が上がる。`,
      });
    }
    if (clinic.reputation <= REPUTATION_MIN) {
      push({
        id: `reputation-floor-${clinic.id}-${q}`,
        severity: 'critical',
        screen: 'clinic',
        title: `${name}：評判が下限に張り付いた`,
        body: '回帰は3か月あたり 15% しか進まない。ここから戻すには数年かかる。',
      });
    }
  }

  // --- 人材
  if (input.staff.nurseSufficiency < 1) {
    push({
      id: `nurse-shortage-${q}`,
      severity: input.staff.nurseSufficiency < 0.9 ? 'critical' : 'warning',
      screen: 'personnel',
      title: `看護師充足率 ${(input.staff.nurseSufficiency * 100).toFixed(1)}%`,
      body: '充足率がそのまま診察枠に掛かる。市場からは3か月で 1.2 人しか採れない。',
    });
  }
  if (input.staff.doctorShortfall) {
    push({
      id: `doctor-shortfall-${q}`,
      severity: 'critical',
      screen: 'igyoku',
      title: '常勤医の調達枠が足りない',
      body: '医局の派遣枠と紹介会社の確保枠の合計を超えて配置しようとしている。',
    });
  }
  if (input.graduatedNurses > 0) {
    push({
      id: `school-graduation-${q}`,
      severity: 'info',
      screen: 'nursingSchool',
      title: `自校の卒業生 ${input.graduatedNurses.toFixed(1)} 名が入職`,
      body: '卒業生の 35% しか残らない。それでも市場採用の2年半ぶんにあたる。',
    });
  }

  // --- 診療報酬
  const revision = feeRevisionAt(q);
  if (revision) {
    push({
      id: `fee-revision-${revision.id}`,
      severity: revision.rate < 0 ? 'warning' : 'info',
      screen: 'bureau',
      title: `${revision.name}：基礎点数 ${(revision.rate * 100).toFixed(1)}%`,
      body: '改定は外部イベント。起きたあとに適応する。',
    });
  }
  for (const status of input.addons) {
    const before = input.previousAddons.find((p) => p.id === status.id);
    const addon = ADDONS.find((a) => a.id === status.id);
    if (!addon) continue;
    if (status.acquiredAtQuarter === q) {
      push({
        id: `addon-acquired-${status.id}`,
        severity: 'info',
        screen: 'bureau',
        title: `${addon.name}を取得`,
        body: `点数に +${(addon.effect * 100).toFixed(0)}%。要件は常勤医 ${addon.requiredDoctors} 名・看護師充足率 ${(addon.requiredNurseSufficiency * 100).toFixed(0)}%。`,
      });
    }
    if (status.lapsedByRequirement && !(before && before.lapsedByRequirement)) {
      push({
        id: `addon-lapsed-${status.id}-${q}`,
        severity: 'warning',
        screen: 'bureau',
        title: `${addon.name}が要件割れで失効`,
        body: '要件を満たし直せば戻るが、落ちている間の点数は戻らない。',
      });
    }
  }

  // --- 財務
  if (input.cash < 0) {
    push({
      id: `cash-shortage-${q}`,
      severity: 'critical',
      screen: 'bank',
      title: '資金ショート',
      body: 'つなぎ融資が引ければ継続できる。純資産が残っているなら債務超過ではない。',
    });
  }
  if (input.equity < 0) {
    push({
      id: `insolvent-${q}`,
      severity: 'critical',
      screen: 'accounting',
      title: '債務超過',
      body: '純資産がマイナス。ゲームオーバー判定。',
    });
  }

  return events;
}
