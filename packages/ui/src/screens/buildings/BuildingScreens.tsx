/**
 * 建物の画面（本社・経理・人事・医局・紹介会社・看護学校・銀行・厚生局）。
 *
 * 8枚まとめて1ファイルにしてある。どれも「sim の既存の値を読んで並べるだけ」で、
 * 画面ごとの固有ロジックが薄いため。**固有の仕掛けを持つ画面（診療所・マップ）は
 * 別ファイル。** ここが太り始めたら、その画面は分けるべきという合図。
 *
 * 共通の約束：
 * - 計算しない。表示している数字は全て sim から読んだもの（CLAUDE.md §2）
 * - 領域色は ScreenShell が CSS 変数で撒く。ここでは色を直書きしない
 * - 台詞は「今この画面で見るべきものを名指しする」
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ADDONS,
  AGENCY_FEE_PER_DOCTOR,
  FEE_REVISIONS,
  NURSES_PER_DOCTOR,
  NURSE_MARKET_HIRES_PER_MONTH,
  RELATION_PER_IGYOKU_SLOT,
  SCHOOL_CLASS_SIZE,
  clinicSummaries,
  deriveGroupTotals,
  eventsForScreen,
  monthLabel,
  schoolStatus,
  totalDebt,
  totalPatientStock,
  type MonthDecision,
  type MonthResult,
  type ScreenId,
} from '@med/sim';
import { PARTNER_BODIES } from './PartnerScreens';
import { HeroRow, HeroStat, Note, SectionTitle, StatusPill } from '../../components/Section';
import { ScreenShell, type ShellTab } from '../../components/ScreenShell';
import { StatRow } from '../../components/StatRow';
import { BuildingBand } from '../../components/BuildingBand';
import { compactMan, man, people, percent, points } from '../../format';
import { buildingOf } from '../registry';

export interface BuildingScreenProps {
  screen: ScreenId;
  result: MonthResult;
  previous: MonthResult | null;
  history: MonthResult[];
  onClose: () => void;
  /**
   * 表示中の月の意思決定を書き換える。以後の月にも効く（意思決定は据え置きが既定）。
   * 読み専用の画面（本社・経理など）は使わない。
   */
  onDecision?: (patch: Partial<MonthDecision>) => void;
}

/** 建物画面の入口。ScreenShell を被せて中身を差し込む */
export function BuildingScreen(props: BuildingScreenProps) {
  const meta = buildingOf(props.screen);
  if (!meta) return null;
  const body = BODIES[props.screen] ?? PARTNER_BODIES[props.screen];
  if (!body) return null;
  const { greeting, tabs, render, dock } = body(props);

  return (
    <ScreenShellWithTabs
      meta={meta}
      greeting={greeting}
      tabs={tabs}
      dock={dock}
      onClose={props.onClose}
      render={render}
      screen={props.screen}
      result={props.result}
    />
  );
}

