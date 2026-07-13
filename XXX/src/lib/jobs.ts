// Real download job runner — calls yt-dlp directly from Node.js.

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

export type JobPhase = "fetching" | "transcoding" | "done" | "failed";

export type JobState = {
  downloadId: string;
  progress: number;
  speedMBps: number;
  phase: JobPhase;
  doneBytes: number;
  totalBytes: number;
  outputFilePath: string | null;
  outputFileName: string | null;
  error: string | null;
  childProcess: ReturnType<typeof spawn> | null;
};

export const PHASE_LABELS: Record<JobPhase, string> = {
  fetching: "Downloading",
  transcoding: "Converting",
  done: "Completed",
  failed: "Failed",
};

const globalForJobs = globalThis as unknown as {
  __downloadJobs?: Map<string, JobState>;
};
export const jobs: Map<string, JobState> =
  globalForJobs.__downloadJobs ?? new Map<string, JobState>();
globalForJobs.__downloadJobs = jobs;

const YT_DLP = path.join(process.env.HOME || "/root", ".venv", "bin", "yt-dlp");
const VENV_BIN = path.join(process.env.HOME || "/root", ".venv", "bin");
const OUTPUT_DIR = path.join(process.cwd(), "download", "exports");

// Ensure yt-dlp is installed
async function ensureYtDlp() {
  if (fs.existsSync(YT_DLP)) return true;
  try {
    await execFileAsync("pip3", ["install", "yt-dlp"], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return fs.existsSync(YT_DLP);
  } catch {
    return false;
  }
}

try {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
} catch {}

export function getJob(downloadId: string): JobState | undefined {
  return jobs.get(downloadId);
}

export function startJob(
  downloadId: string,
  url: string,
  optionId: string,
  formatId: string,
  _totalBytes: number,
) {
  if (jobs.has(downloadId)) return jobs.get(downloadId)!;

  const job: JobState = {
    downloadId,
    progress: 0,
    speedMBps: 0,
    phase: "fetching",
    doneBytes: 0,
    totalBytes: 0,
    outputFilePath: null,
    outputFileName: null,
    error: null,
    childProcess: null,
  };
  jobs.set(downloadId, job);

  // Ensure yt-dlp exists before starting download
  ensureYtDlp().then((ready) => {
    if (!ready) {
      job.phase = "failed";
      job.error = "yt-dlp not available. Please try again.";
      return;
    }
    // Check if this is a blocked video (formatId === "blocked")
    if (formatId === "blocked") {
      job.phase = "failed";
      job.error = "YouTube is blocking this video with bot detection. Try a different video.";
      return;
    }
    runDownload(downloadId, url, optionId, formatId, job);
  });

  return job;
}

function buildYtDlpArgs(url: string, optionId: string, formatId: string, outputPath: string): string[] {
  const args = [
    "--no-playlist", "--no-warnings", "--no-check-certificate",
    "--retries", "1", "--fragment-retries", "1",
    "--concurrent-fragments", "4", "--newline",
    "--hls-prefer-native", "--hls-use-mpegts",
    // --- Security: limit max filesize to 500MB ---
    "--max-filesize", "500M",
    // --- Security: limit playlist extraction (single item only) ---
    "--playlist-items", "1",
  ];

  // SoundRush is audio-only — only allow audio formats
  if (optionId === "opus-256") {
    args.push("-f", "bestaudio[ext=m4a]/bestaudio");
  } else if (optionId === "mp3-320" || optionId === "mp3-128" || optionId === "flac") {
    const audioFmt = optionId.split("-")[0];
    args.push("-x", "--audio-format", audioFmt);
    if (optionId === "mp3-320") args.push("--audio-quality", "0");
    else if (optionId === "mp3-128") args.push("--audio-quality", "8");
    args.push("--postprocessor-args", "-threads 8");
    args.push("-f", "bestaudio");
  } else {
    // Unknown format — fall back to bestaudio (refuse video formats)
    args.push("-f", "bestaudio");
  }

  args.push("-o", outputPath);
  args.push(url);
  return args;
}

function runDownload(downloadId: string, url: string, optionId: string, formatId: string, job: JobState) {
  const ext = getExtensionForOption(optionId);
  const outputPath = path.join(OUTPUT_DIR, `${downloadId}.${ext}`);
  job.outputFilePath = outputPath;
  job.outputFileName = path.basename(outputPath);

  const args = buildYtDlpArgs(url, optionId, formatId, outputPath);
  const child = spawn(YT_DLP, args, {
    env: { ...process.env, PATH: `${VENV_BIN}:${process.env.PATH || ""}` },
  });
  job.childProcess = child;

  let stderrData = "";

  child.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n");
    for (const line of lines) parseProgressLine(line, job);
  });

  child.stderr?.on("data", (data: Buffer) => { stderrData += data.toString(); });

  child.on("close", (code) => {
    if (code !== 0 && code !== null) {
      job.phase = "failed";
      job.error = stderrData.trim().split("\n").pop() || "Download failed";
      return;
    }

    let actualPath = outputPath;
    if (!fs.existsSync(actualPath)) {
      const base = outputPath.replace(/\.[^/.]+$/, "");
      for (const e of ["mp4", "mp3", "flac", "opus", "webm", "m4a", "ogg"]) {
        const c = `${base}.${e}`;
        if (fs.existsSync(c)) { actualPath = c; break; }
      }
    }

    if (!fs.existsSync(actualPath)) {
      job.phase = "failed";
      job.error = "Output file not found";
      return;
    }

    const finalSize = fs.statSync(actualPath).size;
    job.outputFilePath = actualPath;
    job.outputFileName = path.basename(actualPath);
    job.doneBytes = finalSize;
    job.totalBytes = finalSize;
    job.progress = 100;
    job.phase = "done";
    job.speedMBps = 0;

    setTimeout(() => {
      jobs.delete(downloadId);
      setTimeout(() => {
        try { if (fs.existsSync(actualPath)) fs.unlinkSync(actualPath); } catch {}
      }, 600000);
    }, 300000);
  });

  child.on("error", () => {
    job.phase = "failed";
    job.error = "Failed to start download";
  });
}

