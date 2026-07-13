#!/usr/bin/env python3
"""
SoundRush — yt-dlp helper script.
Called by the Next.js API to extract real media info and download files.

Usage:
  python3 ytdlp_helper.py info <url>
  python3 ytdlp_helper.py download <url> <format_id> <output_path>
"""

import json
import sys
import os
import subprocess
import re
import shutil
import urllib.request
import urllib.error

# Find yt-dlp executable — check common locations
YT_DLP = shutil.which("yt-dlp")
if not YT_DLP:
    for candidate in [
        os.path.join(os.path.expanduser("~"), ".venv", "bin", "yt-dlp"),
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        os.path.join(os.path.expanduser("~"), ".local", "bin", "yt-dlp"),
    ]:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            YT_DLP = candidate
            break

if not YT_DLP:
    print(json.dumps({"ok": False, "error": "yt-dlp not found. Install with: pip3 install yt-dlp"}))
    sys.exit(1)


def is_bot_error(stderr: str) -> bool:
    """Check if an error is bot detection related (worth retrying with another client)."""
    s = (stderr or "").lower()
    return "bot" in s or "sign in to confirm" in s or "captcha" in s


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from any URL format."""
    for pattern in [
        r"[?&]v=([\w-]{11})",
        r"youtu\.be/([\w-]{11})",
        r"/shorts/([\w-]{11})",
        r"/embed/([\w-]{11})",
    ]:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


def innertube_fetch(url: str) -> dict:
    """Fallback: fetch video info directly via YouTube's innertube API.

    Uses the ANDROID client which often bypasses bot detection that blocks
    the web client. Returns the same format as _build_info_response.
    """
    video_id = extract_video_id(url)
    if not video_id:
        return {"ok": False, "error": "Could not extract video ID for innertube fallback."}

    # Try multiple clients — ANDROID first (most reliable for bypassing bot detection),
    # then IOS, then WEB
    clients = [
        {"clientName": "ANDROID", "clientVersion": "20.10.38"},
        {"clientName": "IOS", "clientVersion": "20.10.38"},
        {"clientName": "WEB", "clientVersion": "2.20240101.00.00"},
    ]

    api_key = os.environ.get("YT_API_KEY", "")
    api_url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"

    last_error = ""
    for client in clients:
        try:
            payload = json.dumps({
                "context": {"client": {**client, "hl": "en", "gl": "US"}},
                "videoId": video_id,
            }).encode("utf-8")

            req = urllib.request.Request(
                api_url,
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            playability = data.get("playabilityStatus", {})
            if playability.get("status") != "OK":
                last_error = playability.get("reason", "Innertube API rejected the request")
                if "bot" in last_error.lower() or "sign in" in last_error.lower():
                    continue  # try next client
                return {"ok": False, "error": last_error}

            # Convert innertube response to our format
            return _build_info_from_innertube(data, video_id, url)

        except urllib.error.URLError as e:
            last_error = str(e)
            continue
        except Exception as e:
            last_error = str(e)
            continue

    return {"ok": False, "error": last_error or "Innertube API failed for all clients."}


def _build_info_from_innertube(data: dict, video_id: str, original_url: str) -> dict:
    """Convert YouTube innertube API response to our QualityOption structure."""
    vdetails = data.get("videoDetails", {})
    streaming = data.get("streamingData", {})

    title = vdetails.get("title", "Untitled")
    uploader = vdetails.get("author", "Unknown")
    duration = int(vdetails.get("lengthSeconds", 0))
    view_count = int(vdetails.get("viewCount", 0))
    thumbnails = vdetails.get("thumbnail", {}).get("thumbnails", [])
    thumbnail = thumbnails[-1].get("url", "") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    if view_count >= 1_000_000:
        views = f"{view_count / 1_000_000:.1f}M views"
    elif view_count >= 1_000:
        views = f"{view_count / 1_000:.1f}K views"
    else:
        views = f"{view_count} views"

    options = []
    seen = set()

    # SoundRush is audio-only — skip all video formats
    # --- Audio formats only (adaptive streams — audio only) ---
    audio_formats = [f for f in streaming.get("adaptiveFormats", []) if f.get("mimeType", "").startswith("audio/")]
    audio_formats.sort(key=lambda f: f.get("bitrate", 0), reverse=True)

    if audio_formats:
        best_audio = audio_formats[0]
        best_itag = str(best_audio.get("itag"))
        duration_est = duration or 240
        audio_options = [
            ("flac", "flac", "FLAC Lossless", "Lossless", "Hi-Res", True),
            ("mp3-320", "mp3", "MP3 320 kbps", "320kbps", None, True),
            ("mp3-128", "mp3", "MP3 128 kbps", "128kbps", None, True),
            ("opus-256", "opus", "Opus 256 kbps", "256kbps", None, True),
        ]
        for oid, ext, label, quality, badge, available in audio_options:
            if not available or oid in seen:
                continue
            seen.add(oid)
            if oid == "flac":
                est_size = int(duration_est * 1100 * 1024 / 8)
            elif oid == "mp3-320":
                est_size = int(duration_est * 320 * 1024 / 8)
            elif oid == "mp3-128":
                est_size = int(duration_est * 128 * 1024 / 8)
            elif oid == "opus-256":
                est_size = int(duration_est * 256 * 1024 / 8)
            else:
                est_size = 0
            options.append({
                "id": oid,
                "formatId": best_itag,
                "container": ext,
                "label": label,
                "quality": quality,
                "kind": "audio",
                "size": est_size,
                "badge": badge,
                "recommended": oid == "mp3-320",
            })

    # Sort: audio only (high to low)
    options.sort(key=lambda o: -o["size"])

    supports_video = False
    supports_audio = len([o for o in options if o["kind"] == "audio"]) > 0

    return {
        "ok": True,
        "info": {
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": title,
            "author": uploader,
            "thumbnail": thumbnail,
            "durationSec": duration,
            "views": views,
            "platformId": "youtube",
            "supportsVideo": supports_video,
            "supportsAudio": supports_audio,
            "options": options,
        }
    }


def get_info(url: str) -> dict:
    """Fetch real media metadata using yt-dlp.

    For YouTube URLs, tries multiple player clients to bypass bot detection.
    """
    is_youtube = "youtube.com" in url or "youtu.be" in url
    if is_youtube:
        # Order matters: default client first (most compatible), then alternatives
        # for bot-detection bypass. Some clients (tv) are broken for some videos.
        client_args_list = [
            [],  # default (no override) — works for most videos
            ["--extractor-args", "youtube:player_client=android"],
            ["--extractor-args", "youtube:player_client=ios"],
            ["--extractor-args", "youtube:player_client=web_safari"],
            ["--extractor-args", "youtube:player_client=tv"],
        ]
    else:
        client_args_list = [[]]

    last_error = "yt-dlp failed"
    for client_args in client_args_list:
        try:
            cmd = [
                YT_DLP,
                "--dump-json",
                "--no-warnings",
                "--no-playlist",
                "--no-check-certificate",
            ] + client_args + [url]
            result = subprocess.run(
                cmd,
                capture_output=True, text=True, timeout=60
            )
            if result.returncode != 0:
                last_error = result.stderr.strip() or "yt-dlp failed"
                # If this isn't a bot detection error, no point trying other clients
                if not is_bot_error(last_error):
                    return {"ok": False, "error": last_error}
                continue  # try next client

            # Success — parse the JSON output
            data = json.loads(result.stdout)
            return _build_info_response(data, url)

        except subprocess.TimeoutExpired:
            last_error = "Timed out fetching media info."
            continue
        except Exception as e:
            last_error = str(e)
            continue

    # All yt-dlp clients failed — try innertube API fallback (for YouTube URLs)
    if is_youtube:
        innertube_result = innertube_fetch(url)
        if innertube_result.get("ok"):
            return innertube_result
        # If innertube also failed, try oEmbed to at least return basic metadata
        # so the user sees what video was found (download will fail but UX is graceful)
        video_id = extract_video_id(url)
        if video_id:
            try:
                oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
                req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    oembed = json.loads(resp.read().decode("utf-8"))
                # Return basic metadata with a note that download is blocked
                return {
                    "ok": True,
                    "info": {
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                        "title": oembed.get("title", "Unknown"),
                        "author": oembed.get("author_name", "Unknown"),
                        "thumbnail": oembed.get("thumbnail_url", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                        "durationSec": 0,
                        "views": "",
                        "platformId": "youtube",
                        "supportsVideo": False,
                        "supportsAudio": True,
                        "options": [
                            {
                                "id": "mp3-320",
                                "formatId": "blocked",
                                "container": "mp3",
                                "label": "MP3 320 kbps (blocked by YouTube)",
                                "quality": "320kbps",
                                "kind": "audio",
                                "size": 0,
                                "badge": None,
                                "recommended": True,
                            },
                        ],
                        "blocked": True,
                    }
                }
            except Exception:
                pass
        # Final fallback error
        return {
            "ok": False,
            "error": "YouTube is blocking this video with bot detection on our server. Try a different video or try again later."
        }

    return {"ok": False, "error": last_error}


def _build_info_response(data: dict, url: str) -> dict:
    """Convert yt-dlp's dump-json output to our QualityOption structure."""
    title = data.get("title", "Untitled")
    uploader = data.get("uploader") or data.get("channel") or "Unknown"
    duration = data.get("duration") or 0
    thumbnail = data.get("thumbnail", "")
    view_count = data.get("view_count")
    webpage_url = data.get("webpage_url", url)
    extractor = data.get("extractor_key", "Unknown")

    # Build view count string
    views = ""
    if view_count:
        if view_count >= 1_000_000:
            views = f"{view_count / 1_000_000:.1f}M views"
        elif view_count >= 1_000:
            views = f"{view_count / 1_000:.1f}K views"
        else:
            views = f"{view_count} views"

    # Parse formats into our QualityOption structure
    # SoundRush is audio-only — skip all video formats
    formats = data.get("formats", [])
    options = []
    seen = set()

    # --- Audio formats only ---
    audio_formats = []
    for f in formats:
        if f.get("vcodec") == "none" and f.get("acodec") != "none":
            audio_formats.append(f)

    audio_formats.sort(key=lambda f: f.get("abr") or 0, reverse=True)

    if audio_formats:
        best_audio = audio_formats[0]
        best_fid = best_audio.get("format_id")
        best_size = best_audio.get("filesize") or best_audio.get("filesize_approx") or 0
        duration_est = duration or 240

        audio_options = [
            ("flac", "flac", "FLAC Lossless", "Lossless", "Hi-Res", best_size > 0),
            ("mp3-320", "mp3", "MP3 320 kbps", "320kbps", None, True),
            ("mp3-128", "mp3", "MP3 128 kbps", "128kbps", None, True),
            ("opus-256", "opus", "Opus 256 kbps", "256kbps", None, True),
        ]

        for oid, ext, label, quality, badge, available in audio_options:
            if not available:
                continue
            if oid not in seen:
                seen.add(oid)
                if oid == "flac":
                    est_size = int(duration_est * 1100 * 1024 / 8)
                elif oid == "mp3-320":
                    est_size = int(duration_est * 320 * 1024 / 8)
                elif oid == "mp3-128":
                    est_size = int(duration_est * 128 * 1024 / 8)
                elif oid == "opus-256":
                    est_size = int(duration_est * 256 * 1024 / 8)
                else:
                    est_size = best_size
                options.append({
                    "id": oid,
                    "formatId": best_fid,
                    "container": ext,
                    "label": label,
                    "quality": quality,
                    "kind": "audio",
                    "size": est_size,
                    "badge": badge,
                    "recommended": oid == "mp3-320",
                })

    # Sort: audio only (high to low)
    options.sort(key=lambda o: -o["size"])

    # Determine platform
    platform_id = "youtube"
    if "youtube" in extractor.lower():
        if "music" in url.lower():
            platform_id = "youtube-music"
        else:
            platform_id = "youtube"
    elif "spotify" in extractor.lower():
        platform_id = "spotify"
    elif extractor.lower() == "soundcloud":
        platform_id = "soundcloud"
    elif extractor.lower() == "bandcamp":
        platform_id = "bandcamp"

    # SoundRush is audio-only
    supports_video = False
    supports_audio = len([o for o in options if o["kind"] == "audio"]) > 0

    return {
        "ok": True,
        "info": {
            "url": webpage_url,
            "title": title,
            "author": uploader,
            "thumbnail": thumbnail,
            "durationSec": duration,
            "views": views,
            "platformId": platform_id,
            "supportsVideo": supports_video,
            "supportsAudio": supports_audio,
            "options": options,
        }
    }


