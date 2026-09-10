// @ts-check
// iOS native chrome + print.
//
// The iOS shell talks to the web app through window.webkit.messageHandlers and
// a window.setIOSLayoutMode bridge, and the app drives a native-feeling action
// bar / sheets. This module owns that layer (plus the print pipeline, which is
// entangled with the iOS native-print path). DOM elements are looked up by id
// so the module is self-contained.

import DOMPurify from 'dompurify';
import { state } from '../core/state.js';
import { trapFocus } from '../core/focus-trap.js';
import { isDesktop, isIOSNative } from '../core/platform.js';
import { escapeHtml } from '../core/utils.js';
import { getMermaidConfig, loadMermaid } from '../core/render-config.js';
import { visualThemeLabel } from '../core/visual-theme-catalog.js';
import { hasDesktopBridge, bridgeRequestFileOpen } from './bridge.js';

const el = (/** @type {string} */ id) => document.getElementById(id);

// The iOS WKScriptMessage bridge, present only inside the native shell.
const iosHandler = () =>
  window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.specdown;

export function setupIOSNativeUI() {
  document.body.classList.toggle('ios-native', isIOSNative);
  document.documentElement.classList.toggle('ios-native', isIOSNative);
  const iosSampleSection = el('ios-sample-section');
  if (iosSampleSection) {
    iosSampleSection.style.display = isIOSNative ? '' : 'none';
  }
  document.body.classList.toggle('ios-pad', isIOSNative && state.iosLayoutMode === 'pad');
  document.documentElement.classList.toggle('ios-pad', isIOSNative && state.iosLayoutMode === 'pad');
  syncIOSChrome();
}

export function requestAppIconPickerIfAvailable() {
  const handler = iosHandler();
  if (!isIOSNative || !handler) return false;
  handler.postMessage({ action: 'showAppIconPicker' });
  return true;
}

export function requestNativeOpenIfAvailable() {
  if (isDesktop && hasDesktopBridge()) {
    bridgeRequestFileOpen();
    return true;
  }
  const handler = iosHandler();
  if (isIOSNative && handler) {
    handler.postMessage({ action: 'openFilePicker' });
    return true;
  }
  return false;
}

/** @param {string} sampleName */
export function requestBundledSampleIfAvailable(sampleName) {
  const handler = iosHandler();
  if (!isIOSNative || !handler) {
    return false;
  }
  handler.postMessage({
    action: 'openBundledSample',
    data: { name: sampleName },
  });
  return true;
}

/** The active document's display title, for print/export headers. */
function printableTitle() {
  const fileName = el('file-name');
  return fileName && fileName.textContent ? fileName.textContent : 'Specdown Document';
}

export function hasLoadedContent() {
  const contentArea = el('content-area');
  return !!(contentArea && contentArea.style.display !== 'none' && state.currentRawMarkdown);
}

/** Per-sheet focus-trap release fns, keyed by element id. @type {Map<string, () => void>} */
const sheetTraps = new Map();

/**
 * @param {HTMLElement | null} sheet
 * @param {boolean} visible
 */
export function setIOSSheetVisibility(sheet, visible) {
  if (!sheet) return;
  sheet.style.display = visible ? 'flex' : 'none';
  // Sheets are aria-modal surfaces; trap Tab while open (external keyboards
  // on iPad are common) and release on close.
  const existing = sheetTraps.get(sheet.id);
  if (existing) {
    existing();
    sheetTraps.delete(sheet.id);
  }
  if (visible) {
    sheetTraps.set(sheet.id, trapFocus(sheet));
  }
}

export function closeIOSActionSheet() {
  setIOSSheetVisibility(el('ios-action-sheet'), false);
}

export function closeIOSTocSheet() {
  setIOSSheetVisibility(el('ios-toc-sheet'), false);
  state.tocVisible = false;
  const tocToggle = el('toc-toggle');
  if (tocToggle) tocToggle.classList.remove('active');
  syncIOSChrome();
}

/**
 * @param {HTMLElement | null} button
 * @param {string} label
 */
function updateIOSActionButtonLabel(button, label) {
  if (!button) return;
  const labelEl = button.querySelector('.ios-action-label');
  if (labelEl) {
    labelEl.textContent = label;
  }
}

