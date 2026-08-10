/**
 * 外の相手の画面（医師会・連携基幹病院・ケアマネ・門前薬局・機器商社・不動産・個人資産）。
 *
 * BuildingScreens.tsx と分けた理由は行数ではなく**性質**。あちらは
 * 「sim の値を読んで並べるだけ」の7枚で、こちらは全て操作卓を持つ。
 * 押した結果が翌月以降の120ヶ月に効くので、読み専用の画面とは注意の払い方が違う。
 *
 * 共通の約束（BuildingScreens.tsx と同じ）：
 * - 計算しない。表示している数字は全て sim から読んだもの（CLAUDE.md §2）
 * - 領域色は ScreenShell が CSS 変数で撒く。ここでは色を直書きしない
 * - 台詞は「今この画面で見るべきものを名指しする」
 */
import {
  CLINICS,
  EQUIPMENT_CATALOG,
  EXECUTIVE_SALARY_MAX,
  EXTERNAL_RELATIONS,
  MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD,
  PERSONAL_ASSETS,
  PHARMACY_INVITE_CAPEX,
  PROPERTY_PRICE,
  emrMigrationOutlook,
  monthLabel,
  monthsToAfford,
  personalNetWorthSeries,
  pharmacyRentSeries,
  relationSeries,
  relationView,
  worstWait,
  type ExternalRelationId,
  type MonthResult,
  type ScreenId,
} from '@med/sim';
import { HeroRow, HeroStat, Note, SectionTitle, StatusPill } from '../../components/Section';
import { StatRow } from '../../components/StatRow';
import { TrendChart } from '../../components/TrendChart';
import { compactMan, man, minutes, people, percent, points } from '../../format';
import type { Body, BuildingScreenProps } from './BuildingScreens';

const SERIES_MONTHS = 24;

/** 操作卓のボタン列。1行に最大2つまで。親指の届く範囲に置く（CLAUDE.md §5） */
function DockRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{children}</div>;
}

// ==================================================================
// 外部関係の3画面。骨格を共有する
//
// 3つとも「毎月活動すると育ち、やめると錆びる」という同じ形なので、
// 画面の骨も共有する。**効き先の説明だけが違う。**
// 形まで変えると、プレイヤーが覚えることが3倍になる。
// ==================================================================

function relationBody(
  id: ExternalRelationId,
  props: BuildingScreenProps,
  parts: {
    greeting: string;
    /** 関係値の下に置く「効き目」の行 */
    effects: React.ReactNode;
    note: React.ReactNode;
    hero: React.ReactNode;
  },
): Body {
  const spec = EXTERNAL_RELATIONS.find((r) => r.id === id)!;
  const view = relationView(props.result, id);
  const values = relationSeries(props.history, id, props.result.month, SERIES_MONTHS);
  const active = view?.active ?? false;

  return {
    greeting: parts.greeting,
    dock: (
      <DockRow>
        <button
          type="button"
          className={active ? 'btn btn--quiet' : 'btn btn--primary'}
          style={{ flex: 1 }}
          onClick={() => props.onDecision?.({ relationActivity: { [id]: !active } })}
        >
          {active ? '活動をやめる' : `活動する（月 ${spec.monthlyCost}万）`}
        </button>
      </DockRow>
    ),
    render: () => (
      <>
        {parts.hero}

        <SectionTitle>関係値の推移</SectionTitle>
        <TrendChart
          series={[
            {
              label: spec.name,
              color: 'var(--screen-accent)',
              values,
              latest: `${points(view?.value ?? 0)}pt`,
            },
          ]}
          fromLabel={monthLabel(Math.max(1, props.result.month - values.length + 1))}
          toLabel={monthLabel(props.result.month)}
        />

        <SectionTitle>効き目</SectionTitle>
        {parts.effects}
        <StatRow label="活動費" value={man(active ? spec.monthlyCost : 0)} unit="万円/月" />
        <Note>{parts.note}</Note>
      </>
    ),
  };
}

