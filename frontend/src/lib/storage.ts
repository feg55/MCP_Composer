import type { AppPersistedState } from "./types";

const STORAGE_KEY = "mcp-composer-state-v1";

export function loadState(): Partial<AppPersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppPersistedState>) : null;
  } catch {
    return null;
  }
}

export function saveState(state: AppPersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