/**
 * @param {HTMLElement | null} button
 * @param {string} label
 * @param {boolean} active
 */
function updateIOSSheetButton(button, label, active) {
  if (!button) return;
  button.textContent = label;
  button.classList.toggle('active', !!active);
}

// Print pipeline. Every surface prints the SAME standalone document built by
// buildPrintableDocument() — never the live app layout, whose viewport-fixed
// flex containers (body overflow:hidden, 100vh app shell) clip printing to
// the visible screen:
//   - iOS      → native UIPrintInteractionController via the WK bridge
//   - desktop + web → a hidden same-origin iframe hosting the document is
//                printed. Desktop MUST use this in-window path, not an
//                offscreen shell window: on macOS the print dialog is a sheet
//                attached to its window, so printing from a hidden
//                BrowserWindow shows no dialog at all (PDF export is fine —
//                its save dialog attaches to the main window).
//   - fallback → bare window.print() plus the @media print CSS, only if the
//                paths above are unavailable
export async function performPrint() {
  try {
    const iosPrintHandler = iosHandler();
    if (isIOSNative && iosPrintHandler && hasLoadedContent()) {
      iosPrintHandler.postMessage({
        action: 'printDocument',
        data: { title: printableTitle(), html: await buildPrintableDocument() },
      });
      return;
    }
    if (hasLoadedContent() && (await printViaHiddenFrame())) {
      return;
    }
  } catch (error) {
    console.error('Print pipeline failed, falling back to window.print():', error);
  }
  window.print();
}

/** @type {HTMLIFrameElement | null} */
let activePrintFrame = null;

function removeActivePrintFrame() {
  if (activePrintFrame && activePrintFrame.parentNode) {
    activePrintFrame.parentNode.removeChild(activePrintFrame);
  }
  activePrintFrame = null;
}

// Desktop + web print: host the printable document in a hidden same-origin
// iframe and print THAT window. The iframe document carries its own
// @page/print styles and none of the app's viewport-fixed layout, so the full
// document paginates instead of clipping to the current scroll position. The
// print dialog attaches to the visible window (as a sheet on macOS).
async function printViaHiddenFrame() {
  const printableHtml = await buildPrintableDocument();
  if (!printableHtml) return false;
  try {
    removeActivePrintFrame();
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
      'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0; visibility: hidden;';
    document.body.appendChild(frame);
    activePrintFrame = frame;

    const frameDoc = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDoc || !frameWindow || typeof frameWindow.print !== 'function') {
      removeActivePrintFrame();
      return false;
    }
    frameDoc.open();
    frameDoc.write(printableHtml);
    frameDoc.close();

    // Clean up when the print dialog closes; the timeout is a backstop for
    // engines that never deliver afterprint to a subframe.
    frameWindow.addEventListener('afterprint', () => removeActivePrintFrame());
    setTimeout(() => {
      if (activePrintFrame === frame) removeActivePrintFrame();
    }, 60000);

    frameWindow.focus();
    frameWindow.print();
    return true;
  } catch (error) {
    console.error('Hidden-frame print failed:', error);
    removeActivePrintFrame();
    return false;
  }
}

window.setIOSLayoutMode = function (/** @type {string} */ mode) {
  state.iosLayoutMode = mode === 'pad' ? 'pad' : 'phone';
  if (isIOSNative) {
    document.body.classList.toggle('ios-pad', state.iosLayoutMode === 'pad');
    document.documentElement.classList.toggle('ios-pad', state.iosLayoutMode === 'pad');
    if (state.iosLayoutMode === 'pad') {
      closeIOSActionSheet();
      closeIOSTocSheet();
    }
  }
  syncIOSChrome();
};

