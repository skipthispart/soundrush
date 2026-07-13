const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { detectPlatform } = require("./platforms/detector");

let mainWindow;
let pythonProcess;

function startPython() {
  const scriptPath = path.join(__dirname, "..", "scripts", "ytdlp_helper.py");
  const venvPath = path.join(__dirname, "..", "venv");
  const pythonExe = process.platform === "win32"
    ? path.join(venvPath, "Scripts", "python.exe")
    : path.join(venvPath, "bin", "python3");

  try {
    pythonProcess = spawn(pythonExe, [scriptPath, "--server", "3001"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, YT_API_KEY: process.env.YT_API_KEY || "" },
    });
    pythonProcess.stdout.on("data", (d) => console.log(`[Python] ${d}`));
    pythonProcess.stderr.on("data", (d) => console.error(`[Python] ${d}`));
  } catch (e) {
    console.log("[Python] not available — running in browser-only mode");
  }
}

app.whenReady().then(() => {
  startPython();

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "SoundRush",
  });

  // Inject download button into music platforms
  mainWindow.webContents.on("did-finish-load", () => {
    const url = mainWindow.webContents.getURL();
    const platform = detectPlatform(url);
    if (platform) {
      mainWindow.webContents
        .executeJavaScript(`
          (function() {
            const btn = document.createElement("div");
            btn.id = "soundrush-dl-btn";
            btn.innerHTML = \`
              <div style="
                position:fixed; bottom:100px; right:20px; z-index:999999;
                background:#1ed760; color:#000; border:none; border-radius:50px;
                padding:12px 24px; font:600 14px sans-serif; cursor:pointer;
                box-shadow:0 4px 20px rgba(0,0,0,0.3);
                display:flex; align-items:center; gap:8px;
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
                Download
              </div>
            \`;
            btn.onclick = () => {
              document.querySelector("#soundrush-dl-btn").style.opacity = "0.5";
              window.postMessage({ type: "soundrush-download", url: window.location.href }, "*");
            };
            document.body.appendChild(btn);
          })();
        `)
        .catch(() => {});
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "public", "app.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (pythonProcess) pythonProcess.kill();
  });
});

ipcMain.handle("download", async (event, { url, format }) => {
  try {
    const http = require("http");
    return new Promise((resolve) => {
      const data = JSON.stringify({ url, format, action: "download" });
      const req = http.request({ hostname: "127.0.0.1", port: 3001, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(JSON.parse(body)));
      });
      req.write(data);
      req.end();
    });
  } catch {
    return { ok: false, error: "Python backend not available" };
  }
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
