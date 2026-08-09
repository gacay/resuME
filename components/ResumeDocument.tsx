"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ResumeData, ResumeEntry } from "@/lib/schema";

export type ResumeTheme = "normal" | "girly";

// The fixed template. The NORMAL theme is built only from @react-pdf primitives
// and the built-in Times-Roman family (no font registration needed). The GIRLY
// theme registers a bubbly display face (Pacifico) + a rounded body face
// (Comic Neue) and repaints everything pink. The AI never touches this file; it
// only supplies the ResumeData.

// --- Girly font registration (config only; fonts are fetched lazily at render
// time, and only when a Text actually uses them). Served from the google/fonts
// mirror on jsDelivr, which exposes stable static .ttf URLs. -----------------
const GF = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl";
let girlyFontsRegistered = false;
function registerGirlyFonts() {
  if (girlyFontsRegistered) return;
  girlyFontsRegistered = true;
  try {
    Font.register({ family: "Pacifico", src: `${GF}/pacifico/Pacifico-Regular.ttf` });
    Font.register({
      family: "Comic Neue",
      fonts: [
        { src: `${GF}/comicneue/ComicNeue-Regular.ttf` },
        { src: `${GF}/comicneue/ComicNeue-Bold.ttf`, fontWeight: 700 },
        { src: `${GF}/comicneue/ComicNeue-Italic.ttf`, fontStyle: "italic" },
        {
          src: `${GF}/comicneue/ComicNeue-BoldItalic.ttf`,
          fontWeight: 700,
          fontStyle: "italic",
        },
      ],
    });
    // Comic Neue has no true bold-italic hinting issues; disable hyphenation.
    Font.registerHyphenationCallback((w) => [w]);
  } catch {
    girlyFontsRegistered = false;
  }
}

const normalStyles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: "#000000",
    lineHeight: 1.2,
    paddingTop: 30,
    paddingBottom: 28,
    paddingHorizontal: 42,
  },
  name: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  contact: { fontSize: 9.5, textAlign: "center", marginTop: 3, marginBottom: 2 },
  link: { textDecoration: "underline" },
  sectionHeader: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 1.5,
    marginTop: 6,
    marginBottom: 4,
  },
  eduRow: { flexDirection: "row", justifyContent: "space-between" },
  eduSchool: { fontFamily: "Times-Bold", fontSize: 10.5, flex: 1 },
  eduDate: { fontFamily: "Times-Italic", fontSize: 10, flexShrink: 0, marginLeft: 8 },
  eduDegree: { fontFamily: "Times-Italic", fontSize: 10, marginBottom: 3 },
  skillLine: { fontSize: 10, marginBottom: 2, lineHeight: 1.25 },
  skillCat: { fontFamily: "Times-Bold" },
  entry: { marginBottom: 3 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  entryHeading: { flex: 1, fontSize: 10.5 },
  entryTitle: { fontFamily: "Times-BoldItalic" },
  entryOrg: { fontFamily: "Times-Italic" },
  entryDate: { fontFamily: "Times-Italic", fontSize: 10, flexShrink: 0, marginLeft: 8 },
  bulletRow: { flexDirection: "row", paddingLeft: 6, marginBottom: 1.5 },
  bulletDot: { width: 12, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, textAlign: "justify", lineHeight: 1.3 },
});

