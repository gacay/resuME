"use client";

import { useEffect, useState } from "react";
import type { ResumeData, CoverLetterData } from "@/lib/schema";
import { loadState, saveState, clearState } from "@/lib/storage";

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

export default function Home() {
  const [resumeName, setResumeName] = useState("");
  const [resumeBase64, setResumeBase64] = useState("");
  const [resumeMime, setResumeMime] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [experiences, setExperiences] = useState("");

  const [busy, setBusy] = useState<"resume" | "cover" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Load saved inputs once on mount.
  useEffect(() => {
    const s = loadState();
    if (s.resumeName) setResumeName(s.resumeName);
    if (s.resumeBase64) setResumeBase64(s.resumeBase64);
    if (s.resumeMime) setResumeMime(s.resumeMime);
    if (s.jobDescription) setJobDescription(s.jobDescription);
    if (s.experiences) setExperiences(s.experiences);
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
      experiences,
    });
  }, [hydrated, resumeName, resumeBase64, resumeMime, jobDescription, experiences]);

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

  function onClearAll() {
    removeResume();
    setJobDescription("");
    setExperiences("");
    clearState();
    setStatus("");
    setError("");
  }

  async function runGeneration(kind: "resume" | "cover") {
    setError("");
    setStatus("");

    if (!jobDescription.trim()) {
      setError("Please paste a job description.");
      return;
    }
    if (!resumeBase64 && !experiences.trim()) {
      setError("Upload your resume or add some past experiences first.");
      return;
    }

    setBusy(kind);
    setStatus(
      kind === "resume"
        ? "Tailoring your resume with Claude…"
        : "Writing your cover letter with Claude…",
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
          }),
        },
      );

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Generation failed.");
      }

      setStatus("Building your PDF…");

      // Generate the PDF entirely in the browser, then auto-download it.
      // Dynamic import keeps @react-pdf out of the server render path.
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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Resume Tailor</h1>
        <p className="mt-2 text-slate-600">
          Upload your resume, paste a job description, and generate a tailored,
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
            Claude reads this to pull your name, education, and experience.
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

        {/* Past experiences */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label
            htmlFor="exp"
            className="block text-sm font-semibold text-slate-800"
          >
            Additional experiences{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <p className="mb-3 text-sm text-slate-500">
            Anything not on your resume — projects, side work, coursework. The
            tailoring step can pull these in when they fit the job.
          </p>
          <textarea
            id="exp"
            value={experiences}
            onChange={(e) => setExperiences(e.target.value)}
            rows={6}
            placeholder="e.g. Built a side project that…"
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => runGeneration("resume")}
            disabled={busy !== null}
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "resume" ? "Generating…" : "Generate tailored resume"}
          </button>
          <button
            type="button"
            onClick={() => runGeneration("cover")}
            disabled={busy !== null}
            className="rounded-lg border border-slate-900 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "cover" ? "Generating…" : "Generate cover letter"}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={busy !== null}
            className="rounded-lg px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
          >
            Clear saved data
          </button>
        </div>

        {status && !error && (
          <p className="text-sm text-slate-600">{status}</p>
        )}
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
