// src/components/ui/Select.tsx
import React from "react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export default function Select({ className = "", children, ...props }: SelectProps) {
  const base =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <select className={`${base} ${className}`} {...props}>
      {children}
    </select>
  );
}
