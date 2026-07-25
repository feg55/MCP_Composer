import { useSyncExternalStore } from "react";

import { loadState, saveState } from "./storage";
import type { TaskProfile } from "./types";

export const DEFAULT_TASK_PROFILE: TaskProfile = {
  name: "Custom MCP Gateway",
  description: "",
  useCase: "Code Review MCP",
  systemNotes: ""
};

type TaskProfileField = keyof TaskProfile;
type Listener = () => void;

const listeners = new Set<Listener>();
const mutationListeners = new Set<Listener>();
const persistedProfile = loadState()?.taskProfile;

let profileSnapshot: TaskProfile = {
  ...DEFAULT_TASK_PROFILE,
  ...persistedProfile
};
let profileRevision = 0;
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;

const fieldReaders: { [Key in TaskProfileField]: () => TaskProfile[Key] } = {
  name: () => profileSnapshot.name,
  description: () => profileSnapshot.description,
  useCase: () => profileSnapshot.useCase,
  systemNotes: () => profileSnapshot.systemNotes
};

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function schedulePersistence(): void {
  if (persistenceTimer !== null) clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    saveState({ taskProfile: profileSnapshot });
    persistenceTimer = null;
  }, 300);
}

export function getTaskProfileSnapshot(): TaskProfile {
  return profileSnapshot;
}

export function getTaskProfileRevision(): number {
  return profileRevision;
}

export function subscribeTaskProfileMutations(listener: Listener): () => void {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

export function setTaskProfileField<Key extends TaskProfileField>(field: Key, value: TaskProfile[Key]): void {
  if (Object.is(profileSnapshot[field], value)) return;

  profileSnapshot = {
    ...profileSnapshot,
    [field]: value
  };
  profileRevision += 1;
  schedulePersistence();
  mutationListeners.forEach((listener) => listener());
  listeners.forEach((listener) => listener());
}

export function useTaskProfileField<Key extends TaskProfileField>(field: Key): TaskProfile[Key] {
  const getFieldSnapshot = fieldReaders[field] as () => TaskProfile[Key];
  return useSyncExternalStore(subscribe, getFieldSnapshot, getFieldSnapshot);
}

function getDescriptionMissingSnapshot(): boolean {
  return profileSnapshot.description.trim().length === 0;
}

export function useTaskDescriptionMissing(): boolean {
  return useSyncExternalStore(subscribe, getDescriptionMissingSnapshot, getDescriptionMissingSnapshot);
}

export function resetTaskProfileStoreForTests(): void {
  if (persistenceTimer !== null) clearTimeout(persistenceTimer);
  persistenceTimer = null;
  profileSnapshot = { ...DEFAULT_TASK_PROFILE };
  profileRevision += 1;
  mutationListeners.forEach((listener) => listener());
  listeners.forEach((listener) => listener());
}
