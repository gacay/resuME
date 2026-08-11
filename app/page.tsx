"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BUILTIN_SECTIONS,
  DEFAULT_SECTION_ORDER,
  type ResumeData,
  type CoverLetterData,
  type TransferableSkill,
  type MissingRequirement,
  type CustomSection,
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

/** Parse a fetch response as JSON, but fail with a clear message when the body
 * is empty or not JSON (e.g. a gateway timeout or a request-size rejection),
 * instead of the opaque "Unexpected end of JSON input". */
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      `The server returned an empty response (HTTP ${res.status}). The request likely timed out or the PDF is too large — try a smaller resume PDF, then retry.`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Unexpected server response (HTTP ${res.status}). Please try again.`,
    );
  }
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

/** Keep the section order valid: only known keys, every built-in present once,
 * custom ids that still exist, and no duplicates. */
function reconcileOrder(order: string[], customs: CustomSection[]): string[] {
  const builtins = BUILTIN_SECTIONS.map((s) => s.key as string);
  const customIds = customs.map((c) => c.id);
  const valid = new Set<string>([...builtins, ...customIds]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of order) {
    if (valid.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of builtins)
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  for (const id of customIds)
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  return out;
}

/** One draggable row in the section reorder list. Drag is initiated from the
 * grip handle only (so the rest of the row can be tapped/scrolled on touch). */
function SortableSectionRow({
  id,
  label,
  custom,
  onRemove,
}: {
  id: string;
  label: string;
  custom: boolean;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 ${
        isDragging ? "border-slate-400 shadow-sm" : "border-slate-200"
      }`}
    >
      <span
        aria-label={`Drag ${label} to reorder`}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <svg
          width="10"
          height="16"
          viewBox="0 0 10 16"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="2" cy="3" r="1.3" />
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="2" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="2" cy="13" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
        {label}
        {custom && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            custom
          </span>
        )}
      </span>
      {custom && (
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          className="shrink-0 rounded px-2 py-1 text-red-500 hover:bg-red-50"
        >
          ✕
        </button>
      )}
    </div>
  );
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
  // One free-text box per missing requirement, keyed by requirement name.
  const [gapInputs, setGapInputs] = useState<Record<string, string>>({});

  // Customize step — resume section order + user-added sections.
  const [sectionOrder, setSectionOrder] =
    useState<string[]>(DEFAULT_SECTION_ORDER);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionBody, setNewSectionBody] = useState("");

  // Always-valid order: known keys only, all built-ins present, no duplicates.
  const resolvedOrder = useMemo(
    () => reconcileOrder(sectionOrder, customSections),
    [sectionOrder, customSections],
  );

  // Drag sensors: pointer covers mouse + touch; keyboard for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
    if (Array.isArray(s.sectionOrder)) setSectionOrder(s.sectionOrder);
    if (Array.isArray(s.customSections)) setCustomSections(s.customSections);
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
      sectionOrder: resolvedOrder,
      customSections,
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
    resolvedOrder,
    customSections,
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
    setGapInputs({});
  }

  function onClearAll() {
    removeResume();
    setJobDescription("");
    setExpJobs("");
    setExpProjects("");
    setExpSkills("");
    setSectionOrder(DEFAULT_SECTION_ORDER);
    setCustomSections([]);
    setNewSectionTitle("");
    setNewSectionBody("");
    setCustomizeOpen(false);
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
      const payload = await readJson(res);
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
    // Per-requirement, user-authored truthful experience. Each non-empty box is
    // labeled with the requirement it addresses, folded into the experiences
    // payload and flagged so the model treats it as source material (never as
    // license to invent).
    const gap = missing
      .map((m) => {
        const text = (gapInputs[m.name] ?? "").trim();
        return text ? `- ${m.name}: ${text}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const experiences = gap
      ? `${baseExp}${baseExp ? "\n\n" : ""}EXPERIENCE THE CANDIDATE ADDED TO ADDRESS SPECIFIC JOB REQUIREMENTS (truthful source material — use it, do not embellish beyond it):\n${gap}`
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

      const payload = await readJson(res);
      if (!res.ok) throw new Error(payload?.error || "Generation failed.");

      setStatus("Building your PDF…");

      // Generate the PDF entirely in the browser, then auto-download it.
      const { pdf } = await import("@react-pdf/renderer");

      let blob: Blob;
      let filename: string;

      if (kind === "resume") {
        const base = payload as ResumeData & { company?: string };
        // Apply the user's section order + custom sections at render time.
        const data: ResumeData = {
          ...base,
          sectionOrder: resolvedOrder,
          customSections,
        };
        const { ResumeDocument } = await import("@/components/ResumeDocument");
        blob = await pdf(<ResumeDocument data={data} />).toBlob();
        filename = buildFileName(base.name, "Resume", base.company);
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

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = resolvedOrder.indexOf(String(active.id));
    const newIndex = resolvedOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setSectionOrder(arrayMove(resolvedOrder, oldIndex, newIndex));
  }

  function addCustomSection() {
    const title = newSectionTitle.trim();
    const bullets = newSectionBody
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!title || bullets.length === 0) return;
    const id = `custom:${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    setCustomSections((prev) => [...prev, { id, title, bullets }]);
    setSectionOrder((prev) => [...prev, id]);
    setNewSectionTitle("");
    setNewSectionBody("");
  }

  function removeCustomSection(id: string) {
    setCustomSections((prev) => prev.filter((c) => c.id !== id));
    setSectionOrder((prev) => prev.filter((k) => k !== id));
  }

  function sectionLabel(key: string): { label: string; custom: boolean } {
    const b = BUILTIN_SECTIONS.find((s) => s.key === key);
    if (b) return { label: b.label, custom: false };
    const c = customSections.find((x) => x.id === key);
    return { label: c?.title ?? "Custom section", custom: true };
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
                      From the job description, these look unmet. If you actually
                      have relevant experience for any of them, add it in that
                      requirement&apos;s box and we&apos;ll weave it in
                      truthfully — only what you write, nothing invented.
                    </p>
                    <div className="space-y-3">
                      {missing.map((m) => (
                        <div
                          key={m.name}
                          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-start"
                        >
                          <div className="flex min-w-0 items-start gap-2 sm:w-1/2">
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
                          </div>
                          <textarea
                            value={gapInputs[m.name] ?? ""}
                            onChange={(e) =>
                              setGapInputs((prev) => ({
                                ...prev,
                                [m.name]: e.target.value,
                              }))
                            }
                            rows={3}
                            placeholder={`Your real experience with ${m.name}… (optional)`}
                            className="w-full resize-y rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:w-1/2"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    {girly
                      ? "You slay — nothing major looks missing for this role. 💖"
                      : "Nothing major looks missing for this role based on your materials."}
                  </p>
                )}
              </div>

              {/* Customize layout — collapsed by default, resume only */}
              {pendingKind === "resume" && (
                <div className="gp-gap">
                  <button
                    type="button"
                    onClick={() => setCustomizeOpen((o) => !o)}
                    aria-expanded={customizeOpen}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="gp-modal-section-title">
                      {girly ? "🎀 Customize" : "Customize"}
                    </span>
                    <svg
                      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                        customizeOpen ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 8l4 4 4-4" />
                    </svg>
                  </button>

                  <p className="mt-1 text-xs italic text-slate-500">
                    Reorder sections by dragging, or add your own such as
                    Certifications, Awards, or Publications. Changes apply to
                    your downloaded PDF.
                  </p>

                  {customizeOpen && (
                    <div className="mt-3 space-y-4">
                      {/* Reorder list — drag by the grip handle (touch + mouse + keyboard) */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleReorder}
                      >
                        <SortableContext
                          items={resolvedOrder}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1.5">
                            {resolvedOrder.map((key) => {
                              const meta = sectionLabel(key);
                              return (
                                <SortableSectionRow
                                  key={key}
                                  id={key}
                                  label={meta.label}
                                  custom={meta.custom}
                                  onRemove={removeCustomSection}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>

                      {/* Add a custom section */}
                      <div className="rounded-lg border border-dashed border-slate-300 p-3">
                        <label
                          htmlFor="cs-title"
                          className="mb-1 block text-sm font-medium text-slate-700"
                        >
                          Add a section
                        </label>
                        <input
                          id="cs-title"
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                          placeholder="Section title, e.g. Certifications"
                          className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                        <textarea
                          value={newSectionBody}
                          onChange={(e) => setNewSectionBody(e.target.value)}
                          rows={3}
                          placeholder={
                            "One item per line, e.g.\nAWS Certified Cloud Practitioner (2025)\nGoogle Data Analytics Certificate"
                          }
                          className="w-full resize-y rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                        <button
                          type="button"
                          onClick={addCustomSection}
                          disabled={
                            !newSectionTitle.trim() || !newSectionBody.trim()
                          }
                          className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                        >
                          Add section
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
