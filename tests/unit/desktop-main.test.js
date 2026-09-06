/**
 * Tests for desktop/main.js — Electron main process logic
 *
 * These tests cover the pure functions exported from main.js:
 * file validation, file reading, and menu construction.
 * Electron APIs are mocked since we run in a Node/jsdom environment.
 */

const path = require('path');
const fs = require('fs');

// Mock chokidar before requiring main.js
jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    close: jest.fn(),
  })),
}));

// Mock Electron modules before requiring main.js
jest.mock('electron', () => ({
  app: {
    name: 'Specdown Desktop',
    // A thenable whose `then` never resolves — the IIFE in main.js awaits
    // this, so its body stays suspended during tests and we can exercise
    // the exported pure functions in isolation.
    whenReady: jest.fn(() => ({ then: jest.fn() })),
    on: jest.fn(),
    quit: jest.fn(),
    getPath: jest.fn(() => '/tmp/specdown-test-userdata'),
    addRecentDocument: jest.fn(),
  },
  BrowserWindow: Object.assign(
    jest.fn(() => ({
      loadFile: jest.fn(() => Promise.resolve()),
      webContents: {
        on: jest.fn(),
        send: jest.fn(),
        // Print pipeline: invoke the completion callback synchronously so
        // cleanup runs within the awaited call.
        print: jest.fn((_opts, cb) => cb && cb(true)),
        printToPDF: jest.fn(() => Promise.resolve(Buffer.from('%PDF-mock'))),
      },
      on: jest.fn(),
      isDestroyed: jest.fn(() => false),
      destroy: jest.fn(),
    })),
    { getAllWindows: jest.fn(() => []) }
  ),
  Menu: {
    buildFromTemplate: jest.fn((template) => template),
    setApplicationMenu: jest.fn(),
    getApplicationMenu: jest.fn(() => null),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showErrorBox: jest.fn(),
    showMessageBox: jest.fn(),
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
  },
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn(),
  },
  shell: {
    openPath: jest.fn(),
    showItemInFolder: jest.fn(),
  },
}));

const os = require('os');

const {
  isValidMarkdownFile,
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
  armManualUpdateCheck,
  showManualUpdateCheckError,
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
} = require('../../desktop/main');

