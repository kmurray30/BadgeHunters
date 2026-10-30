import type { CSSProperties } from "react";

export interface PieSlice {
  color: string;
  filled: boolean;
}

// Thin wedge of background between slices so neighbors don't blur together.
const GAP_DEGREES = 3;
const RIM = "0 0 0 1px #33334d";

/**
 * Equal wedges clockwise from 12 o'clock as a single element (a conic
 * gradient), so a grid of hundreds of pies stays cheap to render.
 */
function Wedges({ fills, size, glow }: { fills: string[]; size: number | string; glow?: boolean }) {
  const sliceDegrees = 360 / Math.max(fills.length, 1);
  const background =
    fills.length <= 1
      ? (fills[0] ?? "#000")
      : `conic-gradient(${fills
          .map((fill, index) => {
            const start = index * sliceDegrees;
            const end = start + sliceDegrees;
            return `var(--background) ${start}deg ${start + GAP_DEGREES}deg, ${fill} ${start + GAP_DEGREES}deg ${end}deg`;
          })
          .join(", ")})`;
  const style: CSSProperties = {
    width: size,
    height: size,
    background,
    boxShadow: glow ? `${RIM}, 0 0 6px rgba(255,255,255,0.35)` : RIM,
  };
  return <span aria-hidden className="block shrink-0 rounded-full" style={style} />;
}

/**
 * One equal slice per selected player, starting at 12 o'clock in picker order:
 * filled with the player's color if they've done it, black if not. `size` is
 * px, or a CSS length such as "100%" to fill the parent.
 */
export function CompletionPie({ slices, size = 28 }: { slices: PieSlice[]; size?: number | string }) {
  return (
    <Wedges
      fills={slices.map((slice) => (slice.filled ? slice.color : "#000"))}
      size={size}
      glow={slices.length > 0 && slices.every((slice) => slice.filled)}
    />
  );
}

/**
 * Legend mark for a player: the pie with only their slice colored, so you can
 * tell whose wedge is whose even when two colors look alike.
 */
export function PlayerSliceIcon({ index, count, color, size = 14 }: { index: number; count: number; color: string; size?: number }) {
  return <Wedges fills={Array.from({ length: count }, (_, slot) => (slot === index ? color : "var(--slot-empty)"))} size={size} />;
}
