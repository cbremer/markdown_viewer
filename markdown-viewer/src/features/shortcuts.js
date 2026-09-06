// @ts-check
// Keyboard-shortcut reference sheet: a small accessible modal listing the app's
// shortcuts. Opened with `?` or from the command palette.

import { trapFocus } from '../core/focus-trap.js';

const MOD = /Mac|iPhone|iPad/.test(
  (typeof navigator !== 'undefined' && navigator.platform) || ''
)
  ? '⌘'
  : 'Ctrl';

/** @type {Array<{ keys: string, label: string }>} */
const SHORTCUTS = [
  { keys: `${MOD} K`, label: 'Open command palette' },
  { keys: `${MOD} D`, label: 'Bookmark this file' },
  { keys: `${MOD} F`, label: 'Find in document' },
  { keys: 'Enter / Shift Enter', label: 'Next / previous search match' },
  { keys: `${MOD} P`, label: 'Print / save as PDF' },
  { keys: `${MOD} ⇧ E`, label: 'Export as PDF (desktop app)' },
  { keys: '← →', label: 'Previous / next diagram (presentation)' },
  { keys: '+ − 0', label: 'Zoom in / out / fit slide (presentation)' },
  { keys: 'Scroll / drag', label: 'Zoom and pan a diagram (pointer)' },
  { keys: 'Double-click text', label: 'Add or edit a note (annotate mode on)' },
  { keys: 'Double-click diagram', label: 'Reset diagram view' },
  { keys: '?', label: 'Show this shortcuts sheet' },
  { keys: 'Esc', label: 'Close dialog, search, presentation, or fullscreen' },
];

/** @type {HTMLElement | null} */
let overlay = null;
/** @type {Element | null} */
let previouslyFocused = null;
/** @type {(() => void) | null} */
let releaseTrap = null;

export function isShortcutsSheetOpen() {
  return overlay !== null;
}

export function openShortcutsSheet() {
  if (overlay) return;
  previouslyFocused = document.activeElement;

  overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay';
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeShortcutsSheet();
  });

  const dialog = document.createElement('div');
  dialog.className = 'shortcuts-sheet';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Keyboard shortcuts');
  dialog.tabIndex = -1;
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeShortcutsSheet();
    }
  });

  const heading = document.createElement('h2');
  heading.className = 'shortcuts-title';
  heading.textContent = 'Keyboard shortcuts';
  dialog.appendChild(heading);

  const list = document.createElement('dl');
  list.className = 'shortcuts-list';
  for (const { keys, label } of SHORTCUTS) {
    const row = document.createElement('div');
    row.className = 'shortcuts-row';

    const dt = document.createElement('dt');
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    dt.appendChild(kbd);

    const dd = document.createElement('dd');
    dd.textContent = label;

    row.appendChild(dt);
    row.appendChild(dd);
    list.appendChild(row);
  }
  dialog.appendChild(list);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  releaseTrap = trapFocus(overlay);
  dialog.focus();
}

export function closeShortcutsSheet() {
  if (!overlay) return;
  if (releaseTrap) releaseTrap();
  releaseTrap = null;
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  if (
    previouslyFocused &&
    typeof (/** @type {HTMLElement} */ (previouslyFocused)).focus === 'function'
  ) {
    (/** @type {HTMLElement} */ (previouslyFocused)).focus();
  }
  previouslyFocused = null;
}
