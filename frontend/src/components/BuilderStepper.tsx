import { CheckCircle2 } from "lucide-react";

import { cn } from "../lib/utils";

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

export function BuilderStepper<TStep extends string>({ steps, activeStep, onStepChange, canEnterStep }: BuilderStepperProps<TStep>) {
  const activeIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <nav className="rounded-lg border border-[#343d34] bg-[#191d19] p-2" aria-label="Builder steps">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                  "flex min-h-[4.75rem] w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition",
                  isActive && "border-[#2bb3a3] bg-[#202620]",
                  !isActive && !isLocked && "border-[#343d34] bg-[#111510] hover:bg-[#242a24]",
                  isLocked && "cursor-not-allowed border-[#262d26] bg-[#111510] opacity-55"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.75rem] font-bold",
                    isComplete && "border-[#2bb3a3] bg-[#2bb3a3] text-[#10120f]",
                    isActive && !isComplete && "border-[#2bb3a3] text-[#2bb3a3]",
                    !isActive && !isComplete && "border-[#343d34] text-[#a9b4aa]"
                  )}
                >
                  {isComplete ? <CheckCircle2 size="0.9375rem" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold text-[#e7ece7]">
                    {step.label}
                    {typeof step.count === "number" && (
                      <span className="rounded-full border border-[#343d34] px-2 py-0.5 text-[0.6875rem] text-[#a9b4aa]">
                        {step.count}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[0.75rem] leading-4 text-[#a9b4aa]">{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

