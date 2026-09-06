const { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chokidar = require('chokidar');

const VALID_EXTENSIONS = ['.md', '.markdown'];
const MAX_RECENT_FILES = 15;

// Session 01 will AND this with HTML extensions in the open gate.
// Session 00 only exposes the helper so tests can stub it — `.html`
// stays rejected. Electron main is not Vite-bundled; `desktop:html`
// sets VITE_HTML_DOCUMENTS=true so this cannot disagree with the
// renderer (`htmlDocumentsEnabled` / Vite define).
function htmlDocumentsEnabledMain() {
  return process.env.VITE_HTML_DOCUMENTS === 'true';
}

const RELEASES_URL = 'https://github.com/cbremer/specdown/releases/latest';

// Only platforms whose shipped binaries are code-signed may auto-update.
// electron-updater performs NO signature verification for an unsigned app, so
// silent download + install-on-quit on an unsigned platform would execute
// whatever the release feed serves, with no cryptographic check — a compromised
// release asset or upload token becomes remote code execution. macOS builds are
// signed + notarized (see .github/workflows/desktop.yml); Windows/Linux are not
// yet, so they get a manual "download from Releases" flow instead.
function isSignedUpdatePlatform(platform) {
  return platform === 'darwin';
}

let mainWindow = null;
let store = null;
let logFilePath = null;
// electron-updater instance (set in packaged builds only) + a flag marking a
// user-initiated "Check for Updates…" so its result is surfaced (a silent
// background check stays silent).
let autoUpdaterRef = null;
let manualUpdateCheck = false;

// Queue files requested before the window is ready (e.g. Finder double-click on launch)
let pendingFilePaths = [];

// ===========================
// Logging
// ===========================
// Writes to a user-accessible log file so silent failures in packaged builds
// (ASAR + ESM dynamic imports, missing native bindings, etc.) are recoverable.
function initLogFile() {
  try {
    const userData = app.getPath('userData');
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    logFilePath = path.join(userData, 'specdown-main.log');
  } catch {
    // Can't establish a log file — fall back to console only.
    logFilePath = null;
  }
}

function logError(msg, err) {
  const detail = err && err.stack ? err.stack : String(err || '');
  const line = `[${new Date().toISOString()}] ERROR ${msg}: ${detail}\n`;
  console.error(line);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line);
    } catch {
      // Swallow — logging must never crash the app.
    }
  }
}

function logInfo(msg) {
  const line = `[${new Date().toISOString()}] INFO  ${msg}\n`;
  console.log(line);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line);
    } catch {
      // Swallow — logging must never crash the app.
    }
  }
}

// ===========================
// Auto-update (electron-updater)
// ===========================
// Checks GitHub Releases for a newer version; if found, downloads it in the
// background and installs on the next quit, with a native OS notification when
// the download is ready (checkForUpdatesAndNotify). Only meaningful in a
// packaged, code-signed build: skipped in dev (electron-updater has no update
// feed) and when SPECDOWN_DISABLE_UPDATER=1. electron-updater is lazy-required
// so it never loads during unit tests (which mock electron but not the updater)
// or when updates are disabled.
function initAutoUpdater() {
  if (!app.isPackaged) {
    logInfo('Auto-update skipped (not a packaged build).');
    return;
  }
  if (process.env.SPECDOWN_DISABLE_UPDATER === '1') {
    logInfo('Auto-update disabled via SPECDOWN_DISABLE_UPDATER.');
    return;
  }
  if (!isSignedUpdatePlatform(process.platform)) {
    logInfo(
      `Auto-update skipped: ${process.platform} builds are unsigned, so update ` +
        'signatures cannot be verified. Use Help > Check for Updates to open the Releases page.'
    );
    return;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    logError('electron-updater unavailable; skipping auto-update', err);
    return;
  }
  autoUpdaterRef = autoUpdater;

  // Route updater logs into our user-accessible log file so update failures in
  // shipped builds are recoverable.
  autoUpdater.logger = {
    info: (m) => logInfo(`updater: ${m}`),
    warn: (m) => logInfo(`updater WARN: ${m}`),
    error: (m) => logError('updater', m),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    logError('Auto-update error', err);
    showManualUpdateCheckError(err);
  });
  autoUpdater.on('update-available', (info) =>
    logInfo(`Update available: ${info && info.version}`)
  );
  autoUpdater.on('update-not-available', () => {
    logInfo('No update available.');
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox({
        type: 'info',
        message: "You're up to date",
        detail: `SpecDown ${app.getVersion()} is the latest version.`,
      });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    logInfo(`Update downloaded: ${info && info.version} (installs on quit)`);
    manualUpdateCheck = false;
    // Surface an in-app "Restart now" toast (the renderer wires the button to
    // restart-to-update). The native OS notification from checkForUpdatesAndNotify
    // still fires as a fallback when the window isn't focused.
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-downloaded', { version: info && info.version });
    }
  });

  autoUpdater
    .checkForUpdatesAndNotify()
    .catch((err) => logError('checkForUpdatesAndNotify failed', err));
}

