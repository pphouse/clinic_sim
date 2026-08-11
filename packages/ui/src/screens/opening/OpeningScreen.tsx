/**
 * 開院画面。docs/spec/05-specialty.md §7 / docs/spec/06-opening.md
 *
 * ★このゲームでいちばん判断の密度が高い画面。2段階で決める。
 *
 *   1. 科  … 市場のセグメントは（商圏 × 科）。「この商圏でこの科は空いているか」が全て
 *   2. 内装 … 費用と、その院の評判の落ち着き先。**どちらも開院後に変えられない**
 *
 * 科の段では **「競合が居ない」をいちばん目立たせる。** 需要の数字より先に目に入ること。
 * 内装の段では **「いくら借りることになるか」をいちばん目立たせる。**
 * 自己資金では絶対に足りないので、選んでいるのは実質「背負う額」。
 *
 * 金額は sim の openingPlan が組み立てる。ここでは足し算をしない（CLAUDE.md §2）。
 */
import { useState } from 'react';
import {
  FITOUTS,
  SPECIALTIES,
  districtDemand,
  districtNameOf,
  openingPlan,
  specialtyOf,
  type ClinicSite,
  type FitoutId,
  type MonthResult,
  type SpecialtyId,
} from '@med/sim';
import { Note, SectionTitle } from '../../components/Section';
import { StarRating } from '../../components/StarRating';
import { compactMan, man, people } from '../../format';

