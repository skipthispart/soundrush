"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2,
  Search,
  Download,
  Music,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Sun,
  Moon,
  Shield,
  UploadCloud,
  ChevronDown,
  Github,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { toast as sonnerToast } from "sonner";
import { useTheme } from "next-themes";

import {
  PLATFORMS,
  formatBytes,
  formatDuration,
  type MediaInfo,
  type QualityOption,
} from "@/lib/platforms";

type JobProgress = {
  downloadId: string;
  progress: number;
  speedMBps: number;
  phase: string;
  phaseLabel: string;
  doneBytes: number;
  totalBytes: number;
};

export default function Home() {
  const { toast } = useToast();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  const [url, setUrl] = React.useState("");
  const [info, setInfo] = React.useState<MediaInfo | null>(null);
  const [playlist, setPlaylist] = React.useState<{ name: string; cover: string; trackCount: number; tracks: Array<{ index: number; title: string; artist: string; spotifyTrackId: string; spotifyTrackUrl: string }> } | null>(null);
  const [loadingInfo, setLoadingInfo] = React.useState(false);
  const [selectedOption, setSelectedOption] = React.useState<string | null>(null);
  const [qualityOpen, setQualityOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [contentReady, setContentReady] = React.useState(true);
  const [loadingText, setLoadingText] = React.useState("");
  const loadingTextRef = React.useRef("");
  const [trackJobs, setTrackJobs] = React.useState<Record<number, "idle" | "downloading" | "done" | "failed">>({});
  const [downloadingAll, setDownloadingAll] = React.useState(false);
  const downloadingAllRef = React.useRef(false);
  const cancelAllRef = React.useRef(false);
  const [playlistQuality, setPlaylistQuality] = React.useState("mp3-320");
  const [playlistQualityOpen, setPlaylistQualityOpen] = React.useState(false);
  const dragDepth = React.useRef(0);

  // Simple typewriter for loading text
  React.useEffect(() => {
    const fullText = "Wait A Sec";
    if (isExtracting) {
      let i = 0;
      setLoadingText("");
      loadingTextRef.current = "";
      const interval = setInterval(() => {
        if (i < fullText.length) {
          const next = fullText.slice(0, i + 1);
          setLoadingText(next);
          loadingTextRef.current = next;
          i++;
        } else {
          clearInterval(interval);
        }
      }, 120);
      return () => clearInterval(interval);
    } else {
      // Simple fade out — just clear immediately, the AnimatePresence handles the fade
      loadingTextRef.current = "";
    }
  }, [isExtracting]);

  const [activeJob, setActiveJob] = React.useState<{
    downloadId: string;
    progress: JobProgress | null;
    status: "starting" | "running" | "done" | "failed" | "cancelled";
  } | null>(null);

  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    setMounted(true);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // --- Auto-fill URL from query string (for browser extension) ---
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get("url");
    if (queryUrl) {
      setUrl(queryUrl);
      // Auto-trigger extraction after a short delay
      setTimeout(() => {
        handleFetchInfoWithUrl(queryUrl);
      }, 500);
      // Clean the URL (remove ?url=... so refresh doesn't re-trigger)
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Drag and drop handlers ---
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    if (e.dataTransfer?.types?.includes("text/plain") || e.dataTransfer?.types?.includes("text/uri-list")) {
      setIsDragging(true);
    }
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    const dropped =
      e.dataTransfer?.getData("text/uri-list") ||
      e.dataTransfer?.getData("text/plain") ||
      "";
    const trimmed = dropped.trim();
    if (trimmed) {
      setUrl(trimmed);
      sonnerToast.info("Link dropped", { description: "Press Extract to continue." });
    }
  }

  async function handleFetchInfo() {
    if (!url.trim()) {
      toast({
        title: "URL is empty",
        description: "Paste a link from a supported platform.",
        variant: "destructive",
      });
      return;
    }
    await handleFetchInfoWithUrl(url.trim());
  }

  // Variant that accepts an explicit URL (used by extension auto-fill)
  async function handleFetchInfoWithUrl(explicitUrl: string) {
    if (!explicitUrl) return;
    // Sync the input field
    setUrl(explicitUrl);
    // Trigger slide-out animation
    setIsExtracting(true);
    setContentReady(false);
    setLoadingInfo(true);
    setInfo(null);
    setPlaylist(null);
    setSelectedOption(null);
    // Wait for slide-out to FULLY complete (all elements move together: 280ms duration)
    await new Promise((r) => setTimeout(r, 320));
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: explicitUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        setIsExtracting(false);
        setContentReady(true);
        setLoadingInfo(false);
        setUrl("");
        setInfo(null);
        setPlaylist(null);
        setSelectedOption(null);
        setQualityOpen(false);
        setActiveJob(null);
        toast({
          title: "Extraction failed",
          description: data.error?.slice(0, 200) || "Could not extract media info.",
          variant: "destructive",
        });
        return;
      }

      // Handle playlist response
      if (data.playlist) {
        // Fade out loading
        setIsExtracting(false);
        await new Promise((r) => setTimeout(r, 450));
        // NOW set content + mark ready — elements slide back to new position
        setPlaylist(data.playlist);
        setContentReady(true);
        setLoadingInfo(false);
        sonnerToast.success("Playlist loaded", {
          description: `${data.playlist.name} • ${data.playlist.trackCount} tracks`,
        });
        return;
      }
      // The real API returns a flat structure with platformId string.
      // Normalize it to match the MediaInfo type the UI expects.
      const rawInfo = data.info;
      const platformObj = PLATFORMS.find((p) => p.id === rawInfo.platformId) || {
        id: rawInfo.platformId || "unknown",
        name: rawInfo.platformId || "Unknown",
        nameFa: rawInfo.platformId || "Unknown",
        kind: rawInfo.supportsVideo ? "video" : "audio",
        color: "#666",
        glyph: "?",
        homepage: "",
        patterns: [],
        supportsVideo: rawInfo.supportsVideo ?? false,
        supportsAudio: rawInfo.supportsAudio ?? false,
        maxVideoQuality: "—",
        maxAudioQuality: "—",
      };
      const normalizedInfo: MediaInfo = {
        url: rawInfo.url,
        platform: platformObj,
        title: rawInfo.title,
        author: rawInfo.author,
        thumbnail: rawInfo.thumbnail,
        durationSec: rawInfo.durationSec,
        views: rawInfo.views,
        options: rawInfo.options,
      };
      // Fade out loading
      setIsExtracting(false);
      await new Promise((r) => setTimeout(r, 450));
      // NOW set content + mark ready — elements slide back to new position
      setInfo(normalizedInfo);
      setContentReady(true);
      setQualityOpen(true);
      // SoundRush is audio-only — pick the recommended audio option
      const recommended = normalizedInfo.options.find((o: QualityOption) => o.recommended);
      const firstAny = normalizedInfo.options[0];
      setSelectedOption(recommended?.id ?? firstAny?.id ?? null);
    } catch (err: any) {
      setIsExtracting(false);
      setContentReady(true);
      setLoadingInfo(false);
      setUrl("");
      setInfo(null);
      setSelectedOption(null);
      setQualityOpen(false);
      setActiveJob(null);
      toast({
        title: "Server connection error",
        description: err?.message ?? "—",
        variant: "destructive",
      });
    } finally {
      setLoadingInfo(false);
    }
  }

  async function handleDownload() {
    if (!info || !selectedOption) return;
    const selectedOpt = info.options.find((o) => o.id === selectedOption);
    setActiveJob({
      downloadId: "",
      progress: null,
      status: "starting",
    });
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: info.url,
          optionId: selectedOption,
          formatId: selectedOpt?.formatId || selectedOption,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast({
          title: "Failed to start download",
          description: data.error,
          variant: "destructive",
        });
        setActiveJob(null);
        return;
      }
      setActiveJob({
        downloadId: data.downloadId,
        progress: null,
        status: "starting",
      });
      // Start polling for progress
      startPolling(data.downloadId, info.url, selectedOption, selectedOpt?.formatId || selectedOption);
      sonnerToast.info("Download started", {
        description: "Track live progress below.",
      });
    } catch (err: any) {
      toast({
        title: "Error starting download",
        description: err?.message ?? "—",
        variant: "destructive",
      });
      setActiveJob(null);
    }
  }

  function handleCancel() {
    // Universal cancel — works for single download AND playlist
    // 1. Cancel single download job (if any)
    if (activeJob?.downloadId) {
      fetch(`/api/download/${activeJob.downloadId}/cancel`, { method: "POST" }).catch(() => {});
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setActiveJob(null);

    // 2. Cancel playlist download all (if running)
    cancelAllRef.current = true;
    downloadingAllRef.current = false;
    setDownloadingAll(false);
    setTrackJobs(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (updated[Number(key)] === "downloading") {
          updated[Number(key)] = "idle";
        }
      }
      return updated;
    });
  }

  function startPolling(downloadId: string, url: string, optionId: string, formatId: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    // Immediately set to running
    setActiveJob((prev) =>
      prev && prev.downloadId === downloadId
        ? {
            ...prev,
            status: "running",
            progress: {
              downloadId,
              progress: 0,
              speedMBps: 0,
              phase: "fetching",
              phaseLabel: "Downloading",
              doneBytes: 0,
              totalBytes: 0,
            },
          }
        : prev,
    );

    const params = new URLSearchParams({ url, optionId, formatId });

    // Poll every 400ms
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/${downloadId}/status?${params}`);
        const data = await res.json();

        if (!data.ok) return;

        const p: JobProgress = {
          downloadId,
          progress: data.progress,
          speedMBps: data.speedMBps,
          phase: data.phase,
          phaseLabel: data.phaseLabel,
          doneBytes: data.doneBytes,
          totalBytes: data.totalBytes,
        };

        if (data.phase === "done") {
          // Download complete — stop polling and trigger file download
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setActiveJob((prev) =>
            prev && prev.downloadId === downloadId
              ? { ...prev, status: "done", progress: { ...p, progress: 100 } }
              : prev,
          );
          sonnerToast.success("Download completed", {
            description: "Saving to your device...",
          });
          // Auto-download file
          const link = document.createElement("a");
          link.href = `/api/download/${downloadId}/file`;
          link.download = data.fileName || "";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else if (data.phase === "failed") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setActiveJob((prev) =>
            prev && prev.downloadId === downloadId
              ? { ...prev, status: "failed" }
              : prev,
          );
          sonnerToast.error("Download failed", {
            description: data.error || "Unknown error",
          });
        } else {
          // Still running
          setActiveJob((prev) =>
            prev && prev.downloadId === downloadId
              ? { ...prev, status: "running", progress: p }
              : prev,
          );
        }
      } catch {}
    }, 400);
  }

  function handleReset() {
    setActiveJob(null);
  }

  function handleClear() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    // Phase 1: trigger slide-out for title elements + exit animation for info card
    setIsClearing(true);
    // Phase 2: wait for slide-out to FULLY complete (all elements move together: 280ms)
    setTimeout(() => {
      setUrl("");
      setInfo(null);
      setPlaylist(null);
      setSelectedOption(null);
      setQualityOpen(false);
      setActiveJob(null);
      setTrackJobs({});
      setDownloadingAll(false);
      setContentReady(true);
      setIsClearing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 360);
  }

  // Download a single track — returns a promise that resolves when done or cancelled
  async function handleTrackDownload(trackIndex: number): Promise<"done" | "failed" | "cancelled"> {
    if (!playlist) return "failed";
    const track = playlist.tracks.find(t => t.index === trackIndex);
    if (!track) return "failed";

    // Don't start if cancelled
    if (cancelAllRef.current) return "cancelled";

    setTrackJobs(prev => ({ ...prev, [trackIndex]: "downloading" }));

    try {
      // If the track URL is already a direct media URL (SoundCloud), use it directly
      // If it's a Spotify track URL, the API will resolve it to YouTube/SoundCloud
      let mediaUrl = track.spotifyTrackUrl;
      let formatId = "bestaudio";

      // For Spotify tracks, call /api/info to resolve to a downloadable URL
      if (track.spotifyTrackUrl.includes("spotify.com")) {
        const searchRes = await fetch("/api/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: track.spotifyTrackUrl }),
        });
        const searchData = await searchRes.json();

        if (!searchData.ok) {
          setTrackJobs(prev => ({ ...prev, [trackIndex]: "failed" }));
          return "failed";
        }

        if (cancelAllRef.current) {
          setTrackJobs(prev => ({ ...prev, [trackIndex]: "idle" }));
          return "cancelled";
        }

        mediaUrl = searchData.info.url;
        const audioOption = searchData.info.options.find((o: any) => o.kind === "audio");
        formatId = audioOption?.formatId || "bestaudio";
      }

      if (cancelAllRef.current) {
        setTrackJobs(prev => ({ ...prev, [trackIndex]: "idle" }));
        return "cancelled";
      }

      const dlRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: mediaUrl,
          optionId: playlistQuality,
          formatId,
        }),
      });
      const dlData = await dlRes.json();
      if (!dlData.ok) {
        setTrackJobs(prev => ({ ...prev, [trackIndex]: "failed" }));
        return "failed";
      }

      // Return a promise that resolves when download completes or is cancelled
      return new Promise<"done" | "failed" | "cancelled">((resolve) => {
        const params = new URLSearchParams({
          url: mediaUrl,
          optionId: playlistQuality,
          formatId,
        });

        const poll = setInterval(async () => {
          // Check cancel
          if (cancelAllRef.current) {
            clearInterval(poll);
            setTrackJobs(prev => ({ ...prev, [trackIndex]: "idle" }));
            resolve("cancelled");
            return;
          }
          try {
            const statusRes = await fetch(`/api/download/${dlData.downloadId}/status?${params}`);
            const status = await statusRes.json();
            if (status.phase === "done") {
              clearInterval(poll);
              if (cancelAllRef.current) {
                setTrackJobs(prev => ({ ...prev, [trackIndex]: "idle" }));
                resolve("cancelled");
                return;
              }
              setTrackJobs(prev => ({ ...prev, [trackIndex]: "done" }));
              const link = document.createElement("a");
              link.href = `/api/download/${dlData.downloadId}/file`;
              link.download = "";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              resolve("done");
            } else if (status.phase === "failed") {
              clearInterval(poll);
              setTrackJobs(prev => ({ ...prev, [trackIndex]: "failed" }));
              resolve("failed");
            }
          } catch {}
        }, 500);
      });
    } catch {
      setTrackJobs(prev => ({ ...prev, [trackIndex]: "failed" }));
      return "failed";
    }
  }

  // Download all tracks sequentially — can be cancelled
  async function handleDownloadAll() {
    if (!playlist || downloadingAll) return;
    cancelAllRef.current = false;
    downloadingAllRef.current = true;
    setDownloadingAll(true);
    sonnerToast.info("Downloading all tracks", {
      description: `${playlist.trackCount} tracks will download one by one`,
    });

    for (const track of playlist.tracks) {
      // Check if cancelled
      if (cancelAllRef.current) {
        sonnerToast.info("Download cancelled", { description: "Remaining tracks were skipped" });
        setDownloadingAll(false);
        return;
      }
      if (trackJobs[track.index] === "done") continue;
      await handleTrackDownload(track.index);
      await new Promise(r => setTimeout(r, 300));
      // Re-check after each download
      if (cancelAllRef.current) {
        sonnerToast.info("Download cancelled", { description: "Remaining tracks were skipped" });
        setDownloadingAll(false);
        return;
      }
    }

    setDownloadingAll(false);
    sonnerToast.success("All downloads complete!", {
      description: "Check your downloads folder",
    });
  }

  // visibleOptions no longer needed — SoundRush is audio-only and shows all options directly

  const selectedOptionObj = React.useMemo(
    () => info?.options.find((o) => o.id === selectedOption) ?? null,
    [info, selectedOption],
  );

  return (
    <div
      className="min-h-screen flex flex-col bg-background text-foreground relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none"
          >
            <div className="flex flex-col items-center gap-4 p-12 rounded-3xl border-2 border-dashed border-foreground/40">
              <UploadCloud className="size-16 text-foreground/60" />
              <p className="text-xl font-bold">Drop your link here</p>
              <p className="text-sm text-muted-foreground">Release to paste the URL</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme toggle — top right */}
      <div className="absolute top-4 end-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="size-9 rounded-full border-border bg-background/60 backdrop-blur-md"
        >
          {mounted && resolvedTheme === "light" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-2xl mx-auto">
          {/* Title + description */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            {/* GitHub icon — minimal, above title */}
            <motion.a
              href="https://github.com/skipthispart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center mb-4 text-muted-foreground/60 hover:text-foreground transition-colors"
              style={{ willChange: "transform, opacity" }}
              animate={{
                x: isClearing ? -80 : (isExtracting || !contentReady) ? -80 : 0,
                opacity: isClearing || isExtracting || !contentReady ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              aria-label="GitHub"
            >
              <Github className="size-5" />
            </motion.a>

            <motion.h1
              className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6 shine-text"
              style={{ willChange: "transform, opacity" }}
              animate={{
                x: isClearing ? -80 : (isExtracting || !contentReady) ? -80 : 0,
                opacity: isClearing || isExtracting || !contentReady ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              SoundRush
            </motion.h1>
            <motion.p
              className="text-[11px] md:text-[12px] text-muted-foreground leading-relaxed max-w-lg mx-auto"
              style={{ willChange: "transform, opacity" }}
              animate={{
                x: isClearing ? 80 : (isExtracting || !contentReady) ? 80 : 0,
                opacity: isClearing || isExtracting || !contentReady ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              SoundRush is a simple little tool that grabs media from pretty much
              anywhere on the web. Drop a link in, hit the button, and we&apos;ll
              fetch it for you — no accounts, no clutter, no jumping through
              hoops. Whether it&apos;s a song you want offline, a video for the
              commute, or that one clip you keep going back to, SoundRush just
              gets it done and stays out of your way.
            </motion.p>

            {/* Compact link input — no halo, transparent */}
            <motion.div
              className="mt-7"
              style={{ willChange: "transform, opacity" }}
              animate={{
                x: isClearing ? -80 : (isExtracting || !contentReady) ? -80 : 0,
                opacity: isClearing || isExtracting || !contentReady ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="link-pulse flex items-center gap-2 p-1.5 rounded-full border border-border bg-transparent max-w-md mx-auto">
                <div className="relative flex-1">
                  <Link2 className="absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFetchInfo();
                    }}
                    placeholder="Paste a link"
                    className="ps-9 h-9 text-sm bg-transparent dark:bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    dir="ltr"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={info || playlist ? handleClear : handleFetchInfo}
                  disabled={loadingInfo || (!url.trim() && !info && !playlist)}
                  className="btn-glow h-10 px-6 text-sm font-bold rounded-full shrink-0 bg-primary text-primary-foreground hover:bg-primary"
                >
                  {loadingInfo ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span className="hidden sm:inline">Analyzing...</span>
                    </>
                  ) : info || playlist ? (
                    <>
                      Clear
                    </>
                  ) : (
                    <>
                      <Search className="size-4" />
                      Extract
                    </>
                  )}
                </Button>
              </div>
            </motion.div>

            {/* Privacy line */}
            <motion.div
              className="mt-5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground max-w-md mx-auto"
              style={{ willChange: "transform, opacity" }}
              animate={{
                x: isClearing ? 80 : (isExtracting || !contentReady) ? 80 : 0,
                opacity: isClearing || isExtracting || !contentReady ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <Shield className="size-3" />
                <span>Links are processed in-memory</span>
              </div>
              <span className="text-muted-foreground/40">—</span>
              <span>Never stored, never tracked.</span>
            </motion.div>
          </motion.section>

          {/* Loading text — centered in viewport, simple fade in/out */}
          <AnimatePresence>
            {isExtracting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 flex items-center justify-center pointer-events-none z-20"
              >
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight shine-text">
                  {loadingText}
                  <span className="animate-pulse">|</span>
                </h2>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Playlist view */}
          <AnimatePresence>
            {playlist && !isClearing && (
              <motion.section
                key="playlist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="mb-6"
              >
                <div className="max-w-md mx-auto p-3 rounded-2xl border-0 bg-transparent">
                  {/* Header with large cover */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Large square cover image */}
                      <div className="relative size-16 rounded-xl overflow-hidden bg-black shrink-0 ring-1 ring-border dark:ring-white/10">
                        {playlist.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={playlist.cover} alt={playlist.name} className="w-full h-full object-cover" />
                        ) : null}
                        {/* Fallback icon when no cover */}
                        {playlist.cover ? null : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Music className="size-5 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm line-clamp-2">{playlist.name}</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">{playlist.trackCount} tracks</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClear}
                      className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 shrink-0 transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Quality selector + Download All / Cancel */}
                  <div className="flex items-center gap-2 mb-2">
                    {/* Quality dropdown */}
                    <button
                      onClick={() => setPlaylistQualityOpen(!playlistQualityOpen)}
                      disabled={downloadingAll}
                      className="flex-1 flex items-center justify-between gap-2 px-3 h-9 rounded-full border border-border dark:border-white/10 bg-background/40 hover:bg-background/70 transition-colors text-xs disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5">
                        <Music className="size-3.5 text-muted-foreground" />
                        <span>{playlistQuality === "mp3-320" ? "MP3 320" : playlistQuality === "mp3-128" ? "MP3 128" : playlistQuality === "flac" ? "FLAC" : playlistQuality}</span>
                      </span>
                      <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${playlistQualityOpen ? "rotate-180" : ""}`} />
                    </button>
                    {downloadingAll ? (
                      <Button
                        size="sm"
                        onClick={handleCancel}
                        className="h-9 px-5 text-xs font-bold shrink-0 rounded-full border border-border dark:border-white/10 text-foreground bg-transparent hover:bg-foreground/5"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleDownloadAll}
                        className="btn-glow h-9 px-5 text-xs font-bold shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary"
                      >
                        <Download className="size-3.5" />
                        All ({playlist.trackCount})
                      </Button>
                    )}
                  </div>

                  {/* Quality options dropdown */}
                  <AnimatePresence>
                    {playlistQualityOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mb-2"
                      >
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          {[
                            { id: "flac", label: "FLAC Lossless" },
                            { id: "mp3-320", label: "MP3 320 kbps" },
                            { id: "mp3-128", label: "MP3 128 kbps" },
                            { id: "opus-256", label: "Opus 256 kbps" },
                          ].map((q) => (
                            <button
                              key={q.id}
                              onClick={() => {
                                setPlaylistQuality(q.id);
                                setPlaylistQualityOpen(false);
                              }}
                              className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                                playlistQuality === q.id
                                  ? "border-foreground bg-foreground/10 dark:border-white dark:bg-white/10"
                                  : "border-border hover:border-foreground/30"
                              }`}
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Track list */}
                  <div className="max-h-[300px] overflow-y-auto pe-1">
                    {playlist.tracks.map((track) => {
                      const status = trackJobs[track.index] || "idle";
                      return (
                        <div
                          key={track.index}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <span className="text-[10px] text-muted-foreground font-mono w-5 shrink-0 text-center">
                            {track.index}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium line-clamp-1">{track.title}</p>
                            <p className="text-[9px] text-muted-foreground line-clamp-1">{track.artist}</p>
                          </div>
                          <button
                            onClick={() => handleTrackDownload(track.index)}
                            disabled={status === "downloading"}
                            className={`shrink-0 size-7 rounded-full flex items-center justify-center transition-colors ${
                              status === "done"
                                ? "text-foreground"
                                : status === "failed"
                                ? "text-foreground"
                                : status === "downloading"
                                ? "text-muted-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                            }`}
                          >
                            {status === "done" ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : status === "failed" ? (
                              <XCircle className="size-3.5" />
                            ) : status === "downloading" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Info / Format Selector — minimal compact design */}
          <AnimatePresence>
            {info && !isClearing && (
              <motion.section
                key="info"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="mb-6"
              >
                <div className="max-w-md mx-auto p-3 rounded-2xl border border-border dark:border-white/10 bg-card/40 dark:bg-white/[0.02]">
                  {/* Row 1: large cover + title + author + close */}
                  <div className="flex items-center gap-3">
                    {/* Large square cover image */}
                    <div className="relative size-16 rounded-xl overflow-hidden bg-black shrink-0 ring-1 ring-border dark:ring-white/10">
                      {info.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={info.thumbnail}
                          alt={info.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      {/* Fallback icon when no thumbnail */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Music className="size-5 text-muted-foreground/50" />
                      </div>
                    </div>

                    {/* Title + author */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                        {info.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
                        {info.author}
                      </p>
                    </div>

                    {/* Close */}
                    <button
                      onClick={() => {
                        setInfo(null);
                        setSelectedOption(null);
                      }}
                      className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 shrink-0 transition-colors"
                      aria-label="Close"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Row 2: Quality selector toggle + Download/Cancel button */}
                  <div className="flex items-center gap-2 mt-3">
                    {/* Quality selector button */}
                    <button
                      onClick={() => setQualityOpen(!qualityOpen)}
                      disabled={activeJob?.status === "starting" || activeJob?.status === "running"}
                      className="flex-1 flex items-center justify-between gap-2 px-3 h-9 rounded-full border border-border dark:border-white/10 bg-background/40 hover:bg-background/70 transition-colors text-xs disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Music className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {selectedOptionObj ? selectedOptionObj.label : "Select quality"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${qualityOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Download / Cancel button — toggles based on state */}
                    {activeJob?.status === "starting" || activeJob?.status === "running" ? (
                      <Button
                        size="sm"
                        onClick={handleCancel}
                        className="h-9 px-5 text-xs font-semibold shrink-0 rounded-full border border-border dark:border-white/10 text-foreground bg-transparent hover:bg-foreground/5"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleDownload}
                        disabled={activeJob?.status === "done" || (!selectedOption && activeJob?.status !== "done")}
                        className="btn-glow h-9 px-5 text-xs font-semibold shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary"
                      >
                        {activeJob?.status === "done" ? (
                          <>
                            <CheckCircle2 className="size-3.5" />
                            Completed
                          </>
                        ) : (
                          <>
                            <Download className="size-3.5" />
                            Download
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Quality options dropdown (expandable) */}
                  <AnimatePresence>
                    {qualityOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        {/* Audio options grid (SoundRush is audio-only) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 max-h-[200px] overflow-y-auto pe-1">
                          {info.options.map((o) => {
                            const selected = o.id === selectedOption;
                            return (
                              <button
                                key={o.id}
                                onClick={() => {
                                  setSelectedOption(o.id);
                                  setQualityOpen(false);
                                }}
                                className={`relative text-start p-2.5 rounded-lg border transition-all ${
                                  selected
                                    ? "border-foreground bg-foreground/10 dark:border-white dark:bg-white/10"
                                    : "border-border hover:border-foreground/30 bg-background/40 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/30"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`font-medium text-xs ${selected ? "text-foreground dark:text-white" : ""}`}>{o.label}</span>
                                  {o.badge && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[8px] px-1 py-0 font-bold uppercase"
                                    >
                                      {o.badge}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="font-mono uppercase">{o.container}</span>
                                  <span className="font-mono">{formatBytes(o.size)}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Download status — inline, minimal */}
                  {activeJob && (
                    <div className="mt-3 pt-3 border-t border-border dark:border-white/10">
                      {/* Status line */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {activeJob.status === "done" ? (
                            <CheckCircle2 className="size-4 text-foreground" />
                          ) : activeJob.status === "failed" || activeJob.status === "cancelled" ? (
                            <XCircle className="size-4 text-foreground" />
                          ) : (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          <span className="text-xs font-medium">
                            {activeJob.status === "done"
                              ? "Completed"
                              : activeJob.status === "failed"
                              ? "Failed"
                              : activeJob.status === "cancelled"
                              ? "Cancelled"
                              : activeJob.progress?.phaseLabel || "Downloading..."}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {(activeJob.status === "done" ||
                            activeJob.status === "failed" ||
                            activeJob.status === "cancelled") && (
                            <button
                              onClick={handleReset}
                              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {activeJob.progress && activeJob.status === "running" && (
                        <>
                          <Progress
                            value={activeJob.progress.progress}
                            className="h-1.5 mb-2"
                          />
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                            <span>{activeJob.progress.progress}%</span>
                            <span>{activeJob.progress.speedMBps.toFixed(1)} MB/s</span>
                            <span>
                              {formatBytes(activeJob.progress.doneBytes)} / {formatBytes(activeJob.progress.totalBytes)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Sonner position="top-center" theme={mounted && resolvedTheme === "light" ? "light" : "dark"} closeButton />
    </div>
  );
}
