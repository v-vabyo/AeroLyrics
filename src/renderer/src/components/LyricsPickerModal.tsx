import { useEffect, useState, useRef } from "react";
import { LRCLibResponse, SpotifyTrack } from "../types";
import "../index.css";

interface LyricsPickerModalProps {
  track: SpotifyTrack | null;
  isOpen: boolean;
  onClose: () => void;
  onLyricSelected: () => void;
}

export function LyricsPickerModal({
  track,
  isOpen,
  onClose,
  onLyricSelected,
}: LyricsPickerModalProps) {
  const [results, setResults] = useState<LRCLibResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && track) {
      setLoading(true);
      window.electronAPI
        .searchLyrics(track.name, track.artist)
        .then((res) => {
          setResults(res || []);
          setLoading(false);
        })
        .catch(() => {
          setResults([]);
          setLoading(false);
        });
    } else {
      setResults([]);
    }
  }, [isOpen, track]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelect = async (lyric: LRCLibResponse) => {
    if (!track || saving) return;
    setSaving(true);
    await window.electronAPI.saveLyricOverride(track.name, track.artist, lyric);
    setSaving(false);
    onLyricSelected();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        WebkitAppRegion: "no-drag",
      }}
    >
      <div
        ref={modalRef}
        className="modal-content"
        style={{
          backgroundColor: "#18181b",
          borderRadius: "12px",
          width: "90%",
          maxWidth: "500px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
            Select Lyrics
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#a1a1aa",
              cursor: "pointer",
              fontSize: "20px",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: "20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
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
            results.map((r, i) => (
              <div
                key={`${r.id}-${i}`}
                onClick={() => handleSelect(r)}
                style={{
                  padding: "12px",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  cursor: saving ? "wait" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  border: "1px solid transparent",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!saving)
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!saving)
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
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
                    {track && (
                      <span
                        style={{
                          marginLeft: "4px",
                          color:
                            Math.abs(r.duration - Math.round(track.durationMs / 1000)) === 0
                              ? "#10b981"
                              : "#ef4444",
                        }}
                      >
                        (Expected: {formatDuration(track.durationMs / 1000)})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
