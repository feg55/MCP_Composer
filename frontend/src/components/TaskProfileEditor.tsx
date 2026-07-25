import { memo } from "react";

import { reportRender } from "../lib/renderAudit";
import { cn } from "../lib/utils";
import { setTaskProfileField, useTaskProfileField } from "../lib/taskProfileStore";
import { Panel } from "./Panel";
import styles from "./TaskProfileEditor.module.scss";

export const TaskProfileEditor = memo(function TaskProfileEditor() {
  if (import.meta.env.DEV) reportRender("TaskProfileEditor");

  return (
    <Panel title="Task Profile" subtitle="Define the custom MCP target and operating notes.">
      <div className={styles.profileGrid}>
        <NameField />
        <UseCaseField />
        <DescriptionField />
        <SystemNotesField />
      </div>
    </Panel>
  );
});

function NameField() {
  if (import.meta.env.DEV) reportRender("NameField");
  const value = useTaskProfileField("name");

  return (
    <label className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Custom MCP name</span>
      <input
        className={styles.field}
        value={value}
        onChange={(event) => setTaskProfileField("name", event.currentTarget.value)}
        placeholder="Code Review Gateway"
      />
    </label>
  );
}

function UseCaseField() {
  if (import.meta.env.DEV) reportRender("UseCaseField");
  const value = useTaskProfileField("useCase");

  return (
    <label className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Target use case</span>
      <select
        className={styles.field}
        value={value}
        onChange={(event) => setTaskProfileField("useCase", event.currentTarget.value)}
      >
        <option>Code Review MCP</option>
        <option>Research MCP</option>
        <option>Data Analyst MCP</option>
        <option>DevOps MCP</option>
        <option>Custom</option>
      </select>
    </label>
  );
}

function DescriptionField() {
  if (import.meta.env.DEV) reportRender("DescriptionField");
  const value = useTaskProfileField("description");

  return (
    <label className={cn(styles.fieldGroup, styles.fieldGroupWide)}>
      <span className={styles.fieldLabel}>Task description</span>
      <textarea
        className={cn(styles.field, styles.textArea)}
        value={value}
        onChange={(event) => setTaskProfileField("description", event.currentTarget.value)}
        placeholder="Describe the job this gateway should handle."
      />
    </label>
  );
}

function SystemNotesField() {
  if (import.meta.env.DEV) reportRender("SystemNotesField");
  const value = useTaskProfileField("systemNotes");

  return (
    <label className={cn(styles.fieldGroup, styles.fieldGroupWide)}>
      <span className={styles.fieldLabel}>System instruction / notes</span>
      <textarea
        className={cn(styles.field, styles.textArea)}
        value={value}
        onChange={(event) => setTaskProfileField("systemNotes", event.currentTarget.value)}
        placeholder="Optional routing, approval, or behavior notes."
      />
    </label>
  );
}
