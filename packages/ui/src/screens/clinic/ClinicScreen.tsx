/**
 * 診療所画面。docs/spec/screens/clinic.md
 *
 * この画面の唯一の仕事は、因果の鎖を1画面の中で上から順に読ませること。
 *
 *   常勤医 → 診察枠 → 実効枠 → 稼働率 → 待ち時間 → 評判・離脱 → 患者ストック → 収益
 *
 * **計算はしない。** 表示している数字は全て QuarterResult から読んだもの。
 */
import {
  ADDONS,
  CRITICAL_WAIT_MINUTES,
  REPUTATION_MIN,
  TOLERABLE_WAIT_MINUTES,
  eventsForScreen,
  unservedVisits,
  type ClinicId,
  type QuarterResult,
} from '@med/sim';
import { ScreenShell, type ShellTab } from '../../components/ScreenShell';
import { StatRow } from '../../components/StatRow';
import { man, minutes, percent, people, points, visits } from '../../format';
import { ClinicIcon, ClinicIllustration, ManagerPortrait } from './art';

export type ClinicTabId = 'overview' | 'patients' | 'income';

export interface ClinicScreenProps {
  clinicId: ClinicId;
  clinicName: string;
  /** 表示中の四半期の結果 */
  result: QuarterResult;
  /** 前四半期。期首の患者数を出すために読む */
  previous: QuarterResult | null;
  tab: ClinicTabId;
  onTabChange: (tab: ClinicTabId) => void;
  onClose: () => void;
  /** 操作系。sim の意思決定リストを書き換える */
  onDoctorsChange: (next: number) => void;
  onQuarterChange: (delta: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  modified: boolean;
  onReset: () => void;
}

/** 大きく出す数字。数字は大きく、ラベルは小さく（CLAUDE.md §5） */
function HeroStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'warning' | 'critical';
}) {
  const color = tone ? `var(--${tone})` : 'var(--paper)';
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div
        className="num"
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.05,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 500, marginLeft: 1 }}>
          {unit}
        </span>
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2
      style={{
        margin: 'var(--space-6) 0 var(--space-2)',
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-label)',
        fontWeight: 600,
        color: 'var(--paper-dim)',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </h2>
  );
}

/** 事務長の一言。今この画面で見るべきものを名指しする */
function greetingFor(waitMinutes: number, reputation: number, doctors: number): string {
  if (doctors === 0) return '常勤医が居ません。枠がゼロなので、誰も診られていません。';
  if (reputation <= REPUTATION_MIN) {
    return `評判が下限です。待ち時間は${minutes(waitMinutes)}分。ここから戻すのに何年かかるか、ご承知おきください。`;
  }
  if (waitMinutes >= CRITICAL_WAIT_MINUTES) {
    return `待ち時間${minutes(waitMinutes)}分。もう評判は落ちています。患者が減り始めるのは数四半期あとです。`;
  }
  if (waitMinutes > TOLERABLE_WAIT_MINUTES) {
    return `待ち時間が${minutes(waitMinutes)}分です。許容の${TOLERABLE_WAIT_MINUTES}分を超えました。評判が削られ始めています。`;
  }
  return `待ち時間は${minutes(waitMinutes)}分。いまのところ枠は足りています。`;
}

