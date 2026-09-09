"use client";

// Nón Lá theme artwork — all inline SVG, drawn from scratch. Theme colors are
// applied via `style` (CSS custom properties) rather than presentation
// attributes, so they resolve reliably in every browser and track the theme.

const cone = { stroke: "var(--coneLine)" } as const;

/** Nón quai thao lamp — the light/dark toggle. Wrap in a <button> to make it
 * clickable; the SVG itself just draws the hat + light pool. */
export function Lamp() {
  const straw = [
    "M43 20 L10 20",
    "M43 20 L14 26.3",
    "M43 20 L26 29.7",
    "M43 20 L43 30.5",
    "M43 20 L60 29.7",
    "M43 20 L72 26.3",
    "M43 20 L76 20",
    "M43 20 L14 13.7",
    "M43 20 L26 10.3",
    "M43 20 L43 9.5",
    "M43 20 L60 10.3",
    "M43 20 L72 13.7",
  ];
  const ticks = [
    "M17 25.6 V32.1",
    "M25 28.4 V34.9",
    "M34 29.9 V36.4",
    "M43 30.4 V36.9",
    "M52 29.9 V36.4",
    "M61 28.4 V34.9",
    "M69 25.6 V32.1",
  ];
  return (
    <svg width="86" height="72" viewBox="0 0 86 72" aria-hidden="true">
      <defs>
        <radialGradient id="lampGlow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" style={{ stopColor: "var(--glowA)", stopOpacity: 0.85 }} />
          <stop offset="100%" style={{ stopColor: "var(--glowA)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="lampShade" cx="50%" cy="50%" r="55%">
          <stop offset="0%" style={{ stopColor: "var(--shadowInk)", stopOpacity: "var(--shadowOp)" }} />
          <stop offset="100%" style={{ stopColor: "var(--shadowInk)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <ellipse cx="43" cy="45" rx="32" ry="7" fill="url(#lampShade)" />
      <ellipse
        cx="43"
        cy="48"
        rx="28"
        ry="10"
        fill="url(#lampGlow)"
        style={{ opacity: "var(--glowSoft)", transition: "opacity .45s ease" }}
      />
      <path
        d="M10 20 A 33 10.5 0 0 0 76 20 L76 26 A 33 10.5 0 0 1 10 26 Z"
        style={{ fill: "var(--coneFill)", stroke: "var(--coneLine)" }}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <g style={cone} strokeWidth="0.6" opacity="0.4">
        {ticks.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <ellipse
        cx="43"
        cy="20"
        rx="33"
        ry="10.5"
        style={{ fill: "var(--coneFill)", stroke: "var(--coneLine)" }}
        strokeWidth="1.3"
      />
      <g style={cone} strokeWidth="0.55" opacity="0.32">
        {straw.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <ellipse
        cx="43"
        cy="20"
        rx="21"
        ry="6.6"
        fill="none"
        style={cone}
        strokeWidth="0.7"
        opacity="0.5"
      />
      <ellipse
        cx="43"
        cy="20"
        rx="7.5"
        ry="2.6"
        style={{ fill: "var(--strap)", stroke: "var(--coneLine)" }}
        strokeWidth="0.7"
        opacity="0.9"
      />
    </svg>
  );
}

/** Large nón lá outline — first-visit hero. */
export function NonOutline() {
  return (
    <svg width="230" height="132" viewBox="0 0 230 132" aria-hidden="true">
      <defs>
        <radialGradient id="hatShade" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#0C0906" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0C0906" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="115" cy="108" rx="82" ry="16" fill="url(#hatShade)" />
      <path
        d="M115 12 L206 84 Q115 106 24 84 Z"
        fill="none"
        style={cone}
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <path d="M60 42 Q115 52 170 42" fill="none" style={cone} strokeWidth="0.8" opacity="0.3" />
      <path d="M40 62 Q115 76 190 62" fill="none" style={cone} strokeWidth="0.8" opacity="0.3" />
      <path d="M115 12 L70 92" fill="none" style={cone} strokeWidth="0.7" opacity="0.3" />
      <path d="M115 12 L115 96" fill="none" style={cone} strokeWidth="0.7" opacity="0.3" />
      <path d="M115 12 L160 92" fill="none" style={cone} strokeWidth="0.7" opacity="0.3" />
    </svg>
  );
}

/** Needle-and-thread section mark. */
export function NeedleMark() {
  return (
    <svg
      width="24"
      height="22"
      viewBox="0 0 24 22"
      aria-hidden="true"
      style={{ flex: "none", marginTop: 2 }}
    >
      <path
        d="M3 19 L18 5"
        style={{ stroke: "var(--ink)" }}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse
        cx="18.6"
        cy="4.4"
        rx="1.9"
        ry="1.2"
        transform="rotate(-43 18.6 4.4)"
        fill="none"
        style={{ stroke: "var(--ink)" }}
        strokeWidth="0.9"
      />
      <path
        d="M17 6 C 23 6, 22 14, 14 13 C 5 12, 2 4, 9 3"
        fill="none"
        style={{ stroke: "var(--accent)" }}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Silk-thread spiral footnote glyph. */
export function ThreadSpiral({
  size = 26,
  colorVar = "--accent",
}: {
  size?: number;
  colorVar?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M13 22 C6 22 4 15 8 12 C12 9 18 12 16 16 C14.6 18.8 11 18 11 15"
        fill="none"
        style={{ stroke: `var(${colorVar})` }}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Small document/file icon for the resume chip. */
export function DocIcon() {
  return (
    <svg
      width="14"
      height="18"
      viewBox="0 0 14 18"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M1 1 H9 L13 5 V17 H1 Z" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="1.2" />
      <path d="M9 1 V5 H13" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="1.2" />
    </svg>
  );
}

/** Tiny nón lá glyph used as the review checkbox. */
export function NonCheck({ checked }: { checked: boolean }) {
  return (
    <svg
      width="19"
      height="16"
      viewBox="0 0 19 16"
      aria-hidden="true"
      style={{ flex: "none", marginTop: 2 }}
    >
      <path
        d="M9.5 2 L17 12 Q9.5 15 2 12 Z"
        style={{
          fill: checked ? "var(--accent)" : "transparent",
          stroke: "var(--coneLine)",
        }}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hand-drawn full-width rule. */
export function RuleWide({ marginBottom = 30 }: { marginBottom?: number }) {
  return (
    <svg
      width="100%"
      height="8"
      viewBox="0 0 880 8"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", marginBottom }}
    >
      <path d="M0 5 Q220 1 440 5 T880 4" fill="none" style={{ stroke: "var(--line)" }} strokeWidth="1.4" />
    </svg>
  );
}

/** Vành nón concentric arcs — form footer ornament. */
export function FooterArcs() {
  return (
    <svg
      width="180"
      height="40"
      viewBox="0 0 180 40"
      aria-hidden="true"
      style={{ display: "block", margin: "54px auto 0", opacity: 0.5 }}
    >
      <path d="M10 34 Q90 6 170 34" fill="none" style={{ stroke: "var(--line)" }} strokeWidth="1.2" />
      <path d="M28 34 Q90 14 152 34" fill="none" style={{ stroke: "var(--line)" }} strokeWidth="1.2" />
      <path d="M48 34 Q90 22 132 34" fill="none" style={{ stroke: "var(--line)" }} strokeWidth="1.2" />
    </svg>
  );
}

/** Dropdown chevron (inherits currentColor). */
export function Chevron() {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
      <path d="M1 1 L4.5 4.5 L8 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