// Menu-triggered update check. Result surfaces via the handlers above: a native
// "you're up to date" / error dialog (guarded by manualUpdateCheck), or the
// update-downloaded toast. In an unpackaged/dev build there is no updater.
function checkForUpdatesManually() {
  if (!autoUpdaterRef) {
    if (app.isPackaged && !isSignedUpdatePlatform(process.platform)) {
      // Unsigned platform: in-app install is deliberately disabled (no way to
      // verify what we'd be installing), but we can point at Releases.
      dialog
        .showMessageBox({
          type: 'info',
          message: 'Automatic updates are not available on this platform yet',
          detail:
            'SpecDown builds for this platform are not code-signed, so updates are not ' +
            'installed automatically. You can download the latest version from GitHub Releases.',
          buttons: ['Open Releases Page', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result && result.response === 0) shell.openExternal(RELEASES_URL);
        })
        .catch((err) => logError('Releases-page dialog failed', err));
      return;
    }
    dialog.showMessageBox({
      type: 'info',
      message: 'Updates are unavailable in this build',
      detail: 'Automatic updates only run in the installed SpecDown app.',
    });
    return;
  }
  armManualUpdateCheck();
  autoUpdaterRef.checkForUpdates().catch((err) => {
    logError('Manual update check failed', err);
    showManualUpdateCheckError(err);
  });
}

// Arm the "surface the next updater result in a dialog" flag. Split out so
// tests can arm it without driving the whole menu flow.
function armManualUpdateCheck() {
  manualUpdateCheck = true;
}

// One dialog per failed manual check. electron-updater reports the SAME
// failure twice — it emits an 'error' event AND rejects the checkForUpdates()
// promise — and both paths used to open a dialog back-to-back (close the
// first modal, the second pops). The manualUpdateCheck flag is consumed by
// whichever path runs first; the other stays silent. Background (non-manual)
// checks never dialog — they only log.
function showManualUpdateCheckError(err) {
  if (!manualUpdateCheck) return;
  manualUpdateCheck = false;

  const detail = err && err.message ? err.message : String(err || '');
  // A 404 on the update feed usually means a release was just published and
  // its platform artifacts are still building/notarizing (the release record
  // appears minutes before the assets do). Say that instead of dumping HTTP.
  if (/cannot find latest[^\s]*\.yml/i.test(detail) || /HttpError: 404/.test(detail)) {
    dialog.showMessageBox({
      type: 'info',
      message: 'The newest release is still being packaged',
      detail:
        'A new version was just published and its update files are still being ' +
        'built and uploaded. Try Check for Updates again in a few minutes.',
    });
    return;
  }
  dialog.showMessageBox({
    type: 'error',
    message: 'Could not check for updates',
    detail,
  });
}

