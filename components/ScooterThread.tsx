"use client";

// A Vietnamese street-vendor scooter (rider in a nón lá, glass food crate on
// the rear rack, hanging bag) driving left-to-right along the animated dashed
// thread line. Decorative — the loading text carries the actual state.
//
// Colour: the SVG's `color` is the ink token, so every `currentColor` stroke/
// fill re-themes automatically; `--accent` is used only for the nón lá, shirt
// tint, crate bowls and bag, applied via style (var() isn't reliable in SVG
// presentation attributes). Animations live in CSS classes (see globals.css)
// so the prefers-reduced-motion block can switch them off.

const accent = (opacity?: number): React.CSSProperties =>
  opacity === undefined
    ? { fill: "var(--accent)" }
    : { fill: "var(--accent)", fillOpacity: opacity };

export function ScooterThread() {
  return (
    <div style={{ width: 220, margin: "20px auto 0", overflow: "hidden" }}>
      <svg
        width="220"
        height="62"
        viewBox="0 0 220 62"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible", color: "var(--coneLine)" }}
      >
        {/* Road / thread */}
        <path
          className="scoot-thread"
          d="M2 56 Q55 51 110 56 T218 55"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="14 10"
          style={{ stroke: "var(--accent)" }}
        />

        <g className="scoot-run">
          <g className="scoot-bob">
            <g transform="translate(0,3.2)">
              <ellipse cx="26" cy="53.6" rx="22" ry="1.7" fill="currentColor" opacity="0.12" />

              {/* wheels */}
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.05"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <g className="scoot-wheel">
                  <circle cx="12" cy="46" r="6.2" />
                  <circle cx="12" cy="46" r="4.7" strokeWidth="0.5" opacity="0.45" />
                  <circle cx="12" cy="46" r="1.3" strokeWidth="0.8" />
                  <g strokeWidth="0.45" opacity="0.55">
                    <path d="M12 41.3 L12 50.7 M7.3 46 L16.7 46 M8.7 42.7 L15.3 49.3 M15.3 42.7 L8.7 49.3 M9.8 41.7 L14.2 50.3 M14.2 41.7 L9.8 50.3 M7.7 43.8 L16.3 48.2 M16.3 43.8 L7.7 48.2" />
                  </g>
                </g>
                <g className="scoot-wheel">
                  <circle cx="44" cy="46" r="6.2" />
                  <circle cx="44" cy="46" r="4.7" strokeWidth="0.5" opacity="0.45" />
                  <circle cx="44" cy="46" r="1.3" strokeWidth="0.8" />
                  <g strokeWidth="0.45" opacity="0.55">
                    <path d="M44 41.3 L44 50.7 M39.3 46 L48.7 46 M40.7 42.7 L47.3 49.3 M47.3 42.7 L40.7 49.3 M41.8 41.7 L46.2 50.3 M46.2 41.7 L41.8 50.3 M39.7 43.8 L48.3 48.2 M48.3 43.8 L39.7 48.2" />
                  </g>
                </g>
              </g>

              {/* frame, fenders, seat, engine, leg shield, handlebar, mirror, headlight */}
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.05"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5.6 44.2 Q6.2 37 14 38" strokeWidth="0.85" />
                <path d="M37.6 43.2 Q40 37.4 47 39.6" strokeWidth="0.85" />
                <path d="M19.2 38.8 L12.6 45.2" strokeWidth="0.9" />
                <path
                  d="M17.6 35.4 L26.4 35.4 Q28.1 35.4 28.1 37.1 L18.4 37.4 Q16.9 37.1 17.6 35.4 Z"
                  fill="currentColor"
                  fillOpacity="0.14"
                />
                <path d="M27.6 36.8 L28.8 42.5 L34.8 42.5 Q37.6 41.1 37.8 36.2 L38.3 31.7" />
                <path
                  d="M20.4 38.1 Q25.6 38.4 27.5 41.4 L20.9 41.4 Q19.4 39.9 20.4 38.1 Z"
                  fill="currentColor"
                  fillOpacity="0.1"
                  strokeWidth="0.85"
                />
                <path d="M22.4 43.6 L14.2 44.9" strokeWidth="0.9" />
                <path d="M38.1 32.6 L43.4 44.4" strokeWidth="0.95" />
                <path d="M36.4 38.4 Q39.6 38 40.6 40.6" strokeWidth="0.6" opacity="0.65" />
                <circle cx="38.9" cy="34.6" r="1.5" strokeWidth="0.7" fill="currentColor" fillOpacity="0.12" />
                <path d="M38.3 31.7 L43 30.7" />
                <path d="M40.8 31.1 L45.6 30.4" strokeWidth="0.85" />
                <path d="M44.6 30.5 L47.6 28.3" strokeWidth="0.7" />
                <circle cx="48.4" cy="27.5" r="1.15" strokeWidth="0.7" />
                <path d="M16.4 47.9 L9.6 47.9" strokeWidth="0.6" opacity="0.55" />
              </g>

              {/* glass food crate on the rear rack */}
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="0.95"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.4 39.6 L5.2 43.4 M14.6 39.6 L14 43.4" strokeWidth="0.65" opacity="0.75" />
                <path d="M2.6 39.6 L2.6 20.6 L16.4 20.6 L16.4 39.6 Z" />
                <path d="M1.2 20.6 L17.8 20.6" strokeWidth="1.15" />
                <path d="M2.6 21.9 L16.4 21.9" strokeWidth="0.5" opacity="0.5" />
                <path d="M2.6 26.4 L16.4 26.4 M2.6 31.4 L16.4 31.4 M2.6 36 L16.4 36" strokeWidth="0.55" opacity="0.6" />
                <path d="M9.5 20.6 L9.5 39.6" strokeWidth="0.5" opacity="0.4" />
                <path d="M2.6 39.6 L16.4 39.6" strokeWidth="0.9" />
                <path d="M4.2 23.2 Q6.1 26.2 8 23.2 Z" strokeWidth="0.7" fill="currentColor" fillOpacity="0.12" />
                <path d="M11 23.2 Q12.9 26.2 14.8 23.2 Z" strokeWidth="0.7" fill="currentColor" fillOpacity="0.12" />
                <path d="M4.6 31.2 L4.6 28.2 Q6 27 7.4 28.2 L7.4 31.2 Z" strokeWidth="0.7" />
                <path d="M6 27.5 L6 26.3" strokeWidth="0.6" />
                <path d="M11.6 31.2 L11.6 28.2 Q13 27 14.4 28.2 L14.4 31.2 Z" strokeWidth="0.7" />
                <path d="M13 27.5 L13 26.3" strokeWidth="0.6" />
                <path d="M3.8 35.7 Q6.2 32.6 8.6 35.7 Z" strokeWidth="0.7" style={accent(0.14)} />
                <path d="M10.9 35.7 Q13.3 32.6 15.7 35.7 Z" strokeWidth="0.7" style={accent(0.14)} />
                <path d="M3.8 38.8 L15.6 38.8 M5.4 36.8 L5.4 38.8 M14 36.8 L14 38.8" strokeWidth="0.55" opacity="0.6" />
              </g>

              {/* hanging bag (sways) */}
              <g className="scoot-bag">
                <path d="M0.8 21 L0.8 24.2" fill="none" stroke="currentColor" strokeWidth="0.6" />
                <path
                  d="M-1.6 24.2 Q0.8 23 3.2 24.2 Q3.6 29 0.8 29.8 Q-2 29 -1.6 24.2 Z"
                  stroke="currentColor"
                  strokeWidth="0.8"
                  style={accent(0.18)}
                />
                <path d="M-0.7 26.6 Q0.8 27.4 2.3 26.6" fill="none" stroke="currentColor" strokeWidth="0.45" opacity="0.6" />
              </g>

              {/* rider */}
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.05"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22.6 34.6 L29.2 38.3 L31.5 42.5" />
                <path d="M31.5 42.5 L34.4 42.7" strokeWidth="0.9" />
                <path d="M20.9 35.6 Q20.9 29.4 23.2 26.4 Q26.6 24.2 29 27.2 Q30.2 31.4 28 35.9 Z" style={accent(0.2)} />
                <path d="M22.6 30.6 Q25.8 31.6 28.6 30.2" strokeWidth="0.55" opacity="0.55" />
                <path d="M24.4 26.2 Q26.3 27.8 28.4 26.6" strokeWidth="0.55" opacity="0.6" />
                <path d="M26.9 28.3 Q33.2 28.2 38.6 30.9 L41.6 30.8" />
                <path d="M27.3 25.9 L28.6 24.4" strokeWidth="0.8" />
                <ellipse cx="28.9" cy="22.6" rx="3.05" ry="3.3" />
                <path d="M30.6 24.4 Q32 23.7 31.9 22.2" strokeWidth="0.55" opacity="0.65" />
                <path d="M26.4 21.4 Q26 23.8 26.8 25" strokeWidth="0.5" opacity="0.45" />
              </g>

              {/* nón lá + chin strap */}
              <path
                d="M21.2 20.6 L28.9 13.2 L36.6 20.6 Q28.9 23.4 21.2 20.6 Z"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeLinejoin="round"
                style={accent()}
              />
              <g fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5">
                <path d="M25 17 Q28.9 18.2 32.8 17" />
                <path d="M23 19 Q28.9 20.8 34.8 19" />
                <path d="M28.9 13.2 L28.9 21.9" />
                <path d="M28.9 13.2 L24.4 21.2" opacity="0.75" />
                <path d="M28.9 13.2 L33.4 21.2" opacity="0.75" />
              </g>
              <path d="M26.9 21.9 Q28.9 24.8 30.9 21.9" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
