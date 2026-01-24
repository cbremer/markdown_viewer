/**
 * Mock for highlight.js library
 */

const hljs = {
  highlight: jest.fn((code, options) => {
    const language = options?.language || 'plaintext';
    return {
      value: `<span class="hljs-${language}">${code}</span>`,
      language: language,
      relevance: 5,
      illegal: false,
    };
  }),

  highlightAuto: jest.fn((code, languageSubset) => {
    return {
      value: `<span class="hljs-auto">${code}</span>`,
      language: 'javascript',
      relevance: 5,
      illegal: false,
      secondBest: undefined,
    };
  }),

  highlightElement: jest.fn((element) => {
    const code = element.textContent;
    const language = element.className.replace('language-', '') || 'plaintext';
    element.innerHTML = `<span class="hljs-${language}">${code}</span>`;
  }),

  configure: jest.fn(),

  registerLanguage: jest.fn(),

  listLanguages: jest.fn(() => ['javascript', 'python', 'java', 'bash', 'json', 'yaml']),

  // Mock getLanguage to always report that the language exists by default.
  // Tests can override this with hljs.getLanguage.mockImplementation(...)
  getLanguage: jest.fn((language) => ({ name: language })),

  // Simulate error scenario
  __setHighlightError: function(shouldError) {
    if (shouldError) {
      this.highlight.mockImplementation(() => {
        throw new Error('Highlight.js error');
      });
    } else {
      this.highlight.mockImplementation((code, options) => {
        const language = options?.language || 'plaintext';
        return {
          value: `<span class="hljs-${language}">${code}</span>`,
          language: language,
          relevance: 5,
          illegal: false,
        };
      });
    }
  },
};

global.hljs = hljs;

module.exports = hljs;
