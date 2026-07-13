// SoundRush — Popup script
// Handles popup UI interactions

const SOUNDRUSH_URL = "https://preview-19f5347704d73de9.space-z.ai/";
// For local testing: "http://localhost:3000/"

const SUPPORTED_PATTERNS = [
  /youtube\.com/i,
  /youtu\.be/i,
  /music\.youtube\.com/i,
  /soundcloud\.com/i,
  /spotify\.com/i,
  /deezer\.com/i,
  /tidal\.com/i,
  /music\.apple\.com/i,
  /bandcamp\.com/i,
  /pandora\.com/i,
  /share\.google/i,
];

function isSupported(url) {
  return SUPPORTED_PATTERNS.some((p) => p.test(url));
}

// --- DOM elements ---
const currentUrlEl = document.getElementById("current-url");
const downloadCurrentBtn = document.getElementById("download-current");
const manualUrlInput = document.getElementById("manual-url");
const downloadManualBtn = document.getElementById("download-manual");

// --- Get current tab URL ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || "";
  currentUrlEl.textContent = url || "Not available";

  if (url && isSupported(url)) {
    downloadCurrentBtn.disabled = false;
    downloadCurrentBtn.textContent = "Download from this page";
  } else if (url) {
    downloadCurrentBtn.disabled = true;
    downloadCurrentBtn.textContent = "Page not supported";
  }
});

// --- Download current page ---
downloadCurrentBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || "";
    if (url) {
      openSoundRush(url);
    }
  });
});

// --- Manual URL input ---
manualUrlInput.addEventListener("input", () => {
  const url = manualUrlInput.value.trim();
  downloadManualBtn.disabled = !url || !isSupported(url);
});

manualUrlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !downloadManualBtn.disabled) {
    downloadManualBtn.click();
  }
});

downloadManualBtn.addEventListener("click", () => {
  const url = manualUrlInput.value.trim();
  if (url && isSupported(url)) {
    openSoundRush(url);
  }
});

// --- Open SoundRush with pre-filled URL ---
function openSoundRush(mediaUrl) {
  const url = `${SOUNDRUSH_URL}?url=${encodeURIComponent(mediaUrl)}`;
  chrome.tabs.create({ url });
}