def download(url: str, format_id: str, output_path: str) -> dict:
    """Download media using yt-dlp.

    For YouTube URLs, tries multiple player clients to bypass bot detection.
    """
    is_youtube = "youtube.com" in url or "youtu.be" in url
    if is_youtube:
        client_args_list = [
            [],
            ["--extractor-args", "youtube:player_client=android"],
            ["--extractor-args", "youtube:player_client=ios"],
            ["--extractor-args", "youtube:player_client=web_safari"],
            ["--extractor-args", "youtube:player_client=tv"],
        ]
    else:
        client_args_list = [[]]

    last_error = "Download failed"
    for client_args in client_args_list:
        try:
            # Build yt-dlp command with aggressive speed optimizations
            cmd = [
                YT_DLP,
                "--no-playlist",
                "--no-warnings",
                "--quiet",
                "--no-progress",
                "--no-check-certificate",
                "--retries", "1",
                "--fragment-retries", "1",
                "--concurrent-fragments", "4",
                "--buffer-size", "16K",
                "--extractor-args", "youtube:player_skip=configs",
                "--hls-prefer-native",
                "--hls-use-mpegts",
            ] + client_args

            # SoundRush is audio-only — always extract audio
            # All format_ids are audio formats (flac, mp3-320, mp3-128, opus-256)
            audio_fmt = format_id.split("-")[0] if "-" in format_id else format_id
            if audio_fmt == "opus":
                cmd.extend(["-f", "bestaudio[ext=m4a]/bestaudio"])
                ext = "m4a"
            else:
                cmd.extend(["-x", "--audio-format", audio_fmt])
                if format_id == "mp3-320":
                    cmd.extend(["--audio-quality", "0"])
                elif format_id == "mp3-128":
                    cmd.extend(["--audio-quality", "8"])
                cmd.extend(["--postprocessor-args", "-threads 8"])
                cmd.extend(["-f", "bestaudio"])
                ext = audio_fmt

            cmd.extend(["-o", output_path])
            cmd.append(url)

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                last_error = result.stderr.strip() or "Download failed"
                if not is_bot_error(last_error):
                    return {"ok": False, "error": last_error}
                continue  # try next client

            # Find the actual output file (audio formats only)
            actual_path = output_path
            if not os.path.exists(actual_path):
                base = os.path.splitext(output_path)[0]
                for candidate_ext in ["mp3", "flac", "opus", "webm", "m4a", "ogg"]:
                    candidate = f"{base}.{candidate_ext}"
                    if os.path.exists(candidate):
                        actual_path = candidate
                        break

            if not os.path.exists(actual_path):
                return {"ok": False, "error": "Output file not found after download"}

            return {
                "ok": True,
                "filePath": actual_path,
                "fileSize": os.path.getsize(actual_path),
            }
        except subprocess.TimeoutExpired:
            last_error = "Download timed out (5 min limit)"
            continue
        except Exception as e:
            last_error = str(e)
            continue

    # All yt-dlp clients failed — try innertube API fallback (for YouTube URLs)
    if is_youtube:
        return innertube_download(url, format_id, output_path)

    return {"ok": False, "error": last_error}


