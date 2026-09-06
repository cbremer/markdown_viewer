// @ts-check
// Shared mutable app state.
//
// Modules import this object and read/mutate its fields. ESM forbids
// reassigning an imported binding, but mutating a property of an imported
// object is fine — so shared state lives here as object fields rather than
// bare module-level `let`s. This object grows as the entry module is split
// into feature modules that need to share state.

/**
 * Origin metadata for a tab that has no local file path (web File open or URL
 * fetch), surfaced by the File info sheet. Desktop file tabs read their metadata
 * live from disk instead, so they don't populate this.
 * @typedef {object} TabSourceMeta
 * @property {string} [bookmarkId] Identity of a recalled saved copy.
 * @property {string} [url] Source URL when the document was fetched from one.
 * @property {number} [size] Byte size (from a browser File).
 * @property {number} [lastModified] Last-modified epoch ms (from a browser File).
 */

/**
 * An open file tab.
 * @typedef {object} Tab
 * @property {number} id
 * @property {string} filename
 * @property {string | null} filePath
 * @property {string} rawMarkdown
 * @property {'preview' | 'raw'} viewMode
 * @property {number} scrollTop
 * @property {boolean} watching
 * @property {boolean} hasUnseenChanges
 * @property {TabSourceMeta | null} [sourceMeta]
 */

/**
 * A table-of-contents entry derived from a rendered heading.
 * @typedef {object} TocEntry
 * @property {string} id
 * @property {number} level
 * @property {string | null} text
 */

/**
 * @typedef {object} AppState
 * @property {'light' | 'dark'} currentTheme The resolved, applied theme.
 * @property {'light' | 'dark' | 'auto'} themePreference User choice; 'auto' follows the OS.
 * @property {string} visualTheme Named empty-state look (`default`, `starfield`, `aurora`, `blueprint`, …).
 * @property {string} currentRawMarkdown Raw source of the active document.
 * @property {'preview' | 'raw'} currentViewMode
 * @property {Tab[]} tabs Open file tabs.
 * @property {number | null} activeTabId
 * @property {number} nextTabId Monotonic id source for new tabs.
 * @property {boolean} tocVisible
 * @property {TocEntry[]} tocEntries
 * @property {boolean} tocScrollSpyScheduled
 * @property {boolean} splitViewActive
 * @property {string} iosLayoutMode
 */

/** @type {AppState} */
export const state = {
  // Render / view
  // `themePreference` is the persisted user choice (light/dark/auto);
  // `currentTheme` is the resolved theme that's actually applied, set by
  // setupTheme() at init (an 'auto' preference resolves via prefers-color-scheme).
  currentTheme: 'light',
  themePreference: /** @type {'light' | 'dark' | 'auto'} */ (
    localStorage.getItem('theme') || 'auto'
  ),
  // Resolved in setupVisualTheme(): 'starfield' on the web showcase, 'default'
  // on desktop/iOS until the user picks a look. Persisted as visualTheme.
  visualTheme: 'default',
  currentRawMarkdown: '',
  currentViewMode: 'preview', // 'preview' or 'raw'

  // Tabs (the `tabs` array itself stays in main.js for now — it appears in a
  // user-facing string/comment and is migrated with the tabs extraction)
  tabs: [], // open file tabs: { id, filename, filePath, rawMarkdown, viewMode, scrollTop, watching }
  activeTabId: null,
  nextTabId: 0,

  // Table of contents
  tocVisible: false,
  tocEntries: [],
  tocScrollSpyScheduled: false,

  // Split view / iOS layout
  splitViewActive: false,
  iosLayoutMode: 'phone',
};

// Seal the shape (not the values): fields stay mutable, but adding a NEW field
// requires editing this file — which keeps the shared-state surface reviewable
// and stops modules from smuggling private state in via ad-hoc properties.
// (Object.seal throws on new props in strict mode / ESM, silently no-ops in
// sloppy mode — either way the drift can't land.)
Object.seal(state);
