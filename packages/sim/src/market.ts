/**
 * 商圏と競合。docs/spec/04-market.md
 *
 * 検証モデルには競合が居なかった。**隣に分院を出しても本院の患者は1人も減らなかった。**
 * ここで新規患者にシェアを掛けて、その穴を埋める。
 *
 *   新規患者 = ポテンシャル × 評判/75 × シェア
 *
 * `newPatientPotential` の意味が「その商圏を独占したときの新規患者数」に変わる。
 *
 * ★**商圏に自院1つ・競合0なら シェア = 自院の魅力 / 自院の魅力 = 1。**
 * 既定シナリオは A・B・C を別々の商圏に置いて競合を1軒も置かないので、
 * この節を通っても検証済みの数字は 1 ミリも動かない。恒等式であることを維持すること。
 *
 * 純粋関数のみ。Date も Math.random も使わない（CLAUDE.md §1）。
 */
import {
  CLINIC_SCALE_MAX,
  CLINIC_SCALE_WEIGHT,
  COMPETITOR_EXIT_MONTHS,
  COMPETITOR_EXIT_SHARE,
  DISTRICTS,
  TOLERABLE_WAIT_MINUTES,
} from './constants';
import { excessWait } from './engine';
import type {
  ClinicConfig,
  ClinicId,
  CompetitorState,
  CompetitorView,
  DistrictClinicView,
  DistrictId,
  DistrictView,
  MarketTick,
  Month,
} from './types';

/**
 * 患者から見た魅力。
 *
 *   魅力 = 評判 × 待ち時間ペナルティ × 規模係数
 *
 * 待ち時間が許容内なら待ちペナルティは 1。混むほど落ちる。
 * 規模係数は医師数から出す（医師1名なら 1）。
 *
 * ★材料は評判・待ち時間・医師数の3つだけ。**どれも既に検証済みの変数**で、
 * 新しい状態変数を増やしていない。増やすと何が効いたのか説明できなくなる。
 */
export function attractivenessOf(reputation: number, waitMinutes: number, doctors = 1): number {
  const excess = excessWait(waitMinutes);
  const waitFactor = TOLERABLE_WAIT_MINUTES / (TOLERABLE_WAIT_MINUTES + excess);
  const scale = Math.min(CLINIC_SCALE_MAX, 1 + CLINIC_SCALE_WEIGHT * Math.max(0, doctors - 1));
  return reputation * waitFactor * scale;
}

export interface MarketClinicInput {
  config: ClinicConfig;
  /** 開院済みか。開院前の院は商圏に居ない */
  open: boolean;
  /** ★前月の評判。今月の値を使うと循環する（docs/spec/04-market.md §2） */
  reputation: number;
  /** ★前月の待ち時間 */
  waitMinutes: number;
  /** 常勤医の数。多いほど引力が強い */
  doctors: number;
}

export interface MarketInput {
  month: Month;
  clinics: MarketClinicInput[];
  competitors: CompetitorState[];
}

export interface MarketOutcome {
  tick: MarketTick;
  /** 院ごとのシェア。tickClinic に渡す */
  shareByClinic: Record<ClinicId, number>;
  /** 撤退の判定を反映した競合。次の月へ持ち越す */
  competitors: CompetitorState[];
}

/**
 * 商圏ごとにシェアを配る。
 *
 * 撤退：シェアを COMPETITOR_EXIT_SHARE 未満に COMPETITOR_EXIT_MONTHS ヶ月
 * 押さえ込み続けた競合は出ていく。**押し込むのをやめれば数えは 0 に戻る。**
 */
export function tickMarket(input: MarketInput): MarketOutcome {
  const active = input.competitors.filter((c) => c.closedAtMonth === null);
  const shareByClinic: Record<ClinicId, number> = {};
  const districts: DistrictView[] = [];
  const closed: CompetitorView[] = [];
  /** 競合ごとの今月のシェア。撤退の判定に使う */
  const competitorShare: Record<string, number> = {};

  for (const district of DISTRICTS) {
    const clinics = input.clinics.filter((c) => c.open && c.config.districtId === district.id);
    const rivals = active.filter((c) => c.districtId === district.id);
    if (clinics.length === 0 && rivals.length === 0) continue;

    const clinicPower = clinics.map((c) => ({
      clinic: c,
      power: attractivenessOf(c.reputation, c.waitMinutes, c.doctors),
    }));
    const total =
      clinicPower.reduce((sum, c) => sum + c.power, 0) +
      rivals.reduce((sum, r) => sum + r.strength, 0);

    // 魅力の合計が 0（開院直後で評判も待ち時間も無い）なら等分。0除算よけ
    const shareOf = (power: number) =>
      total > 0 ? power / total : 1 / (clinics.length + rivals.length);

    const clinicViews: DistrictClinicView[] = clinicPower.map(({ clinic, power }) => {
      const share = shareOf(power);
      shareByClinic[clinic.config.id] = share;
      return {
        id: clinic.config.id,
        name: clinic.config.name,
        attractiveness: power,
        share,
      };
    });

    const competitorViews: CompetitorView[] = rivals.map((rival) => {
      const share = shareOf(rival.strength);
      competitorShare[rival.id] = share;
      const weak = share < COMPETITOR_EXIT_SHARE ? rival.weakMonths + 1 : 0;
      return {
        id: rival.id,
        name: rival.name,
        districtId: rival.districtId,
        strength: rival.strength,
        share,
        // 押し込めていなければ「あと何ヶ月」は出さない。出すと嘘になる
        monthsToExit: weak > 0 ? Math.max(0, COMPETITOR_EXIT_MONTHS - weak) : null,
        openedAtMonth: rival.openedAtMonth,
      };
    });

    districts.push({
      id: district.id,
      name: district.name,
      clinics: clinicViews,
      competitors: competitorViews,
      ownShare: clinicViews.reduce((sum, c) => sum + c.share, 0),
    });
  }

  const competitors = input.competitors.map((rival) => {
    if (rival.closedAtMonth !== null) return rival;
    const share = competitorShare[rival.id];
    // 商圏に自院が1つも無ければ判定しない（誰も押し込んでいない）
    if (share === undefined) return rival;
    const weakMonths = share < COMPETITOR_EXIT_SHARE ? rival.weakMonths + 1 : 0;
    if (weakMonths >= COMPETITOR_EXIT_MONTHS) {
      closed.push({
        id: rival.id,
        name: rival.name,
        districtId: rival.districtId,
        strength: rival.strength,
        share,
        monthsToExit: 0,
        openedAtMonth: rival.openedAtMonth,
      });
      return { ...rival, weakMonths, closedAtMonth: input.month };
    }
    return { ...rival, weakMonths };
  });

  return { tick: { districts, closed }, shareByClinic, competitors };
}

export function districtNameOf(id: DistrictId): string {
  return DISTRICTS.find((d) => d.id === id)?.name ?? id;
}

/** UI が「この院の商圏」を引くため。院ごとに1つしか無い */
export function districtOfClinic(tick: MarketTick, clinicId: ClinicId): DistrictView | undefined {
  return tick.districts.find((d) => d.clinics.some((c) => c.id === clinicId));
}