const medicalAssociationBody = (props: BuildingScreenProps): Body => {
  const view = relationView(props.result, 'medicalAssociation');
  const value = view?.value ?? 0;
  const contract = props.result.financials.incomeStatement.contractRevenue;
  const opened = CLINICS.filter((c) => props.result.month >= c.openMonth).length;
  const openedThisMonth = CLINICS.some((c) => c.openMonth === props.result.month);

  return relationBody('medicalAssociation', props, {
    greeting: openedThisMonth
      ? '先生のところ、また増やされたそうで。会でも話題になっていましたよ。'
      : contract > 0
        ? `今月の当番、学校健診と合わせて ${man(contract)}万円です。`
        : view?.active
          ? `あと ${points(MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD - value)}pt で当番医の枠が回ってきます。`
          : '最近お顔を見ませんね。',
    hero: (
      <HeroRow>
        <HeroStat label="関係値" value={points(value)} unit="pt" />
        <HeroStat label="受託収入" value={man(contract)} unit="万円" />
        <HeroStat
          label="診察枠"
          value={percent(props.result.expansion.capacityMultiplier)}
          unit="%"
          higherIsBetter={false}
        />
      </HeroRow>
    ),
    effects: (
      <>
        <StatRow
          label={`受託（${MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD}pt 以上で発生）`}
          value={man(contract)}
          unit="万円/月"
          suffix={
            value >= MEDICAL_ASSOCIATION_CONTRACT_THRESHOLD ? (
              <StatusPill text="受託中" tone="positive" />
            ) : (
              <StatusPill text="閾値未満" tone="mute" />
            )
          }
        />
        <StatRow label="開院数" value={opened} unit="院" />
      </>
    ),
    note: (
      <>
        <strong>分院を出すと関係値が落ちる。</strong>
        地域の同業者から見れば、チェーンの分院は競合の出店でしかない。
        拡大そのものがこの数字を削る唯一の相手。
      </>
    ),
  });
};

const referralHospitalBody = (props: BuildingScreenProps): Body => {
  const view = relationView(props.result, 'referralHospital');
  const uplift = props.result.expansion.relations.referralUplift;
  const newPatients = props.result.clinics.reduce((sum, c) => sum + c.newPatients, 0);

  return relationBody('referralHospital', props, {
    greeting: view?.active
      ? (view?.value ?? 0) >= 60
        ? '先生のところなら安心してお願いできます。'
        : `今月も ${people(newPatients)}人ほどお回しできそうです。`
      : '最近は他の先生にお願いすることが増えました。',
    hero: (
      <HeroRow>
        <HeroStat label="連携度" value={points(view?.value ?? 0)} unit="pt" />
        <HeroStat label="新規患者の上乗せ" value={`+${percent(uplift)}`} unit="%" />
        <HeroStat label="今月の新規患者" value={people(newPatients)} unit="人" />
      </HeroRow>
    ),
    effects: (
      <>
        <StatRow label="新規患者ポテンシャルへの係数" value={props.result.expansion.newPatientMultiplier.toFixed(3)} />
        <StatRow label="今月の新規患者" value={people(newPatients)} unit="人" />
      </>
    ),
    note: (
      <>
        評判は落ちるが、<strong>紹介は落ちない。</strong>
        待ち時間で評判が崩れても、連携を続けている限りこの係数は残る。
        崩れた評判を埋められる（埋めきれはしない）唯一の経路。
      </>
    ),
  });
};

