import React from "react";
import type { SpotifyTrack } from "../types";

interface TrackInfoProps {
  track: SpotifyTrack | null;
  currentTimeMs: number;
  syncOffsetMs: number;
  setSyncOffsetMs: React.Dispatch<React.SetStateAction<number>>;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const TrackInfo: React.FC<TrackInfoProps> = ({ track, currentTimeMs, syncOffsetMs, setSyncOffsetMs }) => {
  if (!track) return null;

  const progress = Math.min((currentTimeMs / track.durationMs) * 100, 100);

  return (
    <div className="track-info">
      <div className="track-info-content">
        {track.albumArt && (
          <img
            src={track.albumArt}
            alt={track.album}
            className="track-album-art"
            draggable={false}
          />
        )}
        <div className="track-details">
          <div className="track-name">{track.name}</div>
          <div className="track-artist">{track.artist}</div>
        </div>
        
        <div className="sync-controls">
          <button 
            className="sync-btn" 
            onClick={() => setSyncOffsetMs(s => s - 500)} 
            title="Delay lyrics (-0.5s)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <span className="sync-label" title="Sync Offset">
            {syncOffsetMs > 0 ? `+${(syncOffsetMs/1000).toFixed(1)}s` : `${(syncOffsetMs/1000).toFixed(1)}s`}
          </span>
          <button 
            className="sync-btn" 
            onClick={() => setSyncOffsetMs(s => s + 500)} 
            title="Advance lyrics (+0.5s)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>

      <div className="track-progress">
        <div className="track-progress-bar">
          <div
            className="track-progress-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="track-progress-glow"
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="track-progress-time">
          <span>{formatTime(currentTimeMs)}</span>
          <span>{formatTime(track.durationMs)}</span>
        </div>
      </div>
    </div>
  );
};

export default TrackInfo;