function ScreenShellWithTabs({
  meta,
  greeting,
  tabs,
  dock,
  onClose,
  render,
  screen,
  result,
}: {
  meta: NonNullable<ReturnType<typeof buildingOf>>;
  greeting: string;
  tabs: ShellTab[] | undefined;
  dock: ReactNode | ((tab: string) => ReactNode);
  onClose: () => void;
  render: (activeTab: string) => ReactNode;
  screen: ScreenId;
  result: MonthResult;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.id ?? '');
  const events = eventsForScreen(result, screen);
  return (
    <ScreenShell
      domain={meta.domain}
      title={meta.name}
      subtitle={`${monthLabel(result.month)}　${meta.address}`}
      icon={<img src={meta.icon} alt="" width={36} height={36} style={{ display: 'block' }} />}
      illustration={<BuildingBand icon={meta.icon} />}
      greeting={greeting}
      tabs={tabs}
      activeTabId={tab}
      onTabChange={setTab}
      dock={typeof dock === 'function' ? dock(tab) : dock}
      onClose={onClose}
    >
      {render(tab)}
      {events.length > 0 && (
        <>
          <SectionTitle>今月の通知</SectionTitle>
          {events.map((e) => (
            <div key={e.id} className="receipt-rule" style={{ padding: 'var(--space-3) 0' }}>
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
      <div style={{ height: 'var(--space-6)' }} />
    </ScreenShell>
  );
}

export interface Body {
  greeting: string;
  tabs?: ShellTab[];
  /**
   * 操作卓。ScreenShell が下タブのすぐ上へ固定で置く。
   * タブごとに操作が変わる画面（商社）は関数で渡す。
   */
  dock?: ReactNode | ((tab: string) => ReactNode);
  render: (tab: string) => ReactNode;
}

const textTab = (id: string, label: string): ShellTab => ({
  id,
  label,
  icon: <span style={{ display: 'block', width: 26, height: 26 }} />,
});

// ==================================================================
// 本社
// ==================================================================

const hqBody = ({ result, previous }: BuildingScreenProps): Body => {
  const totals = deriveGroupTotals(result);
  const bs = result.financials.balanceSheet;
  const stock = totalPatientStock(result);
  const open = clinicSummaries(result).filter((c) => c.open);
  return {
    greeting:
      bs.totalEquity < 0
        ? `純資産が ${compactMan(bs.totalEquity)}円。債務超過です。まず銀行と経理を見てください。`
        : bs.cash < 0
          ? `現金が ${compactMan(bs.cash)}円です。黒字でも未収金が2ヶ月ぶん寝ています。`
          : `${open.length}院で ${people(stock)}人を診ています。`,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="通院患者" value={people(stock)} unit="人" />
          <HeroStat
            label="現金"
            value={compactMan(bs.cash)}
            unit="円"
            tone={bs.cash < 0 ? 'critical' : undefined}
          />
          <HeroStat
            label="純資産"
            value={compactMan(bs.totalEquity)}
            unit="円"
            tone={bs.totalEquity < 0 ? 'critical' : undefined}
          />
        </HeroRow>

        <SectionTitle>今月の全社</SectionTitle>
        <StatRow label="診療収入" value={man(totals.clinicRevenue)} unit="万円" />
        <StatRow label="学費収入" value={man(totals.tuitionRevenue)} unit="万円" />
        <StatRow label="診療所の営業利益" value={man(totals.clinicOperatingIncome)} unit="万円" />
        <StatRow label="学校の収支" value={man(totals.schoolOperatingIncome)} unit="万円" />
        <StatRow label="本部費" value={man(-totals.hqCost)} unit="万円" />
        <StatRow
          label="営業利益"
          value={man(totals.operatingIncome)}
          unit="万円"
          total
          compare={previous ? man(deriveGroupTotals(previous).operatingIncome) : undefined}
        />
        <Note>
          この営業利益は検証モデルの定義で、<strong>本部費・金利・減価償却を含まない</strong>。
          発生主義の営業利益は経理で見る。
        </Note>

        <SectionTitle>体制</SectionTitle>
        <StatRow label="開院数" value={open.length} unit="院" />
        <StatRow label="常勤医" value={result.staff.doctorsTotal} unit="名" />
        <StatRow label="看護師" value={result.staff.nurses.toFixed(1)} unit="名" />
        <StatRow label="有利子負債" value={man(totalDebt(result))} unit="万円" total />
      </>
    ),
  };
};

// ==================================================================
// 経理 — 三表
// ==================================================================

const accountingBody = ({ result, previous }: BuildingScreenProps): Body => {
  const is = result.financials.incomeStatement;
  const bs = result.financials.balanceSheet;
  const cf = result.financials.cashFlow;
  const prevIs = previous?.financials.incomeStatement;
  const gap = bs.totalAssets - (bs.totalLiabilities + bs.totalEquity);

  return {
    greeting:
      bs.totalEquity < 0
        ? '債務超過です。資産計上しても純資産が戻っていません。'
        : bs.cash < 0
          ? '黒字でも現金がありません。未収金が2ヶ月ぶん寝ています。'
          : 'こちらが今月の三表です。',
    tabs: [textTab('pl', '損益'), textTab('bs', '貸借'), textTab('cf', '資金')],
    render: (tab) => {
      if (tab === 'bs') {
        return (
          <>
            <HeroRow>
              <HeroStat label="総資産" value={compactMan(bs.totalAssets)} unit="円" />
              <HeroStat
                label="負債"
                value={compactMan(bs.totalLiabilities)}
                unit="円"
              />
              <HeroStat
                label="純資産"
                value={compactMan(bs.totalEquity)}
                unit="円"
                tone={bs.totalEquity < 0 ? 'critical' : undefined}
              />
            </HeroRow>

            <SectionTitle>資産</SectionTitle>
            <StatRow label="現金" value={man(bs.cash)} unit="万円" />
            <StatRow label="医業未収金" value={man(bs.accountsReceivable)} unit="万円" />
            <StatRow label="医療機器" value={man(bs.fixedAssetsByClass.medicalEquipment)} unit="万円" />
            <StatRow label="内装" value={man(bs.fixedAssetsByClass.interior)} unit="万円" />
            <StatRow label="校舎" value={man(bs.fixedAssetsByClass.building)} unit="万円" />
            <StatRow label="資産合計" value={man(bs.totalAssets)} unit="万円" total />
            <Note>
              医業未収金は保険診療収入の<strong>2ヶ月ぶん</strong>。
              レセプトは翌月10日提出・翌々月入金なので、常にこれだけ寝ている。
            </Note>

            <SectionTitle>負債・純資産</SectionTitle>
            <StatRow label="短期借入" value={man(bs.shortTermDebt)} unit="万円" />
            <StatRow label="長期借入" value={man(bs.longTermDebt)} unit="万円" />
            <StatRow label="資本金" value={man(bs.paidInCapital)} unit="万円" />
            <StatRow label="利益剰余金" value={man(bs.retainedEarnings)} unit="万円" />
            <StatRow
              label="負債・純資産合計"
              value={man(bs.totalLiabilities + bs.totalEquity)}
              unit="万円"
              total
            />
            <Note>
              貸借差額 {gap.toFixed(2)} 万円。
              <strong>ここが 0 でなければ会計の実装が壊れている</strong>（assertBalanced）。
            </Note>
          </>
        );
      }

      if (tab === 'cf') {
        return (
          <>
            <HeroRow>
              <HeroStat
                label="営業CF"
                value={man(cf.operatingCashFlow)}
                unit="万"
                tone={cf.operatingCashFlow < 0 ? 'negative' : undefined}
              />
              <HeroStat label="投資CF" value={man(cf.investingCashFlow)} unit="万" />
              <HeroStat label="財務CF" value={man(cf.financingCashFlow)} unit="万" />
            </HeroRow>

            <SectionTitle>営業活動</SectionTitle>
            <StatRow label="当期純利益" value={man(cf.netIncome)} unit="万円" />
            <StatRow label="減価償却費" value={man(cf.depreciation)} unit="万円" />
            <StatRow label="未収金の増減" value={man(-cf.changeInReceivables)} unit="万円" />
            <StatRow label="営業キャッシュフロー" value={man(cf.operatingCashFlow)} unit="万円" total />

            <SectionTitle>投資・財務</SectionTitle>
            <StatRow label="設備投資" value={man(cf.capitalExpenditure)} unit="万円" />
            <StatRow label="新規借入" value={man(cf.newBorrowing)} unit="万円" />
            <StatRow label="元金返済" value={man(cf.principalRepayment)} unit="万円" />
            <StatRow label="現金の増減" value={man(cf.netChangeInCash)} unit="万円" />
            <StatRow label="期末現金" value={man(cf.cashAtEnd)} unit="万円" total />
          </>
        );
      }

      return (
        <>
          <HeroRow>
            <HeroStat label="収益" value={man(is.totalRevenue)} unit="万" />
            <HeroStat
              label="営業利益"
              value={man(is.operatingIncome)}
              unit="万"
              tone={is.operatingIncome < 0 ? 'negative' : undefined}
            />
            <HeroStat
              label="純利益"
              value={man(is.netIncome)}
              unit="万"
              tone={is.netIncome < 0 ? 'negative' : undefined}
            />
          </HeroRow>

          <SectionTitle>収益</SectionTitle>
          <StatRow
            label="保険診療収入"
            value={man(is.insuranceRevenue)}
            unit="万円"
            compare={prevIs ? man(prevIs.insuranceRevenue) : undefined}
          />
          <StatRow label="自費診療収入" value={man(is.selfPayRevenue)} unit="万円" />
          <StatRow label="学費収入" value={man(is.tuitionRevenue)} unit="万円" />
          <StatRow label="収益合計" value={man(is.totalRevenue)} unit="万円" total />

          <SectionTitle>費用</SectionTitle>
          <StatRow label="医薬品・材料費" value={man(is.medicalSupplies)} unit="万円" />
          <StatRow label="医師人件費" value={man(is.doctorPayroll)} unit="万円" />
          <StatRow label="看護師人件費" value={man(is.nursePayroll)} unit="万円" />
          <StatRow label="地代家賃・院の固定費" value={man(is.rent)} unit="万円" />
          <StatRow label="減価償却費" value={man(is.depreciation)} unit="万円" />
          <StatRow label="学校運営費" value={man(is.schoolOperating)} unit="万円" />
          <StatRow label="紹介会社手数料" value={man(is.agencyFees)} unit="万円" />
          <StatRow label="医局関係維持費" value={man(is.igyokuRelationCost)} unit="万円" />
          <StatRow label="本部費" value={man(is.headquarters)} unit="万円" />
          <StatRow label="費用合計" value={man(is.totalExpenses)} unit="万円" total />

          <SectionTitle>利益</SectionTitle>
          <StatRow label="営業利益" value={man(is.operatingIncome)} unit="万円" />
          <StatRow label="支払利息" value={man(is.interestExpense)} unit="万円" />
          <StatRow label="経常利益" value={man(is.ordinaryIncome)} unit="万円" />
          <StatRow label="法人税" value={man(is.tax)} unit="万円" />
          <StatRow label="当期純利益" value={man(is.netIncome)} unit="万円" total />
          <Note>
            繰越欠損金は未モデル化。赤字の月は税0、黒字の月はその月だけで課税している。
          </Note>
        </>
      );
    },
  };
};

// ==================================================================
// 人事
// ==================================================================

const personnelBody = ({ result }: BuildingScreenProps): Body => {
  const staff = result.staff;
  const is = result.financials.incomeStatement;
  const summaries = clinicSummaries(result);
  return {
    greeting:
      staff.doctorShortfall
        ? '配置したい常勤医が調達枠を超えています。医局か紹介会社へ。'
        : staff.nurseSufficiency < 1
          ? `看護師の充足率が ${percent(staff.nurseSufficiency)}%。診察枠がそのぶん絞られています。`
          : '人員は充足しています。',
    tabs: [textTab('doctors', '医師'), textTab('nurses', '看護師')],
    render: (tab) => {
      if (tab === 'nurses') {
        return (
          <>
            <HeroRow>
              <HeroStat label="在籍" value={staff.nurses.toFixed(1)} unit="名" />
              <HeroStat label="必要" value={staff.nursesRequired.toFixed(1)} unit="名" />
              <HeroStat
                label="充足率"
                value={percent(staff.nurseSufficiency)}
                unit="%"
                tone={staff.nurseSufficiency < 0.9 ? 'critical' : staff.nurseSufficiency < 1 ? 'warning' : undefined}
              />
            </HeroRow>

            <SectionTitle>今月の増減</SectionTitle>
            <StatRow label="市場からの採用" value={staff.nursesFromMarket.toFixed(2)} unit="名" />
            <StatRow label="自校の卒業生" value={staff.nursesFromSchool.toFixed(1)} unit="名" />
            <StatRow label="人件費" value={man(is.nursePayroll)} unit="万円" total />
            <Note>
              市場からは月に <strong>{NURSE_MARKET_HIRES_PER_MONTH.toFixed(1)}人</strong>しか採れない。
              必要数は常勤医1名につき {NURSES_PER_DOCTOR} 名なので、
              <strong>分院を開けた月は必ず充足率が落ちる</strong>。
            </Note>

            <SectionTitle>充足率が効く先</SectionTitle>
            <StatRow label="実効枠 ＝ 診察枠 × 充足率" value={percent(staff.nurseSufficiency)} unit="%" />
            <Note>充足率は全社ひとつ。どこか1院が薄まると全院の枠が同じだけ絞られる。</Note>
          </>
        );
      }

      return (
        <>
          <HeroRow>
            <HeroStat label="常勤医" value={String(staff.doctorsTotal)} unit="名" />
            <HeroStat label="調達可能" value={String(staff.doctorsProcurable)} unit="名" />
            <HeroStat
              label="医局の枠"
              value={String(staff.igyokuSlots)}
              unit="枠"
            />
          </HeroRow>

          <SectionTitle>院別の配置</SectionTitle>
          {summaries.map((c) => (
            <StatRow
              key={c.id}
              label={c.name}
              value={c.open ? staff.doctorsByClinic[c.id] ?? 0 : '—'}
              unit={c.open ? '名' : ''}
            />
          ))}
          <StatRow label="合計" value={staff.doctorsTotal} unit="名" total />

          <SectionTitle>調達の内訳</SectionTitle>
          <StatRow label="医局の派遣枠" value={staff.igyokuSlots} unit="枠" />
          <StatRow label="紹介会社の確保枠" value={staff.agencyHiresCumulative} unit="枠" />
          <StatRow label="調達可能数" value={staff.doctorsProcurable} unit="名" total />
          <StatRow
            label="不足"
            value={staff.doctorShortfall ? 'あり' : 'なし'}
            suffix={
              staff.doctorShortfall ? (
                <StatusPill text="調達枠を超過" tone="critical" />
              ) : undefined
            }
          />
          <StatRow label="人件費" value={man(is.doctorPayroll)} unit="万円" total />
          <Note>
            医師は<strong>枠</strong>の問題。金を積んでも枠が無ければ増えない。
            枠を増やすのは医局（非金銭）か紹介会社（1枠 {AGENCY_FEE_PER_DOCTOR}万円）。
          </Note>
        </>
      );
    },
  };
};

// ==================================================================
// 医局
// ==================================================================

const igyokuBody = ({ result }: BuildingScreenProps): Body => {
  const staff = result.staff;
  const is = result.financials.incomeStatement;
  const toNextSlot =
    (staff.igyokuSlots + 1) * RELATION_PER_IGYOKU_SLOT - staff.igyokuRelation;
  return {
    greeting: `関係値は ${staff.igyokuRelation}。派遣枠は ${staff.igyokuSlots} です。`,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="関係値" value={String(staff.igyokuRelation)} unit="/120" />
          <HeroStat label="派遣枠" value={String(staff.igyokuSlots)} unit="枠" />
          <HeroStat label="維持費" value={man(is.igyokuRelationCost)} unit="万" />
        </HeroRow>

        {/* 関係値のゲージ。次の枠まであといくつかが見える */}
        <div
          style={{
            height: 10,
            borderRadius: 5,
            background: 'var(--ink-800)',
            overflow: 'hidden',
            border: '1px solid var(--ink-700)',
          }}
        >
          <div
            style={{
              width: `${(staff.igyokuRelation / 120) * 100}%`,
              height: '100%',
              background: 'var(--screen-accent)',
            }}
          />
        </div>
        <Note>
          次の派遣枠まであと <strong>{Math.max(0, toNextSlot)}</strong>。
          {RELATION_PER_IGYOKU_SLOT} ごとに1枠増える。
        </Note>

        <SectionTitle>関係値の性質</SectionTitle>
        <StatRow label="維持費を払っている間" value="据え置き" />
        <StatRow label="払わなければ" value="毎月 0.67 ずつ低下" />
        <StatRow label="上げる方法" value="当直の引き受け・症例の還元" />
        <Note>
          <strong>関係値は金では買えない。</strong>
          維持費は「下がらないようにする」ためのもので、上げるためのものではない。
          急いで枠が要るなら紹介会社へ行くしかない。
        </Note>

        <SectionTitle>いま医局から来ている医師</SectionTitle>
        <StatRow label="派遣枠" value={staff.igyokuSlots} unit="枠" />
        <StatRow label="実際の常勤医" value={staff.doctorsTotal} unit="名" />
        <StatRow
          label="紹介会社に頼っている数"
          value={Math.max(0, staff.doctorsTotal - staff.igyokuSlots)}
          unit="名"
          total
        />
      </>
    ),
  };
};

// ==================================================================
// 紹介会社
// ==================================================================

const agencyBody = ({ result }: BuildingScreenProps): Body => {
  const staff = result.staff;
  const is = result.financials.incomeStatement;
  return {
    greeting:
      is.agencyFees > 0
        ? `今月 ${man(is.agencyFees)}万円で枠を確保しました。`
        : `これまでに ${staff.agencyHiresCumulative} 枠を確保しています。`,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="確保した枠" value={String(staff.agencyHiresCumulative)} unit="枠" />
          <HeroStat label="今月の手数料" value={man(is.agencyFees)} unit="万" />
          <HeroStat label="1枠あたり" value={man(AGENCY_FEE_PER_DOCTOR)} unit="万" />
        </HeroRow>

        <SectionTitle>医局との違い</SectionTitle>
        <StatRow label="医局の派遣枠" value={staff.igyokuSlots} unit="枠" suffix={<StatusPill text="金では買えない" tone="mute" />} />
        <StatRow label="紹介会社の枠" value={staff.agencyHiresCumulative} unit="枠" suffix={<StatusPill text="即日・有料" tone="warning" />} />
        <StatRow label="調達可能数" value={staff.doctorsProcurable} unit="名" total />
        <Note>
          紹介会社の枠は<strong>払った月に増え、以後ずっと残る</strong>。
          医局の関係値を上げるには何年もかかるので、急ぐならここ。ただし手数料は戻らない。
        </Note>

        <SectionTitle>累計</SectionTitle>
        <StatRow
          label="これまでの手数料"
          value={man(staff.agencyHiresCumulative * AGENCY_FEE_PER_DOCTOR)}
          unit="万円"
          total
        />
      </>
    ),
  };
};

// ==================================================================
// 看護学校
// ==================================================================

const schoolBody = ({ result, history }: BuildingScreenProps): Body => {
  const school = schoolStatus(history, result.month);
  const is = result.financials.incomeStatement;
  return {
    greeting: school.open
      ? school.graduatedThisMonth > 0
        ? `今月 ${school.graduatedThisMonth.toFixed(1)}名が入職しました。`
        : `在学 ${school.enrolledClasses} 学年。次の卒業は ${school.nextGraduationMonth ? monthLabel(school.nextGraduationMonth) : '—'} です。`
      : 'まだ開校していません。建てても最初の卒業生が出るのは3年後です。',
    render: () =>
      school.open ? (
        <>
          <HeroRow>
            <HeroStat label="在学" value={String(school.enrolledClasses)} unit="学年" />
            <HeroStat label="学費収入" value={man(is.tuitionRevenue)} unit="万" />
            <HeroStat
              label="収支"
              value={man(is.tuitionRevenue - is.schoolOperating)}
              unit="万"
              tone={is.tuitionRevenue - is.schoolOperating < 0 ? 'negative' : 'positive'}
            />
          </HeroRow>

          <SectionTitle>学校</SectionTitle>
          <StatRow label="開校" value={school.openedAtMonth ? monthLabel(school.openedAtMonth) : '—'} />
          <StatRow label="1学年の定員" value={SCHOOL_CLASS_SIZE} unit="名" />
          <StatRow label="学費収入" value={man(is.tuitionRevenue)} unit="万円" />
          <StatRow label="運営費" value={man(-is.schoolOperating)} unit="万円" />
          <StatRow label="月の収支" value={man(is.tuitionRevenue - is.schoolOperating)} unit="万円" total />

          <SectionTitle>卒業</SectionTitle>
          <StatRow
            label="次の卒業"
            value={school.nextGraduationMonth ? monthLabel(school.nextGraduationMonth) : '—'}
          />
          <StatRow label="1学年から残る人数" value={school.graduatesPerClass.toFixed(1)} unit="名" />
          <StatRow label="今月の入職" value={school.graduatedThisMonth.toFixed(1)} unit="名" total />
          <Note>
            卒業しても残るのは <strong>85% × 35%</strong> だけ。残りは他院へ流れる。
            それでも {school.graduatesPerClass.toFixed(1)}名は、市場採用の
            約 {(school.graduatesPerClass / NURSE_MARKET_HIRES_PER_MONTH).toFixed(0)}ヶ月分にあたる。
          </Note>
        </>
      ) : (
        <>
          <SectionTitle>未開校</SectionTitle>
          <Note>
            看護学校は<strong>看護師のボトルネックを外す唯一の手段</strong>だが、
            建ててから最初の卒業生が出るまで3年かかり、その間は運営費だけが出ていく。
            資金繰りの谷を越えられるかどうかが判断のすべて。
          </Note>
        </>
      ),
  };
};

// ==================================================================
// 銀行
// ==================================================================

const bankBody = ({ result }: BuildingScreenProps): Body => {
  const bs = result.financials.balanceSheet;
  const cf = result.financials.cashFlow;
  const is = result.financials.incomeStatement;
  return {
    greeting:
      bs.totalEquity < 0
        ? '純資産がマイナスです。これ以上の融資は難しい。'
        : bs.cash < 0
          ? '現金がマイナスです。つなぎ融資の話をしましょう。'
          : `借入残高は ${compactMan(totalDebt(result))}円です。`,
    render: () => (
      <>
        <HeroRow>
          <HeroStat
            label="現金"
            value={compactMan(bs.cash)}
            unit="円"
            tone={bs.cash < 0 ? 'critical' : undefined}
          />
          <HeroStat label="借入残高" value={compactMan(totalDebt(result))} unit="円" />
          <HeroStat
            label="純資産"
            value={compactMan(bs.totalEquity)}
            unit="円"
            tone={bs.totalEquity < 0 ? 'critical' : undefined}
          />
        </HeroRow>

        <SectionTitle>借入</SectionTitle>
        <StatRow label="短期借入（1年以内）" value={man(bs.shortTermDebt)} unit="万円" />
        <StatRow label="長期借入" value={man(bs.longTermDebt)} unit="万円" />
        <StatRow label="残高合計" value={man(totalDebt(result))} unit="万円" total />

        <SectionTitle>今月</SectionTitle>
        <StatRow label="新規借入" value={man(cf.newBorrowing)} unit="万円" />
        <StatRow label="元金返済" value={man(cf.principalRepayment)} unit="万円" />
        <StatRow label="支払利息" value={man(-is.interestExpense)} unit="万円" total />

        <SectionTitle>判定</SectionTitle>
        <StatRow
          label="資金ショート"
          value={bs.cash < 0 ? '発生中' : 'なし'}
          suffix={
            bs.cash < 0 ? (
              <StatusPill text="つなぎ融資が要る" tone="warning" />
            ) : (
              <StatusPill text="問題なし" tone="positive" />
            )
          }
        />
        <StatRow
          label="債務超過"
          value={bs.totalEquity < 0 ? '発生中' : 'なし'}
          suffix={
            bs.totalEquity < 0 ? (
              <StatusPill text="ゲームオーバー判定" tone="critical" />
            ) : (
              <StatusPill text="問題なし" tone="positive" />
            )
          }
        />
        <Note>
          <strong>この2つは別物。</strong>現金がマイナスでも純資産が残っていれば、
          それは資金繰りの谷であって債務超過ではない。つなぎ融資で越えられる。
        </Note>
      </>
    ),
  };
};

// ==================================================================
// 厚生局
// ==================================================================

const bureauBody = ({ result }: BuildingScreenProps): Body => {
  const fee = result.fee;
  const staff = result.staff;
  const lapsed = fee.addons.filter((a) => a.lapsedByRequirement);
  const revision = FEE_REVISIONS.find((r) => r.effectiveMonth === result.month);
  return {
    greeting: revision
      ? `${revision.name}が施行されました。基礎点数が ${(revision.rate * 100).toFixed(1)}% です。`
      : lapsed.length > 0
        ? `${lapsed.length}件の加算が要件割れで落ちています。`
        : `有効な加算は合計 +${percent(fee.addonTotal, 0)}% です。`,
    render: () => (
      <>
        <HeroRow>
          <HeroStat label="点数指数" value={points(fee.feePointIndex)} />
          <HeroStat label="加算" value={`+${percent(fee.addonTotal, 0)}`} unit="%" />
          <HeroStat label="実効点数指数" value={points(fee.effectiveFeeIndex)} />
        </HeroRow>

        <SectionTitle>施設基準の現在値</SectionTitle>
        <StatRow label="常勤医（全社）" value={staff.doctorsTotal} unit="名" />
        <StatRow label="看護師充足率（全社）" value={percent(staff.nurseSufficiency)} unit="%" total />
        <Note>要件は<strong>全社</strong>で判定する。院ごとではない。</Note>

        <SectionTitle>加算</SectionTitle>
        {fee.addons.map((status) => {
          const addon = ADDONS.find((a) => a.id === status.id)!;
          const state = status.active
            ? { text: '有効', tone: 'positive' as const }
            : status.lapsedByRequirement
              ? { text: '要件割れ', tone: 'critical' as const }
              : { text: '未取得', tone: 'mute' as const };
          return (
            <div key={status.id} className="receipt-rule" style={{ padding: 'var(--space-3) 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 'var(--space-3)',
                }}
              >
                <span style={{ fontSize: 'var(--text-body)' }}>{addon.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className="num" style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>
                    +{percent(addon.effect, 0)}%
                  </span>
                  <StatusPill text={state.text} tone={state.tone} />
                </span>
              </div>
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--paper-mute)',
                  marginTop: 3,
                }}
              >
                要件：常勤医 {addon.requiredDoctors}名 ／ 充足率{' '}
                {percent(addon.requiredNurseSufficiency, 0)}%
                {status.acquiredAtMonth !== null &&
                  `　取得：${monthLabel(status.acquiredAtMonth)}`}
              </div>
            </div>
          );
        })}
        <Note>
          <strong>要件を割った月に猶予なく落ちる。</strong>
          満たし直せば戻るが、落ちていた間の点数は戻らない。
        </Note>

        <SectionTitle>診療報酬改定</SectionTitle>
        {FEE_REVISIONS.map((r) => (
          <StatRow
            key={r.id}
            label={`${r.name}　${monthLabel(r.effectiveMonth)}`}
            value={`${r.rate > 0 ? '+' : '−'}${Math.abs(r.rate * 100).toFixed(0)}`}
            unit="%"
            suffix={
              r.effectiveMonth <= result.month ? undefined : (
                <StatusPill text="未施行" tone="mute" />
              )
            }
          />
        ))}
        <Note>
          改定は<strong>起きた後に適応する外部イベント</strong>。予測はできない。
          加算5つで +19% 乗るので、改定の増減はそこに埋もれる。
        </Note>
      </>
    ),
  };
};

const BODIES: Partial<Record<ScreenId, (props: BuildingScreenProps) => Body>> = {
  hq: hqBody,
  accounting: accountingBody,
  personnel: personnelBody,
  igyoku: igyokuBody,
  agency: agencyBody,
  nursingSchool: schoolBody,
  bank: bankBody,
  bureau: bureauBody,
};

