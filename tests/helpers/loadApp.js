/**
 * Helper to load app.js with all CDN dependencies mocked
 */

const fs = require('fs');
const path = require('path');

// Load mocks
require('../mocks/marked');
require('../mocks/mermaid');
require('../mocks/panzoom');
require('../mocks/highlightjs');

/**
 * Load the app.js file into the test environment
 * @param {Document} document - The jsdom document object
 * @returns {void}
 */
function loadApp(document) {
  // Read the app.js file
  const appPath = path.join(__dirname, '../../markdown-viewer/app.js');
  let appCode = fs.readFileSync(appPath, 'utf8');

  // Replace function declarations with global assignments to make them accessible
  // This makes functions available in the global scope for testing
  appCode = appCode.replace(/^function (\w+)/gm, 'global.$1 = function');
  appCode = appCode.replace(/^async function (\w+)/gm, 'global.$1 = async function');

  // Execute in the current context with eval
  // eslint-disable-next-line no-eval
  eval(appCode);
}

/**
 * Load the index.html structure into the document
 * @param {Document} document - The jsdom document object
 * @returns {void}
 */
function loadHTML(document) {
  const htmlPath = path.join(__dirname, '../../markdown-viewer/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract body content (skip script tags)
  const bodyMatch = html.match(/<body>([\s\S]*)<script src="app\.js"><\/script>/);
  if (bodyMatch) {
    document.body.innerHTML = bodyMatch[1];
  }
}

module.exports = {
  loadApp,
  loadHTML,
};
