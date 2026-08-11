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
  COMPETITOR_STRENGTH_MAX,
  COMPETITOR_STRENGTH_MIN,
  DISTRICTS,
  DOCTOR_RESIGN_CHANCE,
  SPECIALTIES,
  EPIDEMIC_CHANCE,
  EPIDEMIC_MONTHS,
  NURSE_EXODUS_CHANCE,
  NURSE_EXODUS_COUNT,
  BAD_REVIEW_CHANCE,
  APARTMENT_CHANCE,
  ASSOCIATION_OFFER_CHANCE,
  RETAIN_DOCTOR_COST,
  RETAIN_NURSES_COST,
  REVIEW_RESPONSE_COST,
  REVIEW_REPUTATION_DAMAGE,
  EXPANSION_CAPEX,
  EXPANSION_POTENTIAL_GAIN,
  ASSOCIATION_OFFICER_COST,
  ASSOCIATION_OFFICER_GAIN,
  ASSOCIATION_DECLINE_PENALTY,
} from './constants';
import type {
  ClinicConfig,
  ClinicId,
  EventChoice,
  Man,
  Month,
  RandomEventOccurrence,
  Rng,
  SpecialtyId,
} from './types';

/**
 * イベントの一意の鍵。**意思決定の記録がこれで紐づく**
 * （docs/spec/08-decisions.md §2）。作り方を変えると古いセーブの答えが外れる。
 */
export function eventKeyOf(id: string, month: Month, clinicId?: ClinicId): string {
  return `${id}-${clinicId ?? 'group'}-${month}`;
}

export interface RandomEventInput {
  month: Month;
  rng: Rng;
  /** 開院済みの院だけが対象 */
  openClinics: ClinicConfig[];
  /** 院ごとの配置医師数 */
  doctorsByClinic: Record<ClinicId, number>;
  /** 院ごとの患者数。競合はここが大きいセグメントへ来る */
  patientStockByClinic: Record<ClinicId, number>;
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
  /** 商圏に新しく開業した競合。シェアの計算に入る */
  newCompetitors: {
    id: string;
    name: string;
    districtId: string;
    specialtyId: SpecialtyId;
    strength: number;
  }[];
  /** 返還請求。P/L の特別損失に出る */
  extraordinaryLoss: Man;
  /** 流行が終わる月。null なら今月は起きていない */
  epidemicUntilMonth: Month | null;
}

/**
 * 新規開業する競合の屋号。**地名＋これ**で作る。
 * 名前が付いていないと地図に置いたときにただの点になる。
 */
const NEW_COMPETITOR_NAMES = [
  'ファミリークリニック',
  '内科・小児科医院',
  'メディカルセンター',
  '総合クリニック',
];

