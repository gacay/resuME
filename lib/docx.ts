// Word (.docx) builders that mirror the PDF templates. They consume the exact
// same ResumeData / CoverLetterData the PDF renderers do, so the Word download
// carries the same content, section order, custom sections, and Times New
// Roman styling — just in an editable format. Imported dynamically on the
// client (like @react-pdf), so it never ships in the main bundle.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { BUILTIN_SECTIONS } from "@/lib/schema";
import type { CoverLetterData, ResumeData, ResumeEntry } from "@/lib/schema";

const FONT = "Times New Roman";
// Letter (12240 twips) minus 0.5" margins each side.
const CONTENT_WIDTH = 10800;

// Sizes are in half-points (e.g. 22 = 11pt), spacing in twips (20 ≈ 1pt).

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
    },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, font: FONT, size: 22 }),
    ],
  });
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 20 },
    children: [new TextRun({ text, font: FONT, size: 20 })],
  });
}

function renderEntry(e: ResumeEntry): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
      children: [
        new TextRun({
          text: e.title,
          bold: true,
          italics: true,
          font: FONT,
          size: 21,
        }),
        ...(e.organization
          ? [
              new TextRun({
                text: ` | ${e.organization}`,
                italics: true,
                font: FONT,
                size: 21,
              }),
            ]
          : []),
        ...(e.date
          ? [
              new TextRun({
                text: `\t${e.date}`,
                italics: true,
                font: FONT,
                size: 20,
              }),
            ]
          : []),
      ],
    }),
    ...e.bullets.map((b) => bulletPara(b)),
  ];
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

function renderResumeSection(
  key: string,
  data: ResumeData,
  customById: Map<string, { id: string; title: string; bullets: string[] }>,
): Paragraph[] {
  switch (key) {
    case "education":
      if (data.education.length === 0) return [];
      return [
        sectionHeader("Education"),
        ...data.education.flatMap((ed) => [
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
            children: [
              new TextRun({ text: ed.school, bold: true, font: FONT, size: 21 }),
              ...(ed.date
                ? [
                    new TextRun({
                      text: `\t${ed.date}`,
                      italics: true,
                      font: FONT,
                      size: 20,
                    }),
                  ]
                : []),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: ed.degree,
                italics: true,
                font: FONT,
                size: 20,
              }),
            ],
          }),
        ]),
      ];

    case "workExperience":
      if (data.workExperience.length === 0) return [];
      return [
        sectionHeader("Work Experience"),
        ...data.workExperience.flatMap((e) => renderEntry(e)),
      ];

    case "projects":
      if (data.projects.length === 0) return [];
      return [
        sectionHeader("Projects | Leadership Experience & Activities"),
        ...data.projects.flatMap((e) => renderEntry(e)),
      ];

    case "skills":
      if (data.skills.length === 0) return [];
      return [
        sectionHeader("Skills & Interests"),
        ...data.skills.map((s) => {
          const details = s.details.trim();
          const withPeriod = /[.!?]$/.test(details) ? details : `${details}.`;
          return new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: `${s.category}: `,
                bold: true,
                font: FONT,
                size: 20,
              }),
              new TextRun({ text: withPeriod, font: FONT, size: 20 }),
            ],
          });
        }),
      ];

    default: {
      const custom = customById.get(key);
      if (!custom || custom.bullets.length === 0) return [];
      return [
        sectionHeader(custom.title),
        ...custom.bullets.map((b) => bulletPara(b)),
      ];
    }
  }
}

export async function resumeToDocxBlob(data: ResumeData): Promise<Blob> {
  const children: Paragraph[] = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: (data.name || "").toUpperCase(),
          bold: true,
          font: FONT,
          size: 32,
        }),
      ],
    }),
  );

  const contactParts = [data.location, data.email, data.phone].filter(Boolean);
  const contactRuns = [
    new TextRun({ text: contactParts.join("  |  "), font: FONT, size: 19 }),
  ];
  if (data.linkedin) {
    contactRuns.push(
      new TextRun({ text: "  |  LinkedIn: ", font: FONT, size: 19 }),
    );
    contactRuns.push(
      new TextRun({
        text: data.linkedin,
        font: FONT,
        size: 19,
        underline: {},
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: contactRuns,
    }),
  );

  const customById = new Map(
    (data.customSections ?? []).map((c) => [c.id, c] as const),
  );
  for (const key of effectiveOrder(data)) {
    children.push(...renderResumeSection(key, data, customById));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 576, bottom: 576, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function coverLetterToDocxBlob(
  data: CoverLetterData,
): Promise<Blob> {
  const children: Paragraph[] = [];

  // Header
  children.push(
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.name, bold: true, font: FONT, size: 24 })],
    }),
  );

  const contactParts = [data.location, data.email, data.phone].filter(Boolean);
  const contactRuns = [
    new TextRun({ text: contactParts.join(" | "), font: FONT, size: 22 }),
  ];
  if (data.linkedin) {
    contactRuns.push(new TextRun({ text: " | LinkedIn: ", font: FONT, size: 22 }));
    contactRuns.push(
      new TextRun({ text: data.linkedin, font: FONT, size: 22, underline: {} }),
    );
  }
  children.push(new Paragraph({ spacing: { after: 280 }, children: contactRuns }));

  // Recipient
  children.push(
    new Paragraph({
      spacing: { after: data.company ? 0 : 240 },
      children: [new TextRun({ text: "Hiring Manager", font: FONT, size: 22 })],
    }),
  );
  if (data.company) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: data.company, font: FONT, size: 22 })],
      }),
    );
  }

  // Salutation
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Dear Hiring Manager,", font: FONT, size: 22 }),
      ],
    }),
  );

  // Body
  for (const p of data.paragraphs) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200, line: 300 },
        children: [new TextRun({ text: p, font: FONT, size: 22 })],
      }),
    );
  }

  // Closing
  children.push(
    new Paragraph({
      spacing: { before: 80 },
      children: [new TextRun({ text: "Sincerely,", font: FONT, size: 22 })],
    }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.signatureName || data.name,
          font: FONT,
          size: 22,
        }),
      ],
    }),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
