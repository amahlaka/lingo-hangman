import React, { useState, useEffect } from "react";

export default function HangmanDrawing({ incorrect, t }) {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const gallowsStroke = isDark ? "#bbb" : "#444";
  const bodyStroke = isDark ? "#eee" : "#222";

  return (
    <div className="flex flex-col items-center my-4 w-full">
      <div style={{ width: "100%", maxWidth: 120, minWidth: 60 }}>
        <svg
          width="100%"
          height="auto"
          viewBox="0 0 120 160"
          style={{ display: "block", width: "100%", height: "auto" }}
          preserveAspectRatio="xMidYMin meet"
        >
          {/* Gallows */}
          <line x1="10" y1="150" x2="110" y2="150" stroke={gallowsStroke} strokeWidth="4" />
          <line x1="40" y1="150" x2="40" y2="20" stroke={gallowsStroke} strokeWidth="4" />
          <line x1="40" y1="20" x2="90" y2="20" stroke={gallowsStroke} strokeWidth="4" />
          <line x1="90" y1="20" x2="90" y2="40" stroke={gallowsStroke} strokeWidth="4" />
          {/* Head */}
          {incorrect > 0 && (
            <circle cx="90" cy="55" r="15" stroke={bodyStroke} strokeWidth="3" fill="none" />
          )}
          {/* Body */}
          {incorrect > 1 && (
            <line x1="90" y1="70" x2="90" y2="110" stroke={bodyStroke} strokeWidth="3" />
          )}
          {/* Left Arm */}
          {incorrect > 2 && (
            <line x1="90" y1="80" x2="70" y2="100" stroke={bodyStroke} strokeWidth="3" />
          )}
          {/* Right Arm */}
          {incorrect > 3 && (
            <line x1="90" y1="80" x2="110" y2="100" stroke={bodyStroke} strokeWidth="3" />
          )}
          {/* Left Leg */}
          {incorrect > 4 && (
            <line x1="90" y1="110" x2="75" y2="135" stroke={bodyStroke} strokeWidth="3" />
          )}
          {/* Right Leg */}
          {incorrect > 5 && (
            <line x1="90" y1="110" x2="105" y2="135" stroke={bodyStroke} strokeWidth="3" />
          )}
        </svg>
      </div>
    </div>
  );
}
