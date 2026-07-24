import { PlusCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "./Button";
import { Panel } from "./Panel";
import type { ManualServerInput, McpServerDefinition, McpTransport } from "../lib/types";
import { createManualServer } from "../lib/utils";

interface ManualServerFormProps {
  onAdd: (server: McpServerDefinition) => void;
}

const fieldClass =
  "w-full rounded-md border border-[#343d34] bg-[#111510] px-3 py-2 text-[0.8125rem] text-[#e7ece7] placeholder:text-[#6f7a70]";

const defaultInput: ManualServerInput = {
  name: "",
  transport: "stdio",
  command: "",
  argsText: "",
  url: "",
  envText: ""
};

export function ManualServerForm({ onAdd }: ManualServerFormProps) {
  const [input, setInput] = useState<ManualServerInput>(defaultInput);

  function update<K extends keyof ManualServerInput>(key: K, value: ManualServerInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    const server = createManualServer(input);
    onAdd(server);
    setInput(defaultInput);
  }

  const canSubmit = input.name.trim().length > 0 && (input.transport === "stdio" ? input.command.trim() : input.url.trim());

  return (
    <Panel title="Manual Add Server" subtitle="Add a custom upstream MCP server, then discover its live tools from the server pool.">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Server name</span>
          <input className={fieldClass} value={input.name} onChange={(event) => update("name", event.target.value)} placeholder="Internal Tools MCP" />
        </label>
        <label className="space-y-1">
          <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Transport</span>
          <select className={fieldClass} value={input.transport} onChange={(event) => update("transport", event.target.value as McpTransport)}>
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
        </label>
        {input.transport === "stdio" ? (
          <>
            <label className="space-y-1">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Command</span>
              <input className={fieldClass} value={input.command} onChange={(event) => update("command", event.target.value)} placeholder="npx" />
            </label>
            <label className="space-y-1">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Args, one per line</span>
              <textarea
                className={`${fieldClass} min-h-[5.5rem] resize-y`}
                value={input.argsText}
                onChange={(event) => update("argsText", event.target.value)}
                placeholder={"-y\n@acme/mcp-server"}
              />
            </label>
          </>
        ) : (
          <label className="space-y-1 md:col-span-2">
            <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">HTTP URL</span>
            <input className={fieldClass} value={input.url} onChange={(event) => update("url", event.target.value)} placeholder="https://mcp.example.com/server" />
          </label>
        )}
        <label className="space-y-1 md:col-span-2">
          <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Environment, KEY=value</span>
          <textarea
            className={`${fieldClass} min-h-[5.5rem] resize-y`}
            value={input.envText}
            onChange={(event) => update("envText", event.target.value)}
            placeholder="API_TOKEN=${API_TOKEN}"
          />
        </label>
      </div>
      <div className="mt-4">
        <Button variant="primary" onClick={submit} disabled={!canSubmit} leftIcon={<PlusCircle size="1rem" />}>
          Add manual server
        </Button>
      </div>
    </Panel>
  );
}
