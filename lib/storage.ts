// Browser persistence so the user's inputs survive a page refresh.

import type { CustomSection } from "@/lib/schema";

const KEY = "resume-tailor:v1";

export interface StoredState {
  resumeName: string;
  resumeBase64: string;
  resumeMime: string;
  jobDescription: string;
  /** Additional experiences, split into three categories. */
  expJobs: string;
  expProjects: string;
  expSkills: string;
  /** Resume section order (built-in keys + custom ids) from the customize step. */
  sectionOrder: string[];
  /** User-authored extra resume sections. */
  customSections: CustomSection[];
}

export function loadState(): Partial<StoredState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredState>) : {};
  } catch {
    return {};
  }
}

export function saveState(state: StoredState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors (a large resume PDF can exceed the ~5MB limit).
  }
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
