// ---------------------------------------------------------------------------
// Model configuration — the single place to swap which model runs each task.
//
// The UI never exposes model choice; change it here in code only. The two
// tasks are configured INDEPENDENTLY so you can, e.g., extract skills with a
// cheap/free model and tailor with a stronger one.
//
// To swap a model: copy one of the PRESETS below into ACTIVE_MODELS, or write
// your own { provider, model } pair.
// ---------------------------------------------------------------------------

export type Provider = "anthropic" | "openrouter";

export interface ModelConfig {
	provider: Provider;
	/** Provider-specific model id. */
	model: string;
}

// Convenience presets. Anthropic ids are used as-is; OpenRouter ids are the
// slugs from https://openrouter.ai/models (":free" variants cost nothing).
export const PRESETS = {
	// --- Anthropic ---
	opus: { provider: "anthropic", model: "claude-opus-4-8" },
	sonnet: { provider: "anthropic", model: "claude-sonnet-4-6" },
	haiku: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },

	// --- OpenRouter (free tiers) ---
	// Note: not every free model supports PDF input or tool/function calling.
	// If a model can't read the PDF, upload text via the "additional
	// experiences" box, or point the resume-reading task at an Anthropic model.
	orGemini: {
		provider: "openrouter",
		model: "google/gemini-2.0-flash-exp:free",
	},
	orLlama: {
		provider: "openrouter",
		model: "meta-llama/llama-3.3-70b-instruct:free",
	},
	orDeepseek: {
		provider: "openrouter",
		model: "deepseek/deepseek-chat-v3-0324:free",
	},
	orQwen: { provider: "openrouter", model: "qwen/qwen-2.5-72b-instruct:free" },
} satisfies Record<string, ModelConfig>;

// ===========================================================================
// ACTIVE CONFIG — edit these two lines to test different models.
// ===========================================================================
export const ACTIVE_MODELS = {
	/** Extracts the list of transferable skills for the selection step. */
	skills: PRESETS.haiku,
	/** Tailors the resume and writes the cover letter. */
	tailor: PRESETS.sonnet,
} satisfies Record<"skills" | "tailor", ModelConfig>;
