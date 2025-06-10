import React from "react";

export function Button({ children, ...props }) {
  return (
    <button
      className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}
