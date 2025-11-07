// src/components/ui/Input.tsx
import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export default function Input({ className = "", ...props }: InputProps) {
  const base =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return <input className={`${base} ${className}`} {...props} />;
}
