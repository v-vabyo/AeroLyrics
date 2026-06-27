import React from 'react'
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer'
import { useLyricSync } from './hooks/useLyricSync'
import LyricsDisplay from './components/LyricsDisplay'
import TrackInfo from './components/TrackInfo'
import AuthScreen from './components/AuthScreen'

const App: React.FC = () => {
  const {
    track,
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    currentTimeMs,
    login
  } = useSpotifyPlayer()

  const {
    lyrics,
    activeIndex,
    isLoading: lyricsLoading,
    hasLyrics,
    error: lyricsError
  } = useLyricSync(track, currentTimeMs)

  const [isLocked, setIsLocked] = React.useState(false)
  const [bgOpacity, setBgOpacity] = React.useState(() => {
    return Number(localStorage.getItem('bgOpacity') ?? 0.78)
  })

  React.useEffect(() => {
    localStorage.setItem('bgOpacity', bgOpacity.toString())
    if (window.electronAPI && window.electronAPI.sendOpacityToMain) {
      window.electronAPI.sendOpacityToMain(bgOpacity)
    }
  }, [bgOpacity])

  React.useEffect(() => {
    if (window.electronAPI && window.electronAPI.onOpacityChange) {
      window.electronAPI.onOpacityChange((newOpacity) => {
        setBgOpacity(newOpacity)
      })
    }
  }, [])

  React.useEffect(() => {
    if (window.electronAPI && window.electronAPI.getClickThroughState) {
      window.electronAPI.getClickThroughState().then(setIsLocked)
    }
    if (window.electronAPI && window.electronAPI.onClickThroughChanged) {
      window.electronAPI.onClickThroughChanged(setIsLocked)
    }
  }, [])

  React.useEffect(() => {
    if (isLocked) {
      document.body.classList.add('is-locked')
    } else {
      document.body.classList.remove('is-locked')
    }
  }, [isLocked])

  const handleClose = () => {
    if (window.electronAPI && window.electronAPI.closeWindow) {
      window.electronAPI.closeWindow()
    }
  }

  return (
    <div 
      className={`widget-container ${isLocked ? 'no-drag' : ''}`}
      style={{
        '--bg-opacity': bgOpacity,
        '--blur-amount': `${bgOpacity * 24}px`,
        '--fade-alpha-40': bgOpacity * 0.6,
        '--track-opacity-top': bgOpacity * 0.95,
        '--track-opacity-bottom': bgOpacity * 0.7,
        '--track-content-opacity': 0.5 + (bgOpacity * 0.5),
        '--border-opacity': bgOpacity > 0 ? 0.1 : 0
      } as React.CSSProperties}
    >
      {}
      {!isLocked && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 40, height: 40, zIndex: 10, WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}

      {}
      {!isLocked && (
        <div className="window-controls no-drag">
          <button className="control-btn close-btn" onClick={handleClose} title="Close">
            <svg viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {}
      <div 
        className="background-blur"
        style={{
          backgroundImage: track?.albumArt ? `url(${track.albumArt})` : undefined,
          opacity: bgOpacity
        }}
      />
      <div className="background-overlay" />

      {}
      {(!isAuthenticated && !authLoading) ? (
        <AuthScreen onLogin={login} isLoading={authLoading} error={authError} isLocked={isLocked} />
      ) : authLoading ? (
        <div className="lyrics-container">
          <div className="lyrics-status">
            <div className="loading-spinner" />
          </div>
        </div>
      ) : !track ? (
        <div className="idle-screen">
          <div className="idle-icon">🎧</div>
          <div className="idle-title">Waiting for music</div>
          <div className="idle-subtitle">
            Play something on Spotify<br />to see lyrics appear here
          </div>
        </div>
      ) : (
        <>
          <LyricsDisplay
            lyrics={lyrics}
            activeIndex={activeIndex}
            isLoading={lyricsLoading}
            hasLyrics={hasLyrics}
            error={lyricsError}
          />
          <TrackInfo track={track} currentTimeMs={currentTimeMs} />
        </>
      )}
    </div>
  )
}

export default App
