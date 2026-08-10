/**
 * 開院画面。docs/spec/05-specialty.md §7
 *
 * ★この画面がこのゲームでいちばん判断の密度が高い。
 * 立地は選んだあと。ここで決めるのは**科**で、市場のセグメントは（商圏 × 科）なので、
 * 「この商圏でこの科は空いているか」が全て。
 *
 * だから **「競合が居ない」をいちばん目立たせる。** 需要の数字より先に目に入ること。
 */
import {
  SPECIALTIES,
  districtDemand,
  districtNameOf,
  type ClinicSite,
  type MonthResult,
  type SpecialtyId,
} from '@med/sim';
import { Note, SectionTitle } from '../../components/Section';
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
  onOpen: (specialty: SpecialtyId) => void;
  onClose: () => void;
}) {
  const districtName = districtNameOf(site.districtId);

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
          height: 'var(--header-height)',
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
          onClick={onClose}
        >
          ×
        </button>
      </header>

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
            const capex = site.capex * sp.capexMultiplier;
            const affordable = capex <= cash;
            const empty = rivals.length === 0;

            return (
              <button
                key={sp.id}
                type="button"
                data-testid={`specialty-${sp.id}`}
                disabled={!affordable}
                onClick={() => onOpen(sp.id)}
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
                  opacity: affordable ? 1 : 0.45,
                  cursor: affordable ? 'pointer' : 'default',
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
                    value={`${compactMan(capex)}円`}
                    tone={affordable ? undefined : 'critical'}
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
                {!affordable && (
                  <div
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--critical)',
                      marginTop: 4,
                    }}
                  >
                    {man(capex - cash)}万円 足りない
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
  tone?: 'critical';
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
