import React, { useEffect, useRef, useMemo } from "react";
import type { LyricLine } from "../types";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  activeIndex: number;
  isLoading: boolean;
  hasLyrics: boolean;
  error: string | null;
}

const LyricsDisplay: React.FC<LyricsDisplayProps> = ({
  lyrics,
  activeIndex,
  isLoading,
  hasLyrics,
  error,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return;

    const activeLine = lineRefs.current.get(activeIndex);
    if (activeLine) {
      activeLine.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  const getLineStyle = useMemo(() => {
    return (index: number) => {
      if (activeIndex < 0) {
        return { opacity: 0 };
      }

      const distance = Math.abs(index - activeIndex);

      if (distance > 1) {
        return { opacity: 0, pointerEvents: "none" as const };
      }

      if (distance === 0) {
        return { opacity: 1, transform: "scale(1.05)" };
      }

      return {
        opacity: 0.3,
        transform: "scale(0.95)",
      };
    };
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="lyrics-container">
        <div className="lyrics-status">
          <div className="loading-spinner" />
          <span>Finding lyrics...</span>
        </div>
      </div>
    );
  }

  if (error && !hasLyrics) {
    return (
      <div className="lyrics-container">
        <div className="lyrics-status">
          <span className="status-icon">♪</span>
          <span>No lyrics available</span>
        </div>
      </div>
    );
  }

  if (!hasLyrics) {
    return (
      <div className="lyrics-container">
        <div className="lyrics-status">
          <span className="status-icon">♫</span>
          <span>Waiting for music...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-container" ref={containerRef}>
      <div className="lyrics-scroll-area">
        {}
        <div className="lyrics-spacer" />

        {lyrics.map((line, index) => (
          <div
            key={`${index}-${line.time}`}
            ref={(el) => {
              if (el) lineRefs.current.set(index, el);
            }}
            className={`lyric-line ${index === activeIndex ? "active" : ""} ${
              index < activeIndex ? "past" : ""
            }`}
            style={getLineStyle(index)}
          >
            {line.text || "♪"}
          </div>
        ))}

        {}
        <div className="lyrics-spacer" />
      </div>

      {}
      <div className="lyrics-fade-top" />
      <div className="lyrics-fade-bottom" />
    </div>
  );
};

export default LyricsDisplay;
