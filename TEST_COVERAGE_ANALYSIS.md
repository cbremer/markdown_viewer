# Test Coverage Analysis - Markdown Diagram Viewer

**Date**: 2026-01-24
**Branch**: claude/analyze-test-coverage-WOZaG
**Current Test Coverage**: 0% (No tests exist)

## Executive Summary

The Markdown Diagram Viewer currently has **no automated tests**. This analysis identifies critical areas requiring test coverage and proposes a phased testing strategy.

### Current State
- **Total Source Files**: 3 (index.html, app.js, styles.css)
- **Lines of JavaScript**: ~584 lines in app.js
- **Testing Framework**: None configured
- **Test Files**: 0
- **Coverage Tooling**: None

---

## Proposed Testing Strategy

### Phase 1: Foundation (High Priority)
Set up testing infrastructure and cover critical path functionality.

### Phase 2: Comprehensive Coverage (Medium Priority)
Expand to edge cases and integration scenarios.

### Phase 3: Advanced Testing (Lower Priority)
Add visual regression, performance, and accessibility tests.

---

## Detailed Test Coverage Gaps

### 1. **Theme Management** (HIGH PRIORITY)
**Location**: app.js:33-53

**Current Functions**:
- `setupTheme()` - app.js:33
- `toggleTheme()` - app.js:38
- `updateThemeIcon()` - app.js:50

**Missing Test Coverage**:
- ✗ Theme initialization from localStorage
- ✗ Theme persistence after toggle
- ✗ Default theme when no localStorage value exists
- ✗ Theme icon updates correctly (🌙 ↔ ☀️)
- ✗ DOM attribute updates (`data-theme`)
- ✗ Mermaid diagram re-rendering on theme change

**Risk Level**: Medium
**Complexity**: Low
**Test Type**: Unit + Integration

**Recommended Tests**:
```javascript
describe('Theme Management', () => {
  describe('setupTheme', () => {
    it('should apply theme from localStorage')
    it('should default to light theme when localStorage is empty')
    it('should set data-theme attribute on document element')
    it('should update theme icon correctly')
  })

  describe('toggleTheme', () => {
    it('should toggle from light to dark')
    it('should toggle from dark to light')
    it('should persist theme to localStorage')
    it('should update DOM attribute')
    it('should trigger mermaid re-render when content is visible')
    it('should not re-render mermaid when content is hidden')
  })

  describe('updateThemeIcon', () => {
    it('should show moon icon in light theme')
    it('should show sun icon in dark theme')
  })
})
```

---

### 2. **File Handling & Validation** (CRITICAL PRIORITY)
**Location**: app.js:139-159

**Current Functions**:
- `handleFile(file)` - app.js:139
- `handleFileSelect(e)` - app.js:129
- `handleDrop(e)` - app.js:118

**Missing Test Coverage**:
- ✗ Accepts valid .md files
- ✗ Accepts valid .markdown files
- ✗ Rejects invalid file extensions (.txt, .doc, etc.)
- ✗ Handles file read errors gracefully
- ✗ Displays appropriate error messages
- ✗ File reader onload triggers renderMarkdown
- ✗ Empty files are handled correctly
- ✗ Large files are processed without hanging
- ✗ Files with special characters in names

**Risk Level**: Critical
**Complexity**: Medium
**Test Type**: Unit + Integration

**Recommended Tests**:
```javascript
describe('File Processing', () => {
  describe('handleFile', () => {
    it('should accept .md files')
    it('should accept .markdown files')
    it('should reject .txt files with alert')
    it('should reject files without extensions')
    it('should handle file read success')
    it('should handle file read errors with alert')
    it('should call renderMarkdown with correct content')
  })

  describe('handleFileSelect', () => {
    it('should process first file from input')
    it('should handle empty file list')
  })

  describe('handleDrop', () => {
    it('should extract file from drag event')
    it('should process dropped file')
    it('should remove drag-over class')
    it('should prevent default drop behavior')
  })
})
```

---

### 3. **Drag and Drop Interactions** (HIGH PRIORITY)
**Location**: app.js:104-127

**Current Functions**:
- `handleDragOver(e)` - app.js:104
- `handleDragLeave(e)` - app.js:110
- `handleDrop(e)` - app.js:118

**Missing Test Coverage**:
- ✗ Drag over adds visual feedback class
- ✗ Drag leave removes visual feedback
- ✗ Drop zone boundary detection
- ✗ Event propagation is stopped correctly
- ✗ Multiple file drops (should process first file only)