export function OpeningScreen({
  site,
  result,
  cash,
  onOpen,
  onClose,
}: {
  site: ClinicSite;
  result: MonthResult;
  cash: number;
  onOpen: (specialty: SpecialtyId, fitout: FitoutId) => void;
  onClose: () => void;
}) {
  const districtName = districtNameOf(site.districtId);
  /** 科を決めるまでは内装を見せない。一度に2つ決めさせると、どちらも決められない */
  const [specialty, setSpecialty] = useState<SpecialtyId | null>(null);

  return (
    <div
      data-testid="opening-screen"
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
          display: 'grid',
          gridTemplateColumns: '1fr 44px',
          alignItems: 'center',
          padding: '0 var(--space-3) 0 var(--space-4)',
          borderBottom: '1px solid rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-title)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {site.name}
          </div>
          <div
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--paper-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {districtName}　{site.character}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--icon btn--quiet"
          aria-label="閉じる"
          onClick={() => (specialty === null ? onClose() : setSpecialty(null))}
        >
          ×
        </button>
      </header>

      {specialty === null ? (
        <SpecialtyStep site={site} result={result} onPick={setSpecialty} />
      ) : (
        <FitoutStep
          site={site}
          specialty={specialty}
          cash={cash}
          onBack={() => setSpecialty(null)}
          onOpen={(fitout) => onOpen(specialty, fitout)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 1. 科

function SpecialtyStep({
  site,
  result,
  onPick,
}: {
  site: ClinicSite;
  result: MonthResult;
  onPick: (id: SpecialtyId) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
      <SectionTitle>何科で開くか</SectionTitle>
      <Note>
        市場は<strong>商圏 × 科</strong>で分かれている。
        内科の隣に皮膚科を出しても患者は取り合わない。
        <strong>空いている科を探すのがこの画面の仕事。</strong>
      </Note>

      <div style={{ paddingTop: 'var(--space-3)' }}>
        {SPECIALTIES.map((sp) => {
          const demand = districtDemand(site.districtId, sp.id);
          const rivals =
            result.market.districts.find(
              (d) => d.id === site.districtId && d.specialtyId === sp.id,
            )?.competitors ?? [];
          const empty = rivals.length === 0;

          return (
            <button
              key={sp.id}
              type="button"
              data-testid={`specialty-${sp.id}`}
              onClick={() => onPick(sp.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 'var(--space-2)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                // ★空いている科だけ縁を光らせる。この画面で最初に目に入るべき情報
                border: `1px solid ${empty ? 'var(--positive)' : 'var(--ink-700)'}`,
                background: 'var(--ink-800)',
                color: 'var(--paper)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 'var(--space-2)',
                }}
              >
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>{sp.name}</span>
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: empty ? 'var(--positive)' : 'var(--critical)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {empty ? '競合なし' : `競合 ${rivals.length}軒`}
                </span>
              </div>

              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--paper-mute)',
                  lineHeight: 1.5,
                  marginTop: 2,
                }}
              >
                {sp.character}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Metric label="月の新規" value={`${people(demand)}人`} />
                <Metric label="医師1人あたり" value={`${people(sp.visitsPerDoctorPerDay)}人/日`} />
                <Metric
                  label="設備投資"
                  value={`${compactMan(site.capex * sp.capexMultiplier)}円〜`}
                />
              </div>

              {!empty && (
                <div
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--paper-mute)',
                    marginTop: 4,
                  }}
                >
                  {rivals.map((r) => `${r.name}（強さ ${r.strength}）`).join('・')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {site.initialPatientStock > 0 && (
        <Note>
          承継なので、どの科を選んでも <strong>{people(site.initialPatientStock)}人</strong>
          を引き継ぐ。ただし引き継いだ患者はその科の離脱率で減っていく。
        </Note>
      )}
      <Note>
        ★<strong>科は開院後に変えられない。</strong>
        やり直しが効くと、立地と科を選ぶ判断が軽くなる。
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------- 2. 内装と資金

function FitoutStep({
  site,
  specialty,
  cash,
  onBack,
  onOpen,
}: {
  site: ClinicSite;
  specialty: SpecialtyId;
  cash: number;
  onBack: () => void;
  onOpen: (fitout: FitoutId) => void;
}) {
  const [fitout, setFitout] = useState<FitoutId>('standard');
  const plan = openingPlan(site, specialty, fitout, cash);
  const specialtyName = specialtyOf(specialty).name;

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-4)' }}>
        <SectionTitle>
          {specialtyName}・内装をどうするか
        </SectionTitle>
        <Note>
          内装は<strong>評判の落ち着き先</strong>を決める。
          「開院時に少し高い」ではなく、10年ずっとその高さで釣り合う。
          <strong>科と同じで、開院後に変えられない。</strong>
        </Note>

        <div style={{ paddingTop: 'var(--space-2)' }}>
          {FITOUTS.map((f) => {
            const option = openingPlan(site, specialty, f.id, cash);
            const selected = f.id === fitout;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`fitout-${f.id}`}
                onClick={() => setFitout(f.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${selected ? 'var(--hq-accent)' : 'var(--ink-700)'}`,
                  background: selected ? 'var(--ink-700)' : 'var(--ink-800)',
                  color: 'var(--paper)',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>{f.name}</span>
                  <StarRating value={f.baselineReputation / 20} size={13} />
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--paper-mute)',
                    lineHeight: 1.5,
                    marginTop: 2,
                  }}
                >
                  {f.character}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 'var(--space-2)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  <Metric label="設備投資" value={`${compactMan(option.capex)}円`} />
                  <Metric
                    label="開業融資"
                    value={`${compactMan(option.loan)}円`}
                    tone={option.loan > 0 ? 'warning' : undefined}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <SectionTitle>資金計画</SectionTitle>
        <PlanRow label="設備投資（内装・医療機器）" value={`${man(plan.capex)}万円`} />
        <PlanRow label="運転資金（6ヶ月ぶん）" value={`${man(plan.workingCapital)}万円`} />
        <PlanRow label="自己資金" value={`−${man(plan.ownFunds)}万円`} />
        <PlanRow
          label="開業融資"
          value={`${man(plan.loan)}万円`}
          emphasis
          tone={plan.loan > 0 ? 'warning' : undefined}
        />
        <PlanRow label="開院した直後の手元" value={`${man(plan.cashAfter)}万円`} />
        <Note>
          レセプトの入金は<strong>2ヶ月遅れる</strong>。
          手元に残るのは運転資金だけで、それが尽きる前に患者を集められるかどうか。
          {plan.loan > 0
            ? ' 自己資金では足りないぶんを全部借りる。10年かけて返す。'
            : ' 手元の現金で足りるので、今回は借りない。'}
        </Note>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          paddingBottom: 'calc(var(--space-3) + var(--safe-bottom))',
          background: 'var(--ink-900)',
          borderTop: '1px solid var(--ink-600)',
          boxShadow: '0 -10px 22px rgba(0, 0, 0, 0.5)',
        }}
      >
        <button type="button" className="btn" onClick={onBack} style={{ whiteSpace: 'nowrap' }}>
          科を選び直す
        </button>
        <button
          type="button"
          className="btn btn--primary"
          data-testid="confirm-opening"
          style={{ flex: 1 }}
          onClick={() => onOpen(fitout)}
        >
          この計画で開院する
        </button>
      </div>
    </>
  );
}

function PlanRow({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'warning';
}) {
  return (
    <div
      className="receipt-rule"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
      }}
    >
      <span style={{ fontSize: 'var(--text-label)', color: 'var(--paper-dim)' }}>{label}</span>
      <span
        className="num"
        style={{
          fontSize: emphasis ? 20 : 'var(--text-body)',
          fontWeight: emphasis ? 700 : 500,
          whiteSpace: 'nowrap',
          color: tone ? `var(--${tone})` : 'var(--paper)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'critical' | 'warning';
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="num"
        style={{
          fontSize: 'var(--text-label)',
          color: tone ? `var(--${tone})` : 'var(--paper)',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--paper-dim)' }}>{label}</div>
    </div>
  );
}
