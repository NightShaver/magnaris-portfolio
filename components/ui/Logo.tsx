import {
  LOGO_PARTS,
  LOGO_TRANSFORM,
  LOGO_VIEWBOX,
  toPolygonPoints,
} from "@/lib/logo";

type LogoProps = {
  className?: string;
  /** Solid forms take currentColor, so the mark inherits its context. */
  title?: string;
  /** Renders the shards in brand colours (default) or in currentColor. */
  monochrome?: boolean;
};

/**
 * The Magnaris mark. Same polygons the hero extrudes in 3D — see lib/logo.ts.
 */
export function Logo({ className, title = "Magnaris", monochrome }: LogoProps) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <g transform={LOGO_TRANSFORM}>
        {LOGO_PARTS.map((part) => (
          <polygon
            key={part.id}
            points={toPolygonPoints(part.points)}
            fill={
              monochrome || part.role === "solid"
                ? "currentColor"
                : part.role === "teal"
                  ? "#0F8E91"
                  : "#6F63C7"
            }
            opacity={monochrome && part.role !== "solid" ? 0.55 : 1}
          />
        ))}
      </g>
    </svg>
  );
}

export default Logo;
