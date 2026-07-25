import { useSyncExternalStore } from "react";

import type { AuditLogEntry, LogSeverity } from "./types";
import { auditEntry } from "./utils";

export interface ToastSnapshot {
  message: string;
  severity: LogSeverity;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let auditLogSnapshot: AuditLogEntry[] = [];
let toastSnapshot: ToastSnapshot | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function getAuditLogSnapshot(): AuditLogEntry[] {
  return auditLogSnapshot;
}

function getToastSnapshot(): ToastSnapshot | null {
  return toastSnapshot;
}

export function pushAudit(type: string, message: string, severity: LogSeverity = "info"): void {
  auditLogSnapshot = [auditEntry(type, message, severity), ...auditLogSnapshot].slice(0, 100);
  toastSnapshot = { message, severity };

  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastSnapshot = null;
    toastTimer = null;
    emitChange();
  }, 3200);

  emitChange();
}

export function useAuditLog(): AuditLogEntry[] {
  return useSyncExternalStore(subscribe, getAuditLogSnapshot, getAuditLogSnapshot);
}

export function useToast(): ToastSnapshot | null {
  return useSyncExternalStore(subscribe, getToastSnapshot, getToastSnapshot);
}

export function resetActivityStoreForTests(): void {
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = null;
  auditLogSnapshot = [];
  toastSnapshot = null;
  emitChange();
}
