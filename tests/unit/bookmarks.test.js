const { loadHTML, loadApp } = require('../helpers/loadApp');

describe('Bookmarks', () => {
  beforeEach(() => {
    delete window.specdown;
    loadHTML(document);
    loadApp(document);
  });
  afterEach(() => {
    delete window.specdown;
  });

  function doc(
    filename = 'README.md',
    content = '# Saved',
    filePath = null,
    sourceMeta = null
  ) {
    const tab = {
      id: state.tabs.length + 1,
      filename,
      rawMarkdown: content,
      filePath,
      sourceMeta,
      viewMode: 'preview',
      scrollTop: 0,
      watching: false,
      hasUnseenChanges: false,
    };
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    return tab;
  }

  it('persists favorites independently of recents and never merges same-named paths', () => {
    doc('README.md', '# One', '/a/README.md');
    bookmarkCurrentFile();
    doc('README.md', '# Two', '/b/README.md');
    bookmarkCurrentFile();
    clearRecentFiles();
    expect(getBookmarks().map((b) => b.ref)).toEqual([
      '/a/README.md',
      '/b/README.md',
    ]);
    expect(
      JSON.parse(localStorage.getItem('specdown-bookmarks-v1'))
    ).toHaveLength(2);
    loadHTML(document);
    loadApp(document);
    expect(getBookmarks()).toHaveLength(2);
  });

  it('does not duplicate an already bookmarked document', () => {
    doc();
    bookmarkCurrentFile();
    bookmarkCurrentFile();
    expect(getBookmarks()).toHaveLength(1);
  });

  it('stores and recalls a pathless file as an explicitly labeled saved copy', async () => {
    doc('notes.md', '# My notes');
    bookmarkCurrentFile();
    expect(document.querySelector('.bookmark-location').textContent).toContain(
      'Saved copy'
    );
    const [entry] = getBookmarks();
    state.tabs = [];
    state.activeTabId = null;
    await recallBookmark(entry.id);
    expect(state.tabs[0].rawMarkdown).toBe('# My notes');
    expect(state.tabs[0].sourceMeta.bookmarkId).toBe(entry.id);
  });

  it('keeps distinct copies with the same filename and different contents', () => {
    doc('notes.md', '# One');
    bookmarkCurrentFile();
    doc('notes.md', '# Two');
    bookmarkCurrentFile();
    expect(getBookmarks()).toHaveLength(2);
  });

  it('reads the latest file contents from the desktop bridge', async () => {
    doc('notes.md', '# Old', '/tmp/notes.md');
    bookmarkCurrentFile();
    const [entry] = getBookmarks();
    state.tabs = [];
    state.activeTabId = null;
    window.specdown = {
      readBookmarkedFile: jest
        .fn()
        .mockResolvedValue({
          filename: 'notes.md',
          filePath: entry.ref,
          content: '# Latest',
        }),
    };
    await recallBookmark(entry.id);
    expect(window.specdown.readBookmarkedFile).toHaveBeenCalledWith(
      '/tmp/notes.md'
    );
    expect(state.tabs[0].rawMarkdown).toBe('# Latest');
    expect(state.tabs[0].filePath).toBe('/tmp/notes.md');
  });

  it('keeps a missing bookmark and shows a recovery action', async () => {
    doc('notes.md', '', '/old/notes.md');
    bookmarkCurrentFile();
    const [entry] = getBookmarks();
    state.tabs = [];
    window.specdown = { readBookmarkedFile: jest.fn().mockResolvedValue(null) };
    const status = document.querySelector('.bookmark-status');
    await recallBookmark(entry.id, status);
    expect(status.textContent).toContain('Locate file');
    expect(getBookmarks()[0].ref).toBe('/old/notes.md');
    expect(isBookmarksOpen()).toBe(true);
  });

  it('reconnects a moved file without changing bookmark name or identity', async () => {
    doc('notes.md', '', '/old/notes.md');
    bookmarkCurrentFile();
    const [entry] = getBookmarks();
    updateBookmark(entry.id, { title: 'Go-to notes' });
    openBookmarks();
    window.specdown = { getPathForFile: () => '/new/notes.md' };
    [...document.querySelectorAll('.bookmark-actions button')]
      .find((b) => b.textContent === 'Locate file')
      .click();
    const input = document.querySelector('.bookmarks-overlay input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['# moved'], 'notes.md')],
    });
    input.dispatchEvent(new Event('change'));
    expect(getBookmarks()[0]).toMatchObject({
      id: entry.id,
      title: 'Go-to notes',
      ref: '/new/notes.md',
    });
  });

  it('canceling a relocation leaves the bookmark intact', () => {
    doc('notes.md', '', '/old/notes.md');
    bookmarkCurrentFile();
    const before = getBookmarks();
    [...document.querySelectorAll('.bookmark-actions button')]
      .find((b) => b.textContent === 'Locate file')
      .click();
    document
      .querySelector('.bookmarks-overlay input[type=file]')
      .dispatchEvent(new Event('cancel'));
    expect(getBookmarks()).toEqual(before);
  });

  it('replaces a saved copy and stops reusing the old open copy', async () => {
    const tab = doc('notes.md', '# Old');
    bookmarkCurrentFile();
    const [entry] = getBookmarks();
    [...document.querySelectorAll('.bookmark-actions button')]
      .find((b) => b.textContent === 'Replace copy')
      .click();
    const input = document.querySelector('.bookmarks-overlay input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['# New'], 'notes.md')],
    });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getBookmarks()[0].content).toBe('# New');
    expect(tab.sourceMeta.bookmarkId).toBeUndefined();
    await recallBookmark(entry.id);
    expect(state.tabs.at(-1).rawMarkdown).toBe('# New');
  });

  it('reuses an already open bookmarked tab', async () => {
    const tab = doc('notes.md', '', '/tmp/notes.md');
    bookmarkCurrentFile();
    const switchTab = jest.fn();
    configureBookmarks({ switchTab, createTab: jest.fn() });
    await recallBookmark(getBookmarks()[0].id);
    expect(switchTab).toHaveBeenCalledWith(tab.id);
    expect(state.tabs).toHaveLength(1);
  });

  it('does not open a file after the bookmark dialog was dismissed during loading', async () => {
    doc('notes.md', '', '/tmp/notes.md');
    bookmarkCurrentFile();
    state.tabs = [];
    let finish;
    window.specdown = {
      readBookmarkedFile: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const pending = recallBookmark(getBookmarks()[0].id);
    closeBookmarks();
    finish({
      filename: 'notes.md',
      content: '# Late',
      filePath: '/tmp/notes.md',
    });
    await pending;
    expect(state.tabs).toHaveLength(0);
  });

  it('fetches URL bookmarks without credentials and supports edited addresses', async () => {
    doc('notes.md', '', null, { url: 'https://example.com/notes.md' });
    bookmarkCurrentFile();
    const [entry] = getBookmarks();
    updateBookmark(entry.id, { ref: 'https://example.com/new.md' });
    state.tabs = [];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '# Remote',
    });
    await recallBookmark(entry.id);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/new.md',
      expect.objectContaining({ credentials: 'omit' })
    );
    expect(state.tabs[0].rawMarkdown).toBe('# Remote');
  });

  it('filters by title and location, and safely renders unusual filenames', () => {
    doc('<img src=x onerror=alert(1)>.md', '', '/work/design.md');
    bookmarkCurrentFile();
    expect(document.querySelector('.bookmark-open img')).toBeNull();
    const search = document.getElementById('bookmark-search');
    search.value = 'other';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.bookmark-row')).toHaveLength(0);
    search.value = '/work';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.bookmark-row')).toHaveLength(1);
  });

  it('requires confirmation to remove and leaves the original tab intact', () => {
    doc();
    bookmarkCurrentFile();
    [...document.querySelectorAll('.bookmark-actions button')]
      .find((b) => b.textContent === 'Remove')
      .click();
    expect(getBookmarks()).toHaveLength(1);
    [...document.querySelectorAll('.bookmark-actions button')]
      .find((b) => b.textContent === 'Remove bookmark?')
      .click();
    expect(getBookmarks()).toHaveLength(0);
    expect(state.tabs).toHaveLength(1);
  });

  it('does not overwrite prior bookmarks when storage is full', () => {
    doc('one.md');
    bookmarkCurrentFile();
    const before = localStorage.getItem('specdown-bookmarks-v1');
    doc('two.md');
    Storage.prototype.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    bookmarkCurrentFile();
    expect(localStorage.getItem('specdown-bookmarks-v1')).toBe(before);
    expect(document.body.textContent).toContain('could not be saved');
  });

  it('preserves corrupt storage rather than silently replacing it', () => {
    localStorage.setItem('specdown-bookmarks-v1', '{bad');
    doc();
    bookmarkCurrentFile();
    expect(localStorage.getItem('specdown-bookmarks-v1')).toBe('{bad');
  });

  it('supports the global button and iPhone sheet actions', () => {
    document.getElementById('bookmarks-button').click();
    expect(isBookmarksOpen()).toBe(true);
    closeBookmarks();
    doc();
    document.getElementById('ios-bookmark-button').click();
    expect(getBookmarks()).toHaveLength(1);
  });
});
