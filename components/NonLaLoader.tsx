"use client";

import { useEffect, useState } from "react";
import { ScooterThread } from "@/components/ScooterThread";

// Full-screen loading state: a nón lá street-vendor scooter riding the dashed
// thread line under a cycling chain-of-thought line.

// Whimsical chain-of-thought lines that cycle while the model works — part
// task, part play, part nón lá craft.
const PHRASES = [
  "Thinking…",
  "Reading the posting…",
  "Matching your skills…",
  "Threading the needle…",
  "Weaving in your experience…",
  "Frolicking…",
  "Trimming the fluff…",
  "Shaping the brim…",
  "Polishing the bullet points…",
  "Pondering…",
  "Checking the fit…",
  "Almost there…",
];

export function NonLaLoader({ kind = "resume" }: { kind?: "resume" | "cover" }) {
  const [phrase, setPhrase] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setPhrase((n) => (n + 1) % PHRASES.length),
      3200,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        minHeight: "78vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 34,
        padding: "60px 24px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="font-lora" style={{ fontSize: 19, letterSpacing: ".01em" }}>
          {kind === "cover" ? "Writing your cover letter" : "Tailoring your resume"}
        </div>
        <ScooterThread />
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "var(--ink2)",
            whiteSpace: "nowrap",
          }}
        >
          <span key={phrase} style={{ display: "inline-block", animation: "fadeUp .4s ease" }}>
            {PHRASES[phrase]}
          </span>
        </div>
      </div>
    </div>
  );
}
