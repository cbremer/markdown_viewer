/**
 * Unit tests for file handling functionality
 */

const { loadHTML, loadApp } = require('../helpers/loadApp');
require('../mocks/marked');
require('../mocks/mermaid');
require('../mocks/panzoom');
require('../mocks/highlightjs');

describe('File Handling', () => {
  beforeEach(() => {
    // Load HTML structure
    loadHTML(document);
    // Load app.js
    loadApp(document);
  });

  describe('handleFile', () => {
    it('should accept .md files', (done) => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });

      // Create spy on FileReader
      const originalFileReader = global.FileReader;
      const mockOnLoad = jest.fn();

      global.FileReader = class {
        constructor() {
          this.readAsText = jest.fn(function() {
            this.result = '# Test';
            setTimeout(() => {
              if (this.onload) {
                this.onload({ target: this });
              }
              mockOnLoad();
              done();
            }, 0);
          });
        }
      };

      // Call handleFile (available in global scope after loadApp)
      handleFile(file);

      // Restore original FileReader
      setTimeout(() => {
        global.FileReader = originalFileReader;
      }, 10);
    });

    it('should accept .markdown files', (done) => {
      const file = new File(['# Test'], 'test.markdown', { type: 'text/markdown' });

      const originalFileReader = global.FileReader;

      global.FileReader = class {
        constructor() {
          this.readAsText = jest.fn(function() {
            this.result = '# Test';
            setTimeout(() => {
              if (this.onload) {
                this.onload({ target: this });
              }
              done();
            }, 0);
          });
        }
      };

      handleFile(file);

      setTimeout(() => {
        global.FileReader = originalFileReader;
      }, 10);
    });

    it('should reject .txt files with alert', () => {
      const file = new File(['Test content'], 'test.txt', { type: 'text/plain' });

      handleFile(file);

      expect(global.alert).toHaveBeenCalledWith(
        'Please select a valid Markdown file (.md or .markdown)'
      );
    });

    it('should reject files without extensions', () => {
      const file = new File(['Test'], 'test', { type: 'text/plain' });

      handleFile(file);

      expect(global.alert).toHaveBeenCalledWith(
        'Please select a valid Markdown file (.md or .markdown)'
      );
    });

    it('should handle file read errors with alert', (done) => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });

      const originalFileReader = global.FileReader;

      global.FileReader = class {
        constructor() {
          this.readAsText = jest.fn(function() {
            setTimeout(() => {
              if (this.onerror) {
                this.onerror(new Error('Read failed'));
              }

              expect(global.alert).toHaveBeenCalledWith(
                'Error reading file. Please try again.'
              );
              done();
            }, 0);
          });
        }
      };

      handleFile(file);

      setTimeout(() => {
        global.FileReader = originalFileReader;
      }, 10);
    });

    it('should handle case-insensitive file extensions', (done) => {
      const file = new File(['# Test'], 'test.MD', { type: 'text/markdown' });

      const originalFileReader = global.FileReader;

      global.FileReader = class {
        constructor() {
          this.readAsText = jest.fn(function() {
            this.result = '# Test';
            setTimeout(() => {
              if (this.onload) {
                this.onload({ target: this });
              }
              done();
            }, 0);
          });
        }
      };

      handleFile(file);

      setTimeout(() => {
        global.FileReader = originalFileReader;
      }, 10);
    });
  });

  describe('handleFileSelect', () => {
    it('should process first file from input', () => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const event = {
        target: {
          files: [file]
        }
      };

      // Spy on handleFile
      const originalHandleFile = global.handleFile;
      global.handleFile = jest.fn();

      handleFileSelect(event);

      expect(global.handleFile).toHaveBeenCalledWith(file);

      global.handleFile = originalHandleFile;
    });

    it('should handle empty file list', () => {
      const event = {
        target: {
          files: []
        }
      };

      const originalHandleFile = global.handleFile;
      global.handleFile = jest.fn();

      handleFileSelect(event);

      expect(global.handleFile).not.toHaveBeenCalled();

      global.handleFile = originalHandleFile;
    });
  });

  describe('handleDrop', () => {
    it('should extract file from drag event', () => {
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          files: [file]
        }
      };

      const originalHandleFile = global.handleFile;
      global.handleFile = jest.fn();

      handleDrop(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(global.handleFile).toHaveBeenCalledWith(file);

      global.handleFile = originalHandleFile;
    });

    it('should handle empty file list from drop', () => {
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          files: []
        }
      };

      const originalHandleFile = global.handleFile;
      global.handleFile = jest.fn();

      handleDrop(event);

      expect(global.handleFile).not.toHaveBeenCalled();

      global.handleFile = originalHandleFile;
    });

    it('should remove drag-over class on drop', () => {
      const dropZone = document.getElementById('drop-zone');
      dropZone.classList.add('drag-over');

      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          files: [file]
        }
      };

      handleDrop(event);

      expect(dropZone.classList.contains('drag-over')).toBe(false);
    });
  });
});
