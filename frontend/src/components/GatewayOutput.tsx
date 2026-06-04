import { Clipboard, Download, FileJson, RotateCcw } from "lucide-react";

import { Button } from "./Button";
import { Panel } from "./Panel";
import type { GeneratedGatewayResponse } from "../lib/types";
import { formatJson } from "../lib/utils";

interface GatewayOutputProps {
  generated: GeneratedGatewayResponse | null;
  onCopy: (label: string, value: string) => void;
  onDownload: (filename: string, value: string, mime?: string) => void;
  onReset: () => void;
}

export function GatewayOutput({ generated, onCopy, onDownload, onReset }: GatewayOutputProps) {
  if (!generated) {
    return (
      <Panel title="Gateway Output" subtitle="Generated gateway artifacts will appear here.">
        <div className="rounded-md border border-dashed border-[#343d34] bg-[#111510] p-5 text-[13px] leading-5 text-[#a9b4aa]">
          Select tools and generate the gateway to view composition JSON, runtime config, client snippet, README, and exposed tools.
        </div>
      </Panel>
    );
  }

  const compositionJson = formatJson(generated.composition_json);
  const gatewayJson = formatJson(generated.gateway_config_json);
  const mcpSnippet = formatJson(generated.mcp_servers_snippet);
  const exposedTools = formatJson(generated.exposed_tools);

  return (
    <Panel
      title="Gateway Output"
      subtitle="Exportable artifacts for the local MCP SDK gateway."
      actions={
        <Button variant="ghost" onClick={onReset} leftIcon={<RotateCcw size={15} />}>
          Reset
        </Button>
      }
    >
      <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Button variant="secondary" onClick={() => onCopy("composition JSON", compositionJson)} leftIcon={<Clipboard size={15} />}>
          Copy JSON
        </Button>
        <Button
          variant="secondary"
          onClick={() => onDownload("mcp-composition.json", compositionJson)}
          leftIcon={<Download size={15} />}
        >
          Composition
        </Button>
        <Button
          variant="secondary"
          onClick={() => onDownload("gateway.config.json", gatewayJson)}
          leftIcon={<Download size={15} />}
        >
          Gateway config
        </Button>
        <Button
          variant="secondary"
          onClick={() => onDownload("README.md", generated.readme_text, "text/markdown")}
          leftIcon={<Download size={15} />}
        >
          README
        </Button>
      </div>

      <div className="grid gap-4">
        <OutputBlock title="Composition JSON" value={compositionJson} onCopy={() => onCopy("composition JSON", compositionJson)} />
        <OutputBlock title="Gateway Config JSON" value={gatewayJson} onCopy={() => onCopy("gateway config JSON", gatewayJson)} />
        <OutputBlock title="mcpServers Config" value={mcpSnippet} onCopy={() => onCopy("mcpServers config", mcpSnippet)} />
        <OutputBlock
          title="Local CLI"
          value={"cd backend\npython -m app.gateway_server --config ./generated/<gateway>.gateway.config.json"}
          onCopy={() => onCopy("local CLI command", "cd backend\npython -m app.gateway_server --config ./generated/<gateway>.gateway.config.json")}
        />
        <OutputBlock title="Exposed Tools" value={exposedTools} onCopy={() => onCopy("exposed tools", exposedTools)} />
      </div>
    </Panel>
  );
}

function OutputBlock({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <section className="min-w-0 rounded-lg border border-[#343d34] bg-[#202620]">
      <div className="flex items-center justify-between gap-3 border-b border-[#343d34] px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#e7ece7]">
          <FileJson size={15} className="text-[#2bb3a3]" />
          {title}
        </div>
        <Button variant="ghost" onClick={onCopy} leftIcon={<Clipboard size={14} />}>
          Copy
        </Button>
      </div>
      <pre className="scrollbar-thin max-h-[320px] min-w-0 overflow-auto p-4 text-[12px] leading-5 text-[#cdd6cd]">{value}</pre>
    </section>
  );
}
