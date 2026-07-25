import type { AppPersistedState } from "./types";

const STORAGE_KEY = "mcp-composer-state-v1";

function withoutStoredSecrets(state: Partial<AppPersistedState>): Partial<AppPersistedState> {
  return {
    taskProfile: state.taskProfile
      ? {
          name: state.taskProfile.name,
          description: "",
          useCase: state.taskProfile.useCase,
          systemNotes: ""
        }
      : undefined
  };
}

export function loadState(): Partial<AppPersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const state = withoutStoredSecrets(JSON.parse(raw) as Partial<AppPersistedState>);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

export function saveState(state: Partial<AppPersistedState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutStoredSecrets(state)));
  } catch {
    // Persistence is optional. The active in-memory composition remains available.
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