// Re-render the cloned diagrams with the LIGHT mermaid theme when the app is
// in dark mode: a dark-theme SVG (light strokes/text tuned for a dark canvas)
// prints nearly invisible on white paper. Each diagram is re-rendered from its
// stored source; on any failure the on-screen clone is kept for that diagram.
/** @param {HTMLElement} printRoot */
async function rerenderPrintDiagramsLight(printRoot) {
  const darkSvgs = printRoot.querySelectorAll('.diagram-wrapper svg[data-mermaid-source]');
  if (darkSvgs.length === 0) return;
  let printMermaid;
  try {
    printMermaid = await loadMermaid();
  } catch (error) {
    console.error('Mermaid unavailable for print re-render:', error);
    return;
  }
  // getMermaidConfig derives its theme from state.currentTheme, so flip it for
  // the duration of the render and restore in finally (including the engine's
  // config, so an on-screen theme re-render isn't left with print settings).
  const savedPrintTheme = state.currentTheme;
  state.currentTheme = 'light';
  let printDiagramSeq = 0;
  try {
    printMermaid.initialize(getMermaidConfig());
    for (const node of darkSvgs) {
      const diagramSource = node.getAttribute('data-mermaid-source');
      if (!diagramSource) continue;
      try {
        const { svg } = await printMermaid.render(
          `print-diagram-${Date.now()}-${printDiagramSeq++}`,
          diagramSource
        );
        const holder = document.createElement('div');
        holder.innerHTML = DOMPurify.sanitize(svg, {
          ADD_TAGS: ['foreignObject'],
          ADD_ATTR: ['xmlns'],
        });
        const lightSvg = holder.querySelector('svg');
        if (lightSvg) {
          lightSvg.setAttribute('data-mermaid-source', diagramSource);
          node.replaceWith(lightSvg);
        }
      } catch (error) {
        console.error('Print diagram re-render failed, keeping on-screen copy:', error);
      }
    }
  } finally {
    state.currentTheme = savedPrintTheme;
    try {
      printMermaid.initialize(getMermaidConfig());
    } catch {
      // Engine config restore is best-effort.
    }
  }
}

