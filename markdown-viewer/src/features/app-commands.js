// @ts-check
// The app's command-palette registry: every user-facing action, registered
// against the palette (features/command-palette.js). Extracted from main.js in
// the Wave C decomposition — this module owns WHAT the commands are; the
// palette owns how they're presented.

import { bookmarkCurrentFile, openBookmarks } from './bookmarks.js';
import { isDesktop } from '../core/platform.js';
import { registerCommands } from './command-palette.js';
import {
  requestNativeOpenIfAvailable,
  performPrint,
  syncIOSChrome,
} from '../platform/ios-chrome.js';
import { openWorkspaceFolder } from './workspace.js';
import { toggleTheme } from './theme.js';
import { toggleViewMode } from './view-mode.js';
import { toggleToc } from './toc.js';
import { toggleComments } from './comments.js';
import { toggleSplitView } from './split-view.js';
import {
  toggleAnnotationMode,
  openAnnotationPanel,
  exportAnnotations,
  importAnnotationsFromFile,
} from './annotations.js';
import { openSearch } from './search.js';
import { startPresentation, hasPresentableDiagrams } from './presentation.js';
import { openShortcutsSheet } from './shortcuts.js';
import { openFileInfoSheet } from './file-info.js';
import {
  toggleWatching,
  refreshActiveFileFromDisk,
  exportActivePdf,
} from '../platform/desktop.js';
import { state } from '../core/state.js';

// The modifier glyph shown in command hints — ⌘ on Apple platforms, Ctrl else.
const CMD_MOD = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';

// Commands that act on the open document are only offered while one is visible.
const isDocumentOpen = () => {
  const contentArea = document.getElementById('content-area');
  return !!contentArea && contentArea.style.display !== 'none';
};

// Disk-backed commands need a desktop file tab (web/URL tabs have no path).
const isDesktopFileTabActive = () => {
  if (!isDesktop) return false;
  const tab =
    state.activeTabId !== null
      ? state.tabs.find((t) => t.id === state.activeTabId)
      : null;
  return !!(tab && tab.filePath);
};

export function registerAppCommands() {
  registerCommands([
    { id: 'bookmarks', title: 'Show bookmarks', keywords: ['favorites', 'saved', 'files'], run: openBookmarks },
    { id: 'bookmark-file', title: 'Bookmark this file', hint: CMD_MOD + ' D', keywords: ['favorite', 'save'], run: bookmarkCurrentFile, isAvailable: isDocumentOpen },
    {
      id: 'open-file',
      title: 'Open file…',
      keywords: ['browse', 'load', 'new'],
      run: () => {
        if (requestNativeOpenIfAvailable()) return;
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
      },
    },
    {
      id: 'open-folder',
      title: 'Open folder…',
      keywords: ['workspace', 'directory', 'browse', 'files', 'sidebar'],
      run: () => openWorkspaceFolder(),
      isAvailable: () => isDesktop,
    },
    {
      id: 'toggle-theme',
      title: 'Toggle theme (light / dark / system)',
      keywords: ['dark', 'light', 'appearance', 'color'],
      run: () => toggleTheme(),
    },
    {
      id: 'toggle-view',
      title: 'Toggle raw / preview',
      keywords: ['markdown', 'source', 'code'],
      run: () => toggleViewMode(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'toggle-toc',
      title: 'Toggle table of contents',
      keywords: ['outline', 'headings', 'contents'],
      run: () => toggleToc(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'toggle-comments',
      title: 'Show / hide HTML comments',
      keywords: ['comments', 'hidden', 'html', 'reveal'],
      run: () => toggleComments(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'toggle-split',
      title: 'Toggle split view',
      keywords: ['preview', 'raw', 'side'],
      run: () => toggleSplitView(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'toggle-annotate',
      title: 'Toggle annotation mode',
      keywords: ['notes', 'comment', 'markup'],
      run: () => {
        toggleAnnotationMode();
        syncIOSChrome();
      },
      isAvailable: isDocumentOpen,
    },
    {
      id: 'show-annotations',
      title: 'Show annotations list',
      keywords: ['notes', 'annotations', 'panel', 'comments'],
      run: () => openAnnotationPanel(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'find',
      title: 'Find in document',
      hint: CMD_MOD + ' F',
      keywords: ['search'],
      run: () => openSearch(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'print',
      title: 'Print / Save as PDF',
      hint: CMD_MOD + ' P',
      keywords: ['pdf', 'export', 'save'],
      run: () => performPrint(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'export-pdf',
      title: 'Export as PDF…',
      hint: CMD_MOD + ' ⇧ E',
      keywords: ['pdf', 'save', 'export', 'file', 'print'],
      run: () => exportActivePdf(),
      isAvailable: () => isDesktop && isDocumentOpen(),
    },
    {
      id: 'present-diagrams',
      title: 'Present diagrams',
      keywords: [
        'presentation',
        'slideshow',
        'fullscreen',
        'mermaid',
        'diagram',
      ],
      run: () => startPresentation(),
      isAvailable: () => isDocumentOpen() && hasPresentableDiagrams(),
    },
    {
      id: 'export-annotations',
      title: 'Export annotations',
      keywords: ['annotations', 'notes', 'download', 'backup', 'json'],
      run: () => exportAnnotations(),
    },
    {
      id: 'import-annotations',
      title: 'Import annotations',
      keywords: ['annotations', 'notes', 'upload', 'restore', 'json'],
      run: () => importAnnotationsFromFile(),
    },
    {
      id: 'toggle-live-reload',
      title: 'Pause / resume live reload',
      keywords: ['watch', 'auto', 'reload', 'live', 'pause', 'file'],
      run: () => toggleWatching(),
      isAvailable: isDesktopFileTabActive,
    },
    {
      id: 'reload-from-disk',
      title: 'Reload from disk',
      keywords: ['refresh', 'reread', 'sync', 'file', 'revert'],
      run: () => refreshActiveFileFromDisk(),
      isAvailable: isDesktopFileTabActive,
    },
    {
      id: 'file-info',
      title: 'Show file info',
      keywords: ['metadata', 'path', 'location', 'directory', 'created', 'modified', 'owner', 'size', 'creator', 'generated', 'generator'],
      run: () => openFileInfoSheet(),
      isAvailable: isDocumentOpen,
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      hint: '?',
      keywords: ['help', 'keys', 'cheatsheet'],
      run: () => openShortcutsSheet(),
    },
  ]);
}