// ===========================
// Store (simple JSON persistence)
// ===========================
// Replaces electron-store v11, which is ESM-only and has a history of
// silently failing to load in packaged ASAR builds (breaking recent files
// and session restore). A tiny synchronous JSON file in userData is simpler,
// has no native deps, and is trivially debuggable.
function initStore() {
  const defaults = {
    recentFiles: [],
    windowBounds: { width: 1200, height: 800 },
    session: { tabs: [] },
    customCssPath: '',
  };

  let statePath;
  try {
    statePath = path.join(app.getPath('userData'), 'specdown-state.json');
  } catch (err) {
    logError('Failed to resolve userData path; persistence disabled', err);
    store = null;
    return;
  }

  let data = { ...defaults };
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, 'utf8');
      const parsed = JSON.parse(raw);
      data = { ...defaults, ...parsed };
    }
  } catch (err) {
    logError('Failed to load state file; starting with defaults', err);
  }

  // Atomic write: write to a sibling temp file, then rename over the target.
  // Rename is atomic on POSIX + NTFS, so a crash/kill mid-write can never
  // leave `specdown-state.json` truncated — the worst case is a leftover
  // `.tmp` file that gets overwritten on the next successful write.
  const write = () => {
    const tempPath = `${statePath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, statePath);
    } catch (err) {
      logError('Failed to write state file', err);
      // Best-effort cleanup of the temp file so it doesn't accumulate.
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Swallow — we've already logged the real failure.
      }
    }
  };

  store = {
    get: (key, fallback) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback),
    set: (key, value) => {
      data[key] = value;
      write();
    },
  };
}

function getRecentFiles() {
  return store ? store.get('recentFiles', []) : [];
}

function addRecentFile(filePath) {
  // Feed the native OS recent-documents list (macOS Dock, Windows jump list).
  // This is independent of our own persistent store so it still works even if
  // JSON persistence is broken.
  if (typeof app.addRecentDocument === 'function') {
    try {
      app.addRecentDocument(filePath);
    } catch (err) {
      logError('app.addRecentDocument failed', err);
    }
  }

  if (!store) return;
  let recent = store.get('recentFiles', []);
  recent = recent.filter((p) => p !== filePath);
  recent.unshift(filePath);
  if (recent.length > MAX_RECENT_FILES) recent = recent.slice(0, MAX_RECENT_FILES);
  store.set('recentFiles', recent);
  rebuildMenu();
}

function saveSession(tabs) {
  if (!store) return;
  // Only save file-path based tabs (not URL/dragged-in ones without a path)
  const saveable = tabs
    .filter((t) => t.filePath)
    .map((t) => ({ filePath: t.filePath, filename: t.filename }));
  store.set('session', { tabs: saveable });
}

function restoreSession() {
  if (!store) return;
  const session = store.get('session', { tabs: [] });
  for (const tabInfo of session.tabs) {
    if (tabInfo.filePath && isValidMarkdownFile(tabInfo.filePath)) {
      openFileByPath(tabInfo.filePath);
    }
  }
}

function createWindow() {
  const bounds = store ? store.get('windowBounds', { width: 1200, height: 800 }) : { width: 1200, height: 800 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    title: 'Specdown Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Loads the Vite build output. `npm run desktop` / `desktop:build` run the
  // web build first so this file exists.
  mainWindow.loadFile(
    path.join(__dirname, '..', 'markdown-viewer', 'dist', 'index.html')
  );

  // Prevent the renderer from navigating away from the bundled local file.
  // This guards against malicious content (e.g. a crafted markdown link)
  // driving the main-frame URL to an external site inside the Electron shell.
  // Genuine external links (http/https) are instead handed to the system
  // browser via shell.openExternal so they are not silently dropped.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let protocol;
    try {
      protocol = new URL(url).protocol;
    } catch {
      event.preventDefault();
      return;
    }
    if (protocol === 'file:') return;
    event.preventDefault();
    if (protocol === 'http:' || protocol === 'https:') {
      shell.openExternal(url);
    }
  });

  // Block any attempt by the renderer to open a new BrowserWindow, but route
  // external http/https links to the system browser via shell.openExternal
  // rather than dropping them. Anything else is denied outright.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url);
      if (protocol === 'http:' || protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — deny without opening anything.
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    // Deliver any files that were queued before the window was ready
    for (const filePath of pendingFilePaths) {
      openFileByPath(filePath);
    }
    pendingFilePaths = [];

    // Restore previous session
    restoreSession();

    // Restore custom CSS theme
    restoreCustomCss();
  });

  // Save window size on resize
  mainWindow.on('resize', () => {
    if (!store) return;
    const [width, height] = mainWindow.getSize();
    store.set('windowBounds', { width, height });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===========================
// File Open Logic
// ===========================
function isValidMarkdownFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VALID_EXTENSIONS.includes(ext);
}

function readMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  return { filename, filePath, content };
}

// Best-effort owner name for a stat result. Node has no portable uid→username
// lookup, so we can only name the owner confidently when it's the current user
// (os.userInfo()). Otherwise fall back to the numeric uid on POSIX, or null on
// Windows where uid is meaningless (-1).
function resolveOwnerName(uid) {
  if (typeof uid !== 'number' || uid < 0) return null; // Windows / unknown
  try {
    const me = os.userInfo();
    if (me && me.uid === uid && me.username) return me.username;
  } catch {
    // os.userInfo() can throw if the user has no passwd entry — fall through.
  }
  return `uid ${uid}`;
}

// On-disk metadata for the renderer's File info sheet. Returns null (rather than
// throwing across the IPC boundary) when the file can't be stat'd, so the sheet
// can show "Unavailable" instead of hanging.
function buildFileMetadata(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    logError(`Failed to stat file for metadata: ${filePath}`, err);
    return null;
  }
  return {
    filePath,
    size: stats.size,
    birthtimeMs: stats.birthtimeMs,
    mtimeMs: stats.mtimeMs,
    owner: resolveOwnerName(stats.uid),
  };
}

function openFileByPath(filePath) {
  if (!isValidMarkdownFile(filePath)) return;

  try {
    const fileData = readMarkdownFile(filePath);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('file-opened', fileData);
    }
    addRecentFile(filePath);
  } catch (err) {
    console.error('Failed to read file:', filePath, err);
  }
}

async function showOpenDialog() {
  if (!mainWindow) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown File',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) return;

  for (const filePath of result.filePaths) {
    openFileByPath(filePath);
  }
}

// ===========================
// Workspace (folder) mode
// ===========================
// Open a folder and browse its markdown files from an in-app sidebar. The scan
// is bounded (depth + count) and skips noisy directories so a large repo can't
// hang the main process or flood the renderer.
const WORKSPACE_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  'coverage', '.next', '.cache', '.vite', '.idea', '.vscode',
]);
const WORKSPACE_MAX_DEPTH = 8;
const WORKSPACE_MAX_FILES = 2000;

/**
 * Recursively collect markdown files under `rootDir`. Returns entries with the
 * absolute path, the path relative to the root (for display), and the basename,
 * sorted by relative path. Bounded by depth, file count, and an ignore list.
 */
function scanWorkspace(rootDir) {
  const out = [];

  const walk = (dir, depth) => {
    if (depth > WORKSPACE_MAX_DEPTH || out.length >= WORKSPACE_MAX_FILES) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      logError(`Failed to read workspace directory: ${dir}`, err);
      return;
    }

    for (const entry of entries) {
      if (out.length >= WORKSPACE_MAX_FILES) return;
      const name = entry.name;
      if (name.startsWith('.') && entry.isDirectory()) continue;
      const full = path.join(dir, name);

      if (entry.isDirectory()) {
        if (WORKSPACE_IGNORE_DIRS.has(name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && isValidMarkdownFile(name)) {
        out.push({
          path: full,
          relPath: path.relative(rootDir, full),
          name,
        });
      }
    }
  };

  walk(rootDir, 0);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

// Roots of every workspace opened this session. Relative-link navigation is
// contained to these directories (see openRelativeFromFile).
const workspaceRoots = new Set();

async function showOpenFolderDialog() {
  if (!mainWindow) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Folder',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths.length) return;

  const root = result.filePaths[0];
  workspaceRoots.add(root);
  const files = scanWorkspace(root);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('workspace-opened', { root, files });
  }
}

// True when targetPath sits inside (or is) one of the opened workspace roots.
// path.relative-based so `/ws-evil` can't pass as inside `/ws` via a prefix
// check, and so the root itself is accepted.
function isInsideAnyWorkspace(targetPath) {
  for (const root of workspaceRoots) {
    const rel = path.relative(root, targetPath);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true;
  }
  return false;
}

// Resolve a relative link (clicked inside a workspace document) against the
// directory of the document it came from, then open it. Used for in-workspace
// navigation via relative `.md` links. The resolved path is validated by
// openFileByPath, so a broken link is a safe no-op.
function openRelativeFromFile(fromPath, href) {
  if (typeof fromPath !== 'string' || !fromPath) return;
  if (typeof href !== 'string' || !href) return;

  // Strip any query/hash and percent-decode so links like `./b.md#section`
  // or `../my%20doc.md` resolve to the real file on disk.
  let cleaned = href.split('#')[0].split('?')[0];
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Leave as-is if it isn't valid percent-encoding.
  }
  if (!cleaned) return;

  const target = path.resolve(path.dirname(fromPath), cleaned);

  // Containment: relative navigation only reaches files inside a workspace the
  // user explicitly opened. Without this, a crafted `../../../…` link in a
  // workspace doc could walk out of the workspace and open arbitrary markdown
  // files the user never opted into (info disclosure via document content).
  if (!isInsideAnyWorkspace(target)) {
    logInfo(`Blocked relative link outside workspace roots: ${target}`);
    return;
  }
  openFileByPath(target);
}