// Build a fully standalone printable HTML document from the rendered content:
// UI chrome stripped, panzoom sizing/transforms cleared, its own light-on-white
// print stylesheet with @page margins. This is the ONE artifact every print and
// PDF-export path renders, so all surfaces paginate identically.
export async function buildPrintableDocument() {
  const markdownContent = el('markdown-content');
  const title = printableTitle();
  if (!markdownContent) return '';
  const printableContent = /** @type {HTMLElement} */ (markdownContent.cloneNode(true));

  printableContent
    .querySelectorAll('.diagram-expand, .annotation-popover, .search-highlight, .search-highlight-current, .code-copy-btn')
    .forEach((element) => element.remove());
  printableContent.querySelectorAll('.annotation-badge').forEach((badge) => badge.remove());
  printableContent.querySelectorAll('.has-annotation').forEach((element) => {
    element.classList.remove('has-annotation');
  });

  if (state.currentTheme === 'dark') {
    await rerenderPrintDiagramsLight(printableContent);
  }

  printableContent.querySelectorAll('.diagram-wrapper').forEach((node) => {
    const wrapper = /** @type {HTMLElement} */ (node);
    wrapper.style.cssText = '';
    wrapper.style.height = 'auto';
    wrapper.style.overflow = 'visible';
  });
  printableContent.querySelectorAll('.diagram-wrapper svg').forEach((node) => {
    const svg = /** @type {SVGElement} */ (node);
    // The on-screen SVG carries panzoom's absolute positioning, transform, and
    // explicit pixel size. Clear all of it and let the viewBox drive natural
    // size, capped to the printable page so wide diagrams shrink-to-fit
    // instead of running off the sheet and tall ones stay on one page.
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.cssText = '';
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '230mm';
    svg.style.width = 'auto';
    svg.style.height = 'auto';
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        @page {
            margin: 18mm 14mm;
        }
        html {
            box-sizing: border-box;
            background: #ffffff;
        }
        *,
        *::before,
        *::after {
            box-sizing: inherit;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 0;
            line-height: 1.6;
        }
        .print-shell {
            max-width: 100%;
            padding: 12px 10px 16px;
        }
        .print-title {
            margin: 0 0 24px;
            font-size: 28px;
            font-weight: 700;
        }
        .print-content h1,
        .print-content h2,
        .print-content h3,
        .print-content h4,
        .print-content h5,
        .print-content h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            line-height: 1.3;
        }
        .print-content h1,
        .print-content h2 {
            padding-bottom: 0.3em;
            border-bottom: 1px solid #d1d5db;
        }
        .print-content p,
        .print-content ul,
        .print-content ol,
        .print-content table,
        .print-content blockquote,
        .print-content pre,
        .print-content .diagram-container {
            margin-bottom: 1em;
        }
        .print-content ul,
        .print-content ol {
            padding-left: 2em;
        }
        .print-content code {
            font-family: "SFMono-Regular", SFMono-Regular, ui-monospace, Menlo, monospace;
            background: #f3f4f6;
            padding: 0.15em 0.35em;
            border-radius: 4px;
            font-size: 0.92em;
        }
        .print-content pre {
            white-space: pre-wrap;
            word-break: break-word;
            overflow: visible;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            border-radius: 8px;
            padding: 1em;
        }
        .print-content pre code {
            background: transparent;
            padding: 0;
        }
        .print-content table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        .print-content th,
        .print-content td {
            border: 1px solid #d1d5db;
            padding: 0.6em;
            text-align: left;
            vertical-align: top;
            word-break: break-word;
        }
        .print-content blockquote {
            margin-left: 0;
            padding-left: 1em;
            border-left: 4px solid #60a5fa;
            color: #4b5563;
        }
        .print-content img,
        .print-content svg {
            max-width: 100%;
            height: auto;
        }
        .print-content .raw-markdown,
        .print-content .html-comment-block,
        .print-content .diagram-container,
        .print-content pre,
        .print-content table,
        .print-content blockquote {
            max-width: 100%;
        }
        .print-content .diagram-container,
        .print-content .diagram-wrapper {
            page-break-inside: avoid;
            break-inside: avoid;
        }
    </style>
</head>
<body>
    <main class="print-shell">
        <h1 class="print-title">${escapeHtml(title)}</h1>
        <section class="print-content">${printableContent.innerHTML}</section>
    </main>
</body>
</html>`;
}

export function syncIOSChrome() {
  if (!isIOSNative) return;

  const hasContent = hasLoadedContent();
  const showActionBar = (hasContent || state.tabs.length > 0) && state.iosLayoutMode !== 'pad';
  const canShowContents = hasContent && state.currentViewMode === 'preview' && state.tocEntries.length > 0;

  const iosActionBar = el('ios-action-bar');
  if (iosActionBar) {
    iosActionBar.style.display = showActionBar ? 'grid' : 'none';
  }

  const iosContentsButton = /** @type {HTMLButtonElement | null} */ (el('ios-contents-button'));
  if (iosContentsButton) {
    iosContentsButton.disabled = !canShowContents;
    iosContentsButton.classList.toggle('active', state.tocVisible);
  }

  const iosViewButton = /** @type {HTMLButtonElement | null} */ (el('ios-view-button'));
  if (iosViewButton) {
    iosViewButton.disabled = !hasContent;
    iosViewButton.classList.toggle('active', state.currentViewMode === 'raw');
    updateIOSActionButtonLabel(iosViewButton, state.currentViewMode === 'preview' ? 'Raw' : 'Preview');
  }

  const iosMoreButton = /** @type {HTMLButtonElement | null} */ (el('ios-more-button'));
  if (iosMoreButton) {
    iosMoreButton.disabled = !hasContent;
  }

  updateIOSSheetButton(el('ios-split-button'), state.splitViewActive ? 'Hide Split View' : 'Show Split View', state.splitViewActive);
  updateIOSSheetButton(el('ios-theme-button'), state.currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode', false);
  updateIOSSheetButton(
    el('ios-visual-theme-button'),
    'Theme: ' + visualThemeLabel(state.visualTheme),
    state.visualTheme !== 'default'
  );

  const iosSplitButton = /** @type {HTMLButtonElement | null} */ (el('ios-split-button'));
  const iosPrintButton = /** @type {HTMLButtonElement | null} */ (el('ios-print-button'));
  if (iosSplitButton) iosSplitButton.disabled = !hasContent;
  if (iosPrintButton) iosPrintButton.disabled = !hasContent;
}
