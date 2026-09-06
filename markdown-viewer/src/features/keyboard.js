// @ts-check
// Global keyboard shortcuts: the single document-level keydown listener.
// Modal-local keys (palette navigation, presentation arrows, search Enter)
// live with their features; this handles the app-wide bindings and the Esc
// close-priority chain. Extracted from main.js in the Wave C decomposition.

import {
  toggleCommandPalette,
  closeCommandPalette,
  isCommandPaletteOpen,
} from './command-palette.js';
import {
  openShortcutsSheet,
  closeShortcutsSheet,
  isShortcutsSheetOpen,
} from './shortcuts.js';
import { closeFileInfoSheet, isFileInfoSheetOpen } from './file-info.js';
import { isPresentationOpen, exitPresentation } from './presentation.js';
import { closeOverflowMenu, isOverflowMenuOpen } from './toolbar-overflow.js';
import { closeFullscreen, updateZoomUI, resetToFit } from './diagrams.js';
import { openSearch, closeSearch } from './search.js';
import { bookmarkCurrentFile, isBookmarksOpen } from './bookmarks.js';
import { performPrint } from '../platform/ios-chrome.js';

// True when the event target is a text-entry element, so global single-key
// shortcuts (like "?") don't fire while the user is typing.
/** @param {EventTarget | null} target */
export function isTypingTarget(target) {
  if (!target) return false;
  const element = /** @type {HTMLElement} */ (target);
  const tag = element.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable === true
  );
}

/** Bind the app-wide keydown listener. */
export function setupGlobalKeyboardShortcuts() {
  const contentArea = document.getElementById('content-area');
  const searchBar = document.getElementById('search-bar');
  // The fullscreen overlay carries expando properties set by features/diagrams.js.
  const fullscreenOverlay =
    /** @type {(HTMLElement & { panzoomInstance?: any, fullscreenState?: { homeState: { scale: number, x: number, y: number } } }) | null} */ (
      document.getElementById('fullscreen-overlay')
    );

  document.addEventListener('keydown', (e) => {
    if (isBookmarksOpen()) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !e.shiftKey && !e.altKey) {
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      bookmarkCurrentFile();
      return;
    }
    // Cmd/Ctrl+K — toggle the command palette (works anywhere)
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }
    // "?" — open the keyboard shortcut sheet (unless typing or in a dialog)
    if (e.key === '?' && !isTypingTarget(e.target) && !isCommandPaletteOpen()) {
      e.preventDefault();
      openShortcutsSheet();
      return;
    }
    // ESC — close the topmost open surface
    if (e.key === 'Escape') {
      if (isCommandPaletteOpen()) {
        closeCommandPalette();
      } else if (isFileInfoSheetOpen()) {
        closeFileInfoSheet();
      } else if (isShortcutsSheetOpen()) {
        closeShortcutsSheet();
      } else if (isPresentationOpen()) {
        exitPresentation();
      } else if (isOverflowMenuOpen()) {
        closeOverflowMenu();
      } else if (
        fullscreenOverlay &&
        fullscreenOverlay.style.display !== 'none'
      ) {
        closeFullscreen();
      } else if (searchBar && searchBar.style.display !== 'none') {
        closeSearch();
      }
      return;
    }
    // Cmd/Ctrl+F — open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      if (contentArea && contentArea.style.display !== 'none') {
        e.preventDefault();
        openSearch();
      }
      return;
    }
    // Cmd/Ctrl+P — print
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      if (contentArea && contentArea.style.display !== 'none') {
        e.preventDefault();
        performPrint();
      }
    }

    // Fullscreen diagram zoom keys
    if (
      fullscreenOverlay &&
      fullscreenOverlay.style.display !== 'none' &&
      fullscreenOverlay.panzoomInstance
    ) {
      const instance = fullscreenOverlay.panzoomInstance;
      const controls = fullscreenOverlay.querySelector('.fullscreen-controls');
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        instance.zoomIn();
        updateZoomUI(instance, controls);
      } else if (e.key === '-') {
        e.preventDefault();
        instance.zoomOut();
        updateZoomUI(instance, controls);
      } else if (e.key === '0') {
        e.preventDefault();
        if (fullscreenOverlay.fullscreenState?.homeState) {
          resetToFit(instance, fullscreenOverlay.fullscreenState.homeState);
          updateZoomUI(instance, controls);
        }
      }
    }
  });
}
