"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { CoverLetterData } from "@/lib/schema";

// Fixed cover-letter template, mirroring the provided sample: a left-aligned
// bold name, a contact line with an underlined LinkedIn, the recipient block
// (Hiring Manager / Company), salutation, body paragraphs, and a signature.
// Built only from @react-pdf primitives + built-in Times-Roman, so formatting
// is identical on every generation.

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: "#000000",
    lineHeight: 1.4,
    paddingTop: 60,
    paddingBottom: 54,
    paddingHorizontal: 64,
  },
  name: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    marginBottom: 2,
  },
  contact: {
    fontSize: 11,
    marginBottom: 18,
  },
  link: {
    textDecoration: "underline",
  },
  recipient: {
    marginBottom: 16,
  },
  salutation: {
    marginBottom: 12,
  },
  paragraph: {
    marginBottom: 11,
    textAlign: "left",
  },
  closing: {
    marginTop: 4,
  },
});

export function CoverLetterDocument({ data }: { data: CoverLetterData }) {
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
        <Text style={styles.salutation}>Dear Hiring Manager,</Text>

        {/* Body */}
        {data.paragraphs.map((p, i) => (
          <Text style={styles.paragraph} key={i}>
            {p}
          </Text>
        ))}

        {/* Closing */}
        <View style={styles.closing}>
          <Text>Sincerely,</Text>
          <Text>{data.signatureName || data.name}</Text>
        </View>
      </Page>
    </Document>
  );
}
