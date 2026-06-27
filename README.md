# AeroLyrics 🎵

AeroLyrics is a beautiful, modern, and frameless floating Spotify lyrics widget built for Windows. It strictly follows your currently playing Spotify track and displays highly accurate synchronized lyrics right on your desktop, designed to never get in your way.

## ✨ Features

- **Real-Time Sync**: Automatically fetches and perfectly synchronizes lyrics with your currently playing Spotify track using the LRCLIB API.
- **Aggressive Always-On-Top**: Uses Windows screen-saver level priority to ensure the widget stays on top of *everything*, even borderless full-screen games or videos.
- **Ghost Mode (Click-Through)**: Toggleable Click-Through mode directly from the System Tray icon. When enabled, your mouse clicks will pass right through the lyrics into the applications behind it.
- **Karaoke-Style Static Lyrics**: Enjoy a distraction-free experience with non-scrolling, static lyrics featuring smooth crossfades and glowing text effects.
- **Permanent Session**: Built-in silent background OAuth token refresh ensures you never get logged out of your Spotify session.
- **Adjustable Transparency**: Right-click the system tray icon to change the background opacity on the fly.

## 🚀 Installation

1. Go to the Releases page.
2. Download the latest AeroLyrics Setup.exe.
3. Install the application.
4. Open AeroLyrics, click Connect to Spotify, and authorize the app.
5. Play a song on Spotify and sing along!

## 🛠️ Development

AeroLyrics is built using **Electron**, **React**, **Vite**, and **TypeScript**.

### Prerequisites
- Node.js (v18 or higher recommended)
- A Spotify Developer Account to create an OAuth Client ID.

### Setup

1. Clone this repository:
`ash
git clone https://github.com/v-vabyo/AeroLyrics.git
cd AeroLyrics
`

2. Install dependencies:
`ash
npm install
`

3. Create a .env file in the root directory and add your Spotify Client ID:
`env
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
`

4. Run the development server:
`ash
npm run dev
`

5. Build the Windows executable:
`ash
npm run build
npm run package
`
