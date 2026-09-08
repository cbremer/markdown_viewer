// @ts-check
// SpecDown — shared viewer entry point.
//
// Phase 1 (modernization roadmap): the viewer is an ES-module graph bundled by
// Vite, split into core/features/platform modules. This entry keeps the render
// core (`renderMarkdown`), the event-wiring hub, and the init() DI wiring; the
// cohesive features live in their own modules. `marked` and `DOMPurify` are used
// directly by the render core here; the heavy `mermaid` engine is loaded on
// demand by the diagram module (see core/render-config.js `loadMermaid`).
import { marked } from 'marked';
import DOMPurify from 'dompurify';
// Side-effect import of a highlight.js theme; Vite resolves it at build time.
// TypeScript 6+ reports TS2882 for an untyped side-effect import (the .css file
// resolves physically but has no type declaration), so suppress it here.
// @ts-expect-error -- no type declaration for the CSS module
import 'highlight.js/styles/github-dark.css';

// Internal modules (Phase 1 split — extracting cohesive units out of this entry).
import { isDesktop, isIOSNative } from './core/platform.js';
import { htmlDocumentsEnabled } from './core/html-flag.js';
import { state } from './core/state.js';
import { revealHtmlComments } from './core/utils.js';
import { configureMarked } from './core/render-config.js';
import {
  handleFile,
  handleFileSelect,
  handleUrl,
  configureFileLoading,
} from './features/file-loading.js';
import {
  openSearch,
  closeSearch,
  runSearch,
  navigateSearch,
  clearSearchHighlights,
} from './features/search.js';
import {
  toggleAnnotationMode,
  renderAnnotations,
  toggleAnnotationPanel,
} from './features/annotations.js';
import {
  processMermaidDiagrams,
  reRenderMermaidDiagrams,
  closeFullscreen,
} from './features/diagrams.js';
import {
  setupIOSNativeUI,
  syncIOSChrome,
  requestNativeOpenIfAvailable,
  requestBundledSampleIfAvailable,
  performPrint,
} from './platform/ios-chrome.js';
import {
  buildToc,
  toggleToc,
  scheduleTocActiveHeadingUpdate,
} from './features/toc.js';
import {
  toggleSplitView,
  updateSplitRawPane,
} from './features/split-view.js';
import {
  setupTheme,
  toggleTheme,
  configureTheme,
} from './features/theme.js';
import { setupVisualTheme } from './features/starfield.js';
import {
  toggleViewMode,
  updateViewToggleButton,
  configureViewMode,
} from './features/view-mode.js';
import {
  checkForDiagramLink,
  configureShareLinks,
} from './features/share-links.js';
import { configureBookmarks, setupBookmarks } from './features/bookmarks.js';
import { createTab, switchTab, configureTabs } from './features/tabs.js';
import { showToast } from './features/toast.js';
import {
  setupToolbarOverflow,
} from './features/toolbar-overflow.js';
import { registerServiceWorker, registerFileHandlerLaunchConsumer } from './features/pwa.js';
import {
  startPresentation,
  hasPresentableDiagrams,
} from './features/presentation.js';
import {
  configureRecentFiles,
  renderRecentFiles,
  clearRecentFiles,
  restoreLastSession,
} from './features/recent-files.js';
import { enhanceCodeBlocks } from './features/code-copy.js';
import {
  setupComments,
  refreshCommentsUI,
} from './features/comments.js';
import {
  setupWorkspace,
  renderWorkspaceSidebar,
  hasWorkspace,
  configureWorkspace,
} from './features/workspace.js';
import {
  setupDesktopIPC,
  updateWatchToggle,
  saveDesktopSession,
  startWatchingFilePath,
  stopWatchingFilePath,
  configureDesktop,
} from './platform/desktop.js';
import { bridgeRequestOpenPath } from './platform/bridge.js';
import { registerAppCommands } from './features/app-commands.js';
import { setupVersionInfo, checkForUpdates } from './features/version-check.js';
import { setupDragAndDrop } from './features/drag-drop.js';
import { setupGlobalKeyboardShortcuts } from './features/keyboard.js';
import { setupIOSEventListeners } from './platform/ios-wiring.js';
import {
  configureLanding,
  setupWebLanding,
  isLandingDropClickIgnored,
  openLandingBundledSample,
} from './features/landing.js';

// ===========================
// Constants
// ===========================
const APP_VERSION = '0.0.190';
const APP_VERSION_LABEL = 'alpha';
const SOURCE_REPO = 'cbremer/specdown';
const SOURCE_REPO_URL = 'https://github.com/' + SOURCE_REPO;

