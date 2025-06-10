import React from "react";

export function Card({ children }) {
  return <div className="border rounded shadow">{children}</div>;
}

export function CardContent({ children, className }) {
  return <div className={className}>{children}</div>;
}
