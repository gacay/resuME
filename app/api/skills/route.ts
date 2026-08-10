import { SKILLS_TOOL, normalizeSkills, normalizeMissing } from "@/lib/schema";
import { SKILLS_SYSTEM_PROMPT, buildSkillsPrompt } from "@/lib/prompt";
import { runToolCall, AIError, type AIContent } from "@/lib/ai";
import { ACTIVE_MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SkillsBody {
  resumeBase64?: string;
  resumeMime?: string;
  resumeText?: string;
  jobDescription?: string;
  experiences?: string;
}

export async function POST(req: Request) {
  let body: SkillsBody;
  try {
    body = (await req.json()) as SkillsBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const jobDescription = (body.jobDescription ?? "").trim();
  const experiences = (body.experiences ?? "").trim();

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
      { error: "Provide a resume or some experiences to analyze." },
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
    text: buildSkillsPrompt({
      jobDescription,
      experiences,
      hasResume: hasResumePdf || !!body.resumeText?.trim(),
    }),
  });

  try {
    const raw = await runToolCall<{ skills?: unknown; missing?: unknown }>({
      config: ACTIVE_MODELS.skills,
      system: SKILLS_SYSTEM_PROMPT,
      content,
      tool: SKILLS_TOOL,
    });

    const skills = normalizeSkills(raw);
    const missing = normalizeMissing(raw);

    if (skills.length === 0) {
      return Response.json(
        { error: "Could not identify any transferable skills." },
        { status: 422 },
      );
    }

    return Response.json({ skills, missing });
  } catch (err) {
    const msg =
      err instanceof AIError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error extracting skills.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
