// @ts-check
// Explicit, durable favorites. Paths/URLs reopen their current source; files
// without a reusable reference retain a clearly labeled snapshot instead.
import { state } from '../core/state.js';
import { trapFocus } from '../core/focus-trap.js';
import { normalizeMarkdownUrl } from '../core/utils.js';
import {
  bridgeGetPathForFile,
  bridgeReadBookmarkedFile,
} from '../platform/bridge.js';
import { showToast } from './toast.js';

/** @typedef {{ id: string, title: string, filename: string, type: 'path'|'url'|'copy', ref: string, content?: string, savedAt: number }} Bookmark */
const BOOKMARK_KEY = 'specdown-bookmarks-v1';
const BOOKMARK_COPY_LIMIT = 1024 * 1024;
/** @type {HTMLElement | null} */
let bookmarkOverlay = null;
let bookmarkRecallGeneration = 0;
/** @type {HTMLElement | null} */
let bookmarkPreviousFocus = null;
/** @type {(() => void) | null} */
let bookmarkReleaseFocus = null;
/** @type {(name: string, content: string, path: string | null, meta: import('../core/state.js').TabSourceMeta | null) => void} */
let bookmarkCreateTab = () => {};
/** @type {(id: number) => void} */
let bookmarkSwitchTab = () => {};

/** @param {{ createTab: typeof bookmarkCreateTab, switchTab: typeof bookmarkSwitchTab }} deps */
export function configureBookmarks(deps) {
  bookmarkCreateTab = deps.createTab;
  bookmarkSwitchTab = deps.switchTab;
}

/** Fail closed on corrupt data: never overwrite an unreadable bookmark store. @returns {Bookmark[]} */
export function getBookmarks() {
  const raw = localStorage.getItem(BOOKMARK_KEY);
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        typeof b.title === 'string' &&
        typeof b.filename === 'string' &&
        typeof b.ref === 'string' &&
        Number.isFinite(b.savedAt) &&
        (b.type === 'path' ||
          (b.type === 'url' && /^https?:\/\//i.test(b.ref)) ||
          (b.type === 'copy' && typeof b.content === 'string'))
    )
  )
    throw new Error('Invalid bookmark store');
  return parsed;
}

/** @param {Bookmark[]} entries */
function bookmarkPersist(entries) {
  // Persist before reporting success or changing the view. Quota errors leave
  // the previous store intact, including saved copies.
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(entries));
}

function bookmarkStorageError() {
  showToast(
    'Bookmarks could not be saved or read. Storage may be full or unavailable. Existing bookmarks have not been replaced.',
    { type: 'error' }
  );
}

/** @param {import('../core/state.js').Tab} tab @param {Bookmark[]} entries */
function bookmarkForTab(tab, entries) {
  return entries.find((b) =>
    tab.filePath
      ? b.type === 'path' && b.ref === tab.filePath
      : tab.sourceMeta?.url
        ? b.type === 'url' && b.ref === tab.sourceMeta.url
        : b.id === tab.sourceMeta?.bookmarkId ||
          (b.type === 'copy' &&
            b.filename === tab.filename &&
            b.content === tab.rawMarkdown)
  );
}

export function bookmarkCurrentFile() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) {
    showToast('Open a document first, then bookmark it.', { type: 'info' });
    return;
  }
  try {
    const entries = getBookmarks();
    if (bookmarkForTab(tab, entries)) {
      openBookmarks();
      showToast('This document is already bookmarked.', { type: 'info' });
      return;
    }
    const type = tab.filePath ? 'path' : tab.sourceMeta?.url ? 'url' : 'copy';
    if (type === 'copy' && tab.rawMarkdown.length > BOOKMARK_COPY_LIMIT) {
      showToast(
        'This file is too large for a saved copy (1 million characters maximum). Open it in the desktop app to bookmark its location.',
        { type: 'warning' }
      );
      return;
    }
    const id = crypto.randomUUID();
    bookmarkPersist([
      ...entries,
      {
        id,
        title: tab.filename,
        filename: tab.filename,
        type,
        ref: tab.filePath || tab.sourceMeta?.url || '',
        ...(type === 'copy' ? { content: tab.rawMarkdown } : {}),
        savedAt: Date.now(),
      },
    ]);
    if (type === 'copy') tab.sourceMeta = { ...tab.sourceMeta, bookmarkId: id };
    openBookmarks();
    bookmarkRenderList();
    showToast(
      type === 'copy'
        ? 'Bookmark saved with a copy of this document.'
        : 'Bookmark saved.',
      { type: 'success' }
    );
  } catch {
    bookmarkStorageError();
  }
}

