import { memo } from "react";

import { useToast } from "../lib/activityStore";
import { reportRender } from "../lib/renderAudit";
import { cn } from "../lib/utils";
import styles from "./ToastHost.module.scss";

export const ToastHost = memo(function ToastHost() {
  if (import.meta.env.DEV) reportRender("ToastHost");

  const toast = useToast();
  if (!toast) return null;

  return (
    <div
      role={toast.severity === "error" ? "alert" : "status"}
      aria-live={toast.severity === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        styles.toast,
        toast.severity === "error"
          ? styles.toastError
          : toast.severity === "warning"
            ? styles.toastWarning
            : styles.toastSuccess
      )}
    >
      {toast.message}
    </div>
  );
});
