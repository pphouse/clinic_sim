/**
 * アイコン。**文字で代用しない。**
 *
 * 「＋」「−」「◀」は全角と半角で幅が違い、書体によって位置も太さも変わる。
 * 並べたときに揃わないので、記号は全部この形で持つ。
 *
 * 全て 24×24 の座標系、線は currentColor。太さは 2 に統一する。
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 6v12M6 12h12" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Icon>
);

/** 1年送り */
export const ChevronsLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.5 6 6 12l5.5 6M18 6l-5.5 6 5.5 6" />
  </Icon>
);

export const ChevronsRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 6 18 12l-5.5 6M6 6l5.5 6L6 18" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