// ===========================
// File Watching
// ===========================

// Why we watch the parent directory instead of the file itself:
// Most modern editors (VSCode, vim, Sublime, JetBrains) save atomically —
// they write a temp file and rename it over the target. Renaming changes
// the inode, and chokidar's single-file watch follows the inode, so the
// watcher goes dead after the first save. Watching the parent directory
// with a basename filter sidesteps this entirely and is robust against
// unlink → add sequences.
//
// Why we share one chokidar watcher per directory across files:
// Opening several tabs from the same folder shouldn't create redundant
// OS-level watches. `dirWatchers` holds one watcher per directory; each
// entry maintains a `files` map (basename → full filePath) so incoming
// events can be routed to the right tab. The exported `watchers` map
// stays keyed by filePath for external API compatibility.
//
// We also don't capture `webContents` in the event closure anymore: if
// the renderer is reloaded (View > Reload), a captured reference becomes
// stale. Instead we look up `mainWindow.webContents` lazily at event time.
const watchers = new Map();          // filePath → { dir }
const dirWatchers = new Map();       // dir → { watcher, files: Map<basename, filePath> }

function watchFile(filePath, _webContents) {
  if (watchers.has(filePath)) return; // already watching

  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);

  let dirEntry = dirWatchers.get(dir);
  if (!dirEntry) {
    const files = new Map();

    const handleEvent = (eventPath) => {
      // chokidar may pass a full path or just a basename depending on platform.
      const eventBase = eventPath ? path.basename(eventPath) : '';
      const target = files.get(eventBase);
      if (!target) return;

      try {
        const fileData = readMarkdownFile(target);
        const wc = mainWindow && mainWindow.webContents;
        if (wc && !wc.isDestroyed()) {
          wc.send('file-changed', fileData);
        }
      } catch (err) {
        logError(`Failed to re-read watched file: ${target}`, err);
      }
    };

    // Escape hatch for users on filesystems where fs.watch is unreliable:
    // network mounts (SMB/NFS/Dropbox/iCloud Drive), VM shared folders,
    // certain fuse filesystems. Setting SPECDOWN_WATCH_POLLING=1 forces
    // chokidar into polling mode at a 500ms interval. CPU cost is small
    // for a handful of files and it works everywhere.
    const usePolling = process.env.SPECDOWN_WATCH_POLLING === '1';
    if (usePolling) {
      logInfo(`Chokidar polling mode enabled for ${dir} (SPECDOWN_WATCH_POLLING=1)`);
    }

    const watcher = chokidar.watch(dir, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Only the directory itself, not subdirs.
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      usePolling,
      interval: usePolling ? 500 : undefined,
    });

    // 'change' covers in-place edits; 'add' covers the post-rename inode
    // of an atomic-save, which chokidar sees as a "new" file appearing.
    watcher.on('change', handleEvent);
    watcher.on('add', handleEvent);
    watcher.on('error', (err) => {
      logError(`Watcher error for ${dir}`, err);
    });

    dirEntry = { watcher, files };
    dirWatchers.set(dir, dirEntry);
  }

  dirEntry.files.set(basename, filePath);
  watchers.set(filePath, { dir });
}

