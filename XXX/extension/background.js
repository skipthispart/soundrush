// SoundRush — Background Service Worker
// Handles context menu, extension button click, and opens SoundRush with current tab URL

const SOUNDRUSH_URL = "https://preview-19f5347704d73de9.space-z.ai/";
// For local testing: "http://localhost:3000/"

// --- Create context menu on install ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "soundrush-download",
    title: "Download with SoundRush",
    contexts: ["link", "page", "video", "audio"],
  });
  console.log("SoundRush extension installed");
});

// --- Handle context menu clicks ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "soundrush-download") {
    // Prefer link URL if clicked on a link, otherwise use page URL
    const url = info.linkUrl || info.pageUrl || tab?.url || "";
    if (url) {
      openSoundRush(url);
    }
  }
});

// --- Handle extension button click (open popup with current URL) ---
chrome.action.onClicked?.addListener(async (tab) => {
  // This only fires if no popup is set; we have a popup so this won't fire
});

// --- Open SoundRush with the given URL pre-filled ---
function openSoundRush(mediaUrl) {
  const url = `${SOUNDRUSH_URL}?url=${encodeURIComponent(mediaUrl)}`;
  chrome.tabs.create({ url });
}

// --- Listen for messages from popup / content script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_SOUNDRUSH") {
    openSoundRush(message.url);
    sendResponse({ ok: true });
  } else if (message.type === "GET_CURRENT_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || "" });
    });
    return true; // async response
  }
});