const careManagerBody = (props: BuildingScreenProps): Body => {
  const view = relationView(props.result, 'careManager');
  const share = props.result.expansion.relations.homeCareShare;
  const worst = worstWait(props.result);
  const crowded = (worst?.utilization ?? 0) > 1;

  return relationBody('careManager', props, {
    greeting: crowded
      ? `外来が ${minutes(worst?.waitMinutes ?? 0)}分待ちだそうですね。訪問まで手が回りますか。`
      : view?.active
        ? '訪問をお願いできる先生を探していまして。'
        : '最近は別の先生にお願いしています。',
    hero: (
      <HeroRow>
        <HeroStat label="関係値" value={points(view?.value ?? 0)} unit="pt" />
        <HeroStat label="在宅比率" value={percent(share)} unit="%" />
        <HeroStat
          label="自費単価"
          value={`+${percent(props.result.expansion.selfPayMultiplier - 1)}`}
          unit="%"
        />
      </HeroRow>
    ),
    effects: (
      <>
        <StatRow label="在宅比率" value={percent(share)} unit="%" />
        <StatRow label="自費への係数" value={props.result.expansion.selfPayMultiplier.toFixed(3)} />
        <StatRow
          label="診察枠への係数"
          value={props.result.expansion.capacityMultiplier.toFixed(3)}
          suffix={
            crowded ? (
              <StatusPill text="外来が詰まっている" tone="critical" />
            ) : (
              <StatusPill text="余力あり" tone="positive" />
            )
          }
        />
        <StatRow
          label="最も混んでいる院の稼働率"
          value={percent(worst?.utilization ?? 0, 0)}
          unit="%"
          total
        />
      </>
    ),
    note: (
      <>
        <strong>同じ操作が状況で逆に働く。</strong>
        外来が空いているうちは在宅が単価を押し上げるが、稼働率が 100% を超えている
        ときに在宅を増やすと、待ち時間が伸びて評判が落ちる。上の稼働率を先に見ること。
      </>
    ),
  });
};

// ==================================================================
// 門前薬局
// ==================================================================

const pharmacyBody = (props: BuildingScreenProps): Body => {
  const tick = props.result.expansion.pharmacy;
  const invited = tick.pharmacies.filter((p) => p.invited);
  const next = tick.pharmacies.find(
    (p) => !p.invited && CLINICS.some((c) => c.id === p.clinicId && props.result.month >= c.openMonth),
  );
  const values = pharmacyRentSeries(props.history, props.result.month, SERIES_MONTHS);
  const lastYear = props.history[props.result.month - 13]?.expansion.pharmacy.rentalRevenue;

  return {
    greeting:
      lastYear !== undefined && lastYear > tick.rentalRevenue
        ? '処方箋が減っていますね。歩合の分が下がります。'
        : next
          ? `${next.clinicName}の隣、まだ空いていますよ。`
          : `今月の賃料は ${man(tick.rentalRevenue)}万円です。`,
    dock: next ? (
      <DockRow>
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          onClick={() => props.onDecision?.({ invitePharmacy: [next.clinicId] })}
        >
          {next.clinicName}に誘致する（{compactMan(PHARMACY_INVITE_CAPEX)}円）
        </button>
      </DockRow>
    ) : undefined,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="今月の賃料" value={man(tick.rentalRevenue)} unit="万円" />
          <HeroStat label="誘致した院" value={String(invited.length)} unit="件" />
          <HeroStat label="一時金" value={compactMan(PHARMACY_INVITE_CAPEX)} unit="円" />
        </HeroRow>

        {values.some((v) => v > 0) && (
          <>
            <SectionTitle>賃料の推移</SectionTitle>
            <TrendChart
              series={[
                {
                  label: '賃料収入',
                  color: 'var(--screen-accent)',
                  values,
                  latest: `${man(tick.rentalRevenue)}万円`,
                },
              ]}
              fromLabel={monthLabel(Math.max(1, props.result.month - values.length + 1))}
              toLabel={monthLabel(props.result.month)}
            />
          </>
        )}

        <SectionTitle>院ごとの状況</SectionTitle>
        {tick.pharmacies.map((p) => (
          <StatRow
            key={p.clinicId}
            label={p.clinicName}
            value={man(p.rent)}
            unit="万円/月"
            suffix={
              p.invited ? (
                <StatusPill text={`${monthLabel(p.invitedAtMonth ?? 1)} 誘致`} tone="positive" />
              ) : (
                <StatusPill text="空き" tone="mute" />
              )
            }
          />
        ))}
        <StatRow label="賃料収入 合計" value={man(tick.rentalRevenue)} unit="万円/月" total />
        <Note>
          賃料は<strong>定額 ＋ 患者数の歩合</strong>。完全な固定収入にすると
          「開院したら必ず誘致」が最適解になって判断が消える。
          患者が育つ前に誘致すると、一時金の回収が遅れる。
        </Note>
      </>
    ),
  };
};