function unwatchFile(filePath) {
  const entry = watchers.get(filePath);
  if (!entry) return;

  watchers.delete(filePath);

  const dirEntry = dirWatchers.get(entry.dir);
  if (!dirEntry) return;

  dirEntry.files.delete(path.basename(filePath));
  if (dirEntry.files.size === 0) {
    try {
      dirEntry.watcher.close();
    } catch (err) {
      logError(`Failed to close watcher for ${entry.dir}`, err);
    }
    dirWatchers.delete(entry.dir);
  }
}

// ===========================
// Custom CSS
// ===========================
async function loadCustomCss() {
  if (!mainWindow) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Custom CSS Theme',
    properties: ['openFile'],
    filters: [
      { name: 'CSS Files', extensions: ['css'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) return;

  const cssPath = result.filePaths[0];
  try {
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('apply-custom-css', cssContent);
    }
    if (store) store.set('customCssPath', cssPath);
  } catch (err) {
    console.error('Failed to read CSS file:', cssPath, err);
  }
}

function clearCustomCss() {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('apply-custom-css', '');
  }
  if (store) store.set('customCssPath', '');
}

function restoreCustomCss() {
  if (!store) return;
  const cssPath = store.get('customCssPath', '');
  if (!cssPath) return;
  try {
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('apply-custom-css', cssContent);
    }
  } catch {
    // CSS file may have been moved; silently skip
    store.set('customCssPath', '');
  }
}

