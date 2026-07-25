export type RenderBoundary =
  | "App"
  | "AppHeader"
  | "AppFooter"
  | "OutputSize"
  | "BuilderStepper"
  | "StepNavigation"
  | "ActiveStep"
  | "AliasWarning"
  | "TaskProfileEditor"
  | "NameField"
  | "UseCaseField"
  | "DescriptionField"
  | "SystemNotesField"
  | "GatewaySummary"
  | "GatewayIdentity"
  | "GatewayName"
  | "GatewayDescription"
  | "Metrics"
  | "RiskBreakdown"
  | "Warnings"
  | "GenerateButton"
  | "AppShell"
  | "AppLayout"
  | "ComposerWorkspace"
  | "ToastHost"
  | "ServerSetupTabs"
  | "ServerDiscovery"
  | "CatalogSearchInput"
  | "ManualServerForm"
  | "ServerPool"
  | "ToolPicker"
  | "GatewayOutput"
  | "AuditLog"
  | "Roadmap"
  | `CatalogCard:${string}`
  | `ServerPoolCard:${string}`
  | `ToolServerGroup:${string}`
  | `ToolCard:${string}`
  | `Metric:${"servers" | "tools"}`
  | `RiskRow:${"read" | "write" | "external" | "destructive"}`
  | `OutputBlock:${string}`
  | `AuditLogRow:${string}`;

type RenderObserver = (boundary: RenderBoundary) => void;

let renderObserver: RenderObserver | null = null;

export function reportRender(boundary: RenderBoundary): void {
  renderObserver?.(boundary);
}

export function setRenderObserver(observer: RenderObserver | null): void {
  renderObserver = observer;
}
