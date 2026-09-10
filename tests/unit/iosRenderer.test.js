/**
 * Unit tests for iOS-native renderer behavior in app.js
 */

const { loadHTML, loadApp } = require('../helpers/loadApp');
require('../mocks/marked');
require('../mocks/mermaid');
require('../mocks/panzoom');
require('../mocks/highlightjs');

describe('iOS renderer integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.iosNative = true;
    window.webkit = {
      messageHandlers: {
        specdown: {
          postMessage: jest.fn(),
        },
      },
    };

    loadHTML(document);
    loadApp(document);
  });

  afterEach(() => {
    delete window.iosNative;
    delete window.webkit;
  });

  it('uses native picker when clicking Browse on iOS', () => {
    const browseButton = document.getElementById('browse-button');
    const fileInput = document.getElementById('file-input');
    fileInput.click = jest.fn();

    browseButton.dispatchEvent(new Event('click', { bubbles: true }));

    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledWith({
      action: 'openFilePicker',
    });
    expect(fileInput.click).not.toHaveBeenCalled();
  });

  it.each(['ios-welcome-app-icon-button', 'ios-app-icon-button'])('opens the native icon picker from %s', (id) => {
    window.webkit.messageHandlers.specdown.postMessage.mockClear();
    document.getElementById(id).click();
    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledTimes(1);
    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledWith({ action: 'showAppIconPicker' });
  });

  it('shows bundled sample actions on iOS', () => {
    const sampleSection = document.getElementById('ios-sample-section');
    expect(sampleSection.style.display).toBe('');
    expect(document.body.classList.contains('ios-native')).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requests the basic bundled sample from iOS', () => {
    const button = document.getElementById('open-sample-basic');

    button.dispatchEvent(new Event('click', { bubbles: true }));

    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledWith({
      action: 'openBundledSample',
      data: { name: 'sample.md' },
    });
  });

  it('requests the mermaid bundled sample from iOS', () => {
    const button = document.getElementById('open-sample-mermaid');

    button.dispatchEvent(new Event('click', { bubbles: true }));

    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledWith({
      action: 'openBundledSample',
      data: { name: 'diagram-showcase.md' },
    });
  });

  it('opens native-loaded files as tabs', () => {
    expect(state.tabs).toHaveLength(0);

    window.loadFileContent('# Native file', 'native.md');

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.tabs[0].filename).toBe('native.md');
    expect(state.tabs[0].rawMarkdown).toBe('# Native file');
    expect(document.getElementById('ios-action-bar').style.display).toBe('grid');
  });

  it('hides the phone action bar in iPad layout mode', () => {
    window.loadFileContent('# Native file', 'native.md');
    window.setIOSLayoutMode('pad');

    expect(document.getElementById('ios-action-bar').style.display).toBe('none');
    expect(document.body.classList.contains('ios-pad')).toBe(true);
  });

  it('does not expose annotations in the iOS action sheet', () => {
    expect(document.getElementById('ios-annotate-button')).toBeNull();
  });

  it('uses an iOS sheet for contents instead of the hidden sidebar', async () => {
    window.loadFileContent('# Heading\n\n## Child', 'outline.md');
    await Promise.resolve();
    await Promise.resolve();

    const contentsButton = document.getElementById('ios-contents-button');
    contentsButton.dispatchEvent(new Event('click', { bubbles: true }));

    expect(document.getElementById('ios-toc-sheet').style.display).toBe('flex');
    expect(document.getElementById('ios-toc-nav').textContent).toContain('Heading');
    expect(document.getElementById('toc-sidebar').style.display).toBe('none');
  });

  it('updates the iOS raw toggle label after switching modes', async () => {
    window.loadFileContent('# Native file', 'native.md');

    const viewButton = document.getElementById('ios-view-button');
    viewButton.dispatchEvent(new Event('click', { bubbles: true }));

    expect(viewButton.textContent).toContain('Preview');
  });

  it('routes print requests through the native iOS bridge', async () => {
    window.loadFileContent('# Native file', 'native.md');

    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
    const printButton = document.getElementById('ios-print-button');
    printButton.dispatchEvent(new Event('click', { bubbles: true }));
    // performPrint is async (the printable document builder may re-render
    // diagrams) — let its microtasks settle before asserting.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.webkit.messageHandlers.specdown.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'printDocument',
        data: expect.objectContaining({
          title: 'native.md',
          html: expect.stringContaining('Native file'),
        }),
      })
    );
    const payload = window.webkit.messageHandlers.specdown.postMessage.mock.calls.at(-1)[0];
    expect(payload.data.html).toContain('@page');
    expect(payload.data.html).toContain('margin: 18mm 14mm;');
    expect(printSpy).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('applies ios-native class to body and html for safe area CSS', () => {
    expect(document.body.classList.contains('ios-native')).toBe(true);
    expect(document.documentElement.classList.contains('ios-native')).toBe(true);
  });

  it('uses safe area insets in CSS for header and action bar', () => {
    // Read the styles.css file to verify safe area environment variables
    const fs = require('fs');
    const path = require('path');
    const cssPath = path.join(__dirname, '../../markdown-viewer/styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Check for iOS header safe area handling (all four edges)
    expect(cssContent).toContain('.ios-native .app-header');
    expect(cssContent).toMatch(/\.ios-native\s+\.app-header[^}]*env\(safe-area-inset-top/);
    expect(cssContent).toMatch(/\.ios-native\s+\.app-header[^}]*env\(safe-area-inset-left/);
    expect(cssContent).toMatch(/\.ios-native\s+\.app-header[^}]*env\(safe-area-inset-right/);

    // Check for iOS action bar safe area handling (all four edges)
    expect(cssContent).toContain('.ios-action-bar');
    expect(cssContent).toMatch(/\.ios-action-bar[^}]*env\(safe-area-inset-bottom/);
    expect(cssContent).toMatch(/\.ios-action-bar[^}]*env\(safe-area-inset-left/);
    expect(cssContent).toMatch(/\.ios-action-bar[^}]*env\(safe-area-inset-right/);
  });
});