// Pink Y2K girly-pop skin. Same geometry, candy palette + rounded/script faces.
const PINK = "#d6156d";
const PINK_SOFT = "#ff8fcd";
const PINK_INK = "#a01a5e";
const girlyStyles = StyleSheet.create({
  page: {
    fontFamily: "Comic Neue",
    fontSize: 10,
    color: PINK_INK,
    backgroundColor: "#fff2f9",
    lineHeight: 1.25,
    paddingTop: 30,
    paddingBottom: 28,
    paddingHorizontal: 42,
  },
  name: {
    fontFamily: "Pacifico",
    fontSize: 22,
    lineHeight: 1.6,
    color: PINK,
    textAlign: "center",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 10,
  },
  contact: {
    fontSize: 9.5,
    color: PINK_INK,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 2,
  },
  link: { textDecoration: "underline", color: PINK },
  sectionHeader: {
    fontFamily: "Pacifico",
    fontSize: 13,
    lineHeight: 1.6,
    color: PINK,
    letterSpacing: 0.3,
    borderBottomWidth: 1.5,
    borderBottomColor: PINK_SOFT,
    paddingBottom: 4,
    marginTop: 10,
    marginBottom: 6,
  },
  eduRow: { flexDirection: "row", justifyContent: "space-between" },
  eduSchool: { fontFamily: "Comic Neue", fontWeight: 700, fontSize: 10.5, color: PINK_INK, flex: 1 },
  eduDate: {
    fontFamily: "Comic Neue",
    fontStyle: "italic",
    fontSize: 10,
    color: "#c74e93",
    flexShrink: 0,
    marginLeft: 8,
  },
  eduDegree: {
    fontFamily: "Comic Neue",
    fontStyle: "italic",
    fontSize: 10,
    color: "#c74e93",
    marginBottom: 3,
  },
  skillLine: { fontSize: 10, color: PINK_INK, marginBottom: 2, lineHeight: 1.3 },
  skillCat: { fontFamily: "Comic Neue", fontWeight: 700, color: PINK },
  entry: { marginBottom: 4 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  entryHeading: { flex: 1, fontSize: 10.5 },
  entryTitle: { fontFamily: "Comic Neue", fontWeight: 700, fontStyle: "italic", color: PINK },
  entryOrg: { fontFamily: "Comic Neue", fontStyle: "italic", color: "#c74e93" },
  entryDate: {
    fontFamily: "Comic Neue",
    fontStyle: "italic",
    fontSize: 10,
    color: "#c74e93",
    flexShrink: 0,
    marginLeft: 8,
  },
  bulletRow: { flexDirection: "row", paddingLeft: 6, marginBottom: 2 },
  bulletDot: { width: 12, fontSize: 10, color: PINK },
  bulletText: { flex: 1, fontSize: 10, color: PINK_INK, textAlign: "justify", lineHeight: 1.35 },
});

type ResumeStyles = typeof normalStyles | typeof girlyStyles;

function pick(theme: ResumeTheme): ResumeStyles {
  return theme === "girly" ? girlyStyles : normalStyles;
}

function Bullets({
  bullets,
  styles,
  glyph,
}: {
  bullets: string[];
  styles: ResumeStyles;
  glyph: string;
}) {
  return (
    <>
      {bullets.map((b, i) => (
        <View style={styles.bulletRow} key={i}>
          <Text style={styles.bulletDot}>{glyph}</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function ExperienceList({
  entries,
  styles,
  glyph,
}: {
  entries: ResumeEntry[];
  styles: ResumeStyles;
  glyph: string;
}) {
  return (
    <>
      {entries.map((e, i) => (
        <View style={styles.entry} key={i} wrap={false}>
          <View style={styles.entryHeader}>
            <Text style={styles.entryHeading}>
              <Text style={styles.entryTitle}>{e.title}</Text>
              {e.organization ? (
                <Text style={styles.entryOrg}>{` | ${e.organization}`}</Text>
              ) : null}
            </Text>
            {e.date ? <Text style={styles.entryDate}>{e.date}</Text> : null}
          </View>
          <Bullets bullets={e.bullets} styles={styles} glyph={glyph} />
        </View>
      ))}
    </>
  );
}

export function ResumeDocument({
  data,
  theme = "normal",
}: {
  data: ResumeData;
  theme?: ResumeTheme;
}) {
  if (theme === "girly") registerGirlyFonts();
  const styles = pick(theme);
  // Stick to plain ASCII glyphs here: the registered Pacifico/Comic Neue
  // webfonts only embed a Latin subset, so dingbats like ✿ or ♡ have no
  // glyph and render as garbage bytes in the PDF.
  const bullet = theme === "girly" ? "*" : "•";

  const contactParts = [data.location, data.email, data.phone].filter(Boolean);

  return (
    <Document title={`${data.name || "Resume"} — Tailored Resume`}>
      {/* wrap={false} keeps everything on a single page (overflow is clipped, never spills to page 2). */}
      <Page size="LETTER" style={styles.page} wrap={false}>
        {/* Header */}
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.contact}>
          <Text>{contactParts.join("  |  ")}</Text>
          {data.linkedin ? <Text>{"  |  LinkedIn: "}</Text> : null}
          {data.linkedin ? (
            <Text style={styles.link}>{data.linkedin}</Text>
          ) : null}
        </Text>

        {/* Education */}
        {data.education.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Education</Text>
            {data.education.map((ed, i) => (
              <View key={i}>
                <View style={styles.eduRow}>
                  <Text style={styles.eduSchool}>{ed.school}</Text>
                  {ed.date ? <Text style={styles.eduDate}>{ed.date}</Text> : null}
                </View>
                <Text style={styles.eduDegree}>{ed.degree}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Work Experience */}
        {data.workExperience.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Work Experience</Text>
            <ExperienceList
              entries={data.workExperience}
              styles={styles}
              glyph={bullet}
            />
          </View>
        )}

        {/* Projects | Leadership Experience & Activities */}
        {data.projects.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>
              Projects | Leadership Experience &amp; Activities
            </Text>
            <ExperienceList
              entries={data.projects}
              styles={styles}
              glyph={bullet}
            />
          </View>
        )}

        {/* Skills & Interests (placed at the bottom) */}
        {data.skills.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>Skills &amp; Interests</Text>
            {data.skills.map((s, i) => {
              const details = s.details.trim();
              const withPeriod = /[.!?]$/.test(details)
                ? details
                : `${details}.`;
              return (
                <Text style={styles.skillLine} key={i}>
                  <Text style={styles.skillCat}>{`${s.category}: `}</Text>
                  <Text>{withPeriod}</Text>
                </Text>
              );
            })}
          </View>
        )}
      </Page>
    </Document>
  );
}
