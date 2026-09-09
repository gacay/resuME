"use client";

// On-screen preview of the generated document. Neutral and professional
// (white sheet, serif) and a faithful mirror of the original PDF templates
// (ResumeDocument / CoverLetterDocument) — so the preview matches what the
// user downloads. The theme lives in the app chrome, never on the document.

import { BUILTIN_SECTIONS } from "@/lib/schema";
import type { CoverLetterData, ResumeData, ResumeEntry } from "@/lib/schema";

const sheet: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid var(--line)",
  boxShadow: "0 18px 44px rgba(20,14,8,0.14)",
  fontFamily: "Georgia, 'Times New Roman', serif",
};

const bullet: React.CSSProperties = {
  display: "flex",
  gap: 6,
  paddingLeft: 6,
  marginTop: 2,
  fontSize: 12.5,
  lineHeight: 1.4,
};

function sectionHeader(text: string) {
  return (
    <div
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        borderBottom: "1px solid #1A1A1A",
        paddingBottom: 2,
        marginTop: 12,
        marginBottom: 5,
      }}
    >
      {text}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <div key={i} style={bullet}>
          <span>•</span>
          <span style={{ flex: 1, textAlign: "justify" }}>{b}</span>
        </div>
      ))}
    </>
  );
}

function EntryList({ entries }: { entries: ResumeEntry[] }) {
  return (
    <>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
            <span>
              <span style={{ fontWeight: 700, fontStyle: "italic" }}>{e.title}</span>
              {e.organization ? (
                <span style={{ fontStyle: "italic" }}>{` | ${e.organization}`}</span>
              ) : null}
            </span>
            {e.date ? (
              <span style={{ fontStyle: "italic", fontSize: 12, whiteSpace: "nowrap" }}>{e.date}</span>
            ) : null}
          </div>
          <Bullets items={e.bullets} />
        </div>
      ))}
    </>
  );
}

function effectiveOrder(data: ResumeData): string[] {
  const provided = data.sectionOrder ?? BUILTIN_SECTIONS.map((s) => s.key);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of provided)
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  for (const s of BUILTIN_SECTIONS)
    if (!seen.has(s.key)) {
      seen.add(s.key);
      out.push(s.key);
    }
  return out;
}

export function ResumePreview({ data }: { data: ResumeData }) {
  const contactParts = [data.location, data.email, data.phone].filter(Boolean);
  const customById = new Map((data.customSections ?? []).map((c) => [c.id, c] as const));

  function section(key: string) {
    switch (key) {
      case "education":
        if (data.education.length === 0) return null;
        return (
          <div key="education">
            {sectionHeader("Education")}
            {data.education.map((ed, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{ed.school}</span>
                  {ed.date ? (
                    <span style={{ fontStyle: "italic", fontSize: 12, whiteSpace: "nowrap" }}>{ed.date}</span>
                  ) : null}
                </div>
                <div style={{ fontStyle: "italic", fontSize: 12, marginBottom: 4 }}>{ed.degree}</div>
              </div>
            ))}
          </div>
        );
      case "workExperience":
        if (data.workExperience.length === 0) return null;
        return (
          <div key="workExperience">
            {sectionHeader("Work Experience")}
            <EntryList entries={data.workExperience} />
          </div>
        );
      case "projects":
        if (data.projects.length === 0) return null;
        return (
          <div key="projects">
            {sectionHeader("Projects | Leadership Experience & Activities")}
            <EntryList entries={data.projects} />
          </div>
        );
      case "skills":
        if (data.skills.length === 0) return null;
        return (
          <div key="skills">
            {sectionHeader("Skills & Interests")}
            {data.skills.map((s, i) => {
              const d = s.details.trim();
              const withPeriod = /[.!?]$/.test(d) ? d : `${d}.`;
              return (
                <div key={i} style={{ fontSize: 12.5, marginBottom: 3, lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 700 }}>{s.category}: </span>
                  {withPeriod}
                </div>
              );
            })}
          </div>
        );
      default: {
        const c = customById.get(key);
        if (!c || c.bullets.length === 0) return null;
        return (
          <div key={c.id}>
            {sectionHeader(c.title)}
            <Bullets items={c.bullets} />
          </div>
        );
      }
    }
  }

  return (
    <div style={{ ...sheet, padding: "44px 48px 52px" }}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
            lineHeight: 1.2,
          }}
        >
          {data.name}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 4 }}>
          {contactParts.join("  |  ")}
          {data.linkedin ? "  |  LinkedIn: " : ""}
          {data.linkedin ? <span style={{ textDecoration: "underline" }}>{data.linkedin}</span> : null}
        </div>
      </div>
      {effectiveOrder(data).map((k) => section(k))}
    </div>
  );
}

export function CoverLetterPreview({ data }: { data: CoverLetterData }) {
  const contactParts = [data.location, data.email, data.phone].filter(Boolean);

  return (
    <div style={{ ...sheet, padding: "52px 56px 60px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{data.name}</div>
      <div style={{ fontSize: 11.5, marginBottom: 18 }}>
        {contactParts.join(" | ")}
        {data.linkedin ? " | LinkedIn: " : ""}
        {data.linkedin ? <span style={{ textDecoration: "underline" }}>{data.linkedin}</span> : null}
      </div>

      <div style={{ marginBottom: 16, fontSize: 12.5, lineHeight: 1.5 }}>
        <div>Hiring Manager</div>
        {data.company ? <div>{data.company}</div> : null}
      </div>

      <div style={{ marginBottom: 12, fontSize: 12.5 }}>Dear Hiring Manager,</div>

      {data.paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 11px", fontSize: 12.5, lineHeight: 1.5, textAlign: "left" }}>
          {p}
        </p>
      ))}

      <div style={{ marginTop: 6, fontSize: 12.5 }}>Sincerely,</div>
      <div style={{ fontSize: 12.5 }}>{data.signatureName || data.name}</div>
    </div>
  );
}
