"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { NonLaLoader } from "@/components/NonLaLoader";
import {
  Lamp,
  NonOutline,
  NeedleMark,
  ThreadSpiral,
  DocIcon,
  NonCheck,
  Chevron,
} from "@/components/NonLaArt";
import { ResumePreview, CoverLetterPreview } from "@/components/DocumentPreview";
import { FaviconManager } from "@/components/FaviconManager";

const THEME_KEY = "resume-tailor:theme";

type Kind = "resume" | "cover";
type Screen = "empty" | "form" | "loading" | "review" | "output";
type GenResult =
  | { kind: "resume"; data: ResumeData & { company?: string } }
  | { kind: "cover"; data: CoverLetterData };

// ---- shared inline styles (token-driven) ----------------------------------
const btnPrimary: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "13px 24px",
  borderRadius: 4,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--onAccent)",
  cursor: "pointer",
};
const btnOutline: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "13px 24px",
  borderRadius: 4,
  border: "1px solid var(--ink)",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
};
const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: 22,
};
const taStyle: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.6,
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  background: "var(--inset)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "12px 13px",
};
const cardTitle: React.CSSProperties = {
  fontFamily: "Lora, Georgia, serif",
  fontSize: 17,
};
const helper: React.CSSProperties = {
  margin: "12px 0 14px",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--ink2)",
};
const disabled = (busy: boolean): React.CSSProperties =>
  busy ? { opacity: 0.6, cursor: "not-allowed" } : {};

