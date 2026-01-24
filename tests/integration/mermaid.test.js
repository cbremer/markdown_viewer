/**
 * Integration tests for mermaid diagram processing
 */

const { loadHTML, loadApp } = require('../helpers/loadApp');
require('../mocks/marked');
require('../mocks/mermaid');
require('../mocks/panzoom');
require('../mocks/highlightjs');

describe('Mermaid Diagram Processing', () => {
  beforeEach(() => {
    loadHTML(document);
    loadApp(document);
    mermaid.render.mockClear();
    Panzoom.mockClear();
  });

  describe('configureMermaid', () => {
    it('should configure mermaid with correct theme for light mode', () => {
      localStorage.getItem.mockReturnValue('light');

      configureMermaid();

      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'default'
        })
      );
    });

    it('should configure mermaid with correct theme for dark mode', () => {
      // Reset and configure for dark mode
      document.documentElement.setAttribute('data-theme', 'dark');
      global.currentTheme = 'dark';

      configureMermaid();

      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'dark'
        })
      );
    });

    it('should set security level to loose', () => {
      configureMermaid();

      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          securityLevel: 'loose'
        })
      );
    });

    it('should configure font family', () => {
      configureMermaid();

      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          fontFamily: expect.stringContaining('apple-system')
        })
      );
    });
  });

  describe('processMermaidDiagrams', () => {
    it('should return early when no diagrams present', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = '<p>No diagrams here</p>';

      await processMermaidDiagrams();

      expect(mermaid.render).not.toHaveBeenCalled();
    });

    it('should find all mermaid code blocks', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
        <pre><code class="language-mermaid">flowchart LR\nStart --> End</code></pre>
      `;

      await processMermaidDiagrams();

      expect(mermaid.render).toHaveBeenCalledTimes(2);
    });

    it('should render valid mermaid syntax', async () => {
      const markdownContent = document.getElementById('markdown-content');
      const mermaidCode = 'graph TD\nA --> B';
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">${mermaidCode}</code></pre>
      `;

      await processMermaidDiagrams();

      expect(mermaid.render).toHaveBeenCalledWith(
        expect.stringContaining('mermaid-diagram'),
        mermaidCode
      );
    });

    it('should handle invalid mermaid syntax with error display', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">invalid syntax</code></pre>
      `;

      // Mock render to throw error
      mermaid.render.mockRejectedValueOnce(new Error('Mermaid syntax error'));

      await processMermaidDiagrams();

      // Check if error div was added
      const errorDiv = markdownContent.querySelector('.mermaid-error');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv.textContent).toContain('Error rendering diagram');
    });

    it('should replace code block with diagram container', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
      `;

      await processMermaidDiagrams();

      // Original pre element should be replaced
      expect(markdownContent.querySelector('pre')).toBeNull();
      // Diagram container should exist
      expect(markdownContent.querySelector('.diagram-container')).toBeTruthy();
    });

    it('should initialize panzoom for each diagram', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
      `;

      await processMermaidDiagrams();

      // Panzoom should be initialized
      expect(Panzoom).toHaveBeenCalled();
    });

    it('should generate unique IDs for each diagram', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
        <pre><code class="language-mermaid">graph TD\nC --> D</code></pre>
      `;

      await processMermaidDiagrams();

      const calls = mermaid.render.mock.calls;
      const id1 = calls[0][0];
      const id2 = calls[1][0];

      expect(id1).not.toBe(id2);
    });

    it('should preserve original code block on render error', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">invalid</code></pre>
      `;

      mermaid.render.mockRejectedValueOnce(new Error('Syntax error'));

      await processMermaidDiagrams();

      // Pre element should still exist
      expect(markdownContent.querySelector('pre')).toBeTruthy();
    });

    it('should store mermaid source on SVG element', async () => {
      const markdownContent = document.getElementById('markdown-content');
      const mermaidCode = 'graph TD\nA --> B';
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">${mermaidCode}</code></pre>
      `;

      await processMermaidDiagrams();

      const svgElement = markdownContent.querySelector('svg');
      expect(svgElement).toBeTruthy();
      expect(svgElement.getAttribute('data-mermaid-source')).toBe(mermaidCode);
    });
  });

  describe('createDiagramContainer', () => {
    it('should create container with diagram-container class', () => {
      const svg = '<svg><text>test</text></svg>';
      const diagramId = 'test-diagram-123';

      const container = createDiagramContainer(svg, diagramId);

      expect(container.className).toBe('diagram-container');
    });

    it('should set data-diagram-id attribute', () => {
      const svg = '<svg><text>test</text></svg>';
      const diagramId = 'test-diagram-123';

      const container = createDiagramContainer(svg, diagramId);

      expect(container.getAttribute('data-diagram-id')).toBe(diagramId);
    });

    it('should create control buttons', () => {
      const svg = '<svg><text>test</text></svg>';
      const diagramId = 'test-diagram-123';

      const container = createDiagramContainer(svg, diagramId);

      const controls = container.querySelector('.diagram-controls');
      expect(controls.querySelector('.zoom-in')).toBeTruthy();
      expect(controls.querySelector('.zoom-out')).toBeTruthy();
      expect(controls.querySelector('.reset')).toBeTruthy();
      expect(controls.querySelector('.fullscreen')).toBeTruthy();
    });

    it('should create wrapper with correct ID', () => {
      const svg = '<svg><text>test</text></svg>';
      const diagramId = 'test-diagram-123';

      const container = createDiagramContainer(svg, diagramId);

      const wrapper = container.querySelector('.diagram-wrapper');
      expect(wrapper.id).toBe(`wrapper-${diagramId}`);
    });

    it('should inject SVG into wrapper', () => {
      const svg = '<svg><text>test diagram</text></svg>';
      const diagramId = 'test-diagram-123';

      const container = createDiagramContainer(svg, diagramId);

      const wrapper = container.querySelector('.diagram-wrapper');
      expect(wrapper.innerHTML).toBe(svg);
    });
  });

  describe('reRenderMermaidDiagrams', () => {
    it('should update mermaid config with new theme', async () => {
      // Set up a diagram
      const markdownContent = document.getElementById('markdown-content');
      const mermaidCode = 'graph TD\nA --> B';
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">${mermaidCode}</code></pre>
      `;
      await processMermaidDiagrams();

      // Clear previous calls
      mermaid.initialize.mockClear();

      // Change theme and re-render
      global.currentTheme = 'dark';
      await reRenderMermaidDiagrams();

      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'dark'
        })
      );
    });

    it('should re-render all diagrams', async () => {
      // Set up diagrams
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
        <pre><code class="language-mermaid">graph TD\nC --> D</code></pre>
      `;
      await processMermaidDiagrams();

      // Clear previous render calls
      mermaid.render.mockClear();

      // Re-render
      await reRenderMermaidDiagrams();

      expect(mermaid.render).toHaveBeenCalledTimes(2);
    });

    it('should skip diagrams without mermaid source', async () => {
      const markdownContent = document.getElementById('markdown-content');

      // Manually create a diagram container without source
      const container = document.createElement('div');
      container.className = 'diagram-container';
      container.setAttribute('data-diagram-id', 'test-123');

      const wrapper = document.createElement('div');
      wrapper.className = 'diagram-wrapper';
      wrapper.innerHTML = '<svg></svg>';

      container.appendChild(wrapper);
      markdownContent.appendChild(container);

      mermaid.render.mockClear();

      await reRenderMermaidDiagrams();

      // Should not try to render diagram without source
      expect(mermaid.render).not.toHaveBeenCalled();
    });

    it('should handle re-render errors gracefully', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
      `;
      await processMermaidDiagrams();

      // Mock render to fail on re-render
      mermaid.render.mockRejectedValueOnce(new Error('Re-render error'));

      // Should not throw
      await expect(reRenderMermaidDiagrams()).resolves.not.toThrow();
    });

    it('should cleanup old panzoom instance before re-render', async () => {
      const markdownContent = document.getElementById('markdown-content');
      markdownContent.innerHTML = `
        <pre><code class="language-mermaid">graph TD\nA --> B</code></pre>
      `;
      await processMermaidDiagrams();

      // Get the panzoom instance that was created
      const panzoomCalls = Panzoom.mock.results;
      expect(panzoomCalls.length).toBeGreaterThan(0);
      
      const firstInstance = panzoomCalls[0].value;
      const destroySpy = jest.spyOn(firstInstance, 'destroy');

      await reRenderMermaidDiagrams();

      // Verify that the old panzoom instance was destroyed
      expect(destroySpy).toHaveBeenCalled();
    });
  });
});