// ===========================
// Print / PDF Export
// ===========================
// PDF export renders the renderer-built standalone printable document (see
// buildPrintableDocument in the web app) in an offscreen window and writes it
// with printToPDF. Printing does NOT come through here: on macOS the print
// dialog is a sheet attached to its window, so webContents.print() on a
// hidden window never shows a dialog — the renderer prints the same document
// via a hidden iframe in the visible window instead.
//
// The HTML is staged through a temp file rather than a data: URL — data URLs
// hit length limits and encoding issues on large documents.
async function loadPrintableWindow(html) {
  const tempHtmlPath = path.join(
    app.getPath('temp'),
    `specdown-print-${process.pid}-${Date.now()}.html`
  );
  fs.writeFileSync(tempHtmlPath, html, 'utf8');
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const cleanup = () => {
    try {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    } catch {
      // Window teardown is best-effort.
    }
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch {
      // Temp file may already be gone.
    }
  };
  try {
    await printWindow.loadFile(tempHtmlPath);
  } catch (err) {
    cleanup();
    throw err;
  }
  return { printWindow, cleanup };
}

function isValidPrintPayload(payload) {
  return !!(payload && typeof payload.html === 'string' && payload.html);
}

// Derive a save-dialog default filename from the document title.
function pdfDefaultName(title) {
  const base = (typeof title === 'string' && title ? title : 'document')
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();
  return `${base || 'document'}.pdf`;
}

async function exportPdfFromHtml(payload) {
  if (!isValidPrintPayload(payload) || !mainWindow) return;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export as PDF',
    defaultPath: pdfDefaultName(payload.title),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!result || result.canceled || !result.filePath) return;

  let printable;
  try {
    printable = await loadPrintableWindow(payload.html);
  } catch (err) {
    logError('Failed to prepare document for PDF export', err);
    dialog.showErrorBox('Export as PDF failed', 'The document could not be prepared for export.');
    return;
  }
  const { printWindow, cleanup } = printable;
  try {
    const pdfData = await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    fs.writeFileSync(result.filePath, pdfData);
    shell.showItemInFolder(result.filePath);
  } catch (err) {
    logError('Failed to export PDF', err);
    dialog.showErrorBox(
      'Export as PDF failed',
      `The PDF could not be written to ${result.filePath}.`
    );
  } finally {
    cleanup();
  }
}

// ===========================
// IPC Handlers
// ===========================
ipcMain.on('request-file-open', () => {
  showOpenDialog();
});

// Export the standalone printable document as a PDF file.
ipcMain.on('export-pdf', (_event, payload) => {
  exportPdfFromHtml(payload);
});

// Re-open a recent file by path (from the renderer's in-app recent-files list).
// openFileByPath validates the extension and handles read errors, so a stale
// or moved path is a safe no-op.
ipcMain.on('request-open-path', (_event, filePath) => {
  if (typeof filePath === 'string' && filePath) {
    openFileByPath(filePath);
  }
});

// Workspace: open a folder picker and scan it for markdown files.
ipcMain.on('request-open-folder', () => {
  showOpenFolderDialog();
});

// Workspace: open a relative link clicked inside a workspace document.
ipcMain.on('request-open-relative', (_event, payload) => {
  if (payload && typeof payload === 'object') {
    openRelativeFromFile(payload.fromPath, payload.href);
  }
});

ipcMain.on('close-active-tab', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('close-tab');
  }
});

ipcMain.on('watch-file', (event, filePath) => {
  watchFile(filePath, event.sender);
});

ipcMain.on('unwatch-file', (_event, filePath) => {
  unwatchFile(filePath);
});

// Request/response lets bookmarks recover from moved or inaccessible files.
ipcMain.handle('read-bookmarked-file', async (event, filePath) => {
  if (event.senderFrame !== event.sender.mainFrame ||
      typeof filePath !== 'string' || !path.isAbsolute(filePath) ||
      !isValidMarkdownFile(filePath)) return null;
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile() || stats.size > 8 * 1024 * 1024) return null;
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { filename: path.basename(filePath), filePath, content };
  } catch {
    return null;
  }
});