// ==================================================================
// システム・機器商社。3タブ
// ==================================================================

const vendorBody = (props: BuildingScreenProps): Body => {
  const v = props.result.expansion.vendor;
  const outlook = emrMigrationOutlook(props.history, props.result.month);
  const nextTier = outlook.find((o) => !o.current && o.tier !== 'single') ?? outlook[0]!;
  const broken = v.equipment.filter((e) => e.broken);
  const buyable = EQUIPMENT_CATALOG.find((e) => !v.equipment.find((x) => x.id === e.id)?.owned);

  return {
    greeting:
      broken.length > 0
        ? `保守に入っていないので、${broken[0]!.name}の部品の取り寄せに時間がかかります。`
        : v.emrTier === null
          ? `カルテの移行、今年やるなら ${man(nextTier.costNow)}万円です。来年だと ${man(nextTier.costIn12Months)}万円になります。`
          : '新しい機種のカタログをお持ちしました。',
    tabs: [
      { id: 'emr', label: '電子カルテ', icon: <span style={{ display: 'block', width: 26, height: 26 }} /> },
      { id: 'equipment', label: '医療機器', icon: <span style={{ display: 'block', width: 26, height: 26 }} /> },
      { id: 'ai', label: 'AI', icon: <span style={{ display: 'block', width: 26, height: 26 }} /> },
    ],
    // 操作卓はタブごとに変える。カルテのタブに機器の購入ボタンが出ていると、
    // 何を決めている画面なのかが毎回ぼやける
    dock: (tab: string) => {
      if (tab === 'equipment') {
        if (buyable === undefined) {
          return (
            <DockRow>
              <button
                type="button"
                className={v.maintenanceContract ? 'btn btn--quiet' : 'btn btn--primary'}
                style={{ flex: 1 }}
                onClick={() =>
                  props.onDecision?.({ maintenanceContract: !v.maintenanceContract })
                }
              >
                {v.maintenanceContract ? '保守契約を切る' : '保守契約に入る'}
              </button>
            </DockRow>
          );
        }
        return (
          <DockRow>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => props.onDecision?.({ buyEquipment: [{ id: buyable.id, lease: true }] })}
            >
              {buyable.name}をリース
            </button>
            <button
              type="button"
              className="btn btn--primary"
              style={{ flex: 1 }}
              onClick={() => props.onDecision?.({ buyEquipment: [{ id: buyable.id }] })}
            >
              {buyable.name}を購入
            </button>
          </DockRow>
        );
      }
      if (tab === 'ai') {
        const pending = v.aiTools.filter((t) => !t.adopted);
        if (pending.length === 0) return undefined;
        return (
          <DockRow>
            {pending.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn btn--primary"
                style={{ flex: 1 }}
                onClick={() => props.onDecision?.({ adoptAiTools: [t.id] })}
              >
                {t.name}を入れる
              </button>
            ))}
          </DockRow>
        );
      }
      if (v.migrating) return undefined;
      return (
        <DockRow>
          {outlook
            .filter((o) => !o.current)
            .map((o) => (
              <button
                key={o.tier}
                type="button"
                className={o.tier === 'chain' ? 'btn btn--primary' : 'btn'}
                style={{ flex: 1 }}
                onClick={() => props.onDecision?.({ migrateEmr: o.tier })}
              >
                {o.tierName}
              </button>
            ))}
        </DockRow>
      );
    },
    render: (tab) => {
      if (tab === 'equipment') {
        return (
          <>
            <HeroRow>
              <HeroStat label="自費の上乗せ" value={`+${percent(v.equipmentSelfPayUplift)}`} unit="%" />
              <HeroStat label="リース料" value={man(v.leaseExpense)} unit="万円" />
              <HeroStat
                label="故障中"
                value={String(broken.length)}
                unit="台"
                tone={broken.length > 0 ? 'critical' : undefined}
              />
            </HeroRow>

            <SectionTitle>保有機器</SectionTitle>
            {v.equipment.map((e) => (
              <StatRow
                key={e.id}
                label={e.name}
                value={e.owned ? (e.leased ? 'リース' : man(e.bookValue)) : '—'}
                unit={e.owned && !e.leased ? '万円' : undefined}
                suffix={
                  !e.owned ? (
                    <StatusPill text={`${man(e.price)}万`} tone="mute" />
                  ) : e.broken ? (
                    <StatusPill text={`故障 〜${monthLabel(e.repairedAtMonth ?? 1)}`} tone="critical" />
                  ) : (
                    <StatusPill text={`自費 +${percent(e.selfPayUplift, 0)}%`} tone="positive" />
                  )
                }
              />
            ))}

            <SectionTitle>保守契約</SectionTitle>
            <StatRow
              label="加入状況"
              value={v.maintenanceContract ? '加入' : '未加入'}
              suffix={
                v.maintenanceContract ? (
                  <StatusPill text="故障しない" tone="positive" />
                ) : (
                  <StatusPill text="故障する" tone="warning" />
                )
              }
            />
            <StatRow label="月額（カルテ・AI・保守・リース）" value={man(v.recurringCost)} unit="万円" total />
            <Note>
              <strong>機器は診察枠を増やさない。自費収入だけを増やす。</strong>
              枠を増やす手段（医師・AI）と効き先を分けないと、
              「とりあえず全部買う」が最適解になって判断が消える。
              保守を切って故障すると、この上乗せを半年失う。
            </Note>
          </>
        );
      }

      if (tab === 'ai') {
        return (
          <>
            <HeroRow>
              <HeroStat label="1人1日あたり" value={`+${v.extraVisitsPerDoctorPerDay}`} unit="人" />
              <HeroStat label="常勤医" value={String(props.result.staff.doctorsTotal)} unit="名" />
              <HeroStat label="加算の合計" value={`+${percent(props.result.fee.addonTotal)}`} unit="%" />
            </HeroRow>

            <SectionTitle>導入状況</SectionTitle>
            {v.aiTools.map((t) => (
              <StatRow
                key={t.id}
                label={t.name}
                value={`+${t.visitsPerDoctorPerDayBonus}`}
                unit="人/日"
                suffix={
                  t.adopted ? (
                    <StatusPill text="導入済み" tone="positive" />
                  ) : (
                    <StatusPill text={`${man(t.upfrontCost)}万`} tone="mute" />
                  )
                }
              />
            ))}
            <Note>
              ★<strong>AI は枠を増やすが、施設基準の医師数には数えない。</strong>
              常勤医1名は +32人/日 かつ施設基準を満たす。AI は +3〜4人/日 で基準は満たさない。
              安く捌けるようになったのに点数は上がらない、という歪みがこの機能の存在理由。
            </Note>
          </>
        );
      }

      return (
        <>
          <HeroRow>
            <HeroStat label="現在のカルテ" value={v.emrTierName} />
            <HeroStat
              label="移行中の枠低下"
              value={v.migrating ? `−${percent(v.migrationCapacityPenalty, 0)}` : '—'}
              unit={v.migrating ? '%' : undefined}
              tone={v.migrating ? 'warning' : undefined}
            />
            <HeroStat label="残り" value={v.migrating ? String(v.migrationMonthsLeft) : '—'} unit={v.migrating ? 'ヶ月' : undefined} />
          </HeroRow>

          <SectionTitle>いま移行するといくらか</SectionTitle>
          {outlook.map((o) => (
            <StatRow
              key={o.tier}
              label={o.tierName}
              value={man(o.costNow)}
              unit="万円"
              suffix={
                o.current ? (
                  <StatusPill text="現行" tone="positive" />
                ) : o.penaltyMonths === 0 ? (
                  <StatusPill text="移行の痛み無し" tone="mute" />
                ) : (
                  <StatusPill text={`枠 −${percent(o.capacityPenalty, 0)}% × ${o.penaltyMonths}ヶ月`} tone="warning" />
                )
              }
            />
          ))}

          <SectionTitle>1年待つと</SectionTitle>
          {outlook.map((o) => (
            <StatRow
              key={o.tier}
              label={o.tierName}
              value={man(o.costIn12Months)}
              unit="万円"
              compare={man(o.costNow)}
            />
          ))}
          <StatRow label={`待つことの代償（${nextTier.tierName}）`} value={man(nextTier.costOfWaiting)} unit="万円" total />

          <Note>
            ★<strong>カルテ移行は、自分で起こす医師不足。</strong>
            枠が落ちる → 待ち時間 → 評判 → 1年後に患者ストック、という
            検証済みの経路をそのまま通る。違うのは自分で選ぶ災害であること。
            移行費用は患者データ量に比例するので、<strong>待つほど高くつく。</strong>
          </Note>
        </>
      );
    },
  };
};