const empty = (): RandomEventOutcome => ({
  events: [],
  doctorsLost: {},
  nursesLost: 0,
  newCompetitors: [],
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
        key: eventKeyOf('doctorResigned', month, clinic.id),
        month,
        clinicId: clinic.id,
        severity: 'critical',
        title: `${clinic.name} 常勤医が辞めたいと言っている`,
        body:
          '抜ければ来月から診察枠が落ちます。補充には医局か紹介会社が要りますが、' +
          'どちらもすぐには埋まりません。',
        choices: [
          {
            id: 'retain',
            label: '引き止める',
            detail: `一時金 ${RETAIN_DOCTOR_COST}万円。枠は落ちない`,
            effect: { cost: RETAIN_DOCTOR_COST, keepDoctor: true },
          },
          {
            id: 'release',
            label: '送り出す',
            detail: '枠が1人分落ちる。待ち時間が伸び、評判が削れる',
            effect: {},
            isDefault: true,
          },
        ],
      });
      break; // 同じ院から同じ月に2人は抜けない
    }
  }

  // ② 看護師の突発離職。充足率が落ちて実効枠が絞られる
  if (input.nurses > NURSE_EXODUS_COUNT && rng.chance(NURSE_EXODUS_CHANCE)) {
    out.nursesLost = NURSE_EXODUS_COUNT;
    out.events.push({
      id: 'nurseExodus',
      key: eventKeyOf('nurseExodus', month),
      month,
      severity: 'warning',
      title: `看護師 ${NURSE_EXODUS_COUNT}名がまとめて辞めそう`,
      body:
        '抜ければ充足率が落ちます。市場からの採用は月 0.4 名しか進まないので、' +
        '穴が埋まるまで時間がかかります。',
      choices: [
        {
          id: 'retain',
          label: '待遇で引き止める',
          detail: `一時金 ${RETAIN_NURSES_COST}万円。充足率は落ちない`,
          effect: { cost: RETAIN_NURSES_COST, keepNurses: true },
        },
        {
          id: 'accept',
          label: '受け入れる',
          detail: `${NURSE_EXODUS_COUNT}名が抜ける。実効枠が絞られる`,
          effect: {},
          isDefault: true,
        },
      ],
    });
  }

  // ③ 商圏に競合が開業する。
  //
  // ★以前は「ポテンシャルが恒久的に −15%」という係数だった。やめた理由：
  // 減り幅はシェアの計算から自然に出るので、係数で殴ると二重に効く。
  // それに、係数だと**なぜ減ったのかが画面から読めない**（相手が見えない）。
  // ③ 競合が開業する。
  //
  // ★**儲かっているところに来る。** 患者数で重み付けして、育っている
  // （商圏 × 科）へ入ってくる。一様抽選にすると、空いたセグメントを見つけて
  // 放置するのが最適解になる。10年誰も来ないニッチは、ニッチではない。
  const targets = input.openClinics.filter(
    (c) => (input.patientStockByClinic[c.id] ?? 0) > 0,
  );
  const totalStock = targets.reduce((sum, c) => sum + (input.patientStockByClinic[c.id] ?? 0), 0);
  if (targets.length > 0 && totalStock > 0 && rng.chance(COMPETITOR_CHANCE * targets.length)) {
    let pick = rng.next() * totalStock;
    let target = targets[targets.length - 1]!;
    for (const clinic of targets) {
      pick -= input.patientStockByClinic[clinic.id] ?? 0;
      if (pick <= 0) {
        target = clinic;
        break;
      }
    }
    const district = DISTRICTS.find((d) => d.id === target.districtId)!;
    const specialty = SPECIALTIES.find((s) => s.id === target.specialtyId)!;
    const strength = rng.int(COMPETITOR_STRENGTH_MIN, COMPETITOR_STRENGTH_MAX + 1);
    out.newCompetitors.push({
      id: `${district.id}-${specialty.id}-${month}`,
      name: `${district.name}${NEW_COMPETITOR_NAMES[month % NEW_COMPETITOR_NAMES.length]}`,
      districtId: district.id,
      specialtyId: specialty.id,
      strength,
    });
    out.events.push({
      id: 'competitorOpened',
      key: eventKeyOf('competitorOpened', month, target.id),
      month,
      clinicId: target.id,
      severity: 'warning',
      title: `${district.name}に${specialty.name}が開業`,
      body:
        `強さ ${strength} の競合が ${target.name} と同じ商圏の同じ科に加わりました。` +
        '育っている場所ほど狙われます。評判で押し返せば、いずれ出ていきます。',
    });
  }

  // ④ 厚生局の個別指導。**加算を多く持っているほど返還が大きい**
  //    加算は点数を積む主戦場だが、積むほど指導のときに失うものも増える
  if (input.addonTotal > 0 && rng.chance(AUDIT_CHANCE)) {
    out.extraordinaryLoss =
      input.insuranceRevenue * input.addonTotal * AUDIT_CLAWBACK_MONTHS;
    out.events.push({
      id: 'bureauAudit',
      key: eventKeyOf('bureauAudit', month),
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
      key: eventKeyOf('epidemic', month),
      month,
      severity: 'info',
      title: '感染症が流行',
      body:
        `${EPIDEMIC_MONTHS} ヶ月のあいだ受診需要が増えます。` +
        '枠に余裕があれば増収ですが、詰まっていれば待ち時間になって評判を削ります。',
    });
  }

  /*
   * ⑥⑦⑧ 選択を迫るイベント（docs/spec/08-decisions.md §2）。
   *
   * ★**末尾に足す。** 引く順番を変えると同じ種でも違う結果になり、
   * 既存のセーブデータの再現が壊れる。
   */
  const withPatients = input.openClinics.filter(
    (c) => (input.patientStockByClinic[c.id] ?? 0) > 0,
  );
  const pickClinic = (): ClinicConfig | null => {
    if (withPatients.length === 0) return null;
    return withPatients[rng.int(0, withPatients.length)] ?? null;
  };

  // ⑥ 口コミサイトに悪い書き込み。**放置すると評判が落ちる**
  if (withPatients.length > 0 && rng.chance(BAD_REVIEW_CHANCE)) {
    const target = pickClinic()!;
    out.events.push({
      id: 'badReview',
      key: eventKeyOf('badReview', month, target.id),
      month,
      clinicId: target.id,
      severity: 'warning',
      title: `${target.name} 口コミサイトに悪い書き込み`,
      body: '待たされた、説明が短い。放っておくと評判に響きます。',
      choices: [
        {
          id: 'respond',
          label: '体制を見直す',
          detail: `${REVIEW_RESPONSE_COST}万円。評判は落ちない`,
          effect: { cost: REVIEW_RESPONSE_COST },
        },
        {
          id: 'ignore',
          label: '放置する',
          detail: `評判が ${REVIEW_REPUTATION_DAMAGE} 落ちる。戻すのに何年もかかる`,
          effect: { reputationDelta: -REVIEW_REPUTATION_DAMAGE },
          isDefault: true,
        },
      ],
    });
  }

  // ⑦ 近隣にマンションが建つ。**商圏そのものが増える**数少ない機会
  if (withPatients.length > 0 && rng.chance(APARTMENT_CHANCE)) {
    const target = pickClinic()!;
    out.events.push({
      id: 'apartmentBuilt',
      key: eventKeyOf('apartmentBuilt', month, target.id),
      month,
      clinicId: target.id,
      severity: 'info',
      title: `${target.name} の近くに大きなマンションが建つ`,
      body: '世帯が増えます。受け止められる作りにしておくかどうか。',
      choices: [
        {
          id: 'expand',
          label: '待合と駐車場を広げる',
          detail: `${EXPANSION_CAPEX}万円。この院の新規患者が恒久的に ${Math.round(
            (EXPANSION_POTENTIAL_GAIN - 1) * 100,
          )}% 増える`,
          effect: {
            cost: EXPANSION_CAPEX,
            potentialMultiplier: EXPANSION_POTENTIAL_GAIN,
          },
        },
        {
          id: 'skip',
          label: '見送る',
          detail: '何も起きない。増えた世帯は他院へ流れる',
          effect: {},
          isDefault: true,
        },
      ],
    });
  }

  // ⑧ 医師会から役員の打診。**金では買えない関係を、時間と実費で買う**
  if (input.openClinics.length > 0 && rng.chance(ASSOCIATION_OFFER_CHANCE)) {
    out.events.push({
      id: 'associationOffer',
      key: eventKeyOf('associationOffer', month),
      month,
      severity: 'info',
      title: '医師会から役員の打診',
      body: '会務に時間を取られますが、断り続けると地域での立場が悪くなります。',
      choices: [
        {
          id: 'accept',
          label: '引き受ける',
          detail: `実費と休診で ${ASSOCIATION_OFFICER_COST}万円。医師会の関係値 +${ASSOCIATION_OFFICER_GAIN}`,
          effect: {
            cost: ASSOCIATION_OFFICER_COST,
            relationDelta: { id: 'medicalAssociation', value: ASSOCIATION_OFFICER_GAIN },
          },
        },
        {
          id: 'decline',
          label: '断る',
          detail: `医師会の関係値 −${ASSOCIATION_DECLINE_PENALTY}`,
          effect: {
            relationDelta: { id: 'medicalAssociation', value: -ASSOCIATION_DECLINE_PENALTY },
          },
          isDefault: true,
        },
      ],
    });
  }

  return out;
}

/** 答えていなければ既定の選択肢。1つのイベントに必ず1つある */
export function chosenChoiceOf(
  event: RandomEventOccurrence,
  answers: Record<string, string> | undefined,
): EventChoice | null {
  if (!event.choices || event.choices.length === 0) return null;
  const answered = answers?.[event.key];
  return (
    event.choices.find((c) => c.id === answered) ??
    event.choices.find((c) => c.isDefault) ??
    event.choices[event.choices.length - 1]!
  );
}
