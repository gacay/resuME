import Anthropic from "@anthropic-ai/sdk";
import { RESUME_TOOL, normalizeResume, type ResumeData } from "@/lib/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompt";

// Claude PDF reading + generation runs on the Node runtime, not Edge.
export const runtime = "nodejs";
// Give the model call headroom (Vercel Hobby allows up to 60s).
export const maxDuration = 60;

// To cut cost, swap to "claude-sonnet-4-6" (also supports tool use well).
const MODEL = "claude-opus-4-8";

interface GenerateBody {
  resumeBase64?: string;
  resumeMime?: string;
  resumeText?: string;
  jobDescription?: string;
  experiences?: string;
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
    text: buildUserPrompt({
      jobDescription,
      experiences,
      hasResume: hasResumePdf || !!body.resumeText?.trim(),
    }),
  });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [RESUME_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: RESUME_TOOL.name },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse) {
      return Response.json(
        { error: "The model did not return a structured resume." },
        { status: 502 },
      );
    }

    const input = toolUse.input as Partial<ResumeData> & { company?: string };
    const data = normalizeResume(input);
    const company = (input.company ?? "").trim();

    if (!data.name && data.workExperience.length === 0 && data.projects.length === 0) {
      return Response.json(
        { error: "Could not extract enough content to build a resume." },
        { status: 422 },
      );
    }

    return Response.json({ ...data, company });
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `Claude API error (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error generating the resume.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
