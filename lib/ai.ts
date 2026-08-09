// ---------------------------------------------------------------------------
// Provider-agnostic "call a model, force it through one tool, get JSON back".
//
// Both Anthropic and OpenRouter are supported behind a single runToolCall()
// function so the API routes never branch on provider. Which model runs is
// decided entirely by lib/models.ts.
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type { ModelConfig } from "@/lib/models";

/** Order-preserving content the caller wants the model to read. */
export type AIContent =
  | { type: "text"; text: string }
  | { type: "pdf"; base64: string };

/** A JSON-Schema tool the model must call to return structured output. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class AIError extends Error {}

const MAX_TOKENS = 4096;

export async function runToolCall<T = Record<string, unknown>>(opts: {
  config: ModelConfig;
  system: string;
  content: AIContent[];
  tool: ToolSpec;
}): Promise<T> {
  if (opts.config.provider === "anthropic") return runAnthropic<T>(opts);
  return runOpenRouter<T>(opts);
}

// ---------------------------------------------------------------------------
// Anthropic — native document blocks + tool_use
// ---------------------------------------------------------------------------
async function runAnthropic<T>({
  config,
  system,
  content,
  tool,
}: {
  config: ModelConfig;
  system: string;
  content: AIContent[];
  tool: ToolSpec;
}): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AIError("Server is missing ANTHROPIC_API_KEY.");
  }

  const anthropic = new Anthropic();

  const blocks: Anthropic.ContentBlockParam[] = content.map((c) =>
    c.type === "pdf"
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: c.base64,
          },
        }
      : { type: "text", text: c.text },
  );

  try {
    const message = await anthropic.messages.create({
      model: config.model,
      max_tokens: MAX_TOKENS,
      system,
      tools: [tool as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: blocks }],
    });

    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      throw new AIError("The model did not return structured output.");
    }
    return toolUse.input as T;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new AIError(`Anthropic API error (${err.status}): ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// OpenRouter — OpenAI-compatible /chat/completions with forced function call
// ---------------------------------------------------------------------------
async function runOpenRouter<T>({
  config,
  system,
  content,
  tool,
}: {
  config: ModelConfig;
  system: string;
  content: AIContent[];
  tool: ToolSpec;
}): Promise<T> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new AIError("Server is missing OPENROUTER_API_KEY.");
  }

  // Build the OpenAI-style multimodal user content array.
  const userContent = content.map((c) =>
    c.type === "pdf"
      ? {
          type: "file",
          file: {
            filename: "resume.pdf",
            file_data: `data:application/pdf;base64,${c.base64}`,
          },
        }
      : { type: "text", text: c.text },
  );

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(
      `OpenRouter error (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { function?: { arguments?: string } }[];
      };
    }[];
  };

  const message = json.choices?.[0]?.message;
  const rawArgs = message?.tool_calls?.[0]?.function?.arguments;

  // Preferred path: the model called the function with JSON arguments.
  if (rawArgs) {
    try {
      return JSON.parse(rawArgs) as T;
    } catch {
      throw new AIError("OpenRouter returned malformed tool arguments.");
    }
  }

  // Fallback: some free models ignore tool_choice and emit JSON in content.
  if (message?.content) {
    const parsed = extractJson(message.content);
    if (parsed) return parsed as T;
  }

  throw new AIError("The model did not return structured output.");
}

/** Pull the first JSON object out of a text blob (handles ```json fences). */
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