**Risk Level**: Medium
**Complexity**: Medium
**Test Type**: Integration

**Recommended Tests**:
```javascript
describe('Drag and Drop', () => {
  describe('handleDragOver', () => {
    it('should add drag-over class to drop zone')
    it('should prevent default behavior')
    it('should stop event propagation')
  })

  describe('handleDragLeave', () => {
    it('should remove drag-over class when leaving drop zone')
    it('should not remove class when leaving child elements')
    it('should prevent default and stop propagation')
  })

  describe('handleDrop', () => {
    it('should remove drag-over class on drop')
    it('should process first file when multiple files dropped')
    it('should handle empty file list')
  })
})
```

---

### 4. **Markdown Rendering** (CRITICAL PRIORITY)
**Location**: app.js:197-223

**Current Functions**:
- `renderMarkdown(content, filename)` - app.js:197
- `configureMarked()` - app.js:164

**Missing Test Coverage**:
- ✗ Basic markdown parsing (headers, lists, links)
- ✗ Code block syntax highlighting
- ✗ GFM features (tables, strikethrough, task lists)
- ✗ Cleanup of previous panzoom instances
- ✗ UI updates (filename display, content area visibility)
- ✗ Scroll reset to top
- ✗ Error handling for malformed markdown
- ✗ XSS protection (sanitization of HTML)

**Risk Level**: Critical
**Complexity**: High
**Test Type**: Unit + Integration

**Recommended Tests**:
```javascript
describe('Markdown Rendering', () => {
  describe('configureMarked', () => {
    it('should configure marked with GFM enabled')
    it('should enable line breaks')
    it('should configure syntax highlighting')
    it('should handle highlight errors gracefully')
  })

  describe('renderMarkdown', () => {
    it('should parse basic markdown to HTML')
    it('should highlight code blocks with language')
    it('should render GFM tables')
    it('should render task lists')
    it('should update filename display')
    it('should show content area and hide drop zone')
    it('should cleanup existing panzoom instances')
    it('should scroll content to top')
    it('should handle parsing errors with alert')
    it('should process mermaid diagrams after rendering')
    it('should sanitize potentially dangerous HTML')
  })
})
```

---

### 5. **Mermaid Diagram Processing** (CRITICAL PRIORITY)
**Location**: app.js:228-293

**Current Functions**:
- `processMermaidDiagrams()` - app.js:228
- `createDiagramContainer(svg, diagramId)` - app.js:268
- `configureMermaid()` - app.js:185

**Missing Test Coverage**:
- ✗ Detection of mermaid code blocks
- ✗ Diagram rendering success
- ✗ Diagram rendering errors are caught and displayed
- ✗ Unique ID generation for diagrams
- ✗ Container creation with controls
- ✗ SVG injection into DOM
- ✗ Panzoom initialization per diagram
- ✗ Theme-appropriate diagram rendering
- ✗ Multiple diagrams in single document

**Risk Level**: Critical
**Complexity**: High
**Test Type**: Integration + E2E

**Recommended Tests**:
```javascript
describe('Mermaid Diagram Processing', () => {
  describe('configureMermaid', () => {
    it('should configure mermaid with correct theme for light mode')
    it('should configure mermaid with correct theme for dark mode')
    it('should set security level to loose')
    it('should configure font family')
  })

  describe('processMermaidDiagrams', () => {
    it('should find all mermaid code blocks')
    it('should return early when no diagrams present')
    it('should generate unique IDs for each diagram')
    it('should render valid mermaid syntax')
    it('should handle invalid mermaid syntax with error display')
    it('should replace code block with diagram container')
    it('should initialize panzoom for each diagram')
    it('should preserve original code block on render error')
    it('should process multiple diagrams in order')
  })

  describe('createDiagramContainer', () => {
    it('should create container with diagram-container class')
    it('should set data-diagram-id attribute')
    it('should create control buttons (+, -, ⟲, ⛶)')
    it('should create wrapper with correct ID')
    it('should inject SVG into wrapper')
  })
})
```

---

### 6. **Panzoom Functionality** (HIGH PRIORITY)
**Location**: app.js:298-359

**Current Functions**:
- `initializePanzoom(diagramId)` - app.js:298
- `cleanupPanzoomInstances()` - app.js:502

