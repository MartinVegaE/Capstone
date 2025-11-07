// src/components/ui/Button.tsx
import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center rounded-xl font-medium transition shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 border border-indigo-600",
  secondary:
    "bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 focus:ring-slate-400",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 border border-transparent focus:ring-slate-400",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 border border-rose-600",
};
const sizes: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-3 py-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}
