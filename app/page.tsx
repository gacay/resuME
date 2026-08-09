"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ResumeData,
  CoverLetterData,
  TransferableSkill,
} from "@/lib/schema";
import { loadState, saveState, clearState } from "@/lib/storage";

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

  // Transferable-skills selection step.
  const [pendingKind, setPendingKind] = useState<Kind | null>(null);
  const [skills, setSkills] = useState<TransferableSkill[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

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
    setHydrated(true);
  }, []);

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
    setSelected({});
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

  // Step 1 — identify transferable skills for the user to select from.
  async function startFlow(kind: Kind) {
    setError("");
    setStatus("");
    const problem = validateInputs();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy("skills");
    setStatus("Scanning your resume for transferable skills…");
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
      // Pre-select the skills the agent judged relevant to this job.
      const preselect: Record<string, boolean> = {};
      for (const s of list) preselect[s.name] = s.relevant;

      setSkills(list);
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

  // Step 2 — generate with only the skills the user kept.
  async function confirmAndGenerate() {
    if (!pendingKind || !skills) return;
    const kind = pendingKind;
    const selectedSkills = skills
      .map((s) => s.name)
      .filter((name) => selected[name]);

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
            experiences: combineExperiences({
              jobs: expJobs,
              projects: expProjects,
              skills: expSkills,
            }),
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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Resume Tailor</h1>
        <p className="mt-2 text-slate-600">
          Upload your resume, paste a job description, then pick which
          transferable skills to carry over before generating a tailored,
          one-page resume or a matching cover letter. Your inputs are saved in
          this browser.
        </p>
      </header>

      <div className="space-y-6">
        {/* Resume upload */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800">
            Current resume (PDF)
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
            Job description
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
            Additional experiences{" "}
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

        {/* Transferable-skills selection step */}
        {inSkillsStep && (
          <section className="rounded-xl border border-slate-900 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Select transferable skills
              </h2>
              <span className="text-sm text-slate-500">
                {selectedCount} of {skills!.length} selected
              </span>
            </div>
            <p className="mt-1 mb-3 text-sm text-slate-500">
              These are the skills found in your resume. Only the ones you keep
              checked will be used in the tailored{" "}
              {pendingKind === "resume" ? "resume" : "cover letter"} — this stops
              the model from inventing skills you don&apos;t have. Skills flagged
              relevant to the job are pre-selected.
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
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {category}
                  </h3>
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

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={confirmAndGenerate}
                disabled={anyBusy}
                className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-lg px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Actions (hidden while choosing skills) */}
        {!inSkillsStep && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => startFlow("resume")}
              disabled={anyBusy}
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "skills" ? "Reading skills…" : "Generate tailored resume"}
            </button>
            <button
              type="button"
              onClick={() => startFlow("cover")}
              disabled={anyBusy}
              className="rounded-lg border border-slate-900 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "skills" ? "Reading skills…" : "Generate cover letter"}
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={anyBusy}
              className="rounded-lg px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
            >
              Clear saved data
            </button>
          </div>
        )}

        {status && !error && <p className="text-sm text-slate-600">{status}</p>}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <footer className="mt-12 text-center text-xs text-slate-400">
        Inputs are stored only in your browser. PDFs are generated in-memory and
        never uploaded.
      </footer>
    </main>
  );
}
