import { AppLayout, AppShell } from "./components/AppShell";
import { ComposerWorkspace } from "./components/ComposerWorkspace";
import { GatewaySummary } from "./components/GatewaySummary";
import { reportRender } from "./lib/renderAudit";

function App() {
  if (import.meta.env.DEV) reportRender("App");

  return (
    <AppShell>
      <AppLayout sidebar={<GatewaySummary />}>
        <ComposerWorkspace />
      </AppLayout>
    </AppShell>
  );
}

export default App;
