import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils";
import styles from "./Button.module.scss";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger
};

export function Button({ children, className, variant = "secondary", fullWidth, leftIcon, ...props }: ButtonProps) {
  return (
    <button className={cn(styles.button, fullWidth && styles.fullWidth, variants[variant], className)} {...props}>
      {leftIcon}
      <span>{children}</span>
    </button>
  );
}
