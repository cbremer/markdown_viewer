/**
 * Unit tests for theme management functionality
 */

const { loadHTML, loadApp } = require('../helpers/loadApp');
require('../mocks/marked');
require('../mocks/mermaid');
require('../mocks/panzoom');
require('../mocks/highlightjs');

describe('Theme Management', () => {
  beforeEach(() => {
    // Clear localStorage before each test (call is already mocked in setup.js)
    localStorage.clear();

    // Load HTML structure
    loadHTML(document);
  });

  describe('setupTheme', () => {
    it('should apply theme from localStorage', () => {
      localStorage.getItem.mockReturnValue('dark');

      loadApp(document);

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should default to light theme when localStorage is empty', () => {
      localStorage.getItem.mockReturnValue(null);

      loadApp(document);

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should update theme icon correctly on init', () => {
      localStorage.getItem.mockReturnValue('dark');

      loadApp(document);

      const icon = document.querySelector('.theme-icon');
      expect(icon.textContent).toBe('☀️');
    });

    it('should show moon icon in light theme', () => {
      localStorage.getItem.mockReturnValue('light');

      loadApp(document);

      const icon = document.querySelector('.theme-icon');
      expect(icon.textContent).toBe('🌙');
    });
  });

  describe('toggleTheme', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('light');
      loadApp(document);
    });

    it('should toggle from light to dark', () => {
      toggleTheme();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      // First toggle to dark
      toggleTheme();
      // Then toggle back to light
      toggleTheme();

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should persist theme to localStorage', () => {
      toggleTheme();

      expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should update DOM attribute', () => {
      toggleTheme();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should update theme icon when toggling', () => {
      const icon = document.querySelector('.theme-icon');

      // Initially light (moon icon)
      expect(icon.textContent).toBe('🌙');

      // Toggle to dark (sun icon)
      toggleTheme();
      expect(icon.textContent).toBe('☀️');

      // Toggle back to light (moon icon)
      toggleTheme();
      expect(icon.textContent).toBe('🌙');
    });

    it('should not re-render mermaid when content is hidden', () => {
      const contentArea = document.getElementById('content-area');
      contentArea.style.display = 'none';

      const reRenderSpy = jest.fn();
      global.reRenderMermaidDiagrams = reRenderSpy;

      toggleTheme();

      expect(reRenderSpy).not.toHaveBeenCalled();
    });

    it('should trigger mermaid re-render when content is visible', () => {
      const contentArea = document.getElementById('content-area');
      contentArea.style.display = 'flex';

      const reRenderSpy = jest.fn();
      global.reRenderMermaidDiagrams = reRenderSpy;

      toggleTheme();

      expect(reRenderSpy).toHaveBeenCalled();
    });
  });

  describe('updateThemeIcon', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('light');
      loadApp(document);
    });

    it('should show moon icon in light theme', () => {
      // currentTheme should be 'light'
      updateThemeIcon();

      const icon = document.querySelector('.theme-icon');
      expect(icon.textContent).toBe('🌙');
    });

    it('should show sun icon in dark theme', () => {
      // Toggle to dark first
      toggleTheme();

      const icon = document.querySelector('.theme-icon');
      expect(icon.textContent).toBe('☀️');
    });
  });
});