**Missing Test Coverage**:
- ✗ Panzoom instance creation
- ✗ Control button bindings (zoom in, zoom out, reset, fullscreen)
- ✗ Mouse wheel zoom functionality
- ✗ Double-click reset
- ✗ Event propagation stops correctly
- ✗ Instance storage in global array
- ✗ Cleanup on new file load
- ✗ Memory leak prevention

**Risk Level**: High
**Complexity**: High
**Test Type**: Integration + E2E

**Recommended Tests**:
```javascript
describe('Panzoom Functionality', () => {
  describe('initializePanzoom', () => {
    it('should create panzoom instance for diagram')
    it('should set correct scale limits (0.5 - 5)')
    it('should set step size to 0.2')
    it('should bind zoom in button')
    it('should bind zoom out button')
    it('should bind reset button')
    it('should bind fullscreen button')
    it('should enable mouse wheel zoom')
    it('should enable double-click reset')
    it('should store instance in global array')
    it('should handle missing wrapper element')
    it('should handle missing SVG element')
  })

  describe('cleanupPanzoomInstances', () => {
    it('should destroy all panzoom instances')
    it('should clear instances array')
    it('should handle destroy errors gracefully')
    it('should not error when array is empty')
  })
})
```

---

### 7. **Fullscreen Mode** (MEDIUM PRIORITY)
**Location**: app.js:364-497

**Current Functions**:
- `openFullscreen(diagramId)` - app.js:364
- `setupFullscreenControls(panzoomInstance, wrapper)` - app.js:408
- `closeFullscreen()` - app.js:467

**Missing Test Coverage**:
- ✗ Fullscreen opens with correct diagram
- ✗ SVG cloning for fullscreen
- ✗ Fullscreen panzoom initialization (different limits: 0.3-10)
- ✗ Control button event listener refresh
- ✗ ESC key closes fullscreen
- ✗ Click outside diagram closes fullscreen
- ✗ Cleanup of fullscreen panzoom instance
- ✗ Event handler removal on close
- ✗ Error handling for missing elements

**Risk Level**: Medium
**Complexity**: High
**Test Type**: Integration + E2E

**Recommended Tests**:
```javascript
describe('Fullscreen Mode', () => {
  describe('openFullscreen', () => {
    it('should clone SVG for fullscreen display')
    it('should create fullscreen panzoom instance')
    it('should use extended zoom limits (0.3 - 10)')
    it('should show fullscreen overlay')
    it('should setup fullscreen controls')
    it('should store panzoom instance on overlay')
    it('should handle missing wrapper gracefully')
    it('should handle missing SVG gracefully')
  })

  describe('setupFullscreenControls', () => {
    it('should bind zoom in button')
    it('should bind zoom out button')
    it('should bind reset button')
    it('should bind close button')
    it('should enable mouse wheel zoom with preventDefault')
    it('should enable double-click reset')
    it('should stop event propagation on controls')
    it('should refresh event listeners by cloning nodes')
  })

  describe('closeFullscreen', () => {
    it('should destroy fullscreen panzoom instance')
    it('should hide fullscreen overlay')
    it('should clear fullscreen content')
    it('should remove wheel event listener')
    it('should remove double-click listener')
    it('should handle destroy errors gracefully')
    it('should handle missing panzoom instance')
  })

  describe('Fullscreen Integration', () => {
    it('should close on ESC key press')
    it('should close on overlay background click')
    it('should not close on diagram click')
    it('should not close on control button click')
  })
})
```

---

### 8. **Re-rendering Diagrams** (MEDIUM PRIORITY)
**Location**: app.js:531-578

**Current Functions**:
- `reRenderMermaidDiagrams()` - app.js:531

**Missing Test Coverage**:
- ✗ Diagram re-rendering on theme change
- ✗ Mermaid config updates
- ✗ Panzoom cleanup before re-render
- ✗ Panzoom re-initialization after re-render
- ✗ Error handling during re-render
- ✗ Handling diagrams without source data
- ✗ Multiple diagram re-rendering

**Risk Level**: Medium
**Complexity**: High
**Test Type**: Integration

**Recommended Tests**:
```javascript
describe('Diagram Re-rendering', () => {
  describe('reRenderMermaidDiagrams', () => {
    it('should update mermaid config with new theme')
    it('should find all diagram containers')
    it('should skip diagrams without mermaid source')
    it('should re-render diagram with new theme')
    it('should cleanup old panzoom instance')
    it('should create new panzoom instance')
    it('should handle re-render errors gracefully')
    it('should process multiple diagrams')
  })
})
```