// File info sheet: return on-disk metadata using request/response IPC.
ipcMain.handle('get-file-metadata', (_event, filePath) => {
  return buildFileMetadata(filePath);
});

// Manual "Reload from disk": re-read the file and reply over the same
// file-changed channel a watcher event uses, so the renderer updates the
// open tab in place (scroll preserved, "Updated" chip flash).
ipcMain.on('refresh-file', (_event, filePath) => {
  if (typeof filePath !== 'string' || !isValidMarkdownFile(filePath)) return;
  try {
    const fileData = readMarkdownFile(filePath);
    const wc = mainWindow && mainWindow.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.send('file-changed', fileData);
    }
  } catch (err) {
    logError(`Failed to refresh file from disk: ${filePath}`, err);
  }
});

// Dropped file/folder routed from the renderer by absolute path (the preload
// resolves dragged Files via webUtils.getPathForFile — Electron v32+ removed
// the legacy File.path). A markdown file opens like any native open (real
// file-backed tab: live reload + Reload from disk); a directory becomes a
// full desktop workspace (real paths, relative-link navigation, containment).
ipcMain.on('open-dropped-path', (_event, absPath) => {
  if (typeof absPath !== 'string' || !absPath) return;
  let stats;
  try {
    stats = fs.statSync(absPath);
  } catch (err) {
    logError(`Failed to stat dropped path: ${absPath}`, err);
    return;
  }
  if (stats.isDirectory()) {
    workspaceRoots.add(absPath);
    const files = scanWorkspace(absPath);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('workspace-opened', { root: absPath, files });
    }
    return;
  }
  openFileByPath(absPath);
});

// Session save: renderer sends tab state when it changes
ipcMain.on('save-session', (_event, tabs) => {
  saveSession(tabs);
});

// Renderer's "Restart now" toast asks the shell to install the downloaded update.
ipcMain.on('restart-to-update', () => {
  if (autoUpdaterRef) {
    autoUpdaterRef.quitAndInstall();
  }
});

// Fallback catalog so Appearance → Theme exists before the renderer loads.
// The renderer catalog (markdown-viewer/src/core/visual-theme-catalog.js) is
// the source of truth and replaces this list over `visual-theme-catalog`.
const DEFAULT_VISUAL_THEME_CATALOG = [
  { id: 'default', label: 'Default' },
  { id: 'starfield', label: 'Starfield' },
];
let visualThemeCatalogItems = DEFAULT_VISUAL_THEME_CATALOG.slice();
let currentVisualThemeId = 'default';

function normalizeVisualThemeCatalog(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const next = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!id || !label || !/^[a-z][a-z0-9-]*$/i.test(id) || seen.has(id)) continue;
    seen.add(id);
    next.push({ id, label });
  }
  return next.length > 0 ? next : null;
}

function applyVisualThemeCatalog(raw) {
  const next = normalizeVisualThemeCatalog(raw);
  if (!next) return false;
  visualThemeCatalogItems = next;
  if (!visualThemeCatalogItems.some((theme) => theme.id === currentVisualThemeId)) {
    currentVisualThemeId = visualThemeCatalogItems[0].id;
  }
  if (typeof Menu.getApplicationMenu === 'function' && Menu.getApplicationMenu()) {
    rebuildMenu();
  }
  return true;
}

function buildVisualThemeSubmenu() {
  return visualThemeCatalogItems.map((theme) => ({
    id: 'visual-theme-' + theme.id,
    label: theme.label,
    type: 'radio',
    checked: theme.id === currentVisualThemeId,
    click: () => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('set-visual-theme', theme.id);
      }
    },
  }));
}

// Renderer catalog of named empty-state looks — rebuild Appearance → Theme.
ipcMain.on('visual-theme-catalog', (_event, catalog) => {
  applyVisualThemeCatalog(catalog);
});

// Keep Appearance > Theme radio items in sync with the in-app picker.
ipcMain.on('visual-theme-changed', (_event, themeId) => {
  if (typeof themeId === 'string' && visualThemeCatalogItems.some((theme) => theme.id === themeId)) {
    currentVisualThemeId = themeId;
  }
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  for (const theme of visualThemeCatalogItems) {
    const item = menu.getMenuItemById('visual-theme-' + theme.id);
    if (item) item.checked = theme.id === currentVisualThemeId;
  }
});

