"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ResumeData, ResumeEntry } from "@/lib/schema";

// The fixed template. Built only from @react-pdf primitives and the built-in
// Times-Roman family (no font registration needed), so the layout — spacing,
// sizing, rules, alignment — is identical on every generation. The AI never
// touches this file; it only supplies the ResumeData.

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: "#000000",
    lineHeight: 1.2,
    paddingTop: 30,
    paddingBottom: 28,
    paddingHorizontal: 42,
  },

  // Header
  name: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  contact: {
    fontSize: 9.5,
    textAlign: "center",
    marginTop: 3,
    marginBottom: 2,
  },
  link: {
    textDecoration: "underline",
  },

  // Section header with full-width rule beneath it
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

  // Education
  eduRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eduSchool: {
    fontFamily: "Times-Bold",
    fontSize: 10.5,
    flex: 1,
  },
  eduDate: {
    fontFamily: "Times-Italic",
    fontSize: 10,
    flexShrink: 0,
    marginLeft: 8,
  },
  eduDegree: {
    fontFamily: "Times-Italic",
    fontSize: 10,
    marginBottom: 3,
  },

  // Skills
  skillLine: {
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 1.25,
  },
  skillCat: {
    fontFamily: "Times-Bold",
  },

  // Experience / Projects
  entry: {
    marginBottom: 3,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  entryHeading: {
    flex: 1,
    fontSize: 10.5,
  },
  entryTitle: {
    fontFamily: "Times-BoldItalic",
  },
  entryOrg: {
    fontFamily: "Times-Italic",
  },
  entryDate: {
    fontFamily: "Times-Italic",
    fontSize: 10,
    flexShrink: 0,
    marginLeft: 8,
  },

  // Bullets
  bulletRow: {
    flexDirection: "row",
    paddingLeft: 6,
    marginBottom: 1.5,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    textAlign: "justify",
    lineHeight: 1.3,
  },
});

function Bullets({ bullets }: { bullets: string[] }) {
  return (
    <>
      {bullets.map((b, i) => (
        <View style={styles.bulletRow} key={i}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function ExperienceList({ entries }: { entries: ResumeEntry[] }) {
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
          <Bullets bullets={e.bullets} />
        </View>
      ))}
    </>
  );
}

export function ResumeDocument({ data }: { data: ResumeData }) {
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
            <ExperienceList entries={data.workExperience} />
          </View>
        )}

        {/* Projects | Leadership Experience & Activities */}
        {data.projects.length > 0 && (
          <View>
            <Text style={styles.sectionHeader}>
              Projects | Leadership Experience &amp; Activities
            </Text>
            <ExperienceList entries={data.projects} />
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
