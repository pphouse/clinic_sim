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
  CLINIC_SITES,
  MONTHS_PER_YEAR,
  districtNameOf,
  clinicSummaries,
  groupSummary,
  monthLabel,
  reputationStars,
  type ClinicId,
  type ClinicSummary,
  type CompetitorView,
  type MonthDecision,
  type MonthResult,
  type ScreenId,
} from '@med/sim';
import { GoalBar } from '../../components/GoalBar';
import { IconButton } from '../../components/IconButton';
import { StarRating } from '../../components/StarRating';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from '../../components/icons';
import { compactMan, formatSignedMan, minutes, people, percent } from '../../format';
import mapDistrict from '../../assets/map-district.svg';
import { BUILDING_GROUPS, buildingsInGroup } from '../registry';

/**
 * 地図上の位置。**sim は座標を持たない**（docs/spec/screens/map.md）。
 * 経営の計算に座標は要らないので、絵の都合はこちら側で持つ。
 */
const MAP_POSITIONS: Record<ClinicId, { left: string; top: string }> = {
  A: { left: '30%', top: '34%' },
  B: { left: '66%', top: '52%' },
  C: { left: '42%', top: '73%' },
  D: { left: '55%', top: '30%' },
  E: { left: '22%', top: '62%' },
};

/**
 * 競合の位置。**自院より控えめに描く**（docs/spec/04-market.md §5）。
 * 地図の主役は自院で、競合は環境。
 *
 * 最初から居る4軒は決め打ち。突発事象で増えた競合は商圏の代表点に寄せて置く
 * （そこまで作り込む価値が無い。名前とシェアが読めれば判断はできる）。
 */
const COMPETITOR_POSITIONS: Record<string, { left: string; top: string }> = {
  'honmachi-naika': { left: '26%', top: '20%' },
  'ekimae-medical': { left: '72%', top: '40%' },
  'ekimae-sakura': { left: '62%', top: '66%' },
  'shinko-nijiiro': { left: '32%', top: '86%' },
};

