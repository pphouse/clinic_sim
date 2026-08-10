/**
 * 突発事象。
 *
 * ★全て `scenario.features.randomEvents` がオンのときだけ引く。
 * 既定シナリオはオフなので、**検証済みの 120 ヶ月は一度も乱数を引かない。**
 * ここが崩れるとゴールデンが再現しなくなる。
 *
 * 設計の方針：**新しい因果を発明しない。**
 * どの事象も、既に検証済みの経路（医師 → 枠 → 待ち時間 → 評判 → 1年後の患者）か、
 * 既に P/L にある行（特別損失）に流し込むだけにしてある。
 * 「イベントが起きたので患者が10%減る」のような直結を作ると、
 * 検証したモデルの外側で数字が動いて、何が効いたのか説明できなくなる。
 *
 * 純粋関数。rng は外から渡す。Date も Math.random も使わない（CLAUDE.md §1）。
 */
import {
  AUDIT_CHANCE,
  AUDIT_CLAWBACK_MONTHS,
  COMPETITOR_CHANCE,
  COMPETITOR_POTENTIAL_LOSS,
  DOCTOR_RESIGN_CHANCE,
  EPIDEMIC_CHANCE,
  EPIDEMIC_MONTHS,
  NURSE_EXODUS_CHANCE,
  NURSE_EXODUS_COUNT,
} from './constants';
import type {
  ClinicConfig,
  ClinicId,
  Man,
  Month,
  RandomEventOccurrence,
  Rng,
} from './types';

export interface RandomEventInput {
  month: Month;
  rng: Rng;
  /** 開院済みの院だけが対象 */
  openClinics: ClinicConfig[];
  /** 院ごとの配置医師数 */
  doctorsByClinic: Record<ClinicId, number>;
  nurses: number;
  /** 有効な加算の合計率。個別指導の返還額はここに比例する */
  addonTotal: number;
  /** 直近の月次保険診療収入。返還額の基準 */
  insuranceRevenue: Man;
}

export interface RandomEventOutcome {
  events: RandomEventOccurrence[];
  /** 辞めた医師。院ごとの人数 */
  doctorsLost: Record<ClinicId, number>;
  /** 突発離職した看護師 */
  nursesLost: number;
  /** 新規患者ポテンシャルが恒久的に落ちる院と、その率 */
  potentialLoss: Record<ClinicId, number>;
  /** 返還請求。P/L の特別損失に出る */
  extraordinaryLoss: Man;
  /** 流行が終わる月。null なら今月は起きていない */
  epidemicUntilMonth: Month | null;
}

const empty = (): RandomEventOutcome => ({
  events: [],
  doctorsLost: {},
  nursesLost: 0,
  potentialLoss: {},
  extraordinaryLoss: 0,
  epidemicUntilMonth: null,
});

/**
 * 1ヶ月ぶんの判定。
 *
 * 引く順番は固定。**入れ替えると同じ種でも違う結果になる**ので、
 * 事象を足すときは必ず末尾に足すこと（既存のセーブデータの再現が壊れる）。
 */
export function rollRandomEvents(input: RandomEventInput): RandomEventOutcome {
  const out = empty();
  const { rng, month } = input;

  // ① 常勤医の退職。医師1人ごとに判定する
  //    枠が落ちる → 待ち時間 → 評判 → 1年後の患者ストック。検証済みの経路をそのまま通る
  for (const clinic of input.openClinics) {
    const doctors = input.doctorsByClinic[clinic.id] ?? 0;
    for (let i = 0; i < doctors; i++) {
      if (!rng.chance(DOCTOR_RESIGN_CHANCE)) continue;
      out.doctorsLost[clinic.id] = (out.doctorsLost[clinic.id] ?? 0) + 1;
      out.events.push({
        id: 'doctorResigned',
        month,
        clinicId: clinic.id,
        severity: 'critical',
        title: `${clinic.name} 常勤医が退職`,
        body:
          '来月から診察枠が落ちます。補充には医局か紹介会社が要りますが、' +
          'どちらもすぐには埋まりません。',
      });
      break; // 同じ院から同じ月に2人は抜けない
    }
  }

  // ② 看護師の突発離職。充足率が落ちて実効枠が絞られる
  if (input.nurses > NURSE_EXODUS_COUNT && rng.chance(NURSE_EXODUS_CHANCE)) {
    out.nursesLost = NURSE_EXODUS_COUNT;
    out.events.push({
      id: 'nurseExodus',
      month,
      severity: 'warning',
      title: `看護師 ${NURSE_EXODUS_COUNT}名が同時退職`,
      body:
        '看護師充足率が落ちます。市場からの採用は月 0.4 名しか進まないので、' +
        '穴が埋まるまで時間がかかります。',
    });
  }

  // ③ 近隣に競合が開業。その院の新規患者ポテンシャルが**恒久的に**落ちる
  for (const clinic of input.openClinics) {
    if (!rng.chance(COMPETITOR_CHANCE)) continue;
    out.potentialLoss[clinic.id] = COMPETITOR_POTENTIAL_LOSS;
    out.events.push({
      id: 'competitorOpened',
      month,
      clinicId: clinic.id,
      severity: 'warning',
      title: `${clinic.name} の近くに競合が開業`,
      body: `新規患者のポテンシャルが恒久的に ${Math.round(COMPETITOR_POTENTIAL_LOSS * 100)}% 落ちます。元には戻りません。`,
    });
  }

  // ④ 厚生局の個別指導。**加算を多く持っているほど返還が大きい**
  //    加算は点数を積む主戦場だが、積むほど指導のときに失うものも増える
  if (input.addonTotal > 0 && rng.chance(AUDIT_CHANCE)) {
    out.extraordinaryLoss =
      input.insuranceRevenue * input.addonTotal * AUDIT_CLAWBACK_MONTHS;
    out.events.push({
      id: 'bureauAudit',
      month,
      severity: 'critical',
      title: '厚生局の個別指導。返還請求',
      body:
        `過去 ${AUDIT_CLAWBACK_MONTHS} ヶ月ぶんの加算について返還を求められました。` +
        '特別損失として一度に落ちます。',
    });
  }

  // ⑤ 感染症の流行。需要が増える。枠が空いていれば増収、詰まっていれば待ち時間に化ける
  if (rng.chance(EPIDEMIC_CHANCE)) {
    out.epidemicUntilMonth = month + EPIDEMIC_MONTHS;
    out.events.push({
      id: 'epidemic',
      month,
      severity: 'info',
      title: '感染症が流行',
      body:
        `${EPIDEMIC_MONTHS} ヶ月のあいだ受診需要が増えます。` +
        '枠に余裕があれば増収ですが、詰まっていれば待ち時間になって評判を削ります。',
    });
  }

  return out;
}