export function ClinicScreen(props: ClinicScreenProps) {
  const { result, previous, clinicId } = props;
  const clinic = result.clinics.find((c) => c.id === clinicId)!;
  const doctors = result.staff.doctorsByClinic[clinicId] ?? 0;
  const events = eventsForScreen(result, 'clinic');
  const opened = clinic.capacity > 0 || clinic.patientStock > 0;

  const waitTone =
    clinic.waitMinutes >= CRITICAL_WAIT_MINUTES
      ? 'critical'
      : clinic.waitMinutes > TOLERABLE_WAIT_MINUTES
        ? 'warning'
        : undefined;
  const reputationTone =
    clinic.reputation < 50 ? 'critical' : clinic.reputation < 65 ? 'warning' : undefined;

  const tabs: ShellTab[] = [
    { id: 'overview', label: '概要', icon: <TabGlyph kind="overview" /> , badge: events.length },
    { id: 'patients', label: '患者', icon: <TabGlyph kind="patients" /> },
    { id: 'income', label: '収支', icon: <TabGlyph kind="income" /> },
  ];

  return (
    <ScreenShell
      domain="hq"
      title={props.clinicName}
      subtitle={`${result.label}　東京都文京区本郷`}
      icon={<ClinicIcon />}
      illustration={<ClinicIllustration crowding={clinic.utilization} />}
      portrait={<ManagerPortrait />}
      greeting={
        opened
          ? greetingFor(clinic.waitMinutes, clinic.reputation, doctors)
          : 'この院はまだ開院していません。'
      }
      tabs={tabs}
      activeTabId={props.tab}
      onTabChange={(id) => props.onTabChange(id as ClinicTabId)}
      onClose={props.onClose}
    >
      {!opened ? (
        <p style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-body)' }}>
          開院予定の四半期まで進めてください。
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-2)',
              padding: 'var(--space-4) 0',
            }}
          >
            <HeroStat label="通院患者" value={people(clinic.patientStock)} unit="人" />
            <HeroStat
              label="待ち時間"
              value={minutes(clinic.waitMinutes)}
              unit="分"
              tone={waitTone}
            />
            <HeroStat
              label="評判"
              value={points(clinic.reputation)}
              unit=""
              tone={reputationTone}
            />
          </div>

          {props.tab === 'overview' && (
            <>
              <SectionTitle>診察枠</SectionTitle>
              <StatRow label="常勤医" value={doctors} unit="名" emphasis />
              <StatRow label="診察枠" value={visits(clinic.capacity)} unit="回" />
              <StatRow
                label="看護師充足率"
                value={percent(result.staff.nurseSufficiency)}
                unit="%"
              />
              <StatRow label="実効枠" value={visits(clinic.effectiveCapacity)} unit="回" total />

              <SectionTitle>混雑</SectionTitle>
              <StatRow label="診察需要" value={visits(clinic.demandVisits)} unit="回" />
              <StatRow label="稼働率" value={percent(clinic.utilization)} unit="%" emphasis />
              <StatRow label="待ち時間" value={minutes(clinic.waitMinutes)} unit="分" total />
              <p
                style={{
                  margin: 'var(--space-2) 0 0',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--paper-mute)',
                  lineHeight: 1.6,
                }}
              >
                稼働率が1を超えると待ち時間は 2.5 乗で伸びる。
                超過分は評判を削り、離脱率に乗る。
              </p>

              {events.length > 0 && (
                <>
                  <SectionTitle>この四半期の通知</SectionTitle>
                  {events.map((e) => (
                    <div
                      key={e.id}
                      className="receipt-rule"
                      style={{ padding: 'var(--space-3) 0' }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--text-body)',
                          color: e.severity === 'critical' ? 'var(--critical)' : 'var(--warning)',
                        }}
                      >
                        {e.title}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-caption)',
                          color: 'var(--paper-dim)',
                          lineHeight: 1.6,
                          marginTop: 2,
                        }}
                      >
                        {e.body}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {props.tab === 'patients' && (
            <>
              <SectionTitle>患者ストックの増減</SectionTitle>
              <StatRow
                label="期首の患者"
                value={people(
                  previous ? (previous.clinics.find((c) => c.id === clinicId)?.patientStock ?? 0) : 0,
                )}
                unit="人"
              />
              <StatRow label="新規患者" value={people(clinic.newPatients)} unit="人" />
              <StatRow label="離脱率" value={percent(clinic.churnRate, 2)} unit="%" />
              <StatRow label="期末の患者" value={people(clinic.patientStock)} unit="人" total />
              <p
                style={{
                  margin: 'var(--space-2) 0 0',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--paper-mute)',
                  lineHeight: 1.6,
                }}
              >
                新規患者は<strong>前四半期の</strong>評判で決まる。ここが遅延の源泉。
              </p>

              <SectionTitle>捌けた診察</SectionTitle>
              <StatRow label="診察需要" value={visits(clinic.demandVisits)} unit="回" />
              <StatRow label="実施した診察" value={visits(clinic.visitsServed)} unit="回" />
              <StatRow
                label="捌けなかった診察"
                value={visits(unservedVisits(clinic))}
                unit="回"
                total
              />
              <p
                style={{
                  margin: 'var(--space-2) 0 0',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--paper-mute)',
                  lineHeight: 1.6,
                }}
              >
                溢れた分は収益にならず、翌期にも繰り越さない。永久に失われる。
              </p>
            </>
          )}

          {props.tab === 'income' && (
            <>
              <SectionTitle>収支</SectionTitle>
              <StatRow label="保険診療収入" value={man(clinic.insuranceRevenue)} unit="万円" />
              <StatRow label="自費診療収入" value={man(clinic.selfPayRevenue)} unit="万円" />
              <StatRow label="営業費用" value={man(clinic.operatingCost)} unit="万円" />
              <StatRow
                label="営業利益"
                value={man(clinic.operatingIncome)}
                unit="万円"
                total
              />

              <SectionTitle>診療報酬</SectionTitle>
              <StatRow label="点数指数" value={points(result.fee.feePointIndex)} />
              <StatRow label="加算の合計" value={percent(result.fee.addonTotal)} unit="%" />
              <StatRow
                label="実効点数指数"
                value={points(result.fee.effectiveFeeIndex)}
                total
              />

              <SectionTitle>加算</SectionTitle>
              {result.fee.addons.map((status) => {
                const addon = ADDONS.find((a) => a.id === status.id)!;
                const state = status.active
                  ? { text: '有効', color: 'var(--positive)' }
                  : status.lapsedByRequirement
                    ? { text: '要件割れ', color: 'var(--critical)' }
                    : { text: '未取得', color: 'var(--paper-mute)' };
                return (
                  <StatRow
                    key={status.id}
                    label={addon.name}
                    value={`+${percent(addon.effect, 0)}%`}
                    suffix={
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--text-caption)',
                          color: state.color,
                        }}
                      >
                        {state.text}
                      </span>
                    }
                  />
                );
              })}
            </>
          )}
        </>
      )}

      <ControlDock {...props} doctors={doctors} opened={opened} />
    </ScreenShell>
  );
}

