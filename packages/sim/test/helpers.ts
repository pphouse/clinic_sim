/**
 * テストの共通の下ごしらえ。
 *
 * ★本編は**院を1つも持たずに始まる**（docs/spec/06-opening.md §5）。
 * ほとんどのテストは「本院が1つ建っている」ところから始めたいので、
 * 1ヶ月目に A院（本町・内科・標準内装・常勤医3名）を開く決定を差し込む。
 *
 * 検証済みの層には触らない。BASELINE_SCENARIO を使うテストはここを通らない。
 */
import type { MonthDecision } from '../src/index';

export function withOpeningA(decisions: MonthDecision[]): MonthDecision[] {
  const first = decisions.find((d) => d.month === 1);
  const rest = decisions.filter((d) => d.month !== 1);
  return [
    {
      ...first,
      month: 1,
      openClinic: 'A',
      openSpecialty: 'naika',
      openFitout: 'standard',
      // テスト側が書いた配置を優先する。書いていなければ3名
      doctorsByClinic: { A: 3, ...first?.doctorsByClinic },
      // ★集患を打たないと認知度が 0.4 で頭打ちになり、どの筋も破綻する
      // （docs/spec/07-awareness.md）。「まともに開業した院」を既定にする
      marketingByClinic: { A: 'web', ...first?.marketingByClinic },
    },
    ...rest,
  ];
}
