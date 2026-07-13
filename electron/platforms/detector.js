const PLATFORMS = [
  {
    name: "YouTube",
    domains: ["youtube.com", "youtu.be", "music.youtube.com"],
    selectors: ["ytd-watch-metadata", "#title h1", "h1.ytd-video-primary-info-renderer"],
    urlPattern: /^https?:\/\/(www\.|music\.)?youtube\.com\/watch\?v=/i,
  },
  {
    name: "Spotify",
    domains: ["spotify.com", "open.spotify.com"],
    selectors: ["[data-testid='context-item-info-title']", "h1[class*='Type__TypeElement']"],
    urlPattern: /^https?:\/\/open\.spotify\.com\/(track|album|playlist)\//i,
  },
  {
    name: "SoundCloud",
    domains: ["soundcloud.com"],
    selectors: [".soundTitle__title", "h1"],
    urlPattern: /^https?:\/\/(www\.)?soundcloud\.com\/[\w-]+\/[\w-]+/i,
  },
  {
    name: "Deezer",
    domains: ["deezer.com", "www.deezer.com"],
    selectors: [".song-name", ".track-title"],
    urlPattern: /^https?:\/\/www\.deezer\.com\/(track|album)\//i,
  },
  {
    name: "YouTube Music",
    domains: ["music.youtube.com"],
    selectors: [".title.ytmusic-player-bar", "yt-formatted-string.title"],
    urlPattern: /^https?:\/\/music\.youtube\.com\/watch\?v=/i,
  },
];

function detectPlatform(url) {
  const domain = new URL(url).hostname.replace("www.", "");
  return PLATFORMS.find((p) => p.domains.some((d) => domain.includes(d))) || null;
}

function getTitleFromPage() {
  const platform = detectPlatform(window.location.href);
  if (!platform) return null;
  for (const sel of platform.selectors) {
    const el = document.querySelector(sel);
    if (el) return el.textContent.trim();
  }
  return document.title;
}

module.exports = { PLATFORMS, detectPlatform, getTitleFromPage };