/**
 * 操作卓。親指の届く画面下半分に固定する（CLAUDE.md §5）。
 * 医師を増減すると意思決定の列が書き換わり、40四半期が丸ごと計算し直される。
 */
function ControlDock(
  props: ClinicScreenProps & { doctors: number; opened: boolean },
) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        marginTop: 'var(--space-6)',
        marginInline: 'calc(var(--space-4) * -1)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--ink-900)',
        borderTop: '1px solid var(--ink-600)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <span style={{ fontSize: 'var(--text-label)', color: 'var(--paper-dim)' }}>常勤医</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <StepButton
            label="常勤医を減らす"
            glyph="−"
            disabled={!props.opened || props.doctors <= 0}
            onClick={() => props.onDoctorsChange(props.doctors - 1)}
          />
          <span
            className="num"
            data-testid="doctor-count"
            style={{ fontSize: 'var(--text-title)', fontWeight: 700, minWidth: 44, textAlign: 'center' }}
          >
            {props.doctors}
            <span style={{ fontSize: 'var(--text-caption)', marginLeft: 2 }}>名</span>
          </span>
          <StepButton
            label="常勤医を増やす"
            glyph="＋"
            disabled={!props.opened}
            onClick={() => props.onDoctorsChange(props.doctors + 1)}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
        }}
      >
        <StepButton
          label="前の四半期へ"
          glyph="◀"
          disabled={!props.canGoBack}
          onClick={() => props.onQuarterChange(-1)}
        />
        <div style={{ textAlign: 'center' }}>
          <div
            className="num"
            data-testid="quarter-label"
            style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}
          >
            {props.result.label}
          </div>
          {props.modified && (
            <button
              type="button"
              onClick={props.onReset}
              style={{
                marginTop: 2,
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--warning)',
                fontSize: 'var(--text-caption)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              既定シナリオに戻す
            </button>
          )}
        </div>
        <StepButton
          label="次の四半期へ"
          glyph="▶"
          disabled={!props.canGoForward}
          onClick={() => props.onQuarterChange(1)}
        />
      </div>
    </div>
  );
}

function StepButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--ink-600)',
        background: disabled ? 'transparent' : 'var(--ink-700)',
        color: disabled ? 'var(--paper-mute)' : 'var(--paper)',
        fontSize: 18,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {glyph}
    </button>
  );
}

function TabGlyph({ kind }: { kind: 'overview' | 'patients' | 'income' }) {
  if (kind === 'patients') {
    return (
      <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden>
        <circle cx="13" cy="9" r="4.5" fill="currentColor" />
        <path d="M4 24 q3 -8 9 -8 q6 0 9 8 Z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'income') {
    return (
      <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden>
        <rect x="4" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 17 h10 M8 13 h10 M8 9 h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden>
      <path d="M4 20 L10 12 L15 16 L22 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