// ===========================
// Native Menu
// ===========================
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const recent = getRecentFiles();

  const recentSubmenu = recent.length === 0
    ? [{ label: 'No Recent Files', enabled: false }]
    : [
        ...recent.map((filePath) => ({
          label: path.basename(filePath),
          sublabel: filePath,
          click: () => openFileByPath(filePath),
        })),
        { type: 'separator' },
        {
          label: 'Clear Recent Files',
          click: () => {
            if (store) store.set('recentFiles', []);
            rebuildMenu();
          },
        },
      ];

  const template = [
    // macOS app menu
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => showOpenDialog(),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => showOpenFolderDialog(),
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('close-tab');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('trigger-print');
            }
          },
        },
        {
          label: 'Export as PDF...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('trigger-export-pdf');
            }
          },
        },
        ...(isMac ? [] : [
          { type: 'separator' },
          { role: 'quit' },
        ]),
      ],
    },
    // Edit menu (macOS standard)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find...',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('trigger-search');
            }
          },
        },
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Appearance menu
    {
      label: 'Appearance',
      submenu: [
        {
          label: 'Load Custom CSS Theme...',
          click: () => loadCustomCss(),
        },
        {
          label: 'Clear Custom Theme',
          click: () => clearCustomCss(),
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: buildVisualThemeSubmenu(),
        },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
    // Help menu — diagnostics live here so issues are reportable.
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdatesManually(),
        },
        { type: 'separator' },
        {
          label: 'Open Log File',
          click: () => {
            if (!logFilePath) {
              dialog.showMessageBox({
                type: 'info',
                message: 'No log file has been created yet.',
              });
              return;
            }
            // Ensure the file exists so the OS doesn't refuse to open it.
            try {
              if (!fs.existsSync(logFilePath)) {
                fs.writeFileSync(logFilePath, '');
              }
              // shell.openPath returns Promise<string>: '' on success, an
              // error message string on failure. Both arms need handling.
              shell.openPath(logFilePath)
                .then((result) => {
                  if (result) {
                    logError('Failed to open log file', new Error(result));
                  }
                })
                .catch((err) => {
                  logError('Failed to open log file', err);
                });
            } catch (err) {
              logError('Failed to open log file', err);
            }
          },
        },
        {
          label: 'Show Log File In Folder',
          click: () => {
            if (logFilePath && fs.existsSync(logFilePath)) {
              shell.showItemInFolder(logFilePath);
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function rebuildMenu() {
  buildMenu();
}

// ===========================
// App Lifecycle
// ===========================
// Catch-all: surface any unhandled error in the main process so silent
// failures become visible (log + optional dialog once we have one).
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason);
});

// IIFE instead of `app.whenReady().then(...)` so we can await, catch, and
// surface startup errors. Previously a rejection anywhere in the startup
// chain (e.g. electron-store ESM import failure in a packaged build) was
// swallowed silently — which is exactly how recent files and session
// restore "never worked" in shipped DMGs.
(async () => {
  try {
    await app.whenReady();

    initLogFile();
    initStore();
    buildMenu();
    createWindow();
    initAutoUpdater();

    // Global shortcut: Cmd+Shift+M brings SpecDown to front and prompts open
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      if (!mainWindow) {
        createWindow();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        showOpenDialog();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    logError('Startup failed', err);
    try {
      dialog.showErrorBox(
        'SpecDown failed to start',
        String(err && err.message ? err.message : err)
      );
    } catch {
      // Dialog may not be available yet — the log line above is our fallback.
    }
  }
})();

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS: handle files opened via Finder (double-click, drag-to-dock, Open With)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    openFileByPath(filePath);
  } else {
    // Window not ready yet — queue the file
    pendingFilePaths.push(filePath);
  }
});

// Export for testing
module.exports = {
  isValidMarkdownFile,
  armManualUpdateCheck,
  showManualUpdateCheckError,
  readMarkdownFile,
  buildFileMetadata,
  resolveOwnerName,
  buildMenu,
  watchFile,
  unwatchFile,
  watchers,
  scanWorkspace,
  openRelativeFromFile,
  isInsideAnyWorkspace,
  workspaceRoots,
  isSignedUpdatePlatform,
  isValidPrintPayload,
  pdfDefaultName,
  loadPrintableWindow,
  exportPdfFromHtml,
  VALID_EXTENSIONS,
  htmlDocumentsEnabledMain,
  applyVisualThemeCatalog,
  DEFAULT_VISUAL_THEME_CATALOG,
};