// ===========================
// Global State
// ===========================

// ===========================
// DOM Elements
// ===========================
const $ = (/** @type {string} */ id) => document.getElementById(id);
// `req` is for elements the app assumes always exist (used unguarded below); it
// casts the null away. At runtime a missing element throws on first use, exactly
// as before this typing pass.
const req = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const dropZone = req('drop-zone');
const fileInput = req('file-input');
const browseButton = req('browse-button');
const openSampleBasic = $('open-sample-basic');
const openSampleMermaid = $('open-sample-mermaid');
const contentArea = req('content-area');
const markdownContent = req('markdown-content');
const fileName = req('file-name');
const themeToggle = req('theme-toggle');
// The fullscreen overlay carries expando properties set by features/diagrams.js.
const fullscreenOverlay = /** @type {HTMLElement & { panzoomInstance?: any, fullscreenState?: { homeState: { scale: number, x: number, y: number } } }} */ (
    document.getElementById('fullscreen-overlay')
);
const viewToggle = req('view-toggle');
const urlInput = /** @type {HTMLInputElement | null} */ ($('url-input'));
const openUrlBtn = $('open-url-btn');
const tocToggle = $('toc-toggle');
const annotationToggle = $('annotation-toggle');
const annotationListToggle = $('annotation-list-toggle');
const annotationPanelClose = $('annotation-panel-close');
const splitToggle = $('split-toggle');
const printButton = $('print-button');
const presentButton = $('present-button');
const workspaceToggle = $('workspace-toggle');
const searchInput = /** @type {HTMLInputElement | null} */ ($('search-input'));
const searchPrev = $('search-prev');
const searchNext = $('search-next');
const searchClose = $('search-close');
const iosPresentButton = /** @type {HTMLButtonElement | null} */ ($('ios-present-button'));

// ===========================
// Initialization
// ===========================
function init() {
    // Keep the helper in the module graph so Vite cannot DCE it.
    // Session 01 gates open paths on this; Session 00 does not.
    const htmlDocumentsEnabledAtBoot = htmlDocumentsEnabled();
    void htmlDocumentsEnabledAtBoot;
    configureTheme({ reRenderDiagrams: () => reRenderMermaidDiagrams() });
    configureFileLoading({
        createTab: (/** @type {string} */ filename, /** @type {string} */ content, /** @type {string | null} */ filePath, /** @type {import('./core/state.js').TabSourceMeta | null} */ sourceMeta) =>
            createTab(filename, content, filePath, sourceMeta),
    });
    configureLanding({
        createTab: (/** @type {string} */ filename, /** @type {string} */ content, /** @type {string | null} */ filePath, /** @type {import('./core/state.js').TabSourceMeta | null} */ sourceMeta) =>
            createTab(filename, content, filePath, sourceMeta),
    });
    configureShareLinks({
        createTab: (/** @type {string} */ filename, /** @type {string} */ md) => createTab(filename, md),
    });
    configureViewMode({
        renderMarkdown: (/** @type {string} */ content, /** @type {string} */ title) => renderMarkdown(content, title),
    });
    configureTabs({
        renderMarkdown: (/** @type {string} */ content, /** @type {string} */ title) => renderMarkdown(content, title),
        updateWatchToggle: () => updateWatchToggle(),
        saveDesktopSession: () => saveDesktopSession(),
        startWatchingFilePath: (/** @type {string | null} */ filePath) => startWatchingFilePath(filePath),
        stopWatchingFilePath: (/** @type {string | null} */ filePath) => stopWatchingFilePath(filePath),
    });
    configureDesktop({
        renderMarkdown: (/** @type {string} */ content, /** @type {string} */ title) => renderMarkdown(content, title),
    });
    configureRecentFiles({ onSelect: (entry) => openRecentEntry(entry) });
    configureWorkspace({
        openFile: (/** @type {string} */ name, /** @type {string} */ content) => createTab(name, content, null),
    });
    configureBookmarks({ createTab, switchTab });
    setupBookmarks();
    registerAppCommands();
    setupVersionInfo(APP_VERSION, APP_VERSION_LABEL);
    setupTheme();
    setupVisualTheme();
    setupIOSNativeUI();
    setupWebLanding();
    setupToolbarOverflow();
    setupRecentFiles();
    setupWorkspace();
    setupComments();
    setupEventListeners();
    configureMarked();
    checkForUpdates({ version: APP_VERSION, repo: SOURCE_REPO, repoUrl: SOURCE_REPO_URL });
    checkForDiagramLink();
    registerServiceWorker();
    // Open .md/.markdown files launched via the OS "Open with" on an installed PWA.
    registerFileHandlerLaunchConsumer((/** @type {File} */ file) => handleFile(file));
    // Session restore (web only): reopen the last document on launch, unless a
    // shared diagram link already opened something. The native shells manage
    // their own session, so they're excluded.
    if (!isDesktop && !isIOSNative && state.tabs.length === 0) {
        restoreLastSession();
    }
    if (isDesktop) {
        setupDesktopIPC();
    }
}

