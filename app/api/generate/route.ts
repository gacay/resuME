import { RESUME_TOOL, normalizeResume, type ResumeData } from "@/lib/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompt";
import { runToolCall, AIError, type AIContent } from "@/lib/ai";
import { ACTIVE_MODELS } from "@/lib/models";

// PDF reading + generation runs on the Node runtime, not Edge.
export const runtime = "nodejs";
// Give the model call headroom (Vercel Hobby allows up to 60s).
export const maxDuration = 60;

interface GenerateBody {
  resumeBase64?: string;
  resumeMime?: string;
  resumeText?: string;
  jobDescription?: string;
  experiences?: string;
  selectedSkills?: string[];
  girly?: boolean;
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const jobDescription = (body.jobDescription ?? "").trim();
  const experiences = (body.experiences ?? "").trim();
  const selectedSkills = Array.isArray(body.selectedSkills)
    ? body.selectedSkills.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (!jobDescription) {
    return Response.json(
      { error: "A job description is required." },
      { status: 400 },
    );
  }

  const hasResumePdf =
    !!body.resumeBase64 && body.resumeMime === "application/pdf";

  if (!hasResumePdf && !body.resumeText?.trim() && !experiences) {
    return Response.json(
      { error: "Provide a resume or some experiences to tailor from." },
      { status: 400 },
    );
  }

  const content: AIContent[] = [];

  if (hasResumePdf) {
    content.push({ type: "pdf", base64: body.resumeBase64 as string });
  } else if (body.resumeText?.trim()) {
    content.push({
      type: "text",
      text: `CURRENT RESUME:\n${body.resumeText.trim()}`,
    });
  }

  content.push({
    type: "text",
    text: buildUserPrompt({
      jobDescription,
      experiences,
      hasResume: hasResumePdf || !!body.resumeText?.trim(),
      selectedSkills,
      girly: !!body.girly,
    }),
  });

  try {
    const input = await runToolCall<Partial<ResumeData> & { company?: string }>(
      {
        config: ACTIVE_MODELS.tailor,
        system: SYSTEM_PROMPT,
        content,
        tool: RESUME_TOOL,
      },
    );

    const data = normalizeResume(input);
    const company = (input.company ?? "").trim();

    const isEmpty =
      !data.name &&
      data.workExperience.length === 0 &&
      data.projects.length === 0;

    if (isEmpty) {
      return Response.json(
        { error: "Could not extract enough content to build a resume." },
        { status: 422 },
      );
    }

    return Response.json({ ...data, company });
  } catch (err) {
    const msg =
      err instanceof AIError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error generating the resume.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