**Note**: Current implementation has a limitation - mermaid source is not stored in `data-mermaid-source` attribute (app.js:554), so re-rendering may not work. This is a **bug that should be fixed**.

---

### 9. **State Management & Cleanup** (HIGH PRIORITY)
**Location**: app.js:513-526

**Current Functions**:
- `showDropZone()` - app.js:513

**Missing Test Coverage**:
- ✗ Cleanup of all panzoom instances
- ✗ Fullscreen closure
- ✗ Content clearing
- ✗ File input reset
- ✗ UI state transitions (content area ↔ drop zone)

**Risk Level**: High (memory leaks possible)
**Complexity**: Medium
**Test Type**: Integration

**Recommended Tests**:
```javascript
describe('State Management', () => {
  describe('showDropZone', () => {
    it('should cleanup all panzoom instances')
    it('should close fullscreen if open')
    it('should clear markdown content')
    it('should clear filename')
    it('should reset file input')
    it('should hide content area')
    it('should show drop zone')
  })

  describe('Memory Management', () => {
    it('should not leak panzoom instances between file loads')
    it('should not leak event listeners')
    it('should properly destroy fullscreen instances')
  })
})
```

---

### 10. **Initialization & Event Listeners** (MEDIUM PRIORITY)
**Location**: app.js:23-99

**Current Functions**:
- `init()` - app.js:23
- `setupEventListeners()` - app.js:58

**Missing Test Coverage**:
- ✗ Initialization sequence
- ✗ Event listener registration
- ✗ Keyboard shortcuts (ESC)
- ✗ Global drag/drop prevention
- ✗ Browse button trigger

**Risk Level**: Medium
**Complexity**: Medium
**Test Type**: Integration

**Recommended Tests**:
```javascript
describe('Initialization', () => {
  describe('init', () => {
    it('should call setupTheme')
    it('should call setupEventListeners')
    it('should call configureMermaid')
    it('should call configureMarked')
    it('should execute in correct order')
  })

  describe('setupEventListeners', () => {
    it('should bind browse button click')
    it('should bind file input change')
    it('should bind drop zone click')
    it('should bind drag over, leave, and drop')
    it('should bind load new file button')
    it('should bind theme toggle')
    it('should bind fullscreen overlay click')
    it('should bind ESC key for fullscreen')
    it('should prevent default drag behavior globally')
  })
})
```

---

## Testing Infrastructure Recommendations

### 1. Testing Framework
**Recommended**: **Jest** (for browser-based JavaScript)

**Rationale**:
- Zero-config setup for modern JavaScript
- Built-in assertion library
- DOM testing with jsdom
- Code coverage reports
- Snapshot testing for HTML output

**Alternative**: Vitest (faster, more modern)

### 2. DOM Testing Library
**Recommended**: **@testing-library/dom**

**Rationale**:
- User-centric testing approach
- Works well with vanilla JavaScript
- Encourages accessibility best practices

### 3. Mocking External Libraries
Need to mock CDN dependencies:
- `marked` - Markdown parser
- `mermaid` - Diagram renderer
- `Panzoom` - Zoom/pan library
- `hljs` - Syntax highlighter

### 4. E2E Testing (Future)
**Recommended**: **Playwright** or **Cypress**

**For testing**:
- Real file drag-and-drop
- Visual rendering of diagrams
- Cross-browser compatibility
- Fullscreen interactions

### 5. Code Coverage Tool
**Recommended**: **Istanbul/NYC** (built into Jest)

**Target Coverage Goals**:
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 85%+
- **Lines**: 80%+

---

## Proposed Test File Structure

```
markdown_viewer/
├── markdown-viewer/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── tests/
│   ├── unit/
│   │   ├── theme.test.js
│   │   ├── fileHandling.test.js
│   │   ├── markdown.test.js
│   │   └── mermaid.test.js
│   ├── integration/
│   │   ├── dragDrop.test.js
│   │   ├── panzoom.test.js
│   │   ├── fullscreen.test.js
│   │   └── rendering.test.js
│   ├── e2e/
│   │   ├── userFlow.spec.js
│   │   └── browserCompat.spec.js
│   ├── fixtures/
│   │   ├── sample.md
│   │   ├── sample-with-mermaid.md
│   │   ├── invalid.txt
│   │   └── large-document.md
│   └── mocks/
│       ├── marked.js
│       ├── mermaid.js
│       ├── panzoom.js
│       └── highlightjs.js
├── jest.config.js
├── package.json
└── README.md
```

