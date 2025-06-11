import React from "react";

export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
      {...props}
    />
  );
}

export function CardContent({ children, className }) {
  return <div className={className}>{children}</div>;
}