/** @param {string} id @param {Partial<Bookmark>} patch */
export function updateBookmark(id, patch) {
  try {
    const entries = getBookmarks();
    const entry = entries.find((b) => b.id === id);
    if (!entry) return false;
    const next = { ...entry, ...patch, id };
    if (!next.title.trim()) return false;
    const duplicate = entries.find(
      (b) =>
        b.id !== id &&
        next.type !== 'copy' &&
        b.type === next.type &&
        b.ref === next.ref
    );
    if (duplicate) {
      showToast(
        'That location is already bookmarked. Remove the duplicate first.',
        { type: 'warning' }
      );
      return false;
    }
    bookmarkPersist(entries.map((b) => (b.id === id ? next : b)));
    return true;
  } catch {
    bookmarkStorageError();
    return false;
  }
}

/** @param {string} id */
export function removeBookmark(id) {
  try {
    bookmarkPersist(getBookmarks().filter((b) => b.id !== id));
    bookmarkRenderList();
    document.getElementById('bookmark-search')?.focus();
    showToast('Bookmark removed. The original file was not deleted.', {
      type: 'info',
    });
  } catch {
    bookmarkStorageError();
  }
}

/** @param {string} id @param {HTMLElement} [status] */
export async function recallBookmark(id, status) {
  const generation = ++bookmarkRecallGeneration;
  try {
    const entry = getBookmarks().find((b) => b.id === id);
    if (!entry) return;
    // Reuse an existing tab, preserving its scroll position and live watcher.
    const existing = state.tabs.find((t) =>
      entry.type === 'path'
        ? t.filePath === entry.ref
        : entry.type === 'url'
          ? t.sourceMeta?.url === entry.ref
          : t.sourceMeta?.bookmarkId === id
    );
    if (existing) {
      closeBookmarks();
      bookmarkSwitchTab(existing.id);
      return;
    }
    let content = entry.content || '';
    let filename = entry.filename;
    if (status) status.textContent = 'Opening…';
    if (entry.type === 'path') {
      const file = await bridgeReadBookmarkedFile(entry.ref);
      if (!file)
        throw new Error(
          'File unavailable. Use Locate file to reconnect this bookmark.'
        );
      content = file.content;
      filename = file.filename;
    } else if (entry.type === 'url') {
      const response = await fetch(normalizeMarkdownUrl(entry.ref), {
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          'URL unavailable. Check your connection or edit the address.'
        );
      content = await response.text();
    }
    // The user may have closed the dialog or changed a bookmark while loading.
    if (
      generation !== bookmarkRecallGeneration ||
      !getBookmarks().some((b) => b.id === id && b.ref === entry.ref)
    )
      return;
    const tabCount = state.tabs.length;
    bookmarkCreateTab(
      filename,
      content,
      entry.type === 'path' ? entry.ref : null,
      entry.type === 'url'
        ? { url: entry.ref }
        : entry.type === 'copy'
          ? { bookmarkId: id }
          : null
    );
    if (state.tabs.length === tabCount) return; // Tab limit: leave the list open.
    closeBookmarks();
    if (entry.type === 'copy')
      showToast(
        'Opened the saved copy. Use Replace copy in Bookmarks to update it.',
        { type: 'info' }
      );
  } catch (error) {
    const message =
      error instanceof Error && /^(File|URL) unavailable/.test(error.message)
        ? error.message
        : 'Could not open this bookmark. Check its location and try again.';
    if (status) status.textContent = message;
    else showToast(message, { type: 'error' });
  }
}

/** @param {Bookmark} entry */
function bookmarkLocateFile(entry) {
  // A dedicated input cannot accidentally replace the next unrelated OS-open.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown';
  input.hidden = true;
  bookmarkOverlay?.appendChild(input);
  input.addEventListener('cancel', () => input.remove());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (!/\.(md|markdown)$/i.test(file.name)) {
      showToast('Choose a Markdown file (.md or .markdown).', {
        type: 'warning',
      });
      return;
    }
    const path = bridgeGetPathForFile(file);
    if (path) {
      if (
        updateBookmark(entry.id, {
          type: 'path',
          ref: path,
          filename: file.name,
          content: undefined,
        })
      ) {
        bookmarkRenderList();
        showToast('Bookmark reconnected. Open it to read the new location.', {
          type: 'success',
        });
      }
      return;
    }
    if (file.size > BOOKMARK_COPY_LIMIT) {
      showToast('Choose a file smaller than 1 MB for a saved copy.', {
        type: 'warning',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (
        updateBookmark(entry.id, {
          type: 'copy',
          ref: '',
          filename: file.name,
          content: String(reader.result ?? ''),
          savedAt: Date.now(),
        })
      ) {
        // Existing recalled copies must no longer mask the replacement.
        for (const tab of state.tabs) {
          if (tab.sourceMeta?.bookmarkId === entry.id)
            delete tab.sourceMeta.bookmarkId;
        }
        bookmarkRenderList();
        showToast('Saved copy replaced.', { type: 'success' });
      }
    };
    reader.onerror = () =>
      showToast('Could not read that file. Your bookmark is unchanged.', {
        type: 'error',
      });
    reader.readAsText(file);
  });
  input.click();
}

/** @param {string} text @param {() => void} action */
function bookmarkButton(text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}

/** @param {Bookmark} entry @param {HTMLElement} row */
function bookmarkEdit(entry, row) {
  row.replaceChildren();
  const name = document.createElement('input');
  name.value = entry.title;
  name.maxLength = 200;
  name.setAttribute('aria-label', 'Bookmark name');
  const address = document.createElement('input');
  address.value = entry.ref;
  address.setAttribute('aria-label', 'Bookmark URL');
  const save = () => {
    if (
      !name.value.trim() ||
      (entry.type === 'url' && !/^https?:\/\//i.test(address.value.trim()))
    ) {
      showToast('Enter a name and a valid http or https URL.', {
        type: 'warning',
      });
      return;
    }
    if (
      updateBookmark(entry.id, {
        title: name.value.trim(),
        ref: entry.type === 'url' ? address.value.trim() : entry.ref,
      })
    ) {
      bookmarkRenderList();
      document.getElementById('bookmark-search')?.focus();
    }
  };
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });
  row.append(name);
  if (entry.type === 'url') row.append(address);
  row.append(
    bookmarkButton('Save', save),
    bookmarkButton('Cancel', bookmarkRenderList)
  );
  name.focus();
  name.select();
}

