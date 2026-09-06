// @ts-check
// Click wiring for the iOS action bar + sheets. The chrome's state/visibility
// logic lives in ios-chrome.js; this module only binds the buttons to feature
// actions. Extracted from main.js in the Wave C decomposition.

import {
  requestNativeOpenIfAvailable,
  performPrint,
  closeIOSActionSheet,
  closeIOSTocSheet,
  setIOSSheetVisibility,
} from './ios-chrome.js';
import { bookmarkCurrentFile, openBookmarks } from '../features/bookmarks.js';
import { toggleToc } from '../features/toc.js';
import { toggleViewMode } from '../features/view-mode.js';
import { toggleSplitView } from '../features/split-view.js';
import { toggleTheme } from '../features/theme.js';
import { cycleVisualTheme } from '../features/starfield.js';
import { toggleComments } from '../features/comments.js';
import { openAnnotationPanel } from '../features/annotations.js';
import { startPresentation } from '../features/presentation.js';
import { openFileInfoSheet } from '../features/file-info.js';

const iosWiringEl = (/** @type {string} */ id) => document.getElementById(id);

/** Bind every iOS chrome button. Safe to call on every surface (no-ops when
 * the elements are hidden; they exist in the shared index.html). */
export function setupIOSEventListeners() {
  iosWiringEl('ios-bookmark-button')?.addEventListener('click', () => { closeIOSActionSheet(); bookmarkCurrentFile(); });
  iosWiringEl('ios-bookmarks-button')?.addEventListener('click', () => { closeIOSActionSheet(); openBookmarks(); });
  const iosOpenButton = iosWiringEl('ios-open-button');
  const iosContentsButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-contents-button')
  );
  const iosViewButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-view-button')
  );
  const iosMoreButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-more-button')
  );
  const iosActionSheet = iosWiringEl('ios-action-sheet');
  const iosActionSheetClose = iosWiringEl('ios-action-sheet-close');
  const iosSplitButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-split-button')
  );
  const iosPresentButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-present-button')
  );
  const iosCommentsButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-comments-button')
  );
  const iosAnnotationsButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-annotations-button')
  );
  const iosInfoButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-info-button')
  );
  const iosPrintButton = /** @type {HTMLButtonElement | null} */ (
    iosWiringEl('ios-print-button')
  );
  const iosThemeButton = iosWiringEl('ios-theme-button');
  const iosTocSheet = iosWiringEl('ios-toc-sheet');
  const iosTocClose = iosWiringEl('ios-toc-close');

  if (iosOpenButton) {
    iosOpenButton.addEventListener('click', () => {
      closeIOSActionSheet();
      if (requestNativeOpenIfAvailable()) return;
      const fileInput = iosWiringEl('file-input');
      if (fileInput) fileInput.click();
    });
  }

  if (iosContentsButton) {
    iosContentsButton.addEventListener('click', () => {
      if (iosContentsButton.disabled) return;
      toggleToc();
    });
  }

  if (iosViewButton) {
    iosViewButton.addEventListener('click', () => {
      if (iosViewButton.disabled) return;
      closeIOSActionSheet();
      toggleViewMode();
    });
  }

  if (iosMoreButton) {
    iosMoreButton.addEventListener('click', () => {
      if (iosMoreButton.disabled) return;
      closeIOSTocSheet();
      setIOSSheetVisibility(iosActionSheet, true);
    });
  }

  if (iosActionSheetClose) {
    iosActionSheetClose.addEventListener('click', closeIOSActionSheet);
  }

  if (iosActionSheet) {
    iosActionSheet.addEventListener('click', (e) => {
      if (e.target === iosActionSheet) {
        closeIOSActionSheet();
      }
    });
  }

  if (iosTocClose) {
    iosTocClose.addEventListener('click', closeIOSTocSheet);
  }

  if (iosTocSheet) {
    iosTocSheet.addEventListener('click', (e) => {
      if (e.target === iosTocSheet) {
        closeIOSTocSheet();
      }
    });
  }

  if (iosSplitButton) {
    iosSplitButton.addEventListener('click', () => {
      if (iosSplitButton.disabled) return;
      closeIOSActionSheet();
      toggleSplitView();
    });
  }

  if (iosPresentButton) {
    iosPresentButton.addEventListener('click', () => {
      closeIOSActionSheet();
      startPresentation();
    });
  }

  if (iosCommentsButton) {
    iosCommentsButton.addEventListener('click', () => {
      closeIOSActionSheet();
      toggleComments();
    });
  }

  if (iosAnnotationsButton) {
    iosAnnotationsButton.addEventListener('click', () => {
      closeIOSActionSheet();
      openAnnotationPanel();
    });
  }

  if (iosInfoButton) {
    iosInfoButton.addEventListener('click', () => {
      closeIOSActionSheet();
      openFileInfoSheet();
    });
  }

  if (iosPrintButton) {
    iosPrintButton.addEventListener('click', () => {
      if (iosPrintButton.disabled) return;
      closeIOSActionSheet();
      performPrint();
    });
  }

  if (iosThemeButton) {
    iosThemeButton.addEventListener('click', () => {
      closeIOSActionSheet();
      toggleTheme();
    });
  }

  const iosVisualThemeButton = iosWiringEl('ios-visual-theme-button');
  if (iosVisualThemeButton) {
    iosVisualThemeButton.addEventListener('click', () => {
      closeIOSActionSheet();
      cycleVisualTheme();
    });
  }
}
