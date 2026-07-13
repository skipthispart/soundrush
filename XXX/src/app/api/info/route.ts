import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { rateLimit, getClientIp, isSafeUrl } from "@/lib/security";

const execFileAsync = promisify(execFile);
const HELPER_SCRIPT = path.join(process.cwd(), "scripts", "ytdlp_helper.py");
const HOME = process.env.HOME || "/root";
const YT_DLP = path.join(HOME, ".venv", "bin", "yt-dlp");
const VENV_BIN = path.join(HOME, ".venv", "bin");

export const runtime = "nodejs";

async function ensureYtDlp() {
  if (fs.existsSync(YT_DLP)) return true;
  // Try multiple pip paths — venv pip first (most reliable), then system pip
  const pipCandidates = [path.join(VENV_BIN, "pip3"), path.join(VENV_BIN, "pip"), "pip3", "pip"];
  for (const pip of pipCandidates) {
    try {
      await execFileAsync(pip, ["install", "yt-dlp"], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      if (fs.existsSync(YT_DLP)) return true;
    } catch {}
  }
  return false;
}

// Get track/playlist info from Spotify by scraping the page
async function getSpotifyMeta(url: string): Promise<{ title: string; desc: string; image: string } | null> {
  try {
    const { stdout } = await execFileAsync("curl", ["-sL", url], { timeout: 10000 });
    const ogTitle = stdout.match(/property="og:title" content="(.*?)"/);
    const ogDesc = stdout.match(/property="og:description" content="(.*?)"/);
    const ogImage = stdout.match(/property="og:image" content="(.*?)"/);
    if (ogTitle) return { title: ogTitle[1], desc: ogDesc?.[1] || "", image: ogImage?.[1] || "" };
    return null;
  } catch { return null; }
}

// Get track IDs from a Spotify playlist page
async function getSpotifyPlaylistTracks(playlistUrl: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("curl", ["-sL", playlistUrl], { timeout: 15000 });
    const trackIds = stdout.match(/\/track\/([a-zA-Z0-9]+)/g) || [];
    // Dedupe
    const unique = [...new Set(trackIds.map(t => t.replace("/track/", "")))];
    return unique;
  } catch { return []; }
}

// Get track name + artist from Spotify track page
async function getSpotifyTrackInfo(trackUrl: string): Promise<{ title: string; artist: string } | null> {
  const meta = await getSpotifyMeta(trackUrl);
  if (!meta) return null;
  // Clean up title — remove "(with X)" / "(feat. X)" for better YouTube search
  let title = meta.title.replace(/\s*\(with\s+[^)]+\)/gi, "").replace(/\s*\(feat\.?\s+[^)]+\)/gi, "").trim();
  // Clean up artist — take only the first artist
  let artist = meta.desc.split("·")[0]?.trim() || "";
  // Remove "&amp;" HTML entities
  title = title.replace(/&amp;/g, "&");
  artist = artist.replace(/&amp;/g, "&");
  return { title, artist };
}

// Search YouTube for a track — scrape HTML results
async function searchYouTube(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const { stdout } = await execFileAsync("curl", ["-sL", searchUrl], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
    const videoIds = stdout.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
    if (videoIds && videoIds.length > 0) {
      const firstId = videoIds[0].match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
      if (firstId) return `https://www.youtube.com/watch?v=${firstId}`;
    }
    return null;
  } catch { return null; }
}

// Check if a YouTube URL actually works (no bot block)
async function testYouTubeUrl(url: string): Promise<boolean> {
  try {
    const { stderr } = await execFileAsync(YT_DLP, [
      "--dump-json", "--no-warnings", "--no-playlist", "--no-check-certificate",
      "--simulate", url,
    ], { timeout: 15000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: `${VENV_BIN}:${process.env.PATH || ""}` } });
    return !stderr.includes("bot");
  } catch { return false; }
}

// Search SoundCloud for a track as fallback
async function searchSoundCloud(query: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(YT_DLP, [
      "--dump-json", "--no-warnings", "--no-playlist", "--no-check-certificate",
      `scsearch1:${query}`,
    ], { timeout: 20000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PATH: `${VENV_BIN}:${process.env.PATH || ""}` } });
    const data = JSON.parse(stdout);
    return data.webpage_url || null;
  } catch { return null; }
}

