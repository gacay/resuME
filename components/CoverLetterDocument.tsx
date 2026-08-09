"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { CoverLetterData } from "@/lib/schema";

export type CoverLetterTheme = "normal" | "girly";

// Fixed cover-letter template. NORMAL uses built-in Times-Roman; GIRLY registers
// a bubbly script (Pacifico) + rounded body (Comic Neue) and repaints pink.
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
  } catch {
    girlyFontsRegistered = false;
  }
}

const normalStyles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: "#000000",
    lineHeight: 1.4,
    paddingTop: 60,
    paddingBottom: 54,
    paddingHorizontal: 64,
  },
  name: { fontFamily: "Times-Bold", fontSize: 12, marginBottom: 2 },
  contact: { fontSize: 11, marginBottom: 18 },
  link: { textDecoration: "underline" },
  recipient: { marginBottom: 16 },
  salutation: { marginBottom: 12 },
  paragraph: { marginBottom: 11, textAlign: "left" },
  closing: { marginTop: 4 },
});

const PINK = "#d6156d";
const PINK_INK = "#a01a5e";
const girlyStyles = StyleSheet.create({
  page: {
    fontFamily: "Comic Neue",
    fontSize: 11,
    color: PINK_INK,
    backgroundColor: "#fff2f9",
    lineHeight: 1.45,
    paddingTop: 60,
    paddingBottom: 54,
    paddingHorizontal: 64,
  },
  name: { fontFamily: "Pacifico", fontSize: 20, color: PINK, marginBottom: 6 },
  contact: { fontSize: 11, color: PINK_INK, marginBottom: 18 },
  link: { textDecoration: "underline", color: PINK },
  recipient: { marginBottom: 16, color: PINK_INK },
  salutation: { marginBottom: 12, fontWeight: 700, color: PINK },
  paragraph: { marginBottom: 11, textAlign: "left", color: PINK_INK },
  closing: { marginTop: 4, color: PINK_INK },
});

export function CoverLetterDocument({
  data,
  theme = "normal",
}: {
  data: CoverLetterData;
  theme?: CoverLetterTheme;
}) {
  if (theme === "girly") registerGirlyFonts();
  const styles = theme === "girly" ? girlyStyles : normalStyles;
  const salutation =
    theme === "girly" ? "Hi lovely Hiring Manager," : "Dear Hiring Manager,";
  const signOff = theme === "girly" ? "With sparkles and gratitude," : "Sincerely,";

  const contactParts = [data.location, data.email, data.phone].filter(Boolean);

  return (
    <Document title={`${data.name || "Cover Letter"} — Cover Letter`}>
      <Page size="LETTER" style={styles.page} wrap={false}>
        {/* Header */}
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.contact}>
          <Text>{contactParts.join(" | ")}</Text>
          {data.linkedin ? <Text>{" | LinkedIn: "}</Text> : null}
          {data.linkedin ? (
            <Text style={styles.link}>{data.linkedin}</Text>
          ) : null}
        </Text>

        {/* Recipient */}
        <View style={styles.recipient}>
          <Text>Hiring Manager</Text>
          {data.company ? <Text>{data.company}</Text> : null}
        </View>

        {/* Salutation */}
        <Text style={styles.salutation}>{salutation}</Text>

        {/* Body */}
        {data.paragraphs.map((p, i) => (
          <Text style={styles.paragraph} key={i}>
            {p}
          </Text>
        ))}

        {/* Closing */}
        <View style={styles.closing}>
          <Text>{signOff}</Text>
          <Text>{data.signatureName || data.name}</Text>
        </View>
      </Page>
    </Document>
  );
}