---

## Priority Implementation Roadmap

### Week 1: Setup & Critical Tests
1. Initialize npm project with package.json
2. Install Jest and @testing-library/dom
3. Configure Jest with jsdom environment
4. Create mock files for CDN dependencies
5. Write tests for **File Handling** (CRITICAL)
6. Write tests for **Markdown Rendering** (CRITICAL)

### Week 2: High Priority Coverage
7. Write tests for **Mermaid Processing** (CRITICAL)
8. Write tests for **Theme Management** (HIGH)
9. Write tests for **Panzoom Functionality** (HIGH)
10. Write tests for **State Management** (HIGH)

### Week 3: Medium Priority Coverage
11. Write tests for **Drag and Drop** (MEDIUM)
12. Write tests for **Fullscreen Mode** (MEDIUM)
13. Write tests for **Re-rendering** (MEDIUM)
14. Write tests for **Initialization** (MEDIUM)

### Week 4: Advanced Testing
15. Setup E2E testing with Playwright
16. Write visual regression tests
17. Write accessibility tests
18. Setup CI/CD pipeline with automated testing

---

## Code Quality Issues Discovered

### Bug #1: Mermaid Re-rendering Not Working
**Location**: app.js:554

**Issue**: The `reRenderMermaidDiagrams()` function expects SVG elements to have a `data-mermaid-source` attribute, but this is never set during initial rendering.

**Impact**: Theme changes don't update existing diagrams.

**Fix Required**:
```javascript
// In processMermaidDiagrams(), after rendering:
const svgElement = container.querySelector('svg');
svgElement.setAttribute('data-mermaid-source', mermaidCode);
```

### Bug #2: No Input Sanitization
**Location**: app.js:197-223

**Issue**: Markdown content is directly injected into innerHTML without sanitization.

**Impact**: Potential XSS vulnerability if viewing untrusted markdown files.

**Recommendation**: Add DOMPurify library or use marked's built-in sanitization.

### Bug #3: No File Size Validation
**Location**: app.js:139-159

**Issue**: No check for file size before reading.

**Impact**: Very large files could freeze the browser.

**Recommendation**: Add file size check (e.g., 10MB limit) with user warning.

### Bug #4: Memory Leak Risk
**Location**: app.js:298-359

**Issue**: Event listeners are added to DOM elements but may not be fully cleaned up.

**Impact**: Potential memory leaks when loading multiple files in one session.

**Recommendation**: Store event listeners and explicitly remove them in cleanup.

---

## Recommended Testing Commands

Add to `package.json`:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration"
  }
}
```

---

## Success Metrics

### Short-term (1 month)
- [ ] Testing framework configured
- [ ] 50%+ code coverage achieved
- [ ] All CRITICAL areas have tests
- [ ] CI/CD pipeline running tests on PR

### Medium-term (3 months)
- [ ] 75%+ code coverage achieved
- [ ] All HIGH priority areas have tests
- [ ] E2E tests covering main user flows
- [ ] Automated visual regression testing

### Long-term (6 months)
- [ ] 85%+ code coverage achieved
- [ ] All areas have comprehensive tests
- [ ] Performance benchmarking tests
- [ ] Accessibility compliance tests
- [ ] Cross-browser testing automated

---

## Conclusion

The Markdown Diagram Viewer has **zero test coverage**, representing a significant quality assurance gap. The application has complex functionality involving:
- File I/O
- DOM manipulation
- Third-party library integration
- State management
- Event handling

**Immediate Action Required**:
1. Set up Jest testing framework
2. Create mocks for CDN dependencies
3. Write tests for critical file handling and rendering logic
4. Fix identified bugs (especially mermaid re-rendering)
5. Establish coverage baseline and improvement targets

**Estimated Effort**:
- Setup: 4-8 hours
- Critical tests (Phase 1): 16-24 hours
- Comprehensive coverage (Phase 2): 24-32 hours
- Advanced testing (Phase 3): 16-24 hours
- **Total**: 60-88 hours (1.5-2 months at 10 hours/week)

**Return on Investment**:
- Prevents regressions during feature additions
- Enables confident refactoring
- Documents expected behavior
- Improves code quality
- Reduces debugging time
