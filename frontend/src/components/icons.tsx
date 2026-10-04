import type { ReactNode, SVGProps } from "react";
import type { NodeType } from "../graph/types.ts";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** One shape per node type, so meaning never rests on colour alone. */
export function TypeIcon({ type, ...rest }: IconProps & { type: NodeType }) {
  switch (type) {
    case "application":
      return (
        <Svg {...rest}>
          <path d="M8 1.75 14.25 8 8 14.25 1.75 8Z" />
          <path d="M8 5.5 10.5 8 8 10.5 5.5 8Z" />
        </Svg>
      );
    case "page":
      return (
        <Svg {...rest}>
          <rect x="2" y="2.75" width="12" height="10.5" rx="1.75" />
          <path d="M2 5.75h12" />
          <path d="M4.25 4.25h.01M5.75 4.25h.01" />
        </Svg>
      );
    case "component":
      return (
        <Svg {...rest}>
          <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" strokeDasharray="2.2 1.6" />
          <rect x="5.25" y="5.25" width="5.5" height="5.5" rx="1" />
        </Svg>
      );
    case "interaction":
      return (
        <Svg {...rest}>
          <path d="M3.5 2.5 12.5 7l-3.9 1.15L7 12.25Z" />
          <path d="m8.75 8.25 3.25 3.25" />
        </Svg>
      );
    case "api":
      return (
        <Svg {...rest}>
          <path d="M2.25 5.25h9.5" />
          <path d="m9.25 2.75 2.5 2.5-2.5 2.5" />
          <path d="M13.75 10.75h-9.5" />
          <path d="m6.75 8.25-2.5 2.5 2.5 2.5" />
        </Svg>
      );
    case "auth":
      return (
        <Svg {...rest}>
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2" />
          <path d="M8 9.75v1.5" />
        </Svg>
      );
    case "service":
      return (
        <Svg {...rest}>
          <path d="M8 1.75 13.4 4.9v6.2L8 14.25 2.6 11.1V4.9Z" />
          <path d="M2.6 4.9 8 8l5.4-3.1M8 8v6.25" />
        </Svg>
      );
    case "function":
      return (
        <Svg {...rest}>
          <path d="M10.75 2.5c-1.6 0-2.3.85-2.6 2.4L6.9 11.1c-.3 1.55-1 2.4-2.65 2.4" />
          <path d="M5 6.75h5.5" />
        </Svg>
      );
    case "database":
      return (
        <Svg {...rest}>
          <ellipse cx="8" cy="3.75" rx="5.25" ry="1.75" />
          <path d="M2.75 3.75v8.5c0 .97 2.35 1.75 5.25 1.75s5.25-.78 5.25-1.75v-8.5" />
          <path d="M2.75 8c0 .97 2.35 1.75 5.25 1.75S13.25 8.97 13.25 8" />
        </Svg>
      );
    case "table":
      return (
        <Svg {...rest}>
          <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
          <path d="M2 6.25h12M2 9.75h12M6.5 6.25v7" />
        </Svg>
      );
    case "external":
      return (
        <Svg {...rest}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12" />
          <path d="M8 2c1.6 1.7 2.4 3.7 2.4 6S9.6 12.3 8 14C6.4 12.3 5.6 10.3 5.6 8S6.4 3.7 8 2Z" />
        </Svg>
      );
    case "error":
      return (
        <Svg {...rest}>
          <path d="M8 2.25 14.25 13H1.75Z" />
          <path d="M8 6.5v3M8 11.25h.01" />
        </Svg>
      );
    case "file":
      return (
        <Svg {...rest}>
          <path d="M4 1.75h5l3.25 3.25v9.25H4Z" />
          <path d="M9 1.75V5h3.25" />
        </Svg>
      );
  }
}

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="1.5" y="2" width="17" height="4" rx="1.5" fill="currentColor" opacity="0.38" />
      <rect x="1.5" y="8" width="17" height="4" rx="1.5" fill="currentColor" opacity="0.62" />
      <rect x="1.5" y="14" width="17" height="4" rx="1.5" fill="currentColor" opacity="0.38" />
      <path d="M7 4v12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="4" r="2" fill="var(--accent)" />
      <circle cx="7" cy="10" r="2" fill="var(--accent)" />
      <circle cx="7" cy="16" r="2" fill="var(--accent)" />
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.25 3.25" />
  </Svg>
);

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

export const MinusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8h10" />
  </Svg>
);

export const FitIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10" />
  </Svg>
);

export const ResetIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.78" />
    <path d="M2.5 2.5v3h3" />
  </Svg>
);

export const CloseIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);

export const PlayIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 2.75v10.5L13 8Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const CodeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" />
  </Svg>
);

export const SparkIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 2c.45 2.85 1.65 4.55 4.75 5.25C8.65 7.95 7.45 9.65 7 12.5c-.45-2.85-1.65-4.55-4.75-5.25C5.35 6.55 6.55 4.85 7 2Z" />
    <path d="M12.25 10.5c.2 1.15.65 1.6 1.75 1.85-1.1.25-1.55.7-1.75 1.85-.2-1.15-.65-1.6-1.75-1.85 1.1-.25 1.55-.7 1.75-1.85Z" />
  </Svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2.75 8h10.5M9 3.75 13.25 8 9 12.25" />
  </Svg>
);

export const ArrowDownIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 2.75v10.5M3.75 9 8 13.25 12.25 9" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m3 8.5 3 3 7-7" />
  </Svg>
);

export const ChevronIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
);

export const ExternalLinkIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
  </Svg>
);

export const LockIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" />
    <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
  </Svg>
);

export const RouteIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="4" cy="3.75" r="1.75" />
    <circle cx="12" cy="12.25" r="1.75" />
    <path d="M4 5.5v2.25a2 2 0 0 0 2 2h4a2 2 0 0 1 2 2v-1" />
  </Svg>
);
