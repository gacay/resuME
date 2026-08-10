"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ResumeData,
  CoverLetterData,
  TransferableSkill,
  MissingRequirement,
} from "@/lib/schema";
import { loadState, saveState, clearState } from "@/lib/storage";
import { MusicVisualizer } from "@/components/MusicVisualizer";

const GIRLY_KEY = "resume-tailor:girly";

type Kind = "resume" | "cover";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:...;base64," prefix.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function buildFileName(name: string, kind: string, company?: string): string {
  const namePart = slug(name) || "Tailored";
  const companyPart = company && company.trim() ? `_${slug(company)}` : "";
  return `${namePart}_${kind}${companyPart}.pdf`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Merge the three additional-experience boxes into one labeled block, exactly
 * like the single free-text box used to relay to the agent. */
function combineExperiences(parts: {
  jobs: string;
  projects: string;
  skills: string;
}): string {
  const sections: string[] = [];
  if (parts.jobs.trim()) sections.push(`Jobs:\n${parts.jobs.trim()}`);
  if (parts.projects.trim()) {
    sections.push(`Experience / Projects:\n${parts.projects.trim()}`);
  }
  if (parts.skills.trim()) sections.push(`Skills:\n${parts.skills.trim()}`);
  return sections.join("\n\n");
}

export default function Home() {
  const [resumeName, setResumeName] = useState("");
  const [resumeBase64, setResumeBase64] = useState("");
  const [resumeMime, setResumeMime] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [expJobs, setExpJobs] = useState("");
  const [expProjects, setExpProjects] = useState("");
  const [expSkills, setExpSkills] = useState("");

  const [busy, setBusy] = useState<"skills" | Kind | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Girly Pop mode — repaints the whole site and starts the music/visualizer.
  // It no longer affects the generated PDF: both modes output the same
  // professional resume and cover letter.
  const [girly, setGirly] = useState(false);

  // Pre-generation review step (rendered as a modal).
  const [pendingKind, setPendingKind] = useState<Kind | null>(null);
  const [skills, setSkills] = useState<TransferableSkill[] | null>(null);
  const [missing, setMissing] = useState<MissingRequirement[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [gapText, setGapText] = useState("");

  // Load saved inputs once on mount.
  useEffect(() => {
    const s = loadState();
    if (s.resumeName) setResumeName(s.resumeName);
    if (s.resumeBase64) setResumeBase64(s.resumeBase64);
    if (s.resumeMime) setResumeMime(s.resumeMime);
    if (s.jobDescription) setJobDescription(s.jobDescription);
    if (s.expJobs) setExpJobs(s.expJobs);
    if (s.expProjects) setExpProjects(s.expProjects);
    if (s.expSkills) setExpSkills(s.expSkills);
    try {
      setGirly(window.localStorage.getItem(GIRLY_KEY) === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist + reflect the girly flag on <body> so the background layers and
  // global skin apply beyond this component's subtree.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(GIRLY_KEY, girly ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.body.classList.toggle("girly-pop", girly);
    return () => document.body.classList.remove("girly-pop");
  }, [girly, hydrated]);

  // Persist inputs whenever they change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    saveState({
      resumeName,
      resumeBase64,
      resumeMime,
      jobDescription,
      expJobs,
      expProjects,
      expSkills,
    });
  }, [
    hydrated,
    resumeName,
    resumeBase64,
    resumeMime,
    jobDescription,
    expJobs,
    expProjects,
    expSkills,
  ]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const base64 = await fileToBase64(file);
      setResumeName(file.name);
      setResumeBase64(base64);
      setResumeMime(file.type || "application/pdf");
    } catch {
      setError("Could not read that file. Try a different PDF.");
    }
  }

  function removeResume() {
    setResumeName("");
    setResumeBase64("");
    setResumeMime("");
  }

  function resetSkillsStep() {
    setPendingKind(null);
    setSkills(null);
    setMissing([]);
    setSelected({});
    setGapText("");
  }

  function onClearAll() {
    removeResume();
    setJobDescription("");
    setExpJobs("");
    setExpProjects("");
    setExpSkills("");
    clearState();
    resetSkillsStep();
    setStatus("");
    setError("");
  }

  function validateInputs(): string | null {
    if (!jobDescription.trim()) return "Please paste a job description.";
    const hasExperiences = !!(
      expJobs.trim() ||
      expProjects.trim() ||
      expSkills.trim()
    );
    if (!resumeBase64 && !hasExperiences) {
      return "Upload your resume or add some past experiences first.";
    }
    return null;
  }

  // Step 1 — analyze the resume: identify transferable skills + unmet
  // requirements, then open the review modal.
  async function startFlow(kind: Kind) {
    setError("");
    setStatus("");
    const problem = validateInputs();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy("skills");
    setStatus("Scanning your resume for skills and gaps…");
    resetSkillsStep();

    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeBase64,
          resumeMime,
          jobDescription,
          experiences: combineExperiences({
            jobs: expJobs,
            projects: expProjects,
            skills: expSkills,
          }),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Could not read skills.");

      const list = (payload.skills ?? []) as TransferableSkill[];
      const gaps = (payload.missing ?? []) as MissingRequirement[];
      // Pre-select the skills the agent judged relevant to this job.
      const preselect: Record<string, boolean> = {};
      for (const s of list) preselect[s.name] = s.relevant;

      setSkills(list);
      setMissing(gaps);
      setSelected(preselect);
      setPendingKind(kind);
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("");
    } finally {
      setBusy(null);
    }
  }

  function toggleSkill(name: string) {
    setSelected((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function setAll(value: boolean) {
    if (!skills) return;
    const next: Record<string, boolean> = {};
    for (const s of skills) next[s.name] = value;
    setSelected(next);
  }

  // Step 2 — generate with only the skills the user kept, plus any experience
  // they added in the modal to cover the gaps.
  async function confirmAndGenerate() {
    if (!pendingKind || !skills) return;
    const kind = pendingKind;
    const selectedSkills = skills
      .map((s) => s.name)
      .filter((name) => selected[name]);

    const baseExp = combineExperiences({
      jobs: expJobs,
      projects: expProjects,
      skills: expSkills,
    });
    const gap = gapText.trim();
    // The gap text is user-authored truthful experience. It is folded into the
    // experiences payload and flagged so the model treats it as source material
    // (never as license to invent).
    const experiences = gap
      ? `${baseExp}${baseExp ? "\n\n" : ""}EXPERIENCE THE CANDIDATE ADDED TO ADDRESS JOB REQUIREMENTS (truthful source material — use it, do not embellish beyond it):\n${gap}`
      : baseExp;

    setError("");
    setBusy(kind);
    setStatus(
      kind === "resume"
        ? "Tailoring your resume…"
        : "Writing your cover letter…",
    );

    try {
      const res = await fetch(
        kind === "resume" ? "/api/generate" : "/api/cover-letter",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeBase64,
            resumeMime,
            jobDescription,
            experiences,
            selectedSkills,
          }),
        },
      );

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Generation failed.");

      setStatus("Building your PDF…");

      // Generate the PDF entirely in the browser, then auto-download it.
      const { pdf } = await import("@react-pdf/renderer");

      let blob: Blob;
      let filename: string;

      if (kind === "resume") {
        const data = payload as ResumeData & { company?: string };
        const { ResumeDocument } = await import("@/components/ResumeDocument");
        blob = await pdf(<ResumeDocument data={data} />).toBlob();
        filename = buildFileName(data.name, "Resume", data.company);
      } else {
        const data = payload as CoverLetterData;
        const { CoverLetterDocument } = await import(
          "@/components/CoverLetterDocument"
        );
        blob = await pdf(<CoverLetterDocument data={data} />).toBlob();
        filename = buildFileName(data.name, "Cover_Letter", data.company);
      }

      downloadBlob(blob, filename);
      resetSkillsStep();

      setStatus(
        kind === "resume"
          ? "Done — your tailored resume has been downloaded."
          : "Done — your cover letter has been downloaded.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("");
    } finally {
      setBusy(null);
    }
  }

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  // Group skills by category for the selection list.
  const grouped = useMemo(() => {
    if (!skills) return [];
    const map = new Map<string, TransferableSkill[]>();
    for (const s of skills) {
      const arr = map.get(s.category) ?? [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return [...map.entries()];
  }, [skills]);

  const inSkillsStep = pendingKind !== null && skills !== null;
  const anyBusy = busy !== null;

  // Fixed, deterministic scatter of twinkling background stars for girly mode.
  const bgStars = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => {
        const rnd = (n: number) => ((Math.sin(i * 99.7 + n) + 1) / 2) * 100;
        return {
          left: rnd(1),
          top: rnd(2),
          size: 10 + rnd(3) * 0.22,
          delay: rnd(4) * 0.04,
          glyph: i % 3 === 0 ? "✦" : i % 3 === 1 ? "✧" : "★",
        };
      }),
    [],
  );

  // Floating hearts / sparkles that drift upward in girly mode.
  const bgHearts = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const rnd = (n: number) => ((Math.sin(i * 57.3 + n) + 1) / 2) * 100;
        const glyphs = ["💖", "🌸", "✨", "🎀", "💗", "⭐", "🦋"];
        return {
          left: rnd(1),
          size: 34 + rnd(2) * 0.42,
          duration: 12 + rnd(3) * 0.1,
          delay: rnd(4) * 0.12,
          glyph: glyphs[i % glyphs.length],
        };
      }),
    [],
  );

  return (
    <main className="relative mx-auto max-w-3xl px-4 py-8 sm:px-5 sm:py-10">
      {/* Girly Pop background layers (rendered only when the mode is on). */}
      {girly && (
        <>
          <div className="girly-pop-bg" aria-hidden />
          <div className="girly-pop-stars" aria-hidden>
            {bgStars.map((s, i) => (
              <span
                key={i}
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  fontSize: `${s.size}px`,
                  animationDelay: `${s.delay}s`,
                }}
              >
                {s.glyph}
              </span>
            ))}
          </div>
          <div className="girly-pop-hearts" aria-hidden>
            {bgHearts.map((h, i) => (
              <span
                key={i}
                style={{
                  left: `${h.left}%`,
                  fontSize: `${h.size}px`,
                  animationDuration: `${h.duration}s`,
                  animationDelay: `${h.delay}s`,
                }}
              >
                {h.glyph}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Normal / Girly Pop switch */}
      <div className="gp-switch-wrap">
        <span className="gp-switch-label-off">Normal</span>
        <button
          type="button"
          role="switch"
          aria-checked={girly}
          aria-label="Toggle Girly Pop mode"
          className="gp-switch"
          data-on={girly}
          onClick={() => setGirly((g) => !g)}
        >
          <span className="gp-switch-knob">{girly ? "💖" : "🖤"}</span>
        </button>
        <span className="gp-switch-label-on">Girly Pop</span>
      </div>

      {/* Music player + star visualizer (only in Girly Pop mode). */}
      {girly && <MusicVisualizer active={girly} src="/girl-like-me.mp3" />}

      <header className="mb-8 text-center sm:text-left">
        {girly && (
          <div className="gp-eyebrow" aria-hidden>
            ˚₊‧ ⋆ ˚꒰ఌ your main-character era ఌ꒱ ˚ ⋆ ‧₊˚
          </div>
        )}
        <h1 className="gp-title text-2xl font-bold tracking-tight break-words sm:text-3xl">
          Resume Tailor
        </h1>
        <p className="mt-2 text-slate-600">
          {girly
            ? "Slay bestie 💅 Upload your resume, drop the job description, then pick your main-character transferable skills. We glow it up into a tailored, one-page resume or a matching cover letter. Your inputs stay saved in this browser."
            : "Upload your resume, paste a job description, then review the skills and gaps we find before generating a tailored, one-page resume or a matching cover letter. Your inputs are saved in this browser."}
        </p>
      </header>

      <div className="space-y-6">
        {/* Resume upload */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800">
            {girly ? "💾 Current resume (PDF)" : "Current resume (PDF)"}
          </label>
          <p className="mb-3 text-sm text-slate-500">
            The model reads this to pull your name, education, and experience.
          </p>

          {resumeName ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="truncate text-sm text-slate-700">
                📄 {resumeName}
              </span>
              <button
                type="button"
                onClick={removeResume}
                className="ml-3 shrink-0 text-sm font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="application/pdf"
              onChange={onFileChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          )}
        </section>

        {/* Job description */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label
            htmlFor="jd"
            className="block text-sm font-semibold text-slate-800"
          >
            {girly ? "💌 Job description" : "Job description"}
          </label>
          <p className="mb-3 text-sm text-slate-500">
            Paste the full posting you&apos;re tailoring toward.
          </p>
          <textarea
            id="jd"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            placeholder="Paste the job description here…"
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </section>

        {/* Additional experiences — split into three categories */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800">
            {girly ? "🌟 Additional experiences" : "Additional experiences"}{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <p className="mb-4 text-sm text-slate-500">
            Anything not on your resume, split by type. The tailoring step pulls
            these in when they fit the job — all three boxes are sent to the
            model together.
          </p>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="exp-jobs"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Jobs
              </label>
              <textarea
                id="exp-jobs"
                value={expJobs}
                onChange={(e) => setExpJobs(e.target.value)}
                rows={4}
                placeholder="e.g. Part-time role, internship, or job not on your resume…"
                className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="exp-projects"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Experience / Projects
              </label>
              <textarea
                id="exp-projects"
                value={expProjects}
                onChange={(e) => setExpProjects(e.target.value)}
                rows={4}
                placeholder="e.g. Side project, coursework, volunteer or leadership work…"
                className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="exp-skills"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Skills
              </label>
              <textarea
                id="exp-skills"
                value={expSkills}
                onChange={(e) => setExpSkills(e.target.value)}
                rows={4}
                placeholder="e.g. Tools, languages, or methods not captured on your resume…"
                className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => startFlow("resume")}
            disabled={anyBusy}
            className="w-full rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === "skills"
              ? "Analyzing…"
              : girly
                ? "✨ Generate tailored resume"
                : "Generate tailored resume"}
          </button>
          <button
            type="button"
            onClick={() => startFlow("cover")}
            disabled={anyBusy}
            className="w-full rounded-lg border border-slate-900 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy === "skills"
              ? "Analyzing…"
              : girly
                ? "💌 Generate cover letter"
                : "Generate cover letter"}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={anyBusy}
            className="w-full rounded-lg px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60 sm:w-auto"
          >
            Clear saved data
          </button>
        </div>

        {status && !error && <p className="text-sm text-slate-600">{status}</p>}
        {error && !inSkillsStep && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {/* ================= Pre-generation review modal ================= */}
      {inSkillsStep && (
        <div
          className="gp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Review skills before generating"
          onClick={(e) => {
            if (e.target === e.currentTarget && !anyBusy) resetSkillsStep();
          }}
        >
          <div className="gp-modal-card">
            <div className="gp-modal-header">
              <div className="min-w-0">
                <h2 className="gp-modal-title">
                  {girly ? "✨ Before we glow it up" : "Before you generate"}
                </h2>
                <p className="gp-modal-sub">
                  Pick the skills to carry into your{" "}
                  {pendingKind === "resume" ? "resume" : "cover letter"}, and add
                  anything that covers the gaps we found. We only use what you
                  give us — no invented experience.
                </p>
              </div>
              <button
                type="button"
                className="gp-modal-close"
                aria-label="Close"
                onClick={() => !anyBusy && resetSkillsStep()}
                disabled={anyBusy}
              >
                ✕
              </button>
            </div>

            <div className="gp-modal-body">
              {/* Transferable skills */}
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="gp-modal-section-title">
                  {girly ? "💅 Your transferable skills" : "Transferable skills"}
                </h3>
                <span className="text-sm text-slate-500">
                  {selectedCount} of {skills!.length} selected
                </span>
              </div>
              <p className="mb-3 text-sm text-slate-500">
                Only checked skills are used, so the model can&apos;t invent
                skills you don&apos;t have. JD-relevant ones are pre-selected.
              </p>
              <div className="mb-3 flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  className="font-medium text-slate-700 hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  className="font-medium text-slate-700 hover:underline"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-4">
                {grouped.map(([category, items]) => (
                  <div key={category}>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {category}
                    </h4>
                    <div className="space-y-1.5">
                      {items.map((s) => (
                        <label
                          key={s.name}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={!!selected[s.name]}
                            onChange={() => toggleSkill(s.name)}
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-slate-800">
                              {s.name}
                            </span>
                            {s.relevant && (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                JD match
                              </span>
                            )}
                            {s.evidence && (
                              <span className="block text-xs text-slate-500">
                                {s.evidence}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Gaps / unmet requirements */}
              <div className="gp-gap">
                <h3 className="gp-modal-section-title">
                  {girly
                    ? "🔍 Requirements you might be missing"
                    : "Requirements you might be missing"}
                </h3>
                {missing.length > 0 ? (
                  <>
                    <p className="mb-3 text-sm text-slate-500">
                      From the job description, these look unmet in your current
                      materials. If you actually have relevant experience, add it
                      below and we&apos;ll weave it in truthfully.
                    </p>
                    <ul className="space-y-1.5">
                      {missing.map((m) => (
                        <li key={m.name} className="gp-gap-item">
                          <span className="gp-gap-badge">{m.category}</span>
                          <span className="min-w-0">
                            <span className="text-sm font-semibold text-slate-800">
                              {m.name}
                            </span>
                            {m.reason && (
                              <span className="block text-xs text-slate-500">
                                {m.reason}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    {girly
                      ? "You slay — nothing major looks missing for this role. 💖"
                      : "Nothing major looks missing for this role based on your materials."}
                  </p>
                )}

                <label
                  htmlFor="gap-text"
                  className="mb-1 mt-4 block text-sm font-medium text-slate-700"
                >
                  Add relevant experience to cover these{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  Only real, truthful experience. This is added to your source
                  material — the model will not fabricate beyond what you write.
                </p>
                <textarea
                  id="gap-text"
                  value={gapText}
                  onChange={(e) => setGapText(e.target.value)}
                  rows={4}
                  placeholder="e.g. I used Kubernetes to deploy a class project, and led a 4-person team for two semesters…"
                  className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              {error && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="gp-modal-footer">
              <button
                type="button"
                onClick={confirmAndGenerate}
                disabled={anyBusy}
                className="w-full rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy === pendingKind
                  ? "Generating…"
                  : pendingKind === "resume"
                    ? `Generate resume with ${selectedCount} skill${selectedCount === 1 ? "" : "s"}`
                    : `Generate cover letter with ${selectedCount} skill${selectedCount === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={resetSkillsStep}
                disabled={anyBusy}
                className="w-full rounded-lg px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-slate-400">
        Inputs are stored only in your browser. PDFs are generated in-memory and
        never uploaded.
      </footer>
    </main>
  );
}
