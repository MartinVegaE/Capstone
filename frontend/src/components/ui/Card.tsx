// src/components/ui/Card.tsx
import React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b px-4 py-3 ${className}`} {...props} />;
}

export function CardBody({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-4 py-4 ${className}`} {...props} />;
}