// ---- helpers (unchanged behaviour) ----------------------------------------
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function buildFileName(
  name: string,
  kind: string,
  company?: string,
  ext: string = "pdf",
): string {
  const namePart = slug(name) || "Tailored";
  const companyPart = company && company.trim() ? `_${slug(company)}` : "";
  return `${namePart}_${kind}${companyPart}.${ext}`;
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

/** Draggable row in the section reorder list (theme-tokened). */
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 3,
    border: "1px solid var(--line)",
    background: "var(--inset)",
    padding: "9px 11px",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <span
        aria-label={`Drag ${label} to reorder`}
        style={{
          flex: "none",
          cursor: "grab",
          touchAction: "none",
          color: "var(--ink2)",
          lineHeight: 0,
        }}
        {...attributes}
        {...listeners}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
          <circle cx="2" cy="3" r="1.3" />
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="2" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="2" cy="13" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      </span>
      <span
        style={{
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13.5,
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        {label}
        {custom && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            custom
          </span>
        )}
      </span>
      {custom && (
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          style={{
            flex: "none",
            background: "none",
            border: 0,
            color: "var(--accent)",
            fontSize: 13,
            cursor: "pointer",
          }}
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

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [screen, setScreen] = useState<Screen>("empty");
  const [busy, setBusy] = useState<"skills" | Kind | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Review step.
  const [pendingKind, setPendingKind] = useState<Kind | null>(null);
  const [skills, setSkills] = useState<TransferableSkill[] | null>(null);
  const [missing, setMissing] = useState<MissingRequirement[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [gapInputs, setGapInputs] = useState<Record<string, string>>({});

  // Customize step.
  const [sectionOrder, setSectionOrder] =
    useState<string[]>(DEFAULT_SECTION_ORDER);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionBody, setNewSectionBody] = useState("");

  // Output step.
  const [result, setResult] = useState<GenResult | null>(null);
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [menuOpen, setMenuOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const resolvedOrder = useMemo(
    () => reconcileOrder(sectionOrder, customSections),
    [sectionOrder, customSections],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Load saved inputs + theme once on mount.
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
      if (window.localStorage.getItem(THEME_KEY) === "dark") setTheme("dark");
    } catch {
      /* ignore */
    }
    // The First Visit page is always the landing screen; saved inputs still
    // load into state so the form is pre-filled once the user continues.
    setHydrated(true);
  }, []);

  // Reflect + persist the theme on <html>.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme, hydrated]);

  // Persist inputs.
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

  // Download dropdown: dismiss on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
    setResult(null);
    setError("");
    setScreen("empty");
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

  // Step 1 — analyze the resume, then open the review.
  async function startFlow(kind: Kind) {
    setError("");
    const problem = validateInputs();
    if (problem) {
      setError(problem);
      return;
    }

    setPendingKind(kind);
    setBusy("skills");
    setScreen("loading");
    resetSkillsStep();
    setPendingKind(kind);

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
      const preselect: Record<string, boolean> = {};
      for (const s of list) preselect[s.name] = s.relevant;

      setSkills(list);
      setMissing(gaps);
      setSelected(preselect);
      setPendingKind(kind);
      setScreen("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setScreen("form");
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

  // Step 2 — generate, then show the document preview (no auto-download).
  async function runGenerate() {
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
    setScreen("loading");

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

      if (kind === "resume") {
        const base = payload as ResumeData & { company?: string };
        const data: ResumeData = {
          ...base,
          sectionOrder: resolvedOrder,
          customSections,
        };
        setResult({ kind: "resume", data });
      } else {
        setResult({ kind: "cover", data: payload as CoverLetterData });
      }
      setScreen("output");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setScreen("review");
    } finally {
      setBusy(null);
    }
  }

  // Build the chosen format from the already-generated data and download it.
  async function downloadResult(fmt: "pdf" | "docx") {
    if (!result) return;
    setMenuOpen(false);
    setFormat(fmt);
    setBuilding(true);
    setError("");
    try {
      let blob: Blob;
      let filename: string;
      if (result.kind === "resume") {
        const data = result.data;
        if (fmt === "docx") {
          const { resumeToDocxBlob } = await import("@/lib/docx");
          blob = await resumeToDocxBlob(data);
        } else {
          const { pdf } = await import("@react-pdf/renderer");
          const { ResumeDocument } = await import("@/components/ResumeDocument");
          blob = await pdf(<ResumeDocument data={data} />).toBlob();
        }
        filename = buildFileName(data.name, "Resume", data.company, fmt);
      } else {
        const data = result.data;
        if (fmt === "docx") {
          const { coverLetterToDocxBlob } = await import("@/lib/docx");
          blob = await coverLetterToDocxBlob(data);
        } else {
          const { pdf } = await import("@react-pdf/renderer");
          const { CoverLetterDocument } = await import(
            "@/components/CoverLetterDocument"
          );
          blob = await pdf(<CoverLetterDocument data={data} />).toBlob();
        }
        filename = buildFileName(data.name, "Cover_Letter", data.company, fmt);
      }
      downloadBlob(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the file.");
    } finally {
      setBuilding(false);
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

  const anyBusy = busy !== null;
  const kindNoun = pendingKind === "cover" ? "cover letter" : "resume";

  // Section-mark card header used by all three form cards.
  const cardHeader = (title: string, extra?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
      <NeedleMark />
      <div style={cardTitle}>
        {title}
        {extra}
      </div>
    </div>
  );

  return (
    <div>
      <FaviconManager loading={screen === "loading"} />
      {/* App chrome: resuME wordmark far-left, lamp toggle far-right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <button
          type="button"
          onClick={() => setScreen("empty")}
          aria-label="Go to the start page"
          className="font-lora"
          style={{
            background: "none",
            border: 0,
            padding: 0,
            cursor: "pointer",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          resu<span style={{ color: "var(--accent)" }}>ME</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Toggle light and dark"
          style={{ background: "none", border: 0, padding: 0, cursor: "pointer", lineHeight: 0 }}
        >
          <Lamp />
        </button>
      </div>

      {/* ================= EMPTY / FIRST VISIT ================= */}
      {hydrated && screen === "empty" && (
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "64px 24px 90px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 26,
            }}
          >
            <div style={{ perspective: "700px", animation: "nonBob 3.4s ease-in-out infinite" }}>
              <div style={{ animation: "nonSpin 3.6s linear infinite", transformStyle: "preserve-3d" }}>
                <NonOutline />
              </div>
            </div>
            <div>
              <h1
                className="font-lora"
                style={{
                  fontWeight: 500,
                  fontSize: "clamp(30px, 5vw, 44px)",
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                resu<span style={{ color: "var(--accent)" }}>ME</span>
              </h1>
              <p
                style={{
                  margin: "8px auto 0",
                  maxWidth: 460,
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "var(--ink2)",
                }}
              >
                Resume fitting for your dream jobs.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setScreen("form")}
                style={{ ...btnPrimary, padding: "13px 26px" }}
              >
                Upload your resume
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink2)", fontSize: 12 }}>
              <ThreadSpiral size={26} colorVar="--accent" />
              <span>Everything stays in this browser.</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= FORM ================= */}
      {hydrated && screen === "form" && (
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 90px" }}>
          <header
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 16,
              paddingBottom: 22,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink2)" }}>
              <ThreadSpiral size={20} colorVar="--gold" />
              <span>Saved in this browser</span>
            </div>
          </header>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Resume upload */}
            <section style={cardStyle}>
              {cardHeader("Current resume (PDF)")}
              <p style={helper}>
                We read your name, education and experience from this file.
              </p>
              {resumeName ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: "1px dashed var(--line)",
                    borderRadius: 3,
                    padding: "12px 14px",
                    background: "var(--inset)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      fontSize: 13.5,
                    }}
                  >
                    <DocIcon />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resumeName}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={removeResume}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      background: "none",
                      border: 0,
                      color: "var(--accent)",
                      cursor: "pointer",
                      flex: "none",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    border: "1px dashed var(--line)",
                    borderRadius: 3,
                    padding: "18px 14px",
                    background: "var(--inset)",
                    cursor: "pointer",
                    fontSize: 13.5,
                    color: "var(--ink2)",
                  }}
                >
                  <DocIcon />
                  <span>Click to upload a PDF</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={onFileChange}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </section>

            {/* Job description */}
            <section style={cardStyle}>
              {cardHeader("Job description")}
              <p style={helper}>Paste the full posting you are tailoring toward.</p>
              <textarea
                rows={7}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here…"
                style={taStyle}
              />
            </section>

            {/* Additional experiences */}
            <section style={cardStyle}>
              {cardHeader(
                "Additional experiences ",
                <span
                  style={{
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontSize: 11,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "var(--ink2)",
                  }}
                >
                  optional
                </span>,
              )}
              <p style={{ ...helper, margin: "12px 0 18px" }}>
                Anything not on your resume, split by type. All three boxes go to
                the model together.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  {
                    label: "Jobs",
                    value: expJobs,
                    set: setExpJobs,
                    ph: "A part-time role, internship, or job not on your resume…",
                  },
                  {
                    label: "Experience / Projects",
                    value: expProjects,
                    set: setExpProjects,
                    ph: "A side project, coursework, volunteer or leadership work…",
                  },
                  {
                    label: "Skills",
                    value: expSkills,
                    set: setExpSkills,
                    ph: "Tools, languages or methods not captured on your resume…",
                  },
                ].map((f) => (
                  <div key={f.label}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {f.label}
                    </label>
                    <textarea
                      rows={3}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.ph}
                      style={{ ...taStyle, padding: "11px 12px" }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p
                style={{
                  border: "1px solid var(--goldLine)",
                  background: "var(--goldWash)",
                  color: "var(--ink)",
                  borderRadius: 3,
                  padding: "11px 13px",
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => startFlow("resume")}
                disabled={anyBusy}
                style={{ ...btnPrimary, ...disabled(anyBusy) }}
              >
                Generate tailored resume
              </button>
              <button
                type="button"
                onClick={() => startFlow("cover")}
                disabled={anyBusy}
                style={{ ...btnOutline, ...disabled(anyBusy) }}
              >
                Generate cover letter
              </button>
              <button
                type="button"
                onClick={onClearAll}
                disabled={anyBusy}
                style={{
                  fontSize: 13,
                  padding: "13px 10px",
                  background: "none",
                  border: 0,
                  color: "var(--ink2)",
                  cursor: "pointer",
                  ...disabled(anyBusy),
                }}
              >
                Clear saved data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LOADING ================= */}
      {hydrated && screen === "loading" && (
        <NonLaLoader kind={pendingKind ?? "resume"} />
      )}

      {/* ================= REVIEW ================= */}
      {hydrated && screen === "review" && skills && (
        <div
          style={{
            minHeight: "82vh",
            padding: "40px 20px 70px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            background: "var(--scrim)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              boxShadow: "0 24px 60px rgba(20,14,8,0.16)",
              animation: "fadeUp .4s ease both",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                padding: "24px 24px 18px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div>
                <h2 className="font-lora" style={{ fontWeight: 500, fontSize: 22, margin: 0 }}>
                  Before you generate
                </h2>
                <p
                  style={{
                    margin: "10px 0 0",
                    maxWidth: 520,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: "var(--ink2)",
                  }}
                >
                  Pick the skills to carry into your {kindNoun}, and fill any gap
                  you genuinely have experience with. We use only what you give
                  us.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreen("form")}
                aria-label="Close"
                disabled={anyBusy}
                style={{
                  fontSize: 16,
                  background: "none",
                  border: 0,
                  color: "var(--ink2)",
                  cursor: "pointer",
                  flex: "none",
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="non-scroll" style={{ padding: "22px 24px 26px", maxHeight: "60vh", overflowY: "auto" }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <h3 className="font-lora" style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>
                  Transferable skills
                </h3>
                <span style={{ fontSize: 12.5, color: "var(--ink2)" }}>
                  {selectedCount} of {skills.length} selected
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, margin: "12px 0 16px", fontSize: 12.5 }}>
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", fontWeight: 600 }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  style={{ background: "none", border: 0, padding: 0, color: "var(--ink2)", cursor: "pointer", fontWeight: 600 }}
                >
                  Clear all
                </button>
              </div>

              {grouped.map(([category, items]) => (
                <div key={category} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      color: "var(--ink2)",
                      marginBottom: 8,
                    }}
                  >
                    {category}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {items.map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleSkill(s.name)}
                        style={{
                          color: "var(--ink)",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 11,
                          width: "100%",
                          background: "var(--inset)",
                          border: "1px solid var(--line)",
                          borderRadius: 3,
                          padding: "11px 13px",
                          cursor: "pointer",
                        }}
                      >
                        <NonCheck checked={!!selected[s.name]} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</span>
                          {s.relevant && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 10,
                                letterSpacing: ".12em",
                                textTransform: "uppercase",
                                color: "var(--gold)",
                              }}
                            >
                              JD match
                            </span>
                          )}
                          {s.evidence && (
                            <span
                              style={{
                                display: "block",
                                fontSize: 12.5,
                                lineHeight: 1.5,
                                color: "var(--ink2)",
                                marginTop: 2,
                              }}
                            >
                              {s.evidence}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Gaps */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                <h3 className="font-lora" style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>
                  Requirements you might be missing
                </h3>
                {missing.length > 0 ? (
                  <>
                    <p style={{ margin: "8px 0 14px", fontSize: 13, lineHeight: 1.6, color: "var(--ink2)" }}>
                      If you do have relevant experience, write it here and we
                      weave it in truthfully.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {missing.map((m) => (
                        <div
                          key={m.name}
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            border: "1px solid var(--goldLine)",
                            background: "var(--goldWash)",
                            borderRadius: 3,
                            padding: 13,
                          }}
                        >
                          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 10,
                                letterSpacing: ".14em",
                                textTransform: "uppercase",
                                color: "var(--gold)",
                              }}
                            >
                              {m.category}
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{m.name}</div>
                            {m.reason && (
                              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink2)", marginTop: 2 }}>
                                {m.reason}
                              </div>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={gapInputs[m.name] ?? ""}
                            onChange={(e) =>
                              setGapInputs((prev) => ({ ...prev, [m.name]: e.target.value }))
                            }
                            placeholder="Your real experience… (optional)"
                            style={{
                              flex: "1 1 240px",
                              minWidth: 0,
                              fontSize: 13,
                              lineHeight: 1.55,
                              boxSizing: "border-box",
                              resize: "vertical",
                              background: "var(--card)",
                              color: "var(--ink)",
                              border: "1px solid var(--goldLine)",
                              borderRadius: 3,
                              padding: "10px 11px",
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink2)" }}>
                    Nothing major looks missing for this role based on your
                    materials.
                  </p>
                )}
              </div>

              {/* Customize (resume only) */}
              {pendingKind === "resume" && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                  <button
                    type="button"
                    onClick={() => setCustomizeOpen((o) => !o)}
                    aria-expanded={customizeOpen}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--ink)",
                    }}
                  >
                    <span className="font-lora" style={{ fontWeight: 500, fontSize: 16 }}>
                      Customize
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      style={{
                        color: "var(--ink2)",
                        transition: "transform .2s ease",
                        transform: customizeOpen ? "rotate(180deg)" : "none",
                      }}
                    >
                      <path d="M6 8l4 4 4-4" />
                    </svg>
                  </button>
                  <p style={{ margin: "6px 0 0", fontSize: 12, fontStyle: "italic", color: "var(--ink2)" }}>
                    Reorder sections by dragging, or add your own such as
                    Certifications, Awards, or Publications. Changes apply to your
                    downloaded document.
                  </p>

                  {customizeOpen && (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
                        <SortableContext items={resolvedOrder} strategy={verticalListSortingStrategy}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

                      <div style={{ border: "1px dashed var(--line)", borderRadius: 3, padding: 12 }}>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                          Add a section
                        </label>
                        <input
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                          placeholder="Section title, e.g. Certifications"
                          style={{
                            marginBottom: 8,
                            width: "100%",
                            boxSizing: "border-box",
                            fontSize: 13,
                            background: "var(--inset)",
                            color: "var(--ink)",
                            border: "1px solid var(--line)",
                            borderRadius: 3,
                            padding: "9px 10px",
                          }}
                        />
                        <textarea
                          rows={3}
                          value={newSectionBody}
                          onChange={(e) => setNewSectionBody(e.target.value)}
                          placeholder={
                            "One item per line, e.g.\nAWS Certified Cloud Practitioner (2025)\nGoogle Data Analytics Certificate"
                          }
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            resize: "vertical",
                            fontSize: 13,
                            lineHeight: 1.55,
                            background: "var(--inset)",
                            color: "var(--ink)",
                            border: "1px solid var(--line)",
                            borderRadius: 3,
                            padding: "9px 10px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={addCustomSection}
                          disabled={!newSectionTitle.trim() || !newSectionBody.trim()}
                          style={{
                            marginTop: 8,
                            ...btnPrimary,
                            fontSize: 13,
                            padding: "9px 16px",
                            ...disabled(!newSectionTitle.trim() || !newSectionBody.trim()),
                          }}
                        >
                          Add section
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p
                  style={{
                    marginTop: 16,
                    border: "1px solid var(--goldLine)",
                    background: "var(--goldWash)",
                    color: "var(--ink)",
                    borderRadius: 3,
                    padding: "11px 13px",
                    fontSize: 13,
                  }}
                >
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "18px 24px 22px",
                borderTop: "1px solid var(--line)",
              }}
            >
              <button
                type="button"
                onClick={() => setScreen("form")}
                disabled={anyBusy}
                style={{ fontSize: 13.5, background: "none", border: 0, color: "var(--ink2)", cursor: "pointer", ...disabled(anyBusy) }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={runGenerate}
                disabled={anyBusy}
                style={{ ...btnPrimary, padding: "12px 24px", ...disabled(anyBusy) }}
              >
                {pendingKind === "cover" ? "Write my cover letter" : "Tailor my resume"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= OUTPUT / DOCUMENT PREVIEW ================= */}
      {hydrated && screen === "output" && result && (
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "36px 24px 80px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 14,
              marginBottom: 22,
            }}
          >
            <h2 className="font-lora" style={{ fontWeight: 500, fontSize: 24, margin: 0 }}>
              {result.kind === "cover" ? "Your cover letter" : "Your tailored resume"}
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative" }} ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  disabled={building}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    padding: "11px 18px 11px 20px",
                    borderRadius: 4,
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "var(--onAccent)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    ...disabled(building),
                  }}
                >
                  <span>{building ? "Building…" : "Download"}</span>
                  <Chevron />
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: 214,
                      background: "var(--card)",
                      border: "1px solid var(--line)",
                      borderRadius: 4,
                      boxShadow: "0 14px 34px rgba(20,14,8,0.18)",
                      padding: 5,
                      zIndex: 5,
                      textAlign: "left",
                    }}
                  >
                    {(
                      [
                        { f: "pdf" as const, label: "PDF", sub: "Fixed layout — best for applying" },
                        { f: "docx" as const, label: "Word (.docx)", sub: "Editable in Word or Google Docs" },
                      ]
                    ).map((it) => (
                      <button
                        key={it.f}
                        type="button"
                        onClick={() => downloadResult(it.f)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "none",
                          border: 0,
                          borderRadius: 3,
                          padding: "9px 11px",
                          color: "var(--ink)",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink2)" }}>{it.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setScreen("review")}
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: "11px 20px",
                  borderRadius: 4,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                Adjust skills
              </button>
            </div>
          </div>

          {result.kind === "resume" ? (
            <ResumePreview data={result.data} />
          ) : (
            <CoverLetterPreview data={result.data} />
          )}

          {error && (
            <p
              style={{
                margin: "16px 0 0",
                border: "1px solid var(--goldLine)",
                background: "var(--goldWash)",
                color: "var(--ink)",
                borderRadius: 3,
                padding: "11px 13px",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}

          <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--ink2)", textAlign: "center" }}>
            {format === "docx"
              ? "Word keeps the same layout, editable in Word or Google Docs. "
              : "PDF is fixed-layout — best for applying. "}
            The document stays neutral and professional — the theme lives in the
            app, not on your {result.kind === "cover" ? "cover letter" : "resume"}.
          </p>
        </div>
      )}
    </div>
  );
}
