import { memo } from "react";
import { CheckCircle2 } from "lucide-react";

import { reportRender } from "../lib/renderAudit";
import { cn } from "../lib/utils";
import styles from "./BuilderStepper.module.scss";

export interface BuilderStepItem<TStep extends string> {
  id: TStep;
  label: string;
  detail: string;
  count?: number;
}

interface BuilderStepperProps<TStep extends string> {
  steps: Array<BuilderStepItem<TStep>>;
  activeStep: TStep;
  onStepChange: (step: TStep) => void;
  canEnterStep: (step: TStep) => boolean;
}

function BuilderStepperComponent<TStep extends string>({
  steps,
  activeStep,
  onStepChange,
  canEnterStep
}: BuilderStepperProps<TStep>) {
  if (import.meta.env.DEV) reportRender("BuilderStepper");

  const activeIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <nav className={styles.stepper} aria-label="Builder steps">
      <ol className={styles.list}>
        {steps.map((step, index) => {
          const isActive = step.id === activeStep;
          const isComplete = index < activeIndex;
          const isLocked = !canEnterStep(step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => onStepChange(step.id)}
                className={cn(
                  styles.step,
                  isActive && styles.active,
                  !isActive && !isLocked && styles.available,
                  isLocked && styles.locked
                )}
              >
                <span
                  className={cn(
                    styles.index,
                    isComplete && styles.completeIndex,
                    isActive && !isComplete && styles.activeIndex,
                    !isActive && !isComplete && styles.inactiveIndex
                  )}
                >
                  {isComplete ? <CheckCircle2 size="0.9375rem" /> : index + 1}
                </span>
                <span className={styles.copy}>
                  <span className={styles.label}>
                    {step.label}
                    {typeof step.count === "number" && <span className={styles.count}>{step.count}</span>}
                  </span>
                  <span className={styles.detail}>{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const BuilderStepper = memo(BuilderStepperComponent) as typeof BuilderStepperComponent;