// Search for a track across multiple platforms
async function searchForTrack(title: string, artist: string): Promise<{ url: string; source: string } | null> {
  const query = `${title} ${artist}`.trim();
  
  // Try YouTube first
  const ytUrl = await searchYouTube(query);
  if (ytUrl) {
    const works = await testYouTubeUrl(ytUrl);
    if (works) return { url: ytUrl, source: "youtube" };
  }
  
  // Fallback to SoundCloud
  const scUrl = await searchSoundCloud(query);
  if (scUrl) return { url: scUrl, source: "soundcloud" };
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // --- Rate limiting: 10 info requests per minute per IP ---
    const ip = getClientIp(req);
    const limit = rateLimit(`info:${ip}`, 10, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    // --- Body size limit (prevent huge payloads) ---
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 10_000) {
      return NextResponse.json(
        { ok: false, error: "Request too large." },
        { status: 413 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const url: string = (body?.url ?? "").toString().trim().slice(0, 2000);

    if (!url) {
      return NextResponse.json({ ok: false, error: "URL is empty." }, { status: 400 });
    }

    // --- SSRF protection: block internal/private IPs ---
    if (!isSafeUrl(url)) {
      return NextResponse.json(
        { ok: false, error: "URL not allowed for security reasons." },
        { status: 403 },
      );
    }

    // Validate URL
    let finalUrl = url;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");

      const knownPlatforms = [
        "youtube.com", "youtu.be", "music.youtube.com",
        "soundcloud.com", "vimeo.com", "tiktok.com",
        "instagram.com", "twitter.com", "x.com",
        "facebook.com", "reddit.com", "twitch.tv",
        "bilibili.com", "dailymotion.com", "bandcamp.com",
        "deezer.com", "tidal.com", "music.apple.com",
        "pandora.com", "pinterest.com", "linkedin.com",
        "share.google",
      ];
      const isKnown = knownPlatforms.some(p => u.hostname.includes(p));
      if (!isKnown) {
        const { stdout: curlOut } = await execFileAsync("curl", ["-sL", "-o", "/dev/null", "-w", "%{url_effective}", url], { timeout: 10000 });
        if (curlOut && curlOut.trim() && curlOut.trim() !== url) finalUrl = curlOut.trim();
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL." }, { status: 400 });
    }

    const ytDlpReady = await ensureYtDlp();
    if (!ytDlpReady) {
      return NextResponse.json({ ok: false, error: "yt-dlp not available." }, { status: 500 });
    }

    // Handle SoundCloud popular tracks / profile pages — treat like a playlist
    if (finalUrl.includes("soundcloud.com") && (finalUrl.includes("/popular-tracks") || finalUrl.includes("/tracks") || finalUrl.includes("/sets"))) {
      try {
        const { stdout } = await execFileAsync("curl", ["-sL", finalUrl], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
        // Extract track URLs from the page
        const trackMatches = stdout.match(/href="\/([\w-]+\/[\w-]+)"/g) || [];
        const seen = new Set<string>();
        const trackUrls: string[] = [];
        for (const m of trackMatches) {
          const path = m.match(/href="\/([\w-]+\/[\w-]+)"/)?.[1];
          if (path && !path.includes("/sets/") && !path.includes("/popular-tracks") && !path.includes("/tracks") && !seen.has(path)) {
            seen.add(path);
            trackUrls.push(`https://soundcloud.com/${path}`);
          }
        }

        if (trackUrls.length > 0) {
          // Get title for each track via yt-dlp (just the title, fast)
          const tracks = [];
          const limit = Math.min(trackUrls.length, 20);
          for (let i = 0; i < limit; i++) {
            // Just use the URL path as title — no yt-dlp call (too slow for 20 tracks)
            const pathParts = trackUrls[i].replace("https://soundcloud.com/", "").split("/");
            const titleFromUrl = pathParts[1]?.replace(/-/g, " ") || "Unknown";
            const artistFromUrl = pathParts[0]?.replace(/-/g, " ") || "Unknown";
            tracks.push({
              index: i + 1,
              title: titleFromUrl,
              artist: artistFromUrl,
              spotifyTrackId: "",
              spotifyTrackUrl: trackUrls[i],
            });
          }

          if (tracks.length > 0) {
            // Get page title
            const ogTitle = stdout.match(/property="og:title" content="([^"]*)"/);
            const pageName = ogTitle?.[1] || "SoundCloud Tracks";

            return NextResponse.json({
              ok: true,
              playlist: {
                name: pageName,
                cover: "",
                trackCount: tracks.length,
                tracks,
              },
            });
          }
        }
      } catch {}
    }

    // Handle Spotify
    if (finalUrl.includes("spotify.com")) {
      const isPlaylist = finalUrl.includes("/playlist/");
      const isTrack = finalUrl.includes("/track/");

      if (isPlaylist) {
        // Get playlist name + track IDs
        const playlistMeta = await getSpotifyMeta(finalUrl);
        const playlistName = playlistMeta?.title || "Spotify Playlist";
        const trackIds = await getSpotifyPlaylistTracks(finalUrl);

        if (trackIds.length === 0) {
          return NextResponse.json({ ok: false, error: "Couldn't read playlist tracks." }, { status: 422 });
        }

        // Get info for each track (limit to first 30 to avoid timeout)
        const tracks = [];
        const limit = Math.min(trackIds.length, 30);
        for (let i = 0; i < limit; i++) {
          const trackUrl = `https://open.spotify.com/track/${trackIds[i]}`;
          const info = await getSpotifyTrackInfo(trackUrl);
          if (info) {
            tracks.push({
              index: i + 1,
              title: info.title,
              artist: info.artist,
              spotifyTrackId: trackIds[i],
              spotifyTrackUrl: trackUrl,
            });
          }
        }

        return NextResponse.json({
          ok: true,
          playlist: {
            name: playlistName,
            cover: playlistMeta?.image || "",
            trackCount: tracks.length,
            tracks,
          },
        });
      }

      if (isTrack) {
        // Single track — search across YouTube + SoundCloud
        const trackInfo = await getSpotifyTrackInfo(finalUrl);
        if (trackInfo) {
          const result = await searchForTrack(trackInfo.title, trackInfo.artist);
          if (result) {
            finalUrl = result.url;
          } else {
            return NextResponse.json({ ok: false, error: `Couldn't find "${trackInfo.title}" on YouTube or SoundCloud.` }, { status: 422 });
          }
        } else {
          return NextResponse.json({ ok: false, error: "Could not read Spotify track info." }, { status: 422 });
        }
      }
    }

    // Call yt-dlp helper with final URL
    async function callHelper(u: string): Promise<{ ok: boolean; info?: any; error?: string }> {
      try {
        const { stdout } = await execFileAsync("python3", [HELPER_SCRIPT, "info", u], {
          timeout: 90000, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PATH: `${VENV_BIN}:${process.env.PATH || ""}` },
        });
        return JSON.parse(stdout);
      } catch (err: any) {
        const msg = err?.stderr || err?.message || "yt-dlp execution failed";
        return { ok: false, error: typeof msg === "string" ? msg.slice(0, 300) : "Extraction failed" };
      }
    }

    async function tryUpdateYtDlp(): Promise<void> {
      // Try to update yt-dlp — sometimes newer versions fix bot detection
      const pipCandidates = [path.join(VENV_BIN, "pip3"), path.join(VENV_BIN, "pip"), "pip3"];
      for (const pip of pipCandidates) {
        try {
          await execFileAsync(pip, ["install", "--upgrade", "yt-dlp"], { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
          return;
        } catch {}
      }
    }

    let result = await callHelper(finalUrl);

    // If first attempt failed, try updating yt-dlp and retry once
    if (!result.ok) {
      await tryUpdateYtDlp();
      result = await callHelper(finalUrl);
    }

    // If YouTube URL failed (bot detection etc), try fallback to SoundCloud search
    // by extracting the video title via oEmbed (works without auth)
    if (!result.ok && (finalUrl.includes("youtube.com") || finalUrl.includes("youtu.be"))) {
      try {
        // Extract video ID from multiple URL formats: watch?v=, youtu.be/, /shorts/, /embed/
        const vMatch = finalUrl.match(/[?&]v=([\w-]{11})/)
          || finalUrl.match(/youtu\.be\/([\w-]{11})/)
          || finalUrl.match(/\/shorts\/([\w-]{11})/)
          || finalUrl.match(/\/embed\/([\w-]{11})/);
        if (vMatch) {
          const videoId = vMatch[1];
          // Use YouTube oEmbed to get the title (no auth needed, very reliable)
          const { stdout: oembedOut } = await execFileAsync("curl", ["-sL", `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`], { timeout: 8000 });
          const oembed = JSON.parse(oembedOut);
          const title = oembed.title;
          const author = oembed.author_name;
          const thumb = oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          // Search SoundCloud for the title + author
          const scUrl = await searchSoundCloud(`${title} ${author}`);
          if (scUrl) {
            // Try extracting info from SoundCloud URL
            const scResult = await callHelper(scUrl);
            if (scResult.ok) {
              // Override title/author with the YouTube ones so user sees what they requested
              scResult.info.title = title;
              scResult.info.author = author;
              scResult.info.thumbnail = thumb;
              scResult.info.platformId = "youtube"; // user-facing platform stays as YouTube
              return NextResponse.json({ ok: true, info: scResult.info });
            }
          }
          // Even if SoundCloud failed, return the basic metadata we got from oEmbed
          // so the user sees the video info (download will still fail but at least UX is graceful)
        }
      } catch {}
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Failed to extract media info." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, info: result.info });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error." }, { status: 500 });
  }
}