/** 商圏の代表点。名前の無い新規競合はここへ置く */
const DISTRICT_POSITIONS: Record<string, { left: string; top: string }> = {
  honmachi: { left: '22%', top: '46%' },
  ekimae: { left: '76%', top: '58%' },
  jutaku: { left: '54%', top: '88%' },
  shinko: { left: '24%', top: '76%' },
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
  onOpenBuilding: (id: ScreenId) => void;
  onMonthChange: (delta: number) => void;
  /** どこまで進めたか。ここより先は見られない */
  currentMonth: number;
  /** 「今」を見ているか。過去を見ているあいだは進めるボタンを出さない */
  isPresent: boolean;
  /** 1ヶ月進める */
  onAdvance: () => void;
  /** 終局後だけ。結果画面へ戻る */
  onShowEnding?: () => void;
  /** 今月の意思決定。過去を見ているあいだは undefined */
  onDecision?: (patch: Partial<MonthDecision>) => void;
  /** 候補地を選んで開院画面へ。科はあちらで決める */
  onChooseSite?: (id: ClinicId) => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function MapScreen(props: MapScreenProps) {
  const { result, previous } = props;
  const summaries = clinicSummaries(result);
  const group = groupSummary(result, previous);
  // まだ開いていない候補地。**開けるものだけを出す**のではなく、
  // 足りない額まで見せる。「いくら足りないか」が次の判断になる
  const sites = CLINIC_SITES.filter((site) => !summaries.some((c) => c.id === site.id));
  const rivals = result.market.districts.flatMap((d) => d.competitors);

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
          height: `calc(var(--header-height) + var(--safe-top))`,
          paddingTop: 'var(--safe-top)',
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

      {/*
        ★何を目指しているかを常に見せる。見えていないと月を進める意味が分からない。
        3本並べるのは選ばせるためではなく、**1本伸ばすと他が縮むのが見える**ようにするため。
      */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--ink-700)' }}>
        <GoalBar goals={result.goals.goals} onOpen={() => props.onOpenBuilding('personalWealth')} />
      </div>

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
              /*
                ★背の低い画面（Safari のタブから開くと 664px しかない）で
                地図が縦を食い切り、診療所の行が1つも見えなくなる。
                正方形のまま縮めず、上下を切って幅を保つ。
              */
              maxHeight: '38dvh',
              objectFit: 'cover',
              objectPosition: 'center',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-700)',
            }}
          />
          {/* 競合を先に描く。自院のピンが上に重なるように */}
          {rivals.map((rival) => (
            <CompetitorPin key={rival.id} rival={rival} />
          ))}
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

          {props.onChooseSite && sites.length > 0 && (
            <>
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
                開院できる候補地
              </h2>
              {sites.map((site) => {
                // 投資額は科で変わる（眼科は2倍、精神科は半分）。ここでは最小額を出す
                return (
                  <div
                    key={site.id}
                    className="receipt-rule"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 'var(--space-3)',
                      alignItems: 'center',
                      padding: 'var(--space-3) 0',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-body)' }}>{site.name}</div>
                      <div
                        style={{
                          fontSize: 'var(--text-caption)',
                          color: 'var(--paper-mute)',
                          lineHeight: 1.5,
                        }}
                      >
                        {districtNameOf(site.districtId)}・{compactMan(site.capex)}円〜
                        {site.initialPatientStock > 0 &&
                          `・${people(site.initialPatientStock)}人を引き継ぐ`}
                        <br />
                        {site.character}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      data-testid={`open-site-${site.id}`}
                      onClick={() => props.onChooseSite?.(site.id)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      科を選ぶ
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/*
            訪問先。**ここに出ている建物だけが実装済み。**
            仕様の無い画面へは行けないので、行けない先を並べない（§7）
          */}
          {BUILDING_GROUPS.map((group) => (
            <div key={group}>
              <h2
                style={{
                  margin: 'var(--space-6) 0 var(--space-3)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-label)',
                  fontWeight: 600,
                  color: 'var(--paper-dim)',
                  letterSpacing: '0.08em',
                }}
              >
                {group}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 'var(--space-2)',
                }}
              >
                {buildingsInGroup(group).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => props.onOpenBuilding(b.id)}
                    data-testid={`building-${b.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      padding: 'var(--space-2) 1px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--ink-700)',
                      background: 'var(--ink-800)',
                      color: 'var(--paper)',
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <img src={b.icon} alt="" width={32} height={32} style={{ display: 'block' }} />
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        lineHeight: 1.2,
                        textAlign: 'center',
                      }}
                    >
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        操作卓。**「翌月へ」がこのゲームの唯一の不可逆な操作。**
        押すと1ヶ月が確定して、その月の意思決定は書き換えられなくなる。
        過去へは戻れるが、読むだけ（docs/spec/screens/map.md）。
      */}
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

        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {monthLabel(result.month)}
          </div>
          {!props.isPresent && (
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-mute)' }}>
              {props.onShowEnding ? '10年の見直し' : `過去（今は ${monthLabel(props.currentMonth)}）`}
            </div>
          )}
        </div>

        {props.isPresent ? (
          <button
            type="button"
            className="btn btn--primary"
            data-testid="advance"
            onClick={props.onAdvance}
            style={{ whiteSpace: 'nowrap' }}
          >
            翌月へ
          </button>
        ) : props.onShowEnding ? (
          <button
            type="button"
            className="btn"
            data-testid="show-ending"
            onClick={props.onShowEnding}
            style={{ whiteSpace: 'nowrap' }}
          >
            結果へ
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <IconButton
              label="次の月へ"
              tone="quiet"
              icon={<ChevronRightIcon size={19} />}
              disabled={!props.canGoForward}
              onClick={() => props.onMonthChange(1)}
            />
            <IconButton
              label="今へ戻る"
              tone="quiet"
              icon={<ChevronsRightIcon size={19} />}
              disabled={!props.canGoForward}
              onClick={() => props.onMonthChange(MONTHS_PER_YEAR)}
            />
          </div>
        )}
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

/**
 * 競合のピン。**自院より弱く描く。** 塗りを持たせず、輪郭だけ。
 * 地図の主役は自院で、競合は環境（docs/spec/04-market.md §5）。
 * 押せない。中に入る用事が無い相手なので、押せる形にしない。
 */
function CompetitorPin({ rival }: { rival: CompetitorView }) {
  const pos =
    COMPETITOR_POSITIONS[rival.id] ??
    DISTRICT_POSITIONS[rival.districtId] ?? { left: '50%', top: '50%' };
  const pushing = rival.monthsToExit !== null;

  return (
    <div
      aria-label={`${rival.name} シェア ${percent(rival.share, 0)}%`}
      data-testid={`rival-pin-${rival.id}`}
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 'var(--radius-sm)',
          border: `1px dashed ${pushing ? 'var(--positive)' : 'var(--paper-mute)'}`,
          background: 'rgba(14, 20, 25, 0.72)',
          color: pushing ? 'var(--positive)' : 'var(--paper-mute)',
          fontSize: 'var(--text-caption)',
          whiteSpace: 'nowrap',
          maxWidth: 116,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{rival.name}</span>
        <span className="num">{percent(rival.share, 0)}%</span>
      </div>
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: `6px solid ${pushing ? 'var(--positive)' : 'var(--paper-mute)'}`,
          opacity: 0.7,
        }}
      />
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
