import React from 'react'
import type { SpotifyTrack } from '../types'

interface TrackInfoProps {
  track: SpotifyTrack | null
  currentTimeMs: number
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

const TrackInfo: React.FC<TrackInfoProps> = ({ track, currentTimeMs }) => {
  if (!track) return null

  const progress = Math.min((currentTimeMs / track.durationMs) * 100, 100)

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
  )
}

export default TrackInfo
