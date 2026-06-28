import React, { useEffect, useState } from "react";
import { LRCLibResponse } from "./types";
import "./index.css";

export function LyricsPickerApp() {
  const [results, setResults] = useState<LRCLibResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Parse URL search params
  const urlParams = new URLSearchParams(window.location.search);
  const trackName = urlParams.get("trackName") || "";
  const artistName = urlParams.get("artistName") || "";
  const durationMsStr = urlParams.get("durationMs") || "0";
  const durationMs = parseInt(durationMsStr, 10);

  useEffect(() => {
    if (trackName && artistName) {
      window.electronAPI
        .searchLyrics(trackName, artistName)
        .then((res) => {
          let fetchedResults = res || [];
          
          if (durationMs > 0) {
            const expectedSec = Math.round(durationMs / 1000);
            fetchedResults.sort((a, b) => {
              // 1. Prioritize Synced Lyrics
              const aHasSync = !!a.syncedLyrics;
              const bHasSync = !!b.syncedLyrics;
              if (aHasSync && !bHasSync) return -1;
              if (!aHasSync && bHasSync) return 1;
              
              // 2. Sort by duration difference to expected
              const aDiff = Math.abs(a.duration - expectedSec);
              const bDiff = Math.abs(b.duration - expectedSec);
              return aDiff - bDiff;
            });
          }

          setResults(fetchedResults);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to search lyrics:", err);
          setResults([]);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelect = async (lyric: LRCLibResponse) => {
    if (saving) return;
    setSaving(true);
    try {
      await window.electronAPI.saveLyricOverride(trackName, artistName, lyric);
      window.electronAPI.notifyLyricSelected();
    } catch (err) {
      console.error("Failed to save lyric:", err);
    }
    setSaving(false);
  };

  return (
    <div
      style={{
        backgroundColor: "#18181b",
        color: "white",
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
          Select Lyrics for {trackName}
        </h2>
        <div style={{ fontSize: "13px", color: "#a1a1aa", marginTop: "4px" }}>
          By {artistName}
        </div>
      </div>

      <div
        style={{
          padding: "20px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          flexGrow: 1,
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", color: "#a1a1aa", padding: "20px" }}>
            Searching lyrics...
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: "center", color: "#a1a1aa", padding: "20px" }}>
            No alternative lyrics found.
          </div>
        ) : (
          results.map((r, i) => {
            const isPreviewing = previewIndex === i;
            return (
            <div
              key={`${r.id}-${i}`}
              onClick={() => {
                if (!saving && !isPreviewing) {
                  setPreviewIndex(i);
                  window.electronAPI.previewLyric(r);
                }
              }}
              style={{
                padding: "12px",
                backgroundColor: isPreviewing ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                borderRadius: "8px",
                cursor: saving ? "wait" : (isPreviewing ? "default" : "pointer"),
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                border: isPreviewing ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!saving && !isPreviewing)
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!saving && !isPreviewing)
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "14px" }}>
                  {r.trackName} - {r.artistName}
                </strong>
                <span
                  style={{
                    fontSize: "12px",
                    color: r.syncedLyrics ? "#10b981" : "#a1a1aa",
                    fontWeight: r.syncedLyrics ? "600" : "normal",
                  }}
                >
                  {r.syncedLyrics ? "Synced" : "Static"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#a1a1aa",
                }}
              >
                <span>{r.albumName || "Unknown Album"}</span>
                <span>
                  Duration: {formatDuration(r.duration)}
                  {durationMs > 0 && (
                    <span
                      style={{
                        marginLeft: "4px",
                        color:
                          Math.abs(r.duration - Math.round(durationMs / 1000)) <= 2
                            ? "#10b981"
                            : "#ef4444",
                      }}
                    >
                      (Expected: {formatDuration(durationMs / 1000)})
                    </span>
                  )}
                </span>
              </div>
              
              {isPreviewing && (
                <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px" }}>
                  <div style={{ 
                    maxHeight: "150px", 
                    overflowY: "auto", 
                    fontSize: "13px", 
                    color: "#d4d4d8",
                    lineHeight: "1.6",
                    marginBottom: "12px",
                    padding: "8px",
                    backgroundColor: "rgba(0,0,0,0.2)",
                    borderRadius: "4px",
                    whiteSpace: "pre-wrap"
                  }}>
                    {r.syncedLyrics || r.plainLyrics || "No lyrics content available."}
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setPreviewIndex(null); 
                        window.electronAPI.clearPreview();
                      }}
                      style={{ padding: "6px 12px", backgroundColor: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleSelect(r); }}
                      style={{ padding: "6px 12px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Use this Lyric"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
