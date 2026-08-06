# Resume Tailor

A web app that tailors your resume to a specific job description and exports a
consistent, one-page PDF. Upload your resume, paste a job description (and any
extra experiences), click **Generate**, and a tailored PDF downloads
automatically.

## How it works

```
Your inputs ─▶ /api/generate ─▶ Claude (structured JSON) ─▶ fixed PDF template ─▶ download
```

The key design decision: **content generation and layout are separate.**

- **Claude** reads your resume (PDF) + extra experiences + the job description
  and returns _structured JSON only_ — it never produces formatting. It's forced
  to call a single `build_resume` tool whose schema is the resume's shape, so the
  output is always the same shape.
- A **hardcoded `@react-pdf/renderer` template** ([components/ResumeDocument.tsx](components/ResumeDocument.tsx))
  renders that JSON. Because the template is fixed and uses the built-in
  Times-Roman font, spacing, sizing, rules, and alignment are identical on every
  generation.

This is what guarantees the format never drifts between runs.

## Stack

| Layer       | Choice                          |
| ----------- | ------------------------------- |
| Framework   | Next.js (App Router) + Tailwind |
| AI          | Claude (`claude-opus-4-8`) via `@anthropic-ai/sdk`, tool use for structured output |
| PDF         | `@react-pdf/renderer`, generated client-side in-memory |
| Persistence | Browser `localStorage`          |
| Deploy      | Vercel                          |

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then paste your Anthropic API key
npm run dev
```

Open http://localhost:3000.

Get an API key at https://console.anthropic.com/.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at https://vercel.com/new (it auto-detects Next.js).
3. Add an environment variable **`ANTHROPIC_API_KEY`** in the project settings.
4. Deploy.

The `/api/generate` route runs as a Node serverless function with
`maxDuration = 60` so the Claude call has headroom.

## Customizing

- **The template / format** — edit [components/ResumeDocument.tsx](components/ResumeDocument.tsx).
  All fonts, sizes, margins, and section rules live in the `StyleSheet`. Change
  it once and every future resume follows the new look.
- **Tailoring behavior & one-page budget** — edit the system prompt in
  [lib/prompt.ts](lib/prompt.ts). The bullet counts and length limits there are
  tuned to keep output on a single page.
- **The resume sections / fields** — edit [lib/schema.ts](lib/schema.ts)
  (`ResumeData`, `RESUME_TOOL`) and the matching render in the template.
- **Cost** — switch `MODEL` in [app/api/generate/route.ts](app/api/generate/route.ts)
  to `claude-sonnet-4-6` for cheaper runs; it handles structured tool output well.

## Notes

- One page is enforced by a content budget in the prompt (limited roles/bullets
  + concise lengths) plus a compact template. If you paste an unusually large
  amount of content it could still spill; tighten the budgets in `lib/prompt.ts`
  if needed.
- Bullets use `•` (a glyph the built-in Times font supports). To match the exact
  `●` from a specific sample, register a TTF via `@react-pdf`'s `Font.register`.
- Your resume and text are saved only in your browser (`localStorage`) and the
  PDF is built in-memory in the browser — nothing is persisted server-side.
