/**
 * Mock for marked.js library
 */

const marked = {
  parse: jest.fn((markdown) => {
    // Simple mock implementation - converts markdown headers
    return markdown
      .replace(/^# (.*)/gm, '<h1>$1</h1>')
      .replace(/^## (.*)/gm, '<h2>$1</h2>')
      .replace(/^### (.*)/gm, '<h3>$1</h3>')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>');
  }),

  setOptions: jest.fn(),

  use: jest.fn(),
};

global.marked = marked;

module.exports = marked;