// ==================================================================
// 不動産
// ==================================================================

const realEstateBody = (props: BuildingScreenProps): Body => {
  const estate = props.result.expansion.realEstate;
  const cash = props.result.financials.balanceSheet.cash;
  const next = estate.properties.find(
    (p) => !p.owned && CLINICS.some((c) => c.id === p.clinicId && props.result.month >= c.openMonth),
  );
  // 買った後だけでなく、買う前から回収年数を出す。判断に使えなければ意味が無い
  const payback = estate.properties[0]?.paybackYears ?? null;
  const shortfall = next ? PROPERTY_PRICE - cash : 0;

  return {
    greeting:
      next && shortfall > 0
        ? `${man(shortfall)}万円足りませんね。銀行と相談されてはいかがです。`
        : next
          ? `${next.clinicName}の物件、オーナーが手放したいそうです。`
          : '家賃のご心配が要らないのは強いですよ。',
    dock: next ? (
      <DockRow>
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          disabled={shortfall > 0}
          onClick={() => props.onDecision?.({ buyProperty: [next.clinicId] })}
        >
          {next.clinicName}の物件を取得（{compactMan(PROPERTY_PRICE)}円）
        </button>
      </DockRow>
    ) : undefined,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="消えた家賃" value={man(estate.rentSaved)} unit="万円" />
          <HeroStat label="物件の簿価" value={compactMan(estate.bookValue)} unit="円" />
          <HeroStat
            label="回収年数"
            value={payback === null ? '—' : payback.toFixed(1)}
            unit={payback === null ? undefined : '年'}
            higherIsBetter={false}
          />
        </HeroRow>

        <SectionTitle>院ごとの状況</SectionTitle>
        {estate.properties.map((p) => (
          <StatRow
            key={p.clinicId}
            label={p.clinicName}
            value={p.owned ? man(p.bookValue) : man(PROPERTY_PRICE)}
            unit="万円"
            suffix={
              p.owned ? (
                <StatusPill text={`${monthLabel(p.ownedSinceMonth ?? 1)} 取得`} tone="positive" />
              ) : (
                <StatusPill text="テナント" tone="mute" />
              )
            }
          />
        ))}

        <SectionTitle>現金との見合い</SectionTitle>
        <StatRow label="手元現金" value={man(cash)} unit="万円" />
        <StatRow label="物件価格" value={man(PROPERTY_PRICE)} unit="万円" />
        <StatRow
          label="不足額"
          value={man(Math.max(0, shortfall))}
          unit="万円"
          total
          suffix={
            shortfall > 0 ? (
              <StatusPill text="買えない" tone="critical" />
            ) : (
              <StatusPill text="買える" tone="positive" />
            )
          }
        />
        <Note>
          現金 {compactMan(PROPERTY_PRICE)}円を今出して、
          月 {man(estate.properties[0]?.rentIfOwned ?? 0)}万円の家賃を永久に止める。
          回収年数は<strong>単純な割り算</strong>で、値上がり益も割引現在価値も見ない。
          見せかけの精度を足さない。売却は実装していない。
        </Note>
      </>
    ),
  };
};

