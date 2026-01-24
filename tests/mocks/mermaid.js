/**
 * Mock for mermaid.js library
 */

const mermaid = {
  initialize: jest.fn(),

  render: jest.fn((id, code) => {
    // Return a promise that resolves with mock SVG
    return Promise.resolve({
      svg: `<svg id="${id}" class="mermaid-diagram"><text>${code}</text></svg>`,
      bindFunctions: jest.fn(),
    });
  }),

  mermaidAPI: {
    render: jest.fn((id, code, callback) => {
      const svg = `<svg id="${id}" class="mermaid-diagram"><text>${code}</text></svg>`;
      if (callback) {
        callback(svg);
      }
      return svg;
    }),
  },

  // Mock error scenarios
  __setRenderError: function(shouldError) {
    if (shouldError) {
      this.render.mockRejectedValue(new Error('Mermaid syntax error'));
    } else {
      this.render.mockResolvedValue({
        svg: '<svg><text>Valid diagram</text></svg>',
        bindFunctions: jest.fn(),
      });
    }
  },
};

global.mermaid = mermaid;

module.exports = mermaid;