def innertube_download(url: str, format_id: str, output_path: str) -> dict:
    """Fallback: download using direct stream URLs from innertube API.

    Gets the streaming URLs via innertube, then downloads + converts with ffmpeg.
    """
    info_result = innertube_fetch(url)
    if not info_result.get("ok"):
        return {"ok": False, "error": info_result.get("error", "Innertube fetch failed for download.")}

    video_id = extract_video_id(url)
    if not video_id:
        return {"ok": False, "error": "Could not extract video ID for download."}

    # Re-fetch raw innertube data to get stream URLs
    api_key = os.environ.get("YT_API_KEY", "")
    api_url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"

    clients = [
        {"clientName": "ANDROID", "clientVersion": "20.10.38"},
        {"clientName": "IOS", "clientVersion": "20.10.38"},
        {"clientName": "WEB", "clientVersion": "2.20240101.00.00"},
    ]

    raw_data = None
    for client in clients:
        try:
            payload = json.dumps({
                "context": {"client": {**client, "hl": "en", "gl": "US"}},
                "videoId": video_id,
            }).encode("utf-8")
            req = urllib.request.Request(api_url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data.get("playabilityStatus", {}).get("status") == "OK":
                raw_data = data
                break
        except Exception:
            continue

    if not raw_data:
        return {"ok": False, "error": "Innertube API failed — cannot get download URLs."}

    streaming = raw_data.get("streamingData", {})
    all_formats = streaming.get("formats", []) + streaming.get("adaptiveFormats", [])

    # Pick the right stream URL based on format_id
    stream_url = None
    # SoundRush is audio-only — always find the best audio stream
    audio_streams = [f for f in all_formats if f.get("mimeType", "").startswith("audio/")]
    audio_streams.sort(key=lambda f: f.get("bitrate", 0), reverse=True)
    if audio_streams:
        stream_url = audio_streams[0].get("url")

    if not stream_url:
        return {"ok": False, "error": f"Could not find audio stream URL for format: {format_id}"}

    # Download the stream with curl (fast, no bot detection)
    try:
        temp_path = output_path + ".raw"
        dl_result = subprocess.run(
            ["curl", "-sL", "--max-time", "280", "-o", temp_path, stream_url],
            capture_output=True, text=True, timeout=290
        )
        if dl_result.returncode != 0 or not os.path.exists(temp_path):
            return {"ok": False, "error": f"Stream download failed: {dl_result.stderr[:200]}"}

        # Convert audio with ffmpeg (SoundRush is audio-only)
        audio_fmt = format_id.split("-")[0] if "-" in format_id else format_id
        if audio_fmt == "opus":
            final_path = output_path + ".m4a"
            ff_result = subprocess.run(
                ["ffmpeg", "-y", "-i", temp_path, "-c:a", "copy", final_path],
                capture_output=True, text=True, timeout=120
            )
        else:
            final_path = f"{output_path}.{audio_fmt}"
            ff_args = ["ffmpeg", "-y", "-i", temp_path, "-threads", "8"]
            if audio_fmt == "mp3":
                bitrate = "320k" if format_id == "mp3-320" else "128k"
                ff_args.extend(["-codec:a", "libmp3lame", "-b:a", bitrate])
            elif audio_fmt == "flac":
                ff_args.extend(["-codec:a", "flac"])
            ff_args.append(final_path)
            ff_result = subprocess.run(ff_args, capture_output=True, text=True, timeout=120)

        os.remove(temp_path)
        if ff_result.returncode != 0 or not os.path.exists(final_path):
            return {"ok": False, "error": f"ffmpeg conversion failed: {ff_result.stderr[:200]}"}
        return {"ok": True, "filePath": final_path, "fileSize": os.path.getsize(final_path)}

    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Download timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: helper.py [info|download] <args...>"}))
        sys.exit(1)

    action = sys.argv[1]
    if action == "info":
        if len(sys.argv) < 3:
            print(json.dumps({"ok": False, "error": "URL required"}))
            sys.exit(1)
        print(json.dumps(get_info(sys.argv[2])))
    elif action == "download":
        if len(sys.argv) < 4:
            print(json.dumps({"ok": False, "error": "URL and format_id required"}))
            sys.exit(1)
        url = sys.argv[2]
        format_id = sys.argv[3]
        output_path = sys.argv[4] if len(sys.argv) > 4 else f"/tmp/soundrush_{os.getpid()}"
        print(json.dumps(download(url, format_id, output_path)))
    else:
        print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))