// ==================================================================
// 個人資産
// ==================================================================

const personalWealthBody = (props: BuildingScreenProps): Body => {
  const p = props.result.expansion.personal;
  const values = personalNetWorthSeries(props.history, props.result.month, SERIES_MONTHS);
  const loss = props.result.financials.incomeStatement.netIncome < 0;

  return {
    greeting: loss
      ? '法人が赤字です。報酬を下げるという手もあります。'
      : p.salary === 0
        ? '役員報酬を取っていらっしゃいませんね。'
        : `先生の個人口座は ${man(p.cash)}万円です。`,
    dock: (
      <DockRow>
        <button
          type="button"
          className="btn"
          style={{ flex: 1 }}
          disabled={p.salary <= 0}
          onClick={() => props.onDecision?.({ executiveSalary: Math.max(0, p.salary - 50) })}
        >
          報酬 −50万
        </button>
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          disabled={p.salary >= EXECUTIVE_SALARY_MAX}
          onClick={() =>
            props.onDecision?.({
              executiveSalary: Math.min(EXECUTIVE_SALARY_MAX, p.salary + 50),
            })
          }
        >
          報酬 +50万
        </button>
      </DockRow>
    ),
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="個人資産" value={compactMan(p.netWorth)} unit="円" />
          <HeroStat label="手取り" value={man(p.netSalary)} unit="万円" />
          <HeroStat label="累計報酬" value={compactMan(p.cumulativeSalary)} unit="円" />
        </HeroRow>

        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-body)',
            color: 'var(--screen-accent)',
            padding: 'var(--space-2) 0 var(--space-4)',
          }}
        >
          {p.rank}
        </div>

        {values.some((v) => v > 0) && (
          <>
            <SectionTitle>個人資産の推移</SectionTitle>
            <TrendChart
              series={[
                {
                  label: '個人資産',
                  color: 'var(--screen-accent)',
                  values,
                  latest: `${compactMan(p.netWorth)}円`,
                },
              ]}
              fromLabel={monthLabel(Math.max(1, props.result.month - values.length + 1))}
              toLabel={monthLabel(props.result.month)}
            />
          </>
        )}

        <SectionTitle>役員報酬</SectionTitle>
        <StatRow label={`月額（上限 ${EXECUTIVE_SALARY_MAX}万）`} value={man(p.salary)} unit="万円" />
        <StatRow label="税・社会保険を引いた手取り" value={man(p.netSalary)} unit="万円" />
        <StatRow label="個人の現金" value={man(p.cash)} unit="万円" total />

        <SectionTitle>買えるもの</SectionTitle>
        {PERSONAL_ASSETS.map((spec) => {
          const owned = p.assets.find((a) => a.id === spec.id)?.owned ?? false;
          const wait = monthsToAfford(spec.price, p.cash, p.netSalary);
          return (
            <StatRow
              key={spec.id}
              label={`${spec.name}（${spec.note}）`}
              value={compactMan(spec.price)}
              unit="円"
              suffix={
                owned ? (
                  <StatusPill text="所有" tone="positive" />
                ) : wait === 0 ? (
                  <button
                    type="button"
                    className="btn btn--link"
                    onClick={() => props.onDecision?.({ buyPersonalAssets: [spec.id] })}
                  >
                    買う
                  </button>
                ) : (
                  <StatusPill text={wait === null ? '手が届かない' : `あと${wait}ヶ月`} tone="mute" />
                )
              }
            />
          );
        })}
        <Note>
          ★<strong>ここで買ったものは、法人の数字に一切効かない。</strong>
          「クルーザーを買うと医師会での評判が上がる」は書ける。書かない理由は1つで、
          嘘の因果ができるから。見栄レイヤーは進捗を測る物差しであって、意思決定ではない。
        </Note>
      </>
    ),
  };
};

export const PARTNER_BODIES: Partial<Record<ScreenId, (props: BuildingScreenProps) => Body>> = {
  medicalAssociation: medicalAssociationBody,
  referralHospital: referralHospitalBody,
  careManager: careManagerBody,
  pharmacy: pharmacyBody,
  vendor: vendorBody,
  realEstate: realEstateBody,
  personalWealth: personalWealthBody,
};

export type { MonthResult };
