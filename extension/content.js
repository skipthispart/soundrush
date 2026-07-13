// SoundRush — Content Script
// Injects a floating "Download" button on supported music platforms

const SOUNDRUSH_URL = "https://preview-19f5347704d73de9.space-z.ai/";
// For local testing: "http://localhost:3000/"

// --- Detect platform and extract media URL ---
function getMediaUrl() {
  const url = window.location.href;

  // YouTube — extract video ID
  if (/youtube\.com\/watch/i.test(url)) {
    return url; // use full URL
  }
  if (/youtu\.be/i.test(url)) {
    return url;
  }
  if (/youtube\.com\/shorts/i.test(url)) {
    return url;
  }

  // SoundCloud — track page
  if (/soundcloud\.com\/[\w-]+\/[\w-]+/i.test(url)) {
    return url;
  }

  // Spotify — track or playlist
  if (/spotify\.com\/(track|playlist|album)/i.test(url)) {
    return url;
  }

  // Deezer
  if (/deezer\.com\/(track|album|playlist)/i.test(url)) {
    return url;
  }

  // Tidal
  if (/tidal\.com\/(track|album|playlist)/i.test(url)) {
    return url;
  }

  // Apple Music
  if (/music\.apple\.com/i.test(url)) {
    return url;
  }

  // Bandcamp
  if (/bandcamp\.com\/(track|album)/i.test(url)) {
    return url;
  }

  // YouTube Music
  if (/music\.youtube\.com/i.test(url)) {
    return url;
  }

  return null;
}

// --- Create floating button ---
function createButton() {
  const mediaUrl = getMediaUrl();
  if (!mediaUrl) return;

  // Check if button already exists
  if (document.getElementById("soundrush-fab")) return;

  const fab = document.createElement("a");
  fab.id = "soundrush-fab";
  fab.href = `${SOUNDRUSH_URL}?url=${encodeURIComponent(mediaUrl)}`;
  fab.target = "_blank";
  fab.rel = "noopener noreferrer";
  fab.title = "Download with SoundRush";
  fab.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>Download</span>
  `;

  document.body.appendChild(fab);
  console.log("[SoundRush] Download button injected for:", mediaUrl);
}

// --- Wait for page to load, then inject button ---
if (document.readyState === "complete") {
  setTimeout(createButton, 1000);
} else {
  window.addEventListener("load", () => setTimeout(createButton, 1000));
}

// --- Re-inject on URL change (SPA navigation) ---
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const existing = document.getElementById("soundrush-fab");
    if (existing) existing.remove();
    setTimeout(createButton, 1500);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// --- Listen for URL changes via History API ---
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  setTimeout(createButton, 1500);
};
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  setTimeout(createButton, 1500);
};
window.addEventListener("popstate", () => setTimeout(createButton, 1500));
