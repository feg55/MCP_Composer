import { AlertCircle, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { compositionActions, type BuilderStep, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import { AuditLog } from "./AuditLog";
import { BuilderStepper, type BuilderStepItem } from "./BuilderStepper";
import { Button } from "./Button";
import { GatewayOutput } from "./GatewayOutput";
import { Roadmap } from "./Roadmap";
import { ServerPool } from "./ServerPool";
import { ServerSetupTabs } from "./ServerSetupTabs";
import { TaskProfileEditor } from "./TaskProfileEditor";
import { ToastHost } from "./ToastHost";
import { ToolPicker } from "./ToolPicker";
import styles from "./ComposerWorkspace.module.scss";

const builderSteps: Array<BuilderStepItem<BuilderStep>> = [
  { id: "profile", label: "Task Profile", detail: "Name and use case" },
  { id: "servers", label: "Add Servers", detail: "Catalog or manual" },
  { id: "tools", label: "Pick Tools", detail: "Aliases and permissions" },
  { id: "output", label: "Gateway Output", detail: "Generate and export" }
];

export const ComposerWorkspace = memo(function ComposerWorkspace() {
  if (import.meta.env.DEV) reportRender("ComposerWorkspace");

  return (
    <>
      <ToastHost />
      <BuilderStepperConnector />
      <ActiveStep />
    </>
  );
});

function BuilderStepperConnector() {
  const activeStep = useCompositionSelector((current) => current.activeStep);
  const serverCount = useCompositionSelector((current) => current.serverCount);
  const selectedToolCount = useCompositionSelector((current) => current.selectedToolCount);
  const hasDiscoveredTools = useCompositionSelector((current) => current.hasDiscoveredTools);
  const hasGeneratedOutput = useCompositionSelector((current) => current.generated !== null);

  const steps = useMemo<Array<BuilderStepItem<BuilderStep>>>(
    () => [
      builderSteps[0],
      { ...builderSteps[1], count: serverCount },
      { ...builderSteps[2], count: selectedToolCount },
      builderSteps[3]
    ],
    [selectedToolCount, serverCount]
  );
  const canEnterStep = useCallback(
    (step: BuilderStep) => {
      if (step === "tools") return hasDiscoveredTools;
      if (step === "output") return hasGeneratedOutput;
      return true;
    },
    [hasDiscoveredTools, hasGeneratedOutput]
  );

  return (
    <BuilderStepper
      steps={steps}
      activeStep={activeStep}
      onStepChange={compositionActions.setActiveStep}
      canEnterStep={canEnterStep}
    />
  );
}

function ActiveStep() {
  if (import.meta.env.DEV) reportRender("ActiveStep");
  const activeStep = useCompositionSelector((current) => current.activeStep);

  if (activeStep === "profile") {
    return (
      <>
        <TaskProfileEditor />
        <StepNavigation />
      </>
    );
  }

  if (activeStep === "servers") {
    return (
      <>
        <StepNavigation />
        <ServerPool />
        <ServerSetupTabs />
      </>
    );
  }

  if (activeStep === "tools") {
    return (
      <>
        <div id="tool-picker" className={styles.toolPickerAnchor}>
          <ToolPicker />
        </div>
        <AliasWarning />
        <StepNavigation />
      </>
    );
  }

  return (
    <>
      <GatewayOutput />
      <AuditLog />
      <Roadmap />
      <StepNavigation />
    </>
  );
}

const AliasWarning = memo(function AliasWarning() {
  if (import.meta.env.DEV) reportRender("AliasWarning");
  const conflicts = useCompositionSelector((current) => current.conflicts);

  if (!conflicts.length) return null;

  return (
    <div className={styles.aliasWarning}>
      <AlertCircle size="1rem" className={styles.warningIcon} />
      Alias conflicts must be resolved before generation: {conflicts.join(", ")}
    </div>
  );
});

const StepNavigation = memo(function StepNavigation() {
  if (import.meta.env.DEV) reportRender("StepNavigation");

  const activeStep = useCompositionSelector((current) => current.activeStep);
  const selectedToolCount = useCompositionSelector((current) =>
    current.activeStep === "tools" ? current.selectedToolCount : 0
  );
  const hasConflicts = useCompositionSelector((current) =>
    current.activeStep === "tools" ? current.conflicts.length > 0 : false
  );
  const isGenerating = useCompositionSelector((current) =>
    current.activeStep === "tools" ? current.isGenerating : false
  );
  const canEnterTools = useCompositionSelector((current) =>
    current.activeStep === "servers" ? current.hasDiscoveredTools : false
  );

  const activeStepIndex = builderSteps.findIndex((step) => step.id === activeStep);
  const isFirst = activeStep === "profile";
  const isLast = activeStep === "output";
  const nextDisabled =
    activeStep === "servers"
      ? !canEnterTools
      : activeStep === "tools"
        ? selectedToolCount === 0 || hasConflicts || isGenerating
        : isLast;
  const nextLabel = activeStep === "tools" ? (isGenerating ? "Generating..." : "Generate and review") : "Next";

  return (
    <div className={styles.navigation}>
      <div className={styles.navigationCopy}>
        <p className={styles.navigationEyebrow}>
          Step {activeStepIndex + 1} of {builderSteps.length}
        </p>
        <p className={styles.navigationDescription}>
          {activeStep === "servers"
            ? "Catalog and manual additions both update the same server pool."
            : activeStep === "tools"
              ? "Select at least one tool, then generate the gateway."
              : activeStep === "output"
                ? "Review, copy, or download the generated artifacts."
                : "Define the task before choosing upstream capabilities."}
        </p>
      </div>
      <div className={styles.navigationActions}>
        <Button
          variant="secondary"
          onClick={compositionActions.goBack}
          disabled={isFirst}
          leftIcon={<ArrowLeft size="0.9375rem" />}
        >
          Back
        </Button>
        {!isLast && (
          <Button
            variant="primary"
            onClick={compositionActions.goNext}
            disabled={nextDisabled}
            leftIcon={activeStep === "tools" ? <Sparkles size="0.9375rem" /> : <ArrowRight size="0.9375rem" />}
          >
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
});
