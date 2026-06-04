import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#2bb3a3] text-[#10120f] hover:bg-[#39c9b8] border-[#2bb3a3] font-bold",
  secondary: "bg-[#202620] text-[#e7ece7] hover:bg-[#242a24] border-[#343d34]",
  ghost: "bg-transparent text-[#a9b4aa] hover:text-[#e7ece7] hover:bg-[#242a24] border-transparent",
  danger: "bg-[#2a1717] text-[#ff9c9c] hover:bg-[#3a1d1d] border-[#633232]"
};

export function Button({ children, className, variant = "secondary", fullWidth, leftIcon, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth && "w-full",
        variants[variant],
        className
      )}
      {...props}
    >
      {leftIcon}
      <span>{children}</span>
    </button>
  );
}