function parseProgressLine(line: string, job: JobState) {
  const match = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([\d.]+)(\w+)\s+at\s+([\d.]+)(\w+\/s)/);
  if (match) {
    const percent = parseFloat(match[1]);
    const sizeVal = parseFloat(match[2]);
    const sizeUnit = match[3];
    const speedVal = parseFloat(match[4]);
    const speedUnit = match[5];

    const sizeMult = sizeUnit === "GiB" ? 1073741824 : sizeUnit === "MiB" ? 1048576 : sizeUnit === "KiB" ? 1024 : 1;
    const speedMult = speedUnit === "GiB/s" ? 1024 : speedUnit === "MiB/s" ? 1 : speedUnit === "KiB/s" ? 0.0009765625 : 1;

    job.progress = Math.min(99, Math.floor(percent));
    job.totalBytes = Math.floor(sizeVal * sizeMult);
    job.doneBytes = Math.floor((percent / 100) * sizeVal * sizeMult);
    job.speedMBps = Number((speedVal * speedMult).toFixed(2));
    job.phase = "fetching";
    return;
  }

  if (line.includes("[ExtractAudio]") || line.includes("[Merger]") || line.includes("[VideoConvertor]")) {
    job.phase = "transcoding";
    job.progress = Math.max(job.progress, 50);
    job.speedMBps = 0;
    return;
  }

  if (line.includes("[download] Destination:") || line.includes("Downloading")) {
    job.phase = "fetching";
  }
}

function getExtensionForOption(optionId: string): string {
  if (optionId.startsWith("flac")) return "flac";
  if (optionId.startsWith("mp3")) return "mp3";
  if (optionId.startsWith("opus")) return "m4a";
  if (optionId.startsWith("mp4")) return "mp4";
  return "mp4";
}

export function cancelJob(downloadId: string) {
  const job = jobs.get(downloadId);
  if (job?.childProcess) {
    try { job.childProcess.kill("SIGTERM"); } catch {}
  }
  jobs.delete(downloadId);
}
