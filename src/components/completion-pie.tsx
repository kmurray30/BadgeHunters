export interface PieSlice {
  color: string;
  filled: boolean;
}

const RADIUS = 15;
const CENTER = 16;

function pointOnCircle(angle: number) {
  return [CENTER + RADIUS * Math.cos(angle), CENTER + RADIUS * Math.sin(angle)] as const;
}

function wedgePath(startAngle: number, endAngle: number) {
  const [startX, startY] = pointOnCircle(startAngle);
  const [endX, endY] = pointOnCircle(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${CENTER} ${CENTER}L${startX.toFixed(3)} ${startY.toFixed(3)}A${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)}Z`;
}

/**
 * One equal slice per selected player, starting at 12 o'clock in picker order:
 * filled with the player's color if they've done it, black if not. `size` is
 * px, or a CSS length such as "100%" to fill the parent.
 */
export function CompletionPie({ slices, size = 28 }: { slices: PieSlice[]; size?: number | string }) {
  const everyoneDone = slices.length > 0 && slices.every((slice) => slice.filled);
  const sliceAngle = (2 * Math.PI) / Math.max(slices.length, 1);

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
      style={everyoneDone ? { filter: "drop-shadow(0 0 4px rgba(255,255,255,0.35))" } : undefined}
    >
      {slices.length === 1 ? (
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={slices[0].filled ? slices[0].color : "#000"} />
      ) : (
        slices.map((slice, index) => {
          const start = -Math.PI / 2 + index * sliceAngle;
          return (
            <path
              key={index}
              d={wedgePath(start, start + sliceAngle)}
              fill={slice.filled ? slice.color : "#000"}
              stroke="var(--background)"
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          );
        })
      )}
      <circle cx={CENTER} cy={CENTER} r={RADIUS + 0.5} fill="none" stroke="#33334d" strokeWidth={1} />
    </svg>
  );
}
