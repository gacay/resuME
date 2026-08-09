import {
  COVER_LETTER_TOOL,
  normalizeCoverLetter,
  type CoverLetterData,
} from "@/lib/schema";
import { COVER_LETTER_SYSTEM_PROMPT, buildCoverLetterPrompt } from "@/lib/prompt";
import { runToolCall, AIError, type AIContent } from "@/lib/ai";
import { ACTIVE_MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CoverLetterBody {
  resumeBase64?: string;
  resumeMime?: string;
  resumeText?: string;
  jobDescription?: string;
  experiences?: string;
  selectedSkills?: string[];
  girly?: boolean;
}

export async function POST(req: Request) {
  let body: CoverLetterBody;
  try {
    body = (await req.json()) as CoverLetterBody;
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
      { error: "Provide a resume or some experiences to write from." },
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
    text: buildCoverLetterPrompt({
      jobDescription,
      experiences,
      hasResume: hasResumePdf || !!body.resumeText?.trim(),
      selectedSkills,
      girly: !!body.girly,
    }),
  });

  try {
    const input = await runToolCall<Partial<CoverLetterData>>({
      config: ACTIVE_MODELS.tailor,
      system: COVER_LETTER_SYSTEM_PROMPT,
      content,
      tool: COVER_LETTER_TOOL,
    });

    const data = normalizeCoverLetter(input);

    if (data.paragraphs.length === 0) {
      return Response.json(
        { error: "Could not generate cover letter content." },
        { status: 422 },
      );
    }

    return Response.json(data);
  } catch (err) {
    const msg =
      err instanceof AIError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error generating the cover letter.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
