import { PlusCircle } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { Button } from "./Button";
import { Panel } from "./Panel";
import { compositionActions } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import type { ManualServerInput, McpTransport } from "../lib/types";
import { createManualServer } from "../lib/utils";
import styles from "./ManualServerForm.module.scss";

const defaultInput: ManualServerInput = {
  name: "",
  transport: "stdio",
  command: "",
  argsText: "",
  url: "",
  envText: "",
  headersText: ""
};

export const ManualServerForm = memo(function ManualServerForm() {
  if (import.meta.env.DEV) reportRender("ManualServerForm");

  const [input, setInput] = useState<ManualServerInput>(defaultInput);

  const update = useCallback(function updateField<K extends keyof ManualServerInput>(
    key: K,
    value: ManualServerInput[K]
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }, []);

  const submit = useCallback(() => {
    const server = createManualServer(input);
    compositionActions.addServer(server);
    setInput(defaultInput);
  }, [input]);

  const canSubmit = Boolean(
    input.name.trim().length > 0 && (input.transport === "stdio" ? input.command.trim() : input.url.trim())
  );

  return (
    <Panel
      title="Manual Add Server"
      subtitle="Add a custom upstream MCP server, then discover its live tools from the server pool."
    >
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Server name</span>
          <input
            className={styles.input}
            value={input.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Internal Tools MCP"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Transport</span>
          <select
            className={styles.input}
            value={input.transport}
            onChange={(event) => update("transport", event.target.value as McpTransport)}
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
        </label>
        {input.transport === "stdio" ? (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Command</span>
              <input
                className={styles.input}
                value={input.command}
                onChange={(event) => update("command", event.target.value)}
                placeholder="npx"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Args, one per line</span>
              <textarea
                className={styles.textarea}
                value={input.argsText}
                onChange={(event) => update("argsText", event.target.value)}
                placeholder={"-y\n@acme/mcp-server"}
              />
            </label>
          </>
        ) : (
          <label className={styles.fullWidthField}>
            <span className={styles.label}>HTTP URL</span>
            <input
              className={styles.input}
              value={input.url}
              onChange={(event) => update("url", event.target.value)}
              placeholder="https://mcp.example.com/server"
            />
          </label>
        )}
        <label className={styles.fullWidthField}>
          <span className={styles.label}>Environment, KEY=value</span>
          <textarea
            className={styles.textarea}
            value={input.envText}
            onChange={(event) => update("envText", event.target.value)}
            placeholder="API_TOKEN=${API_TOKEN}"
          />
        </label>
        {input.transport === "http" && (
          <label className={styles.fullWidthField}>
            <span className={styles.label}>HTTP headers, KEY=value</span>
            <textarea
              className={styles.textarea}
              value={input.headersText}
              onChange={(event) => update("headersText", event.target.value)}
              placeholder="Authorization=Bearer ${API_TOKEN}"
            />
          </label>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={submit} disabled={!canSubmit} leftIcon={<PlusCircle size="1rem" />}>
          Add manual server
        </Button>
      </div>
    </Panel>
  );
});