function bookmarkRenderList() {
  const list = document.getElementById('bookmark-list');
  if (!list) return;
  const query =
    /** @type {HTMLInputElement | null} */ (
      document.getElementById('bookmark-search')
    )?.value.toLowerCase() || '';
  list.replaceChildren();
  let entries;
  try {
    entries = getBookmarks();
  } catch {
    list.textContent =
      'Bookmarks could not be read. Your saved data has not been changed.';
    return;
  }
  const matches = entries.filter((b) =>
    `${b.title} ${b.filename} ${b.ref}`.toLowerCase().includes(query)
  );
  if (!matches.length) {
    list.textContent = entries.length
      ? 'No matching bookmarks.'
      : 'Keep your go-to documents here. Open a file and choose Bookmark this file.';
  }
  for (const entry of matches) {
    const row = document.createElement('li');
    row.className = 'bookmark-row';
    const status = document.createElement('p');
    status.className = 'bookmark-status';
    status.setAttribute('role', 'status');
    const open = bookmarkButton(entry.title, () => {
      open.disabled = true;
      void recallBookmark(entry.id, status).finally(() => {
        open.disabled = false;
      });
    });
    open.className = 'bookmark-open';
    const location = document.createElement('p');
    location.className = 'bookmark-location';
    location.textContent =
      entry.type === 'copy'
        ? `Saved copy · ${entry.filename} · ${new Date(entry.savedAt).toLocaleDateString()}`
        : entry.ref;
    const actions = document.createElement('div');
    actions.className = 'bookmark-actions';
    actions.append(bookmarkButton('Edit', () => bookmarkEdit(entry, row)));
    if (entry.type !== 'url')
      actions.append(
        bookmarkButton(
          entry.type === 'path' ? 'Locate file' : 'Replace copy',
          () => bookmarkLocateFile(entry)
        )
      );
    actions.append(
      bookmarkButton('Remove', () => {
        // Inline confirmation protects the only stored copy on web/iOS.
        actions.replaceChildren(
          bookmarkButton('Remove bookmark?', () => removeBookmark(entry.id)),
          bookmarkButton('Keep', bookmarkRenderList)
        );
        actions.querySelector('button')?.focus();
      })
    );
    row.append(open, location, actions, status);
    list.append(row);
  }
}

