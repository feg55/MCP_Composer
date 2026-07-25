import { Clipboard, Download, FileJson, RotateCcw } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { Button } from "./Button";
import { Panel } from "./Panel";
import { pushAudit } from "../lib/activityStore";
import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import type { GeneratedGatewayResponse } from "../lib/types";
import { copyText, downloadText, formatJson } from "../lib/utils";
import styles from "./GatewayOutput.module.scss";

function generatedSlug(response: GeneratedGatewayResponse): string {
  const gateway = response.gateway_config_json.gateway;
  if (!gateway || typeof gateway !== "object" || Array.isArray(gateway)) {
    return "mcp-composer-gateway";
  }
  const slug = (gateway as Record<string, unknown>).slug;
  return typeof slug === "string" && slug ? slug : "mcp-composer-gateway";
}

async function copyArtifact(label: string, value: string): Promise<void> {
  try {
    await copyText(value);
    pushAudit("config_copied", `Copied ${label}.`, "success");
  } catch {
    pushAudit("config_copied", `Unable to copy ${label}.`, "error");
  }
}

function downloadArtifact(filename: string, value: string, mime?: string): void {
  downloadText(filename, value, mime);
  pushAudit("config_downloaded", `Downloaded ${filename}.`, "success");
}

export const GatewayOutput = memo(function GatewayOutput() {
  if (import.meta.env.DEV) reportRender("GatewayOutput");
  const generated = useCompositionSelector((current) => current.generated);

  const artifacts = useMemo(
    () =>
      generated
        ? {
            slug: generatedSlug(generated),
            compositionJson: formatJson(generated.composition_json),
            gatewayJson: formatJson(generated.gateway_config_json),
            mcpSnippet: formatJson(generated.mcp_servers_snippet),
            exposedTools: formatJson(generated.exposed_tools),
            localCli: `PowerShell:\ncd backend\n$env:APP_MODE = "local"\npython -m app.gateway_server --config ./app/generated/${generatedSlug(generated)}.gateway.config.json\n\nBash:\ncd backend\nAPP_MODE=local python -m app.gateway_server --config ./app/generated/${generatedSlug(generated)}.gateway.config.json`
          }
        : null,
    [generated]
  );

  const copyComposition = useCallback(() => {
    if (artifacts) void copyArtifact("composition JSON", artifacts.compositionJson);
  }, [artifacts]);
  const downloadComposition = useCallback(() => {
    if (artifacts) downloadArtifact(`${artifacts.slug}.composition.json`, artifacts.compositionJson);
  }, [artifacts]);
  const downloadGateway = useCallback(() => {
    if (artifacts) downloadArtifact(`${artifacts.slug}.gateway.config.json`, artifacts.gatewayJson);
  }, [artifacts]);
  const downloadReadme = useCallback(() => {
    if (generated) downloadArtifact("README.md", generated.readme_text, "text/markdown");
  }, [generated]);

  if (!generated) {
    return (
      <Panel title="Gateway Output" subtitle="Generated gateway artifacts will appear here.">
        <div className={styles.empty}>
          Select tools and generate the gateway to view composition JSON, runtime config, client snippet, README, and
          exposed tools.
        </div>
      </Panel>
    );
  }

  if (!artifacts) return null;

  return (
    <Panel
      title="Gateway Output"
      subtitle="Download the config into backend/app/generated before using the local command or client template."
      actions={
        <Button variant="ghost" onClick={compositionActions.resetOutput} leftIcon={<RotateCcw size="0.9375rem" />}>
          Reset
        </Button>
      }
    >
      <div className={styles.actions}>
        <Button variant="secondary" onClick={copyComposition} leftIcon={<Clipboard size="0.9375rem" />}>
          Copy JSON
        </Button>
        <Button variant="secondary" onClick={downloadComposition} leftIcon={<Download size="0.9375rem" />}>
          Composition
        </Button>
        <Button variant="secondary" onClick={downloadGateway} leftIcon={<Download size="0.9375rem" />}>
          Gateway config
        </Button>
        <Button variant="secondary" onClick={downloadReadme} leftIcon={<Download size="0.9375rem" />}>
          README
        </Button>
      </div>

      <div className={styles.blocks}>
        <OutputBlock
          title="Composition JSON"
          copyLabel="composition JSON"
          value={artifacts.compositionJson}
          onCopy={copyArtifact}
        />
        <OutputBlock
          title="Gateway Config JSON"
          copyLabel="gateway config JSON"
          value={artifacts.gatewayJson}
          onCopy={copyArtifact}
        />
        <OutputBlock
          title="mcpServers Config"
          copyLabel="mcpServers config"
          value={artifacts.mcpSnippet}
          onCopy={copyArtifact}
        />
        <OutputBlock title="Local CLI" copyLabel="local CLI command" value={artifacts.localCli} onCopy={copyArtifact} />
        <OutputBlock
          title="Exposed Tools"
          copyLabel="exposed tools"
          value={artifacts.exposedTools}
          onCopy={copyArtifact}
        />
      </div>
    </Panel>
  );
});

interface OutputBlockProps {
  title: string;
  copyLabel: string;
  value: string;
  onCopy: (label: string, value: string) => void;
}

const OutputBlock = memo(function OutputBlock({ title, copyLabel, value, onCopy }: OutputBlockProps) {
  if (import.meta.env.DEV) reportRender(`OutputBlock:${copyLabel}`);

  const copy = useCallback(() => void onCopy(copyLabel, value), [copyLabel, onCopy, value]);

  return (
    <section className={styles.outputBlock}>
      <div className={styles.outputHeader}>
        <div className={styles.outputTitle}>
          <FileJson size="0.9375rem" className={styles.outputIcon} />
          {title}
        </div>
        <Button variant="ghost" onClick={copy} leftIcon={<Clipboard size="0.875rem" />}>
          Copy
        </Button>
      </div>
      <pre className={styles.code}>{value}</pre>
    </section>
  );
});
