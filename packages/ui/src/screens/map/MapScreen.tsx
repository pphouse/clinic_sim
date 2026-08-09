/**
 * マップ画面。docs/spec/screens/map.md
 *
 * この画面の唯一の仕事は「**どこが詰まっているかを一目で示し、そこへ入らせる**」。
 * 数字を読ませる画面ではない。細部は診療所画面が持つ。
 *
 * ★マップは根であって、モーダルではない。**ここだけは × で閉じられない。**
 * だから ScreenShell（閉じるボタンと領域色を前提にした器）は使わない。
 */
import {
  MONTHS_PER_YEAR,
  clinicSummaries,
  groupSummary,
  monthLabel,
  reputationStars,
  type ClinicId,
  type ClinicSummary,
  type MonthResult,
} from '@med/sim';
import { IconButton } from '../../components/IconButton';
import { StarRating } from '../../components/StarRating';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from '../../components/icons';
import { compactMan, formatSignedMan, minutes, people } from '../../format';
import mapDistrict from '../../assets/map-district.svg';

/**
 * 地図上の位置。**sim は座標を持たない**（docs/spec/screens/map.md）。
 * 経営の計算に座標は要らないので、絵の都合はこちら側で持つ。
 */
const MAP_POSITIONS: Record<ClinicId, { left: string; top: string }> = {
  A: { left: '30%', top: '34%' },
  B: { left: '66%', top: '52%' },
  C: { left: '42%', top: '73%' },
};

const CONGESTION_COLOR = {
  calm: 'var(--hq-accent)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
} as const;