export function isBookmarksOpen() {
  return bookmarkOverlay !== null;
}

export function closeBookmarks() {
  ++bookmarkRecallGeneration;
  bookmarkReleaseFocus?.();
  bookmarkReleaseFocus = null;
  bookmarkOverlay?.remove();
  bookmarkOverlay = null;
  bookmarkPreviousFocus?.focus();
}

export function openBookmarks() {
  if (bookmarkOverlay) {
    bookmarkRenderList();
    return;
  }
  bookmarkPreviousFocus = /** @type {HTMLElement | null} */ (
    document.activeElement
  );
  const overlay = document.createElement('div');
  overlay.className = 'bookmarks-overlay';
  const dialog = document.createElement('section');
  dialog.className = 'bookmarks-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Bookmarks');
  const header = document.createElement('div');
  header.className = 'bookmarks-heading';
  const title = document.createElement('h2');
  title.textContent = 'Bookmarks';
  header.append(title, bookmarkButton('Close', closeBookmarks));
  const help = document.createElement('p');
  help.className = 'bookmarks-help';
  help.textContent =
    'Your favorites stay here until you remove them. Stored on this device; clearing app or browser data removes them.';
  const search = document.createElement('input');
  search.id = 'bookmark-search';
  search.type = 'search';
  search.placeholder = 'Find a bookmark…';
  search.setAttribute('aria-label', 'Find a bookmark');
  search.addEventListener('input', bookmarkRenderList);
  const list = document.createElement('ul');
  list.id = 'bookmark-list';
  dialog.append(header, help);
  if (state.activeTabId !== null)
    dialog.append(bookmarkButton('Bookmark this file', bookmarkCurrentFile));
  dialog.append(search, list);
  overlay.append(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBookmarks();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeBookmarks();
    }
    // Do not trigger document-level shortcuts underneath this modal.
    e.stopPropagation();
  });
  bookmarkOverlay = overlay;
  document.body.append(overlay);
  bookmarkRenderList();
  bookmarkReleaseFocus = trapFocus(dialog);
  search.focus();
}

export function setupBookmarks() {
  document
    .getElementById('bookmarks-button')
    ?.addEventListener('click', openBookmarks);
  document
    .getElementById('bookmark-button')
    ?.addEventListener('click', bookmarkCurrentFile);
}