// ===========================
// Recent Files
// ===========================
// Re-open a recents entry: URLs re-fetch via handleUrl; desktop file paths are
// re-read by the Electron main process over the requestOpenPath bridge.
/** @param {import('./features/recent-files.js').RecentEntry} entry */
function openRecentEntry(entry) {
    if (entry.type === 'path') {
        bridgeRequestOpenPath(entry.ref);
        return;
    }
    handleUrl(entry.ref);
}

function setupRecentFiles() {
    renderRecentFiles();
    const clearBtn = $('recent-files-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearRecentFiles();
            renderRecentFiles();
        });
    }
}

// iOS API: called by Swift shell to load a file (Session 2+)
window.loadFileContent = function(content, filename) {
    createTab(filename, content);
};


// ===========================
// Event Listeners
// ===========================
function setupEventListeners() {
    // Browse button - stopPropagation prevents the dropZone click handler
    // from calling fileInput.click() a second time (button is inside drop-zone-content)
    browseButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (requestNativeOpenIfAvailable()) return;
        fileInput.click();
    });

    if (openSampleBasic) {
        openSampleBasic.addEventListener('click', (e) => {
            e.stopPropagation();
            if (requestBundledSampleIfAvailable('sample.md')) return;
            void openLandingBundledSample('sample.md');
        });
    }

    if (openSampleMermaid) {
        openSampleMermaid.addEventListener('click', (e) => {
            e.stopPropagation();
            if (requestBundledSampleIfAvailable('diagram-showcase.md')) return;
            void openLandingBundledSample('diagram-showcase.md');
        });
    }

    const openWebShowcase = $('open-web-showcase');
    if (openWebShowcase) {
        openWebShowcase.addEventListener('click', (e) => {
            e.stopPropagation();
            if (requestBundledSampleIfAvailable('diagram-showcase.md')) return;
            void openLandingBundledSample('diagram-showcase.md');
        });
    }

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    dropZone.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (isLandingDropClickIgnored(target)) return;
        if (e.target === dropZone || (target && target.closest('.drop-zone-content'))) {
            if (requestNativeOpenIfAvailable()) return;
            fileInput.click();
        }
    });

    setupDragAndDrop();

    // Color scheme (light/dark/auto). Visual theme dropdown is bound in
    // setupVisualTheme(); iOS also has a sheet action that cycles looks.
    themeToggle.addEventListener('click', toggleTheme);

    // View toggle (preview/raw)
    viewToggle.addEventListener('click', toggleViewMode);

    // TOC toggle
    if (tocToggle) {
        tocToggle.addEventListener('click', () => toggleToc());
    }

    // Annotation toggle (sync iOS chrome after toggling)
    if (annotationToggle) {
        annotationToggle.addEventListener('click', () => {
            toggleAnnotationMode();
            syncIOSChrome();
        });
    }

    // Annotations list panel (toggle button + close button)
    if (annotationListToggle) {
        annotationListToggle.addEventListener('click', () => toggleAnnotationPanel());
    }
    if (annotationPanelClose) {
        annotationPanelClose.addEventListener('click', () => toggleAnnotationPanel());
    }

    // Split view toggle
    if (splitToggle) {
        splitToggle.addEventListener('click', toggleSplitView);
    }

    // Print button
    if (printButton) {
        printButton.addEventListener('click', performPrint);
    }

    // Search button (visible affordance for Cmd/Ctrl+F)
    const searchButton = $('search-button');
    if (searchButton) {
        searchButton.addEventListener('click', () => openSearch());
    }

    // Present button (shown only when the document has diagrams)
    if (presentButton) {
        presentButton.addEventListener('click', () => startPresentation());
    }

    setupIOSEventListeners();

    // Search bar events
    if (searchInput) {
        searchInput.addEventListener('input', () => runSearch(searchInput.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.shiftKey ? navigateSearch(-1) : navigateSearch(1);
            } else if (e.key === 'Escape') {
                closeSearch();
            }
        });
    }
    if (searchPrev) searchPrev.addEventListener('click', () => navigateSearch(-1));
    if (searchNext) searchNext.addEventListener('click', () => navigateSearch(1));
    if (searchClose) searchClose.addEventListener('click', closeSearch);

    // Fullscreen overlay close
    fullscreenOverlay.addEventListener('click', (e) => {
        if (e.target === fullscreenOverlay) {
            closeFullscreen();
        }
    });

    setupGlobalKeyboardShortcuts();

    // URL input. The fetch can be slow (remote host, big repo scan), so the
    // Open button carries a busy state — without it the flow reads as frozen.
    const openUrlWithBusyState = async (/** @type {string} */ url) => {
        const btn = /** @type {HTMLButtonElement | null} */ (openUrlBtn);
        if (!btn) {
            await handleUrl(url);
            return;
        }
        if (btn.disabled) return; // already loading — ignore re-clicks
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Opening…';
        btn.setAttribute('aria-busy', 'true');
        try {
            await handleUrl(url);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.removeAttribute('aria-busy');
        }
    };
    if (openUrlBtn) {
        openUrlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openUrlWithBusyState(urlInput ? urlInput.value.trim() : '');
        });
    }
    if (urlInput) {
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') openUrlWithBusyState(urlInput.value.trim());
        });
        urlInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // TOC scroll spy
    markdownContent.addEventListener('scroll', scheduleTocActiveHeadingUpdate);
}


