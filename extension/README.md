# SoundRush — Chrome Extension

Download music from any supported platform with one click.

## Features

- 🎵 **One-click download** — Click the extension icon on any music page
- 📍 **Floating button** — A "Download" button appears on YouTube, Spotify, SoundCloud, etc.
- 🖱️ **Right-click menu** — Right-click any link or page → "Download with SoundRush"
- 📋 **Manual paste** — Paste any URL in the popup
- 🎨 **Minimal black design** — Matches SoundRush aesthetic

## Supported Platforms

- YouTube / YouTube Music
- Spotify (tracks + playlists)
- SoundCloud
- Deezer
- Tidal
- Apple Music
- Bandcamp
- Pandora

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions` in your browser
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The SoundRush icon will appear in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file from the `extension/` folder

## Usage

### Method 1: Floating Button
- Visit any supported music platform
- A black "Download" button appears in the bottom-right corner
- Click it to open SoundRush with the URL pre-filled

### Method 2: Extension Popup
- Click the SoundRush icon in your toolbar
- The current page URL is shown
- Click "Download from this page"

### Method 3: Right-Click Menu
- Right-click anywhere on a music page
- Or right-click a specific link to a track/video
- Select "Download with SoundRush"

### Method 4: Manual Paste
- Click the SoundRush icon
- Paste any URL in the input field
- Click "Download"

## Configuration

To use a different SoundRush server (e.g., localhost for development):

1. Open `background.js` and `popup.js` and `content.js`
2. Change the `SOUNDRUSH_URL` constant
3. Reload the extension

## Files

```
extension/
├── manifest.json      — Extension manifest (MV3)
├── background.js      — Service worker (context menu)
├── popup.html         — Popup UI
├── popup.css          — Popup styles
├── popup.js           — Popup logic
├── content.js         — Injects floating button on music sites
├── content.css        — Floating button styles
└── icons/
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## Privacy

- ✅ No data collection
- ✅ No analytics
- ✅ No background tracking
- ✅ Only runs on supported music platforms
- ✅ All it does is open SoundRush with the current URL
