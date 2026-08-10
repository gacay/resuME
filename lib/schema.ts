// The single source of truth for the resume's shape.
// The AI fills this structure; the PDF template renders it. Keeping content
// (AI) and layout (template) separate is what guarantees a consistent format
// across every generation.

export interface ResumeEntry {
  /** Job title or project/role name. Rendered bold-italic. */
  title: string;
  /** Company, organization, or context. Rendered italic. */
  organization: string;
  /** Date range, e.g. "August 2024 - Present". Right-aligned, italic. */
  date: string;
  bullets: string[];
}

export interface ResumeData {
  name: string;
  location: string;
  email: string;
  phone: string;
  /** LinkedIn URL or handle. Rendered underlined in the contact line. */
  linkedin: string;
  education: { school: string; date: string; degree: string }[];
  /** Each line renders as "**Category:** details". */
  skills: { category: string; details: string }[];
  workExperience: ResumeEntry[];
  /** "PROJECTS | LEADERSHIP EXPERIENCE & ACTIVITIES" section. */
  projects: ResumeEntry[];
}

// JSON Schema given to the model as a tool input schema. Forcing the model to
// call this tool guarantees the response is shaped exactly like ResumeData.
const entrySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    organization: { type: "string" },
    date: { type: "string" },
    bullets: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
      description:
        "Exactly 3 action-verb-led bullets tailored to the job; each long enough to fill at least ~75% of its line (roughly 16-28 words) to minimize blank space.",
    },
  },
  required: ["title", "organization", "date", "bullets"],
} as const;

export const RESUME_TOOL = {
  name: "build_resume",
  description:
    "Return the tailored, one-page resume as structured data. Every field must be filled using only facts present in the candidate's source material.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Candidate full name." },
      location: { type: "string", description: "City, State." },
      email: { type: "string" },
      phone: { type: "string" },
      linkedin: {
        type: "string",
        description: "LinkedIn URL or handle exactly as on the source resume.",
      },
      company: {
        type: "string",
        description:
          "Hiring company name from the job description (used only for the file name; not shown on the resume).",
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            school: { type: "string" },
            date: { type: "string" },
            degree: {
              type: "string",
              description:
                "Degree line, e.g. 'B.A. in Computer Science | GPA: 3.84/4.0'.",
            },
          },
          required: ["school", "date", "degree"],
        },
      },
      skills: {
        type: "array",
        description:
          "Skills relevant to the job, grouped into 3-5 concise lines. Build these ONLY from the transferable skills the candidate selected (provided in the prompt). Omit anything not selected or not called for by the posting.",
        items: {
          type: "object",
          properties: {
            category: { type: "string", description: "Skill group label." },
            details: {
              type: "string",
              description: "Concise comma-separated list for this group.",
            },
          },
          required: ["category", "details"],
        },
      },
      workExperience: {
        type: "array",
        description: "2-3 most relevant roles. Each role has exactly 3 bullets.",
        items: entrySchema,
      },
      projects: {
        type: "array",
        description:
          "2-3 most relevant projects / leadership / activities. Each entry has exactly 3 bullets.",
        items: entrySchema,
      },
    },
    required: [
      "name",
      "location",
      "email",
      "phone",
      "linkedin",
      "company",
      "education",
      "skills",
      "workExperience",
      "projects",
    ],
  },
} as const;

/** Coerce a model value into a clean string array. Handles a proper array, a
 * single string (split into paragraphs/lines), or an array-like object — the
 * model occasionally returns any of these despite the schema. */
function asStringArray(value: unknown): string[] {
  const clean = (s: string) => s.trim();
  const ok = (s: unknown): s is string =>
    typeof s === "string" && s.trim().length > 0;

  if (Array.isArray(value)) return value.filter(ok).map(clean);
  if (typeof value === "string") {
    const byBlank = value.split(/\n{2,}/).map(clean).filter(Boolean);
    if (byBlank.length > 1) return byBlank;
    return value.split(/\n+/).map(clean).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).filter(ok).map(clean);
  }
  return [];
}

/** Replace em/en dashes with commas (the model is asked not to use them, but
 * this guarantees none reach the PDF) and tidy the surrounding punctuation.
 * Ordinary hyphens (e.g. "data-driven") are left untouched. */