// ===========================
// Markdown Rendering
// ===========================
/**
 * @param {string} content
 * @param {string} filename
 */
async function renderMarkdown(content, filename) {
    try {
        // Store raw markdown for toggle
        state.currentRawMarkdown = content;
        state.currentViewMode = 'preview';
        updateViewToggleButton();

        // Parse markdown to HTML (synchronous: marked.parse returns a string here)
        const htmlContent = /** @type {string} */ (marked.parse(content));

        // Update UI
        fileName.textContent = filename;
        // Keep HTML comment nodes through sanitization (`#comment`) so they can
        // be revealed below — DOMPurify strips them by default, which silently
        // dropped authored `<!-- … -->` content from the preview.
        markdownContent.innerHTML = DOMPurify.sanitize(htmlContent, { ADD_TAGS: ['#comment'] });

        // Reveal authored HTML comments as styled blocks, then sync the toggle.
        revealHtmlComments(markdownContent);
        refreshCommentsUI();

        // Add copy buttons to code blocks
        enhanceCodeBlocks(markdownContent);

        // Show content area, hide drop zone
        dropZone.style.display = 'none';
        contentArea.style.display = 'flex';
        syncIOSChrome();

        // Process mermaid diagrams
        await processMermaidDiagrams();

        // Reveal the Present entry points (desktop toolbar + iPhone action sheet)
        // only when there are diagrams to present.
        const canPresent = hasPresentableDiagrams();
        if (presentButton) {
            presentButton.style.display = canPresent ? '' : 'none';
        }
        if (iosPresentButton) {
            iosPresentButton.style.display = canPresent ? '' : 'none';
        }

        // Reveal the workspace Files toggle when a folder is loaded, and refresh
        // the sidebar so the active file is highlighted.
        if (workspaceToggle) {
            workspaceToggle.style.display = hasWorkspace() ? '' : 'none';
        }
        renderWorkspaceSidebar();

        // Refresh TOC
        buildToc();

        // Update split raw pane if active
        if (state.splitViewActive) {
            updateSplitRawPane(content);
        }

        // Clear any active search
        clearSearchHighlights();

        // Render annotations for this document (re-arms handlers if active)
        renderAnnotations(filename);

        // Scroll to top
        markdownContent.scrollTop = 0;
        syncIOSChrome();

    } catch (error) {
        console.error('Error rendering markdown:', error);
        showToast('Error rendering markdown content. Please check the file format.', { type: 'error' });
    }
}


// ===========================
// Feature: Print / PDF Export
// ===========================
// Print button wired in setupEventListeners; Cmd+P wired in keydown handler.
// All surfaces print the standalone document from buildPrintableDocument()
// (platform/ios-chrome.js): iOS via the native print controller, desktop and
// web via a hidden iframe in the visible window (the macOS print dialog is a
// window-attached sheet, so it must originate there); desktop also has
// File > Export as PDF via an offscreen shell window + printToPDF. The
// @media print CSS is only the bare-window.print() fallback.

// ===========================
// Initialize App
// ===========================
init();
