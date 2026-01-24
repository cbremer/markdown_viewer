/**
 * Jest Setup File
 * Configures the testing environment and global mocks
 */

// Import testing library extensions
require('@testing-library/jest-dom');

// Create mock functions for localStorage
const getItemMock = jest.fn();
const setItemMock = jest.fn();
const removeItemMock = jest.fn();
const clearMock = jest.fn();

// Mock localStorage
global.localStorage = {
  getItem: getItemMock,
  setItem: setItemMock,
  removeItem: removeItemMock,
  clear: clearMock,
};

// Create mock functions for sessionStorage
const sessionGetItemMock = jest.fn();
const sessionSetItemMock = jest.fn();
const sessionRemoveItemMock = jest.fn();
const sessionClearMock = jest.fn();

// Mock sessionStorage
global.sessionStorage = {
  getItem: sessionGetItemMock,
  setItem: sessionSetItemMock,
  removeItem: sessionRemoveItemMock,
  clear: sessionClearMock,
};

// Mock alert
global.alert = jest.fn();

// Mock console methods to reduce test noise (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

// Setup FileReader mock
class FileReaderMock {
  constructor() {
    this.readAsText = jest.fn(function(file) {
      // Simulate async file reading
      setTimeout(() => {
        if (this.onload) {
          this.result = file.mockContent || '';
          this.onload({ target: this });
        }
      }, 0);
    });
    this.onerror = null;
    this.onload = null;
    this.result = null;
  }
}
global.FileReader = FileReaderMock;

// Mock File constructor
global.File = class File {
  constructor(parts, filename, options) {
    this.parts = parts;
    this.name = filename;
    this.type = options?.type || '';
    this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
    this.mockContent = parts.join('');
  }
};

// Mock Blob
global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options?.type || '';
    this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
  }
};

// Reset mocks before each test
beforeEach(() => {
  // Clear mock call history
  getItemMock.mockClear();
  setItemMock.mockClear();
  removeItemMock.mockClear();
  clearMock.mockClear();

  sessionGetItemMock.mockClear();
  sessionSetItemMock.mockClear();
  sessionRemoveItemMock.mockClear();
  sessionClearMock.mockClear();

  global.alert.mockClear();
  global.console.error.mockClear();
  global.console.warn.mockClear();

  // Clear document body
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});