describe('desktop/main.js', () => {
  describe('VALID_EXTENSIONS', () => {
    it('includes .md and .markdown', () => {
      expect(VALID_EXTENSIONS).toContain('.md');
      expect(VALID_EXTENSIONS).toContain('.markdown');
    });

    it('does not include other extensions', () => {
      expect(VALID_EXTENSIONS).not.toContain('.txt');
      expect(VALID_EXTENSIONS).not.toContain('.html');
      expect(VALID_EXTENSIONS).not.toContain('.htm');
    });
  });

  describe('htmlDocumentsEnabledMain', () => {
    const originalFlag = process.env.VITE_HTML_DOCUMENTS;

    afterEach(() => {
      if (originalFlag === undefined) {
        delete process.env.VITE_HTML_DOCUMENTS;
      } else {
        process.env.VITE_HTML_DOCUMENTS = originalFlag;
      }
    });

    it('is off by default', () => {
      delete process.env.VITE_HTML_DOCUMENTS;
      expect(htmlDocumentsEnabledMain()).toBe(false);
    });

    it('is on when VITE_HTML_DOCUMENTS is the string true', () => {
      process.env.VITE_HTML_DOCUMENTS = 'true';
      expect(htmlDocumentsEnabledMain()).toBe(true);
    });

    it('does not open .html even when the flag is on', () => {
      process.env.VITE_HTML_DOCUMENTS = 'true';
      expect(isValidMarkdownFile('/path/to/file.html')).toBe(false);
      expect(isValidMarkdownFile('/path/to/file.htm')).toBe(false);
    });
  });

  describe('isValidMarkdownFile', () => {
    it('returns true for .md files', () => {
      expect(isValidMarkdownFile('/path/to/file.md')).toBe(true);
    });

    it('returns true for .markdown files', () => {
      expect(isValidMarkdownFile('/path/to/file.markdown')).toBe(true);
    });

    it('returns true regardless of case', () => {
      expect(isValidMarkdownFile('/path/to/FILE.MD')).toBe(true);
      expect(isValidMarkdownFile('/path/to/FILE.Markdown')).toBe(true);
    });

    it('returns false for .txt files', () => {
      expect(isValidMarkdownFile('/path/to/file.txt')).toBe(false);
    });

    it('returns false for .html files', () => {
      expect(isValidMarkdownFile('/path/to/file.html')).toBe(false);
    });

    it('returns false for files with no extension', () => {
      expect(isValidMarkdownFile('/path/to/README')).toBe(false);
    });

    it('returns false for .md embedded in the filename', () => {
      expect(isValidMarkdownFile('/path/to/file.md.bak')).toBe(false);
    });
  });

  describe('readMarkdownFile', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');

    it('reads a markdown file and returns filename, filePath, and content', () => {
      // Use an actual fixture file
      const fixturePath = path.join(fixturesDir, 'test-read.md');
      const testContent = '# Test\n\nHello world\n';
      fs.writeFileSync(fixturePath, testContent);

      try {
        const result = readMarkdownFile(fixturePath);
        expect(result.filename).toBe('test-read.md');
        expect(result.filePath).toBe(fixturePath);
        expect(result.content).toBe(testContent);
      } finally {
        fs.unlinkSync(fixturePath);
      }
    });

    it('throws for non-existent files', () => {
      expect(() => {
        readMarkdownFile('/nonexistent/path/file.md');
      }).toThrow();
    });
  });

  describe('resolveOwnerName', () => {
    it('names the current user when the uid matches', () => {
      const me = os.userInfo();
      // Skip on platforms where uid is meaningless (Windows reports -1).
      if (typeof me.uid === 'number' && me.uid >= 0) {
        expect(resolveOwnerName(me.uid)).toBe(me.username);
      }
    });

    it('falls back to the numeric uid for another user', () => {
      const me = os.userInfo();
      const otherUid = typeof me.uid === 'number' && me.uid >= 0 ? me.uid + 1 : 12345;
      expect(resolveOwnerName(otherUid)).toBe(`uid ${otherUid}`);
    });

    it('returns null for a Windows/unknown uid (-1)', () => {
      expect(resolveOwnerName(-1)).toBeNull();
      expect(resolveOwnerName(undefined)).toBeNull();
    });
  });

  describe('buildFileMetadata', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');

    it('returns size, timestamps, and owner for a real file', () => {
      const fixturePath = path.join(fixturesDir, 'test-metadata.md');
      const content = '# Metadata\n\nSome bytes here.\n';
      fs.writeFileSync(fixturePath, content);

      try {
        const meta = buildFileMetadata(fixturePath);
        expect(meta).not.toBeNull();
        expect(meta.filePath).toBe(fixturePath);
        expect(meta.size).toBe(Buffer.byteLength(content));
        expect(typeof meta.birthtimeMs).toBe('number');
        expect(typeof meta.mtimeMs).toBe('number');
        // owner is a string (username or "uid N") on POSIX, or null on Windows.
        expect(meta.owner === null || typeof meta.owner === 'string').toBe(true);
      } finally {
        fs.unlinkSync(fixturePath);
      }
    });

    it('returns null for a non-existent file (no throw across IPC)', () => {
      expect(buildFileMetadata('/nonexistent/path/file.md')).toBeNull();
    });

    it('returns null for an empty or non-string path', () => {
      expect(buildFileMetadata('')).toBeNull();
      expect(buildFileMetadata(undefined)).toBeNull();
    });
  });

  describe('buildMenu', () => {
    const { Menu } = require('electron');

    beforeEach(() => {
      applyVisualThemeCatalog(DEFAULT_VISUAL_THEME_CATALOG);
      Menu.getApplicationMenu.mockReturnValue(null);
      Menu.buildFromTemplate.mockClear();
      Menu.setApplicationMenu.mockClear();
    });

    it('calls Menu.buildFromTemplate and Menu.setApplicationMenu', () => {
      buildMenu();
      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
      expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    });

    it('includes a File menu with Open item', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const fileMenu = template.find(m => m.label === 'File');
      expect(fileMenu).toBeDefined();

      const openItem = fileMenu.submenu.find(item => item.label === 'Open...');
      expect(openItem).toBeDefined();
      expect(openItem.accelerator).toBe('CmdOrCtrl+O');
      expect(typeof openItem.click).toBe('function');
    });

    it('includes File menu Print and Export as PDF items', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const fileMenu = template.find(m => m.label === 'File');

      const printItem = fileMenu.submenu.find(item => item.label === 'Print...');
      expect(printItem).toBeDefined();
      expect(printItem.accelerator).toBe('CmdOrCtrl+P');

      const exportItem = fileMenu.submenu.find(item => item.label === 'Export as PDF...');
      expect(exportItem).toBeDefined();
      expect(exportItem.accelerator).toBe('CmdOrCtrl+Shift+E');
      expect(typeof exportItem.click).toBe('function');
    });

    it('includes a File menu with Close Tab item', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const fileMenu = template.find(m => m.label === 'File');
      const closeItem = fileMenu.submenu.find(item => item.label === 'Close Tab');
      expect(closeItem).toBeDefined();
      expect(closeItem.accelerator).toBe('CmdOrCtrl+W');
    });

    it('includes Edit, View, and Window menus', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.find(m => m.label === 'Edit')).toBeDefined();
      expect(template.find(m => m.label === 'View')).toBeDefined();
      expect(template.find(m => m.label === 'Window')).toBeDefined();
    });

    it('includes an Appearance > Theme submenu with Default and Starfield', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const appearance = template.find(m => m.label === 'Appearance');
      expect(appearance).toBeDefined();
      const themeMenu = appearance.submenu.find(item => item.label === 'Theme');
      expect(themeMenu).toBeDefined();
      const ids = themeMenu.submenu.map(item => item.id);
      expect(ids).toContain('visual-theme-default');
      expect(ids).toContain('visual-theme-starfield');
      expect(themeMenu.submenu.every(item => item.type === 'radio')).toBe(true);
    });

    it('rebuilds Appearance > Theme from a renderer catalog', () => {
      applyVisualThemeCatalog([
        { id: 'default', label: 'Default' },
        { id: 'starfield', label: 'Starfield' },
        { id: 'aurora', label: 'Aurora' },
      ]);
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const appearance = template.find(m => m.label === 'Appearance');
      const themeMenu = appearance.submenu.find(item => item.label === 'Theme');
      expect(themeMenu.submenu.map(item => item.id)).toEqual([
        'visual-theme-default',
        'visual-theme-starfield',
        'visual-theme-aurora',
      ]);
      expect(themeMenu.submenu.map(item => item.label)).toEqual([
        'Default',
        'Starfield',
        'Aurora',
      ]);
    });

    it('ignores an invalid visual theme catalog from the renderer', () => {
      applyVisualThemeCatalog('nope');
      applyVisualThemeCatalog([]);
      applyVisualThemeCatalog([{ id: '!!!', label: 'Bad' }]);
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const appearance = template.find(m => m.label === 'Appearance');
      const themeMenu = appearance.submenu.find(item => item.label === 'Theme');
      expect(themeMenu.submenu.map(item => item.id)).toEqual([
        'visual-theme-default',
        'visual-theme-starfield',
      ]);
    });

    it('includes a Help menu with Open Log File', () => {
      buildMenu();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const helpMenu = template.find(m => m.label === 'Help');
      expect(helpMenu).toBeDefined();

      const openLog = helpMenu.submenu.find(item => item.label === 'Open Log File');
      expect(openLog).toBeDefined();
      expect(typeof openLog.click).toBe('function');
    });
  });

  describe('IPC handlers', () => {
    it('registers request-file-open and close-active-tab handlers', () => {
      const { ipcMain } = require('electron');
      // ipcMain.on is called when main.js is first required (module-level)
      const registeredChannels = ipcMain.on.mock.calls.map(call => call[0]);
      expect(registeredChannels).toContain('request-file-open');
      expect(registeredChannels).toContain('close-active-tab');
    });

    it('registers watch-file and unwatch-file handlers', () => {
      const { ipcMain } = require('electron');
      const registeredChannels = ipcMain.on.mock.calls.map(call => call[0]);
      expect(registeredChannels).toContain('watch-file');
      expect(registeredChannels).toContain('unwatch-file');
      expect(registeredChannels).toContain('refresh-file');
      expect(registeredChannels).toContain('open-dropped-path');
      expect(registeredChannels).toContain('visual-theme-changed');
      expect(registeredChannels).toContain('visual-theme-catalog');
    });

    it('checks Appearance > Theme radios from the live catalog', () => {
      const { ipcMain, Menu } = require('electron');
      const items = {
        'visual-theme-default': { checked: true },
        'visual-theme-starfield': { checked: false },
        'visual-theme-aurora': { checked: false },
      };
      applyVisualThemeCatalog([
        { id: 'default', label: 'Default' },
        { id: 'starfield', label: 'Starfield' },
        { id: 'aurora', label: 'Aurora' },
      ]);
      Menu.getApplicationMenu.mockReturnValue({
        getMenuItemById: (id) => items[id] || null,
      });
      const handler = ipcMain.on.mock.calls.find(
        (call) => call[0] === 'visual-theme-changed'
      )[1];
      handler({}, 'aurora');
      expect(items['visual-theme-default'].checked).toBe(false);
      expect(items['visual-theme-starfield'].checked).toBe(false);
      expect(items['visual-theme-aurora'].checked).toBe(true);
      applyVisualThemeCatalog(DEFAULT_VISUAL_THEME_CATALOG);
      Menu.getApplicationMenu.mockReturnValue(null);
    });

    it('registers a request-open-path handler that ignores non-string paths', () => {
      const { ipcMain } = require('electron');
      const call = ipcMain.on.mock.calls.find(c => c[0] === 'request-open-path');
      expect(call).toBeDefined();
      const handler = call[1];
      // No window is open in this test harness, so a valid path is a safe
      // no-op; the contract we assert is that bad input never throws.
      expect(() => handler({}, undefined)).not.toThrow();
      expect(() => handler({}, '')).not.toThrow();
      expect(() => handler({}, '/tmp/does-not-exist.md')).not.toThrow();
    });

    it('registers request-open-folder and request-open-relative handlers', () => {
      const { ipcMain } = require('electron');
      const channels = ipcMain.on.mock.calls.map(c => c[0]);
      expect(channels).toContain('request-open-folder');
      expect(channels).toContain('request-open-relative');
    });

    it('request-open-relative tolerates malformed payloads', () => {
      const { ipcMain } = require('electron');
      const handler = ipcMain.on.mock.calls.find(c => c[0] === 'request-open-relative')[1];
      expect(() => handler({}, undefined)).not.toThrow();
      expect(() => handler({}, {})).not.toThrow();
      expect(() => handler({}, { fromPath: '', href: '' })).not.toThrow();
      expect(() => handler({}, { fromPath: '/a/b.md', href: '../c.md' })).not.toThrow();
    });

    it('registers the export-pdf handler (printing stays in the renderer)', () => {
      const { ipcMain } = require('electron');
      const channels = ipcMain.on.mock.calls.map(c => c[0]);
      expect(channels).toContain('export-pdf');
      // Printing must NOT round-trip through a hidden shell window: on macOS
      // the print dialog is a sheet attached to its window, so it would never
      // appear. The renderer prints via a hidden iframe instead.
      expect(channels).not.toContain('print-document');
    });
  });

  describe('print / PDF export', () => {
    const { BrowserWindow, dialog, app } = require('electron');

    beforeEach(() => {
      BrowserWindow.mockClear();
      dialog.showSaveDialog = jest.fn();
      // loadPrintableWindow stages the HTML through a temp file under
      // app.getPath('temp') — make sure the mocked path exists.
      fs.mkdirSync(app.getPath('temp'), { recursive: true });
    });

    describe('isValidPrintPayload', () => {
      it('accepts a payload with a non-empty html string', () => {
        expect(isValidPrintPayload({ title: 'x', html: '<!DOCTYPE html>' })).toBe(true);
      });

      it('rejects missing, empty, and non-string html', () => {
        expect(isValidPrintPayload(undefined)).toBe(false);
        expect(isValidPrintPayload(null)).toBe(false);
        expect(isValidPrintPayload({})).toBe(false);
        expect(isValidPrintPayload({ html: '' })).toBe(false);
        expect(isValidPrintPayload({ html: 42 })).toBe(false);
      });
    });

    describe('pdfDefaultName', () => {
      it('derives the PDF name from the document title', () => {
        expect(pdfDefaultName('release-notes.md')).toBe('release-notes.pdf');
        expect(pdfDefaultName('Spec.markdown')).toBe('Spec.pdf');
      });

      it('sanitizes path-hostile characters and falls back to document.pdf', () => {
        expect(pdfDefaultName('a/b:c.md')).toBe('a-b-c.pdf');
        expect(pdfDefaultName('')).toBe('document.pdf');
        expect(pdfDefaultName(undefined)).toBe('document.pdf');
      });
    });

    describe('loadPrintableWindow', () => {
      it('stages the HTML in an offscreen sandboxed window and cleans up fully', async () => {
        const { printWindow, cleanup } = await loadPrintableWindow('<!DOCTYPE html><p>hi</p>');

        expect(BrowserWindow).toHaveBeenCalledTimes(1);
        const opts = BrowserWindow.mock.calls[0][0];
        expect(opts.show).toBe(false);
        expect(opts.webPreferences.sandbox).toBe(true);
        expect(opts.webPreferences.nodeIntegration).toBe(false);
        expect(printWindow.loadFile).toHaveBeenCalledTimes(1);

        // The staged temp file exists until cleanup, then is removed.
        const tempHtmlPath = printWindow.loadFile.mock.calls[0][0];
        expect(fs.existsSync(tempHtmlPath)).toBe(true);
        cleanup();
        expect(printWindow.destroy).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(tempHtmlPath)).toBe(false);
      });
    });

    describe('exportPdfFromHtml', () => {
      it('is a safe no-op when no main window exists (guards before the dialog)', async () => {
        // The test harness never runs createWindow, so mainWindow is null —
        // the export must bail out before showing any dialog.
        await expect(
          exportPdfFromHtml({ title: 'spec.md', html: '<!DOCTYPE html><p>hi</p>' })
        ).resolves.toBeUndefined();
        expect(dialog.showSaveDialog).not.toHaveBeenCalled();
        expect(BrowserWindow).not.toHaveBeenCalled();
      });

      it('ignores invalid payloads', async () => {
        await exportPdfFromHtml({});
        expect(dialog.showSaveDialog).not.toHaveBeenCalled();
      });
    });
  });

  describe('scanWorkspace', () => {
    let root;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'specdown-ws-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('collects markdown files recursively with relative paths, sorted', () => {
      fs.writeFileSync(path.join(root, 'b.md'), 'b');
      fs.mkdirSync(path.join(root, 'docs'));
      fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'a');
      fs.writeFileSync(path.join(root, 'note.txt'), 'ignored');

      const files = scanWorkspace(root);
      expect(files.map(f => f.relPath)).toEqual(['b.md', path.join('docs', 'a.md')]);

      const b = files.find(f => f.name === 'b.md');
      expect(b.path).toBe(path.join(root, 'b.md'));
    });

    it('skips noisy directories like node_modules, .git, and dist', () => {
      for (const dir of ['node_modules', '.git', 'dist']) {
        fs.mkdirSync(path.join(root, dir));
        fs.writeFileSync(path.join(root, dir, 'x.md'), 'x');
      }
      fs.writeFileSync(path.join(root, 'keep.md'), 'k');

      const files = scanWorkspace(root);
      expect(files.map(f => f.name)).toEqual(['keep.md']);
    });
  });

  describe('file watching', () => {
    const chokidar = require('chokidar');

    beforeEach(() => {
      // Clear watchers map and reset mocks between tests
      watchers.clear();
      chokidar.watch.mockClear();
      chokidar.watch.mockReturnValue({
        on: jest.fn().mockReturnThis(),
        close: jest.fn(),
      });
    });

    afterEach(() => {
      // Route cleanup through unwatchFile so the internal dirWatchers
      // map also gets cleared between tests (entries in `watchers` are
      // metadata, not chokidar watchers).
      [...watchers.keys()].forEach((filePath) => unwatchFile(filePath));
      watchers.clear();
    });

    describe('watchFile', () => {
      it('creates a chokidar watcher for the parent directory of the file', () => {
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };
        watchFile('/path/to/file.md', mockWebContents);

        // We watch the parent dir (not the file) so atomic renames don't
        // orphan the watcher on the old inode.
        expect(chokidar.watch).toHaveBeenCalledWith('/path/to', expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
          depth: 0,
        }));
        expect(watchers.has('/path/to/file.md')).toBe(true);
      });

      it('does not create a second watcher for the same path', () => {
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };
        watchFile('/path/to/file.md', mockWebContents);
        watchFile('/path/to/file.md', mockWebContents);

        expect(chokidar.watch).toHaveBeenCalledTimes(1);
        expect(watchers.size).toBe(1);
      });

      it('registers change, add, and error handlers on the watcher', () => {
        const mockWatcher = { on: jest.fn().mockReturnThis(), close: jest.fn() };
        chokidar.watch.mockReturnValue(mockWatcher);
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

        watchFile('/path/to/file.md', mockWebContents);

        // 'change' for in-place edits; 'add' catches atomic saves (where the
        // editor replaces the file via rename and chokidar sees it as a new
        // add event on the post-rename inode).
        const registeredEvents = mockWatcher.on.mock.calls.map((call) => call[0]);
        expect(registeredEvents).toContain('change');
        expect(registeredEvents).toContain('add');
        expect(registeredEvents).toContain('error');
      });

      it('can watch multiple different paths', () => {
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };
        watchFile('/path/to/a.md', mockWebContents);
        watchFile('/other/dir/b.md', mockWebContents);

        expect(watchers.size).toBe(2);
        expect(watchers.has('/path/to/a.md')).toBe(true);
        expect(watchers.has('/other/dir/b.md')).toBe(true);
      });

      it('reuses a single chokidar watcher for files in the same directory', () => {
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };
        watchFile('/shared/dir/a.md', mockWebContents);
        watchFile('/shared/dir/b.md', mockWebContents);

        // One OS-level watch on the parent dir serves both files.
        expect(chokidar.watch).toHaveBeenCalledTimes(1);
        expect(chokidar.watch).toHaveBeenCalledWith('/shared/dir', expect.any(Object));
        expect(watchers.size).toBe(2);
      });

      describe('SPECDOWN_WATCH_POLLING env var', () => {
        const originalEnv = process.env.SPECDOWN_WATCH_POLLING;

        afterEach(() => {
          if (originalEnv === undefined) {
            delete process.env.SPECDOWN_WATCH_POLLING;
          } else {
            process.env.SPECDOWN_WATCH_POLLING = originalEnv;
          }
        });

        it('enables chokidar polling when SPECDOWN_WATCH_POLLING=1', () => {
          process.env.SPECDOWN_WATCH_POLLING = '1';
          const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

          watchFile('/path/to/file.md', mockWebContents);

          expect(chokidar.watch).toHaveBeenCalledWith('/path/to', expect.objectContaining({
            usePolling: true,
            interval: 500,
          }));
        });

        it('does not enable polling when the env var is unset', () => {
          delete process.env.SPECDOWN_WATCH_POLLING;
          const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

          watchFile('/path/to/file.md', mockWebContents);

          const options = chokidar.watch.mock.calls[0][1];
          expect(options.usePolling).toBe(false);
          expect(options.interval).toBeUndefined();
        });

        it('does not enable polling for other truthy values', () => {
          // Only the exact string '1' flips the switch — prevents accidental
          // activation via e.g. `SPECDOWN_WATCH_POLLING=true`.
          process.env.SPECDOWN_WATCH_POLLING = 'true';
          const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

          watchFile('/path/to/file.md', mockWebContents);

          const options = chokidar.watch.mock.calls[0][1];
          expect(options.usePolling).toBe(false);
        });
      });
    });

    describe('unwatchFile', () => {
      it('closes the watcher and removes it from the map', () => {
        const mockWatcher = { on: jest.fn().mockReturnThis(), close: jest.fn() };
        chokidar.watch.mockReturnValue(mockWatcher);
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

        watchFile('/path/to/file.md', mockWebContents);
        expect(watchers.has('/path/to/file.md')).toBe(true);

        unwatchFile('/path/to/file.md');

        expect(mockWatcher.close).toHaveBeenCalledTimes(1);
        expect(watchers.has('/path/to/file.md')).toBe(false);
      });

      it('keeps the shared dir watcher alive while other files in it are watched', () => {
        const mockWatcher = { on: jest.fn().mockReturnThis(), close: jest.fn() };
        chokidar.watch.mockReturnValue(mockWatcher);
        const mockWebContents = { isDestroyed: jest.fn(() => false), send: jest.fn() };

        watchFile('/shared/dir/a.md', mockWebContents);
        watchFile('/shared/dir/b.md', mockWebContents);

        unwatchFile('/shared/dir/a.md');
        // One file in /shared/dir is still being watched, so the underlying
        // chokidar watcher must stay open.
        expect(mockWatcher.close).not.toHaveBeenCalled();
        expect(watchers.has('/shared/dir/b.md')).toBe(true);

        unwatchFile('/shared/dir/b.md');
        // Last file gone → watcher closes.
        expect(mockWatcher.close).toHaveBeenCalledTimes(1);
      });

      it('does nothing if the path is not being watched', () => {
        expect(() => unwatchFile('/not/watched.md')).not.toThrow();
      });
    });
  });

  describe('manual update-check error dialog', () => {
    const { dialog } = require('electron');

    beforeEach(() => {
      dialog.showMessageBox.mockClear();
    });

    it('shows exactly one dialog when both updater error paths fire', () => {
      // electron-updater reports one failure via BOTH the 'error' event and
      // the rejected checkForUpdates() promise; the flag dedupes them.
      armManualUpdateCheck();
      showManualUpdateCheckError(new Error('boom'));
      showManualUpdateCheckError(new Error('boom'));
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    });

    it('stays silent for background (non-manual) check errors', () => {
      showManualUpdateCheckError(new Error('boom'));
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('explains the still-packaging window for update-feed 404s', () => {
      armManualUpdateCheck();
      showManualUpdateCheckError(
        new Error(
          'Cannot find latest-mac.yml in the latest release artifacts ' +
            '(https://github.com/x/y/releases/download/v1/latest-mac.yml): HttpError: 404'
        )
      );
      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
      const arg = dialog.showMessageBox.mock.calls[0][0];
      expect(arg.type).toBe('info');
      expect(arg.detail).toMatch(/few minutes/i);
    });

    it('keeps the generic error dialog for non-404 failures', () => {
      armManualUpdateCheck();
      showManualUpdateCheckError(new Error('net::ERR_CONNECTION_REFUSED'));
      const arg = dialog.showMessageBox.mock.calls[0][0];
      expect(arg.type).toBe('error');
      expect(arg.detail).toMatch(/CONNECTION_REFUSED/);
    });
  });

  describe('electron-builder artifact names', () => {
    it('contain no spaces (GitHub rewrites spaces to dots, breaking the update feed URLs)', () => {
      // Root cause of the "Cannot download ...-universal-mac.zip, status 404"
      // update failure: electron-builder's feed (latest-mac.yml) hyphenates
      // spaces in artifact names while GitHub's asset store dots them, so any
      // space in an artifactName makes every auto-update download 404.
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
      );
      const names = [
        pkg.build.artifactName,
        pkg.build.mac && pkg.build.mac.artifactName,
        pkg.build.nsis && pkg.build.nsis.artifactName,
        pkg.build.linux && pkg.build.linux.artifactName,
      ];
      for (const name of names) {
        expect(typeof name).toBe('string');
        expect(name).not.toMatch(/ /);
      }
    });
  });

  describe('open-dropped-path routing', () => {
    const { app, ipcMain } = require('electron');
    const getHandler = () =>
      ipcMain.on.mock.calls.find((c) => c[0] === 'open-dropped-path')[1];
    let dropDir;

    beforeEach(() => {
      dropDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specdown-drop-'));
      fs.writeFileSync(path.join(dropDir, 'notes.md'), '# Notes');
      workspaceRoots.clear();
      app.addRecentDocument.mockClear();
    });

    afterEach(() => {
      workspaceRoots.clear();
      fs.rmSync(dropDir, { recursive: true, force: true });
    });

    it('opens a dropped markdown file like a native open (recents recorded)', () => {
      getHandler()(null, path.join(dropDir, 'notes.md'));
      expect(app.addRecentDocument).toHaveBeenCalledWith(path.join(dropDir, 'notes.md'));
      // A plain file must not be registered as a workspace root.
      expect(workspaceRoots.size).toBe(0);
    });

    it('registers a dropped directory as a workspace root (relative-link containment)', () => {
      getHandler()(null, dropDir);
      expect(workspaceRoots.has(dropDir)).toBe(true);
      expect(app.addRecentDocument).not.toHaveBeenCalled();
    });

    it('ignores non-string and nonexistent paths', () => {
      expect(() => getHandler()(null, 42)).not.toThrow();
      expect(() => getHandler()(null, path.join(dropDir, 'missing.md'))).not.toThrow();
      expect(app.addRecentDocument).not.toHaveBeenCalled();
      expect(workspaceRoots.size).toBe(0);
    });
  });

  describe('auto-update signing gate', () => {
    // electron-updater performs no signature verification for unsigned apps,
    // so auto-update must stay restricted to platforms we actually sign.
    it('allows auto-update only on macOS (the signed platform)', () => {
      expect(isSignedUpdatePlatform('darwin')).toBe(true);
      expect(isSignedUpdatePlatform('win32')).toBe(false);
      expect(isSignedUpdatePlatform('linux')).toBe(false);
      expect(isSignedUpdatePlatform(undefined)).toBe(false);
    });
  });

  describe('workspace relative-link containment', () => {
    const { app } = require('electron');
    const path = require('path');
    let wsRoot;
    let outsideDir;

    beforeEach(() => {
      wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specdown-ws-'));
      outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specdown-outside-'));
      fs.mkdirSync(path.join(wsRoot, 'sub'));
      fs.writeFileSync(path.join(wsRoot, 'a.md'), '# A');
      fs.writeFileSync(path.join(wsRoot, 'sub', 'b.md'), '# B');
      fs.writeFileSync(path.join(outsideDir, 'secret.md'), '# Secret');
      workspaceRoots.clear();
      app.addRecentDocument.mockClear();
    });

    afterEach(() => {
      workspaceRoots.clear();
      fs.rmSync(wsRoot, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    describe('isInsideAnyWorkspace', () => {
      it('accepts the root itself and nested paths', () => {
        workspaceRoots.add(wsRoot);
        expect(isInsideAnyWorkspace(wsRoot)).toBe(true);
        expect(isInsideAnyWorkspace(path.join(wsRoot, 'sub', 'b.md'))).toBe(true);
      });

      it('rejects paths outside every root, including sibling-prefix dirs', () => {
        workspaceRoots.add(wsRoot);
        expect(isInsideAnyWorkspace(path.join(outsideDir, 'secret.md'))).toBe(false);
        // `/ws-evil` must not pass as inside `/ws` via naive prefix matching.
        expect(isInsideAnyWorkspace(wsRoot + '-evil')).toBe(false);
      });

      it('rejects everything when no workspace is open', () => {
        expect(isInsideAnyWorkspace(path.join(wsRoot, 'a.md'))).toBe(false);
      });
    });

    describe('openRelativeFromFile', () => {
      // openFileByPath feeds every successful open into the OS recents via
      // app.addRecentDocument (mocked) — use that as the observable outcome.
      it('opens a relative .md inside the workspace', () => {
        workspaceRoots.add(wsRoot);
        openRelativeFromFile(path.join(wsRoot, 'a.md'), './sub/b.md');
        expect(app.addRecentDocument).toHaveBeenCalledWith(path.join(wsRoot, 'sub', 'b.md'));
      });

      it('blocks traversal that escapes the workspace root', () => {
        workspaceRoots.add(wsRoot);
        const escape = path.relative(wsRoot, outsideDir); // e.g. ../specdown-outside-xyz
        openRelativeFromFile(path.join(wsRoot, 'a.md'), escape + '/secret.md');
        expect(app.addRecentDocument).not.toHaveBeenCalled();
      });

      it('blocks relative opens when no workspace is open', () => {
        openRelativeFromFile(path.join(wsRoot, 'a.md'), './sub/b.md');
        expect(app.addRecentDocument).not.toHaveBeenCalled();
      });
    });
  });
});

describe('Bookmark file reads', () => {
  const { ipcMain } = require('electron');
  const readBookmark = ipcMain.handle.mock.calls.find(([channel]) => channel === 'read-bookmarked-file')[1];
  const frame = {};
  const event = { senderFrame: frame, sender: { mainFrame: frame } };

  afterEach(() => {
    fs.promises.stat.mockRestore?.();
    fs.promises.readFile.mockRestore?.();
  });

  it('returns the current file content with a real path', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true, size: 10 });
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue('# Updated');
    await expect(readBookmark(event, '/tmp/bookmark.md')).resolves.toEqual({
      filePath: '/tmp/bookmark.md', filename: 'bookmark.md', content: '# Updated',
    });
  });

  it('returns null when a bookmarked file has moved or is inaccessible', async () => {
    jest.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));
    await expect(readBookmark(event, '/tmp/missing.md')).resolves.toBeNull();
  });

  it('rejects subframe requests and invalid file types before reading', async () => {
    const read = jest.spyOn(fs.promises, 'stat');
    await expect(readBookmark({ ...event, senderFrame: {} }, '/tmp/a.md')).resolves.toBeNull();
    await expect(readBookmark(event, '/tmp/a.html')).resolves.toBeNull();
    await expect(readBookmark(event, 'relative.md')).resolves.toBeNull();
    await expect(readBookmark(event, null)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects directories and oversized files', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValueOnce({ isFile: () => false, size: 0 })
      .mockResolvedValueOnce({ isFile: () => true, size: 9 * 1024 * 1024 });
    await expect(readBookmark(event, '/tmp/folder.md')).resolves.toBeNull();
    await expect(readBookmark(event, '/tmp/large.md')).resolves.toBeNull();
  });
});
