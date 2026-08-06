import Anthropic from "@anthropic-ai/sdk";
import {
  COVER_LETTER_TOOL,
  normalizeCoverLetter,
  type CoverLetterData,
} from "@/lib/schema";
import { COVER_LETTER_SYSTEM_PROMPT, buildCoverLetterPrompt } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

// To cut cost, swap to "claude-sonnet-4-6".
const MODEL = "claude-opus-4-8";

interface CoverLetterBody {
  resumeBase64?: string;
  resumeMime?: string;
  resumeText?: string;
  jobDescription?: string;
  experiences?: string;
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  const anthropic = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];

  if (hasResumePdf) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: body.resumeBase64 as string,
      },
    });
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
    }),
  });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: COVER_LETTER_SYSTEM_PROMPT,
      tools: [COVER_LETTER_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: COVER_LETTER_TOOL.name },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse) {
      return Response.json(
        { error: "The model did not return a cover letter." },
        { status: 502 },
      );
    }

    const data = normalizeCoverLetter(toolUse.input as Partial<CoverLetterData>);

    if (data.paragraphs.length === 0) {
      return Response.json(
        { error: "Could not generate cover letter content." },
        { status: 422 },
      );
    }

    return Response.json(data);
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `Claude API error (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error generating the cover letter.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
