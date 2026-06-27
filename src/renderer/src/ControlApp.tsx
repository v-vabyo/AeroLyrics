import React from 'react'

export default function ControlApp() {
  const [isLocked, setIsLocked] = React.useState(false)

  React.useEffect(() => {
    if (window.electronAPI && window.electronAPI.getClickThroughState) {
      window.electronAPI.getClickThroughState().then(setIsLocked)
    }
    if (window.electronAPI && window.electronAPI.onClickThroughChanged) {
      window.electronAPI.onClickThroughChanged(setIsLocked)
    }
  }, [])

  const toggleLock = () => {
    const newState = !isLocked
    setIsLocked(newState)
    if (window.electronAPI && window.electronAPI.toggleClickThrough) {
      window.electronAPI.toggleClickThrough(newState)
    }
  }

  // The controlWindow is now permanently exactly 32x32 pixels.
  // Its position relative to mainWindow is synced by the main process.
  return (
    <div 
      style={{ 
        width: '32px', 
        height: '32px', 
        WebkitAppRegion: 'no-drag',
        background: 'transparent'
      } as React.CSSProperties}
    >
      <button 
        key="lock-toggle-btn"
        className="lock-toggle-btn" 
        onClick={toggleLock}
        style={{ 
          position: 'absolute',
          top: 0, 
          left: 0,
          margin: 0,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
        title={isLocked ? "Click to unlock and move window" : "Click to lock window (enable click-through)"}
      >
        {isLocked ? "🔒" : "🔓"}
      </button>
    </div>
  )
}
