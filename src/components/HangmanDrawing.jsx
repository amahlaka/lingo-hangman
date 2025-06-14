import React, { useState, useEffect } from "react";

export default function HangmanDrawing({ incorrect, t, shrink }) {
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

  // Shrink drawing if shrink prop is true
  const svgWidth = shrink ? 80 : 120;
  const svgHeight = shrink ? 110 : 160;
  const viewBox = shrink ? "0 0 80 110" : "0 0 120 160";
  // Scale all coordinates if shrinked
  const scale = shrink ? 0.67 : 1;
  const S = v => v * scale;

  return (
    <div className="flex flex-col items-center my-4 w-full">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={viewBox}
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMin meet"
      >
        {/* Gallows */}
        <line x1={S(10)} y1={S(150)} x2={S(110)} y2={S(150)} stroke={gallowsStroke} strokeWidth={S(4)} />
        <line x1={S(40)} y1={S(150)} x2={S(40)} y2={S(20)} stroke={gallowsStroke} strokeWidth={S(4)} />
        <line x1={S(40)} y1={S(20)} x2={S(90)} y2={S(20)} stroke={gallowsStroke} strokeWidth={S(4)} />
        <line x1={S(90)} y1={S(20)} x2={S(90)} y2={S(40)} stroke={gallowsStroke} strokeWidth={S(4)} />
        {/* Head */}
        {incorrect > 0 && (
          <circle cx={S(90)} cy={S(55)} r={S(15)} stroke={bodyStroke} strokeWidth={S(3)} fill="none" />
        )}
        {/* Body */}
        {incorrect > 1 && (
          <line x1={S(90)} y1={S(70)} x2={S(90)} y2={S(110)} stroke={bodyStroke} strokeWidth={S(3)} />
        )}
        {/* Left Arm */}
        {incorrect > 2 && (
          <line x1={S(90)} y1={S(80)} x2={S(70)} y2={S(100)} stroke={bodyStroke} strokeWidth={S(3)} />
        )}
        {/* Right Arm */}
        {incorrect > 3 && (
          <line x1={S(90)} y1={S(80)} x2={S(110)} y2={S(100)} stroke={bodyStroke} strokeWidth={S(3)} />
        )}
        {/* Left Leg */}
        {incorrect > 4 && (
          <line x1={S(90)} y1={S(110)} x2={S(75)} y2={S(135)} stroke={bodyStroke} strokeWidth={S(3)} />
        )}
        {/* Right Leg */}
        {incorrect > 5 && (
          <line x1={S(90)} y1={S(110)} x2={S(105)} y2={S(135)} stroke={bodyStroke} strokeWidth={S(3)} />
        )}
      </svg>
    </div>
  );
}