export interface MapScreenProps {
  result: MonthResult;
  previous: MonthResult | null;
  onOpenClinic: (id: ClinicId) => void;
  onMonthChange: (delta: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function MapScreen(props: MapScreenProps) {
  const { result, previous } = props;
  const summaries = clinicSummaries(result);
  const group = groupSummary(result, previous);

  return (
    <div
      className="screen-shell"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink-900)',
        color: 'var(--paper)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <header
        style={{
          height: 'var(--header-height)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
          borderBottom: '1px solid rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-title)',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          医療グループ
        </div>
        <div
          data-testid="month-label"
          data-month={result.month}
          style={{ fontSize: 'var(--text-label)', color: 'var(--paper-dim)' }}
        >
          {monthLabel(result.month)}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <GroupSummaryRow group={group} />

        <div style={{ position: 'relative', margin: '0 var(--space-4)' }}>
          <img
            src={mapDistrict}
            alt=""
            style={{
              display: 'block',
              width: '100%',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-700)',
            }}
          />
          {summaries.map((clinic) => (
            <MapPin
              key={clinic.id}
              clinic={clinic}
              onOpen={() => props.onOpenClinic(clinic.id)}
            />
          ))}
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          {summaries.map((clinic) => (
            <ClinicRow
              key={clinic.id}
              clinic={clinic}
              onOpen={() => props.onOpenClinic(clinic.id)}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          paddingBottom: `calc(var(--space-3) + var(--safe-bottom))`,
          background: 'var(--ink-900)',
          borderTop: '1px solid var(--ink-600)',
          boxShadow: '0 -10px 22px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <IconButton
            label="1年戻る"
            tone="quiet"
            icon={<ChevronsLeftIcon size={19} />}
            disabled={!props.canGoBack}
            onClick={() => props.onMonthChange(-MONTHS_PER_YEAR)}
          />
          <IconButton
            label="前の月へ"
            tone="quiet"
            icon={<ChevronLeftIcon size={19} />}
            disabled={!props.canGoBack}
            onClick={() => props.onMonthChange(-1)}
          />
        </div>
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {monthLabel(result.month)}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <IconButton
            label="次の月へ"
            tone="quiet"
            icon={<ChevronRightIcon size={19} />}
            disabled={!props.canGoForward}
            onClick={() => props.onMonthChange(1)}
          />
          <IconButton
            label="1年進む"
            tone="quiet"
            icon={<ChevronsRightIcon size={19} />}
            disabled={!props.canGoForward}
            onClick={() => props.onMonthChange(MONTHS_PER_YEAR)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 全社サマリ。
 * ★現金をここに出すのは、この画面が「資金ショートに気づく場所」だから。
 * 診療所画面に現金は無いので、ここに無いと誰も気づかないまま10年が終わる。
 */
function GroupSummaryRow({ group }: { group: ReturnType<typeof groupSummary> }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
      }}
    >
      <SummaryCell
        label="通院患者"
        value={people(group.patientStock)}
        unit="人"
        delta={group.patientStockDelta === null ? undefined : formatSignedMan(group.patientStockDelta, '人')}
        higherIsBetter
      />
      <SummaryCell
        label="現金"
        value={compactMan(group.cash)}
        unit="円"
        tone={group.cash < 0 ? 'critical' : undefined}
        delta={group.cashDelta === null ? undefined : formatSignedMan(group.cashDelta, '万')}
        higherIsBetter
      />
      <SummaryCell
        label="営業利益"
        value={compactMan(group.operatingIncome)}
        unit="円"
        tone={group.operatingIncome < 0 ? 'negative' : undefined}
      />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  unit,
  delta,
  tone,
  higherIsBetter,
}: {
  label: string;
  value: string;
  unit: string;
  delta?: string;
  tone?: 'critical' | 'negative';
  higherIsBetter?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div
        key={value}
        className="num value-changed"
        style={{
          fontSize: 24,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          color: tone ? `var(--${tone})` : 'var(--paper)',
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
      {delta !== undefined && (
        <div
          className="num"
          style={{
            fontSize: 'var(--text-caption)',
            marginTop: 1,
            color: delta.startsWith('±')
              ? 'var(--paper-mute)'
              : delta.startsWith('+') === Boolean(higherIsBetter)
                ? 'var(--positive)'
                : 'var(--negative)',
          }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/** 地図の上のピン。混雑が色、通知が数 */
function MapPin({ clinic, onOpen }: { clinic: ClinicSummary; onOpen: () => void }) {
  const pos = MAP_POSITIONS[clinic.id] ?? { left: '50%', top: '50%' };
  const color = clinic.open ? CONGESTION_COLOR[clinic.congestion] : 'var(--paper-mute)';

  return (
    <button
      type="button"
      onClick={clinic.open ? onOpen : undefined}
      disabled={!clinic.open}
      aria-label={
        clinic.open
          ? `${clinic.name} 待ち時間 ${minutes(clinic.waitMinutes)}分`
          : `${clinic.name} ${monthLabel(clinic.openMonth)} 開院予定`
      }
      data-testid={`map-pin-${clinic.id}`}
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: clinic.open ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        style={{
          padding: '3px 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(8, 12, 16, 0.86)',
          border: `1px solid ${color}`,
          color,
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          position: 'relative',
        }}
      >
        {clinic.name.replace(/（.*）/, '')}
        {clinic.open && (
          <span className="num" style={{ marginLeft: 5, color: 'var(--paper)' }}>
            {minutes(clinic.waitMinutes)}分
          </span>
        )}
        {clinic.eventCount > 0 && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -7,
              right: -7,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              background: 'var(--critical)',
              color: '#fff',
              fontSize: 10,
              lineHeight: '16px',
              fontFamily: 'var(--font-num)',
            }}
          >
            {clinic.eventCount}
          </span>
        )}
      </span>
      {/* ピンの脚。地図の一点を指していることを示す */}
      <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden style={{ display: 'block' }}>
        <path d="M7 10 L1.5 0 h11 Z" fill={color} opacity="0.85" />
      </svg>
    </button>
  );
}

/** 地図の下の一覧。**他院との比較はここでやる** */
function ClinicRow({ clinic, onOpen }: { clinic: ClinicSummary; onOpen: () => void }) {
  if (!clinic.open) {
    return (
      <div
        className="receipt-rule"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: 'var(--space-3) 0',
          color: 'var(--paper-mute)',
        }}
      >
        <span style={{ fontSize: 'var(--text-body)' }}>{clinic.name}</span>
        <span style={{ fontSize: 'var(--text-label)' }}>
          {monthLabel(clinic.openMonth)} 開院予定
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="receipt-rule"
      data-testid={`clinic-row-${clinic.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-3) 0',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--rule)',
        color: 'var(--paper)',
        textAlign: 'left',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-body)' }}>{clinic.name}</div>
        <div style={{ marginTop: 3 }}>
          <StarRating value={reputationStars(clinic.reputation)} size={12} />
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>
          {people(clinic.patientStock)}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-mute)' }}>人</span>
        </div>
        <div
          className="num"
          style={{
            fontSize: 'var(--text-label)',
            color: CONGESTION_COLOR[clinic.congestion],
          }}
        >
          {minutes(clinic.waitMinutes)}
          <span style={{ fontSize: 'var(--text-caption)' }}>分</span>
        </div>
      </div>
      <span style={{ color: 'var(--paper-mute)' }}>
        <ChevronRightIcon size={18} />
      </span>
    </button>
  );
}
