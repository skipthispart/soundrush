// Platform detection and metadata utilities

export type MediaKind = "video" | "audio";

export type QualityOption = {
  id: string;          // unique format id e.g. "mp4-4320"
  formatId?: string;   // yt-dlp format_id for real downloads
  container: string;   // mp4, webm, mp3, flac, m4a, opus, ogg, wav
  label: string;       // "4K (2160p)"
  quality: string;     // "2160p" | "320kbps" | "Lossless"
  kind: MediaKind;     // video | audio
  size: number;        // estimated bytes
  badge?: string;      // "HDR" | "Atmos" | "Hi-Res"
  recommended?: boolean;
};

export type PlatformInfo = {
  id: string;
  name: string;          // YouTube
  nameFa: string;        // یوتیوب
  kind: MediaKind;       // dominant media type
  color: string;         // brand color hex
  glyph: string;         // single letter or symbol for logo
  homepage: string;
  patterns: RegExp[];    // detection patterns
  supportsVideo: boolean;
  supportsAudio: boolean;
  maxVideoQuality: string;
  maxAudioQuality: string;
};

export type MediaInfo = {
  url: string;
  platform: PlatformInfo;
  title: string;
  author: string;
  thumbnail: string;
  durationSec: number;
  views?: string;
  options: QualityOption[];
};

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "youtube",
    name: "YouTube",
    nameFa: "یوتیوب",
    kind: "audio",
    color: "#FF0000",
    glyph: "▶",
    homepage: "https://youtube.com",
    patterns: [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)[\w-]+/i,
    ],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "Opus 160kbps",
  },
  {
    id: "youtube-music",
    name: "YouTube Music",
    nameFa: "یوتیوب موزیک",
    kind: "audio",
    color: "#FF0000",
    glyph: "♫",
    homepage: "https://music.youtube.com",
    patterns: [/music\.youtube\.com\/watch\?v=[\w-]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "Opus 256kbps",
  },
  {
    id: "spotify",
    name: "Spotify",
    nameFa: "اسپاتیفای",
    kind: "audio",
    color: "#1DB954",
    glyph: "♫",
    homepage: "https://spotify.com",
    patterns: [/open\.spotify\.com\/(track|album|playlist|episode|show)\/[\w]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "FLAC Lossless",
  },
  {
    id: "deezer",
    name: "Deezer",
    nameFa: "دیزِر",
    kind: "audio",
    color: "#A238FF",
    glyph: "♪",
    homepage: "https://deezer.com",
    patterns: [/deezer\.com\/(track|album|playlist)\/\d+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "FLAC Hi-Res",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    nameFa: "ساندکلاود",
    kind: "audio",
    color: "#FF5500",
    glyph: "≈",
    homepage: "https://soundcloud.com",
    patterns: [/soundcloud\.com\/[\w-]+\/[\w-]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "Opus 320kbps",
  },
  {
    id: "tidal",
    name: "Tidal",
    nameFa: "تایدل",
    kind: "audio",
    color: "#000000",
    glyph: "T",
    homepage: "https://tidal.com",
    patterns: [/tidal\.com\/(track|album|playlist)\/\d+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "FLAC MQA",
  },
  {
    id: "apple-music",
    name: "Apple Music",
    nameFa: "اپل موزیک",
    kind: "audio",
    color: "#FA243C",
    glyph: "",
    homepage: "https://music.apple.com",
    patterns: [/music\.apple\.com\/[\w-]+\/(album|playlist|song)\/[\w-]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "ALAC Lossless",
  },
  {
    id: "bandcamp",
    name: "Bandcamp",
    nameFa: "بندکمپ",
    kind: "audio",
    color: "#629AA9",
    glyph: "b",
    homepage: "https://bandcamp.com",
    patterns: [/[\w-]+\.bandcamp\.com\/(track|album)\/[\w-]+/i, /bandcamp\.com\/(track|album)\/[\w-]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "FLAC Lossless",
  },
  {
    id: "pandora",
    name: "Pandora",
    nameFa: "پاندورا",
    kind: "audio",
    color: "#3668FF",
    glyph: "P",
    homepage: "https://pandora.com",
    patterns: [/pandora\.com\/(track|album|playlist)\/[\w-]+/i],
    supportsVideo: false,
    supportsAudio: true,
    maxVideoQuality: "—",
    maxAudioQuality: "AAC 192kbps",
  },
];

export function detectPlatform(rawUrl: string): PlatformInfo | null {
  const url = rawUrl.trim();
  if (!url) return null;
  for (const p of PLATFORMS) {
    for (const re of p.patterns) {
      if (re.test(url)) return p;
    }
  }
  return null;
}

/**
 * Detect the dominant media kind for a URL.
 * SoundRush is audio-only — always returns "audio".
 */
export function detectMediaKind(platform: PlatformInfo): MediaKind {
  return "audio";
}

export function isValidUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------- Mock metadata generator ----------
// In production this would call yt-dlp / spotDL / deemix etc.
// For this sandbox demo we deterministically synthesize realistic metadata
// from the URL so the UX feels alive without external network calls.

const SAMPLE_TITLES = [
  "Midnight City Lights — Official Music Video",
  "آخرین قطعهٔ شب (Live at Studio 7)",
  "Lofi Beats to Study / Relax to",
  "Symphony No. 9 in D minor, Op. 125",
  "Undefined — Extended Mix",
  "Voragine — Live Session",
  "Echoes from the North",
  "Roadtrip Tape Vol. 3",
  "Neon Rain — Slowed + Reverb",
  "Concerto for Strings in G major",
];

const SAMPLE_AUTHORS = [
  "Aurora Sound",
  "Mahsa Razavi",
  "Kael Norström",
  "The Polaris Collective",
  "Yuki Tanaka",
  "SynthWavez",
  "Reza Mehrabi",
  "Halcyon Records",
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function makeThumbnail(platform: string, seed: number): string {
  // Inline SVG data URL — no external network needed.
  const palettes: Record<string, [string, string]> = {
    youtube: ["#FF0000", "#1a0000"],
    "youtube-music": ["#FF0000", "#280014"],
    spotify: ["#1DB954", "#0a3d22"],
    deezer: ["#A238FF", "#1a0033"],
    soundcloud: ["#FF5500", "#330f00"],
    tidal: ["#000000", "#1a1a1a"],
    "apple-music": ["#FA243C", "#2b050a"],
    instagram: ["#E1306C", "#2a0612"],
    tiktok: ["#111111", "#000000"],
    vimeo: ["#1AB7EA", "#06222b"],
  };
  const [c1, c2] = palettes[platform] ?? ["#444", "#111"];
  const label = platform.toUpperCase().slice(0, 6);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
  <defs>
    <linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="480" height="270" fill="url(#g${seed})"/>
  <circle cx="${80 + (seed % 6) * 60}" cy="${80 + (seed % 4) * 30}" r="46" fill="rgba(255,255,255,0.18)"/>
  <circle cx="${380 - (seed % 5) * 40}" cy="${190 - (seed % 3) * 30}" r="32" fill="rgba(255,255,255,0.12)"/>
  <text x="24" y="240" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="rgba(255,255,255,0.92)">${label}</text>
  <text x="24" y="48" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.7)">${seed.toString(16).padStart(8, "0")}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function generateMockInfo(rawUrl: string, platform: PlatformInfo): MediaInfo {
  const seed = hashString(rawUrl);
  const title = pick(SAMPLE_TITLES, seed);
  const author = pick(SAMPLE_AUTHORS, seed >> 3);
  const durationSec = 180 + (seed % 600); // 3 – 13 minutes
  const thumbnail = makeThumbnail(platform.id, seed);

  const options: QualityOption[] = [];

  if (platform.supportsVideo) {
    const videoTiers: Array<[string, string, number, string?]> = [
      ["4320", "mp4", 1_200_000_000, "8K"],
      ["2160", "mp4", 480_000_000, "4K"],
      ["1440", "mp4", 240_000_000, "2K"],
      ["1080", "mp4", 120_000_000, "Full HD"],
      ["720", "mp4", 60_000_000, "HD"],
      ["480", "mp4", 28_000_000, "SD"],
      ["360", "mp4", 14_000_000, "Low"],
    ];
    for (const [res, ext, base, label] of videoTiers) {
      if (platform.id === "instagram" && res === "4320") continue;
      if (platform.id === "instagram" && res === "2160") continue;
      if (platform.id === "instagram" && res === "1440") continue;
      if (platform.id === "tiktok" && res === "4320") continue;
      const sizeFactor = 0.6 + ((seed % 80) / 100);
      options.push({
        id: `${ext}-${res}`,
        container: ext,
        label: `${label} (${res}p)`,
        quality: `${res}p`,
        kind: "video",
        size: Math.floor(base * sizeFactor * (durationSec / 240)),
        badge: res === "4320" ? "8K" : res === "2160" ? "4K HDR" : undefined,
        recommended: res === "1080",
      });
    }
  }

  if (platform.supportsAudio) {
    const audioTiers: Array<[string, string, string, number, string?, boolean?]> = [
      ["flac", "flac", "FLAC Lossless", 38_000_000, "Hi-Res", true],
      ["wav-2496", "wav", "WAV 24bit/96kHz", 92_000_000, "Studio"],
      ["alac", "m4a", "ALAC Lossless", 32_000_000, "Apple Lossless"],
      ["mp3-320", "mp3", "MP3 320 kbps", 11_000_000, undefined, true],
      ["mp3-128", "mp3", "MP3 128 kbps", 4_400_000],
      ["opus-256", "opus", "Opus 256 kbps", 8_600_000],
      ["ogg-192", "ogg", "Ogg Vorbis 192 kbps", 6_400_000],
      ["m4a-256", "m4a", "AAC 256 kbps", 8_800_000],
    ];
    for (const [id, ext, label, base, badge, recommended] of audioTiers) {
      // Some platforms don't actually serve FLAC
      if (platform.id === "soundcloud" && (id === "flac" || id === "wav-2496" || id === "alac")) continue;
      if (platform.id === "youtube" && (id === "flac" || id === "wav-2496" || id === "alac")) continue;
      if (platform.id === "youtube-music" && (id === "wav-2496")) continue;
      if (platform.id === "tiktok" && (id === "flac" || id === "wav-2496" || id === "alac")) continue;
      if (platform.id === "instagram" && (id === "flac" || id === "wav-2496" || id === "alac")) continue;
      const sizeFactor = 0.7 + ((seed % 60) / 100);
      options.push({
        id,
        container: ext,
        label,
        quality: label,
        kind: "audio",
        size: Math.floor(base * sizeFactor * (durationSec / 240)),
        badge,
        recommended,
      });
    }
  }

  // Sort: video first (high → low), then audio (high → low)
  options.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "video" ? -1 : 1;
    return b.size - a.size;
  });

  const views = platform.kind === "video"
    ? `${(1 + (seed % 99))}.${(seed % 9)}M views`
    : `${(1 + (seed % 49))}.${(seed % 9)}M plays`;

  return {
    url: rawUrl.trim(),
    platform,
    title,
    author,
    thumbnail,
    durationSec,
    views,
    options,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
