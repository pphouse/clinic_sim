/**
 * アイコンだけのボタン。16画面で共有する。
 *
 * 見た目は design/controls.css の `.btn` 系が持つ。ここは「どの階層か」を選ぶだけ。
 *
 *   primary … 盤面が動く操作（医師を増やす、投資する）
 *   quiet   … 見る場所が変わるだけの操作（月を送る、閉じる）
 *
 * 同じ見た目のボタンを並べると、どれが取り返しのつかない操作なのか分からなくなる。
 */
import type { ReactNode } from 'react';

export type ButtonTone = 'primary' | 'quiet' | 'default';

export interface IconButtonProps {
  /** 読み上げとテストで使う名前。アイコンだけなので必須 */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
}

const TONE_CLASS: Record<ButtonTone, string> = {
  primary: 'btn btn--icon btn--primary',
  quiet: 'btn btn--icon btn--quiet',
  default: 'btn btn--icon',
};

export function IconButton({ label, icon, onClick, disabled, tone = 'default' }: IconButtonProps) {
  return (
    <button
      type="button"
      className={TONE_CLASS[tone]}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