export function removeEmDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ", ")
    .replace(/,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Defensive normalization so a missing/odd field never crashes the PDF renderer. */
export function normalizeResume(input: Partial<ResumeData>): ResumeData {
  const entries = (list: unknown): ResumeEntry[] =>
    (Array.isArray(list) ? list : []).map((e) => ({
      title: e?.title ?? "",
      organization: e?.organization ?? "",
      date: e?.date ?? "",
      // Enforce a consistent 3 bullets per entry, even if the model returns more.
      bullets: asStringArray(e?.bullets).slice(0, 3),
    }));

  return {
    name: input.name ?? "",
    location: input.location ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    linkedin: input.linkedin ?? "",
    education: Array.isArray(input.education) ? input.education : [],
    workExperience: entries(input.workExperience),
    projects: entries(input.projects),
    skills: Array.isArray(input.skills) ? input.skills : [],
  };
}

// ---------------------------------------------------------------------------
// Transferable skills (the pre-generation selection step)
// ---------------------------------------------------------------------------

export interface TransferableSkill {
  /** The skill itself, e.g. "Python", "Stakeholder communication". */
  name: string;
  /** A grouping label, e.g. "Programming", "Leadership". */
  category: string;
  /** Where in the resume/experiences this skill is evidenced. */
  evidence: string;
  /** Whether the skill is relevant to the target job description. */
  relevant: boolean;
}

/** A job requirement the candidate does not clearly evidence yet. */
export interface MissingRequirement {
  /** The requirement, e.g. "Kubernetes", "3+ years management". */
  name: string;
  /** A grouping label, e.g. "Tools", "Experience", "Certification". */
  category: string;
  /** What the posting asks for and why it looks unmet from the materials. */
  reason: string;
}

export const SKILLS_TOOL = {
  name: "list_transferable_skills",
  description:
    "Return (1) the transferable skills the candidate genuinely demonstrates, so the user can select which to carry into the tailored resume, and (2) the job requirements the candidate does not clearly meet.",
  input_schema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        description:
          "Every transferable skill actually evidenced in the resume or additional experiences. Do NOT invent skills. Prefer 8-16 distinct, non-overlapping entries.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Short skill name (1-4 words).",
            },
            category: {
              type: "string",
              description:
                "Group label, e.g. 'Programming', 'Data', 'Leadership', 'Communication'.",
            },
            evidence: {
              type: "string",
              description:
                "Brief note on where this skill shows up in the source (role, project, or task). No fabrication.",
            },
            relevant: {
              type: "boolean",
              description:
                "True if this skill is relevant to the target job description.",
            },
          },
          required: ["name", "category", "evidence", "relevant"],
        },
      },
      missing: {
        type: "array",
        description:
          "Job-description requirements the candidate does NOT clearly evidence in the resume or additional experiences. 0-8 entries; empty if the candidate appears to meet everything important. Do NOT fabricate requirements not in the posting.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Short requirement name (1-5 words).",
            },
            category: {
              type: "string",
              description:
                "Group label, e.g. 'Tools', 'Experience', 'Education', 'Certification'.",
            },
            reason: {
              type: "string",
              description:
                "What the posting asks for and why it looks unmet from the provided materials.",
            },
          },
          required: ["name", "category", "reason"],
        },
      },
    },
    required: ["skills", "missing"],
  },
} as const;

export function normalizeSkills(input: {
  skills?: unknown;
}): TransferableSkill[] {
  const list = Array.isArray(input?.skills) ? input.skills : [];
  const seen = new Set<string>();
  const out: TransferableSkill[] = [];
  for (const s of list) {
    const name = (s?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      category: (s?.category ?? "General").trim() || "General",
      evidence: (s?.evidence ?? "").trim(),
      relevant: Boolean(s?.relevant),
    });
  }
  return out;
}

export function normalizeMissing(input: {
  missing?: unknown;
}): MissingRequirement[] {
  const list = Array.isArray(input?.missing) ? input.missing : [];
  const seen = new Set<string>();
  const out: MissingRequirement[] = [];
  for (const m of list) {
    const name = (m?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      category: (m?.category ?? "Requirement").trim() || "Requirement",
      reason: (m?.reason ?? "").trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

export interface CoverLetterData {
  name: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  /** Hiring company, from the job description. */
  company: string;
  /** Body paragraphs, in order. */
  paragraphs: string[];
  /** Name used to sign off (preferred form if evident). */
  signatureName: string;
}

export const COVER_LETTER_TOOL = {
  name: "build_cover_letter",
  description:
    "Return a tailored, one-page cover letter as structured data, using only facts present in the candidate's source material.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Candidate full name (letter header).",
      },
      location: { type: "string", description: "City, State." },
      email: { type: "string" },
      phone: { type: "string" },
      linkedin: {
        type: "string",
        description: "LinkedIn URL or handle exactly as on the source resume.",
      },
      company: {
        type: "string",
        description: "Hiring company name from the job description.",
      },
      signatureName: {
        type: "string",
        description:
          "Name to sign off with — preferred first-name form if evident (e.g. from the email or LinkedIn handle), otherwise the full name.",
      },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        minItems: 4,
        maxItems: 5,
        description:
          "4-5 body paragraphs in order: (1) interest in the role + hook + company alignment, (2) why a strong fit with concrete skills/experience, (3) why drawn to the company using real job-description details, (4) why the role appeals / growth, (5) brief thank-you close.",
      },
    },
    required: [
      "name",
      "location",
      "email",
      "phone",
      "linkedin",
      "company",
      "signatureName",
      "paragraphs",
    ],
  },
} as const;

export function normalizeCoverLetter(
  input: Partial<CoverLetterData>,
): CoverLetterData {
  return {
    name: input.name ?? "",
    location: input.location ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    linkedin: input.linkedin ?? "",
    company: input.company ?? "",
    paragraphs: asStringArray(input.paragraphs).map(removeEmDashes),
    signatureName: (input.signatureName ?? "").trim() || (input.name ?? ""),
  };
}
