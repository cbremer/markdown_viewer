// @ts-check
// Toolbar overflow menu: the "⋮" button is visible at every width and its menu
// is the COMPLETE list of document actions — the toolbar keeps only the
// high-frequency shortcuts (Contents, Split, Annotate, Present, Search)
// visible, and everything else (`.overflow-only` buttons: Workspace files,
// author comments, annotations list, Print, Raw) lives here. Entries come in
// two shapes: button proxies (`targetId`) that `.click()` the real toolbar
// button — no duplicated action logic, and an inline display:none on the
// button means feature-gated off (e.g. Present with no diagrams), so the
// entry is skipped — and run-entries (`run` + `isAvailable`) for actions with
// no toolbar button at all (e.g. "Reload from disk"). Live-reload state is
// NOT in this menu: it lives on the "Live" chip beside the filename.

import { state } from '../core/state.js';
import { isDesktop } from '../core/platform.js';
import {
  refreshActiveFileFromDisk,
  exportActivePdf,
} from '../platform/desktop.js';
import { openFileInfoSheet } from './file-info.js';

const el = (/** @type {string} */ id) => document.getElementById(id);

// True when the active tab is backed by a local file on desktop — the
// precondition for disk-related actions (live reload lives on the "Live"
// chip beside the filename; the menu carries the manual refresh).
const overflowHasDesktopFileTab = () => {
  if (!isDesktop) return false;
  const tab =
    state.activeTabId !== null
      ? state.tabs.find((t) => t.id === state.activeTabId)
      : null;
  return !!(tab && tab.filePath);
};

// True when a document is open — the precondition for the File info entry
// (it needs an active tab to describe).
const overflowHasOpenDocument = () => state.activeTabId !== null;

/** @type {Array<{ label: string, targetId?: string, run?: () => void, isAvailable?: () => boolean }>} */
const OVERFLOW_ACTIONS = [
  {
    label: 'File info',
    run: () => openFileInfoSheet(),
    isAvailable: overflowHasOpenDocument,
  },
  {
    label: 'Reload from disk',
    run: () => refreshActiveFileFromDisk(),
    isAvailable: overflowHasDesktopFileTab,
  },
  { targetId: 'bookmark-button', label: 'Bookmark this file' },
  { targetId: 'workspace-toggle', label: 'Workspace files' },
  { targetId: 'toc-toggle', label: 'Table of contents' },
  { targetId: 'split-toggle', label: 'Split view' },
  { targetId: 'annotation-toggle', label: 'Annotate' },
  { targetId: 'annotation-list-toggle', label: 'Annotations list' },
  { targetId: 'comments-toggle', label: 'Show author comments' },
  { targetId: 'present-button', label: 'Present diagrams' },
  { targetId: 'print-button', label: 'Print / Save as PDF' },
  {
    label: 'Export as PDF',
    run: () => exportActivePdf(),
    isAvailable: () => isDesktop,
  },
  { targetId: 'view-toggle', label: 'Toggle raw / preview' },
];

/** @type {HTMLElement | null} */
let menu = null;

export function isOverflowMenuOpen() {
  return menu !== null;
}

export function openOverflowMenu() {
  if (menu) return;
  const toggle = el('overflow-toggle');
  if (!toggle) return;

  const built = document.createElement('div');
  built.className = 'overflow-menu';
  built.setAttribute('role', 'menu');

  for (const action of OVERFLOW_ACTIONS) {
    // run-entries carry their own availability + behavior (no toolbar button).
    if (action.run) {
      if (action.isAvailable && !action.isAvailable()) continue;
      const item = document.createElement('button');
      item.className = 'overflow-menu-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = action.label;
      const runAction = action.run;
      item.addEventListener('click', () => {
        closeOverflowMenu();
        runAction();
      });
      built.appendChild(item);
      continue;
    }

    const target = action.targetId ? el(action.targetId) : null;
    if (!target) continue;
    // Skip actions whose button is inline-hidden (e.g. Present with no diagrams).
    if (target.style.display === 'none') continue;
    const item = document.createElement('button');
    item.className = 'overflow-menu-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = action.label;
    item.addEventListener('click', () => {
      closeOverflowMenu();
      const proxied = action.targetId ? el(action.targetId) : null;
      if (proxied) proxied.click();
    });
    built.appendChild(item);
  }

  // Anchor inside the toolbar so it positions under the toggle.
  (toggle.parentElement || document.body).appendChild(built);
  menu = built;
  toggle.setAttribute('aria-expanded', 'true');

  // Defer so the opening click doesn't immediately close it.
  setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
}

export function closeOverflowMenu() {
  if (!menu) return;
  if (menu.parentNode) menu.parentNode.removeChild(menu);
  menu = null;
  const toggle = el('overflow-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onOutsideClick);
}

export function toggleOverflowMenu() {
  if (menu) {
    closeOverflowMenu();
  } else {
    openOverflowMenu();
  }
}

/** @param {Event} e */
function onOutsideClick(e) {
  const toggle = el('overflow-toggle');
  const target = /** @type {Node} */ (e.target);
  if (menu && !menu.contains(target) && toggle && !toggle.contains(target)) {
    closeOverflowMenu();
  }
}

export function setupToolbarOverflow() {
  const toggle = el('overflow-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOverflowMenu();
  });
}
