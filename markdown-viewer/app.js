// ===========================
// Global State
// ===========================
let currentPanzoomInstances = [];
let currentTheme = localStorage.getItem('theme') || 'light';

// ===========================
// DOM Elements
// ===========================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseButton = document.getElementById('browse-button');
const contentArea = document.getElementById('content-area');
const markdownContent = document.getElementById('markdown-content');
const fileName = document.getElementById('file-name');
const loadNewFileButton = document.getElementById('load-new-file');
const themeToggle = document.getElementById('theme-toggle');
const fullscreenOverlay = document.getElementById('fullscreen-overlay');

// ===========================
// Initialization
// ===========================
function init() {
    setupTheme();
    setupEventListeners();
    configureMermaid();
    configureMarked();
}

// ===========================
// Theme Management
// ===========================
function setupTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateThemeIcon();
    
    // Re-render mermaid diagrams with new theme
    if (contentArea.style.display !== 'none') {
        reRenderMermaidDiagrams();
    }
}

function updateThemeIcon() {
    const icon = themeToggle.querySelector('.theme-icon');
    icon.textContent = currentTheme === 'light' ? '🌙' : '☀️';
}

// ===========================
// Event Listeners
// ===========================
function setupEventListeners() {
    // Browse button
    browseButton.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    dropZone.addEventListener('click', (e) => {
        if (e.target === dropZone || e.target.closest('.drop-zone-content')) {
            fileInput.click();
        }
    });
    
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    
    // Load new file button
    loadNewFileButton.addEventListener('click', showDropZone);
    
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Fullscreen overlay close
    fullscreenOverlay.addEventListener('click', (e) => {
        if (e.target === fullscreenOverlay) {
            closeFullscreen();
        }
    });
    
    // ESC key to close fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fullscreenOverlay.style.display !== 'none') {
            closeFullscreen();
        }
    });
    
    // Prevent default drag behavior on document
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
}

// ===========================
// Drag and Drop Handlers
// ===========================
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZone) {
        dropZone.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// ===========================
// File Processing
// ===========================
function handleFile(file) {
    // Validate file type
    const validExtensions = ['.md', '.markdown'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
        alert('Please select a valid Markdown file (.md or .markdown)');
        return;
    }
    
    // Read file
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        renderMarkdown(content, file.name);
    };
    reader.onerror = () => {
        alert('Error reading file. Please try again.');
    };
    reader.readAsText(file);
}

// ===========================
// Markdown Configuration
// ===========================
function configureMarked() {
    // Configure marked with custom renderer
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) {
                    console.error('Highlight error:', err);
                }
            }
            return code;
        },
        breaks: true,
        gfm: true
    });
}

// ===========================
// Mermaid Configuration
// ===========================
function configureMermaid() {
    mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    });
}

// ===========================
// Markdown Rendering
// ===========================
async function renderMarkdown(content, filename) {
    try {
        // Clean up existing panzoom instances
        cleanupPanzoomInstances();
        
        // Parse markdown to HTML
        const htmlContent = marked.parse(content);
        
        // Update UI
        fileName.textContent = filename;
        markdownContent.innerHTML = htmlContent;
        
        // Show content area, hide drop zone
        dropZone.style.display = 'none';
        contentArea.style.display = 'flex';
        
        // Process mermaid diagrams
        await processMermaidDiagrams();
        
        // Scroll to top
        markdownContent.scrollTop = 0;
        
    } catch (error) {
        console.error('Error rendering markdown:', error);
        alert('Error rendering markdown content. Please check the file format.');
    }
}

// ===========================
// Mermaid Diagram Processing
// ===========================
async function processMermaidDiagrams() {
    // Find all code blocks with mermaid language
    const codeBlocks = markdownContent.querySelectorAll('code.language-mermaid');
    
    if (codeBlocks.length === 0) return;
    
    // Process each mermaid diagram
    for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks[i];
        const mermaidCode = codeBlock.textContent;
        const preElement = codeBlock.parentElement;
        
        try {
            // Generate unique ID
            const diagramId = `mermaid-diagram-${i}-${Date.now()}`;
            
            // Render mermaid diagram
            const { svg } = await mermaid.render(diagramId, mermaidCode);
            
            // Create diagram container
            const container = createDiagramContainer(svg, diagramId);
            
            // Replace pre/code block with diagram container
            preElement.replaceWith(container);
            
            // Initialize panzoom for this diagram
            initializePanzoom(diagramId);
            
        } catch (error) {
            console.error('Error rendering mermaid diagram:', error);
            // Keep the original code block on error
            const errorDiv = document.createElement('div');
            errorDiv.className = 'mermaid-error';
            errorDiv.style.cssText = 'color: red; padding: 1rem; border: 1px solid red; border-radius: 4px; margin: 1rem 0;';
            errorDiv.textContent = `Error rendering diagram: ${error.message}`;
            preElement.parentElement.insertBefore(errorDiv, preElement);
        }
    }
}

function createDiagramContainer(svg, diagramId) {
    const container = document.createElement('div');
    container.className = 'diagram-container';
    container.setAttribute('data-diagram-id', diagramId);
    
    // Create controls
    const controls = document.createElement('div');
    controls.className = 'diagram-controls';
    controls.innerHTML = `
        <button class="zoom-in" title="Zoom in">+</button>
        <button class="zoom-out" title="Zoom out">-</button>
        <button class="reset" title="Reset view">⟲</button>
        <button class="fullscreen" title="Fullscreen">⛶</button>
    `;
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'diagram-wrapper';
    wrapper.id = `wrapper-${diagramId}`;
    wrapper.innerHTML = svg;
    
    container.appendChild(controls);
    container.appendChild(wrapper);
    
    return container;
}

// ===========================
// Panzoom Initialization
// ===========================
function initializePanzoom(diagramId) {
    const wrapper = document.getElementById(`wrapper-${diagramId}`);
    if (!wrapper) return;
    
    const svgElement = wrapper.querySelector('svg');
    if (!svgElement) return;
    
    // Initialize panzoom
    const panzoomInstance = Panzoom(svgElement, {
        maxScale: 5,
        minScale: 0.5,
        step: 0.2,
        cursor: 'grab'
    });
    
    // Store instance for cleanup
    currentPanzoomInstances.push({
        id: diagramId,
        instance: panzoomInstance,
        element: svgElement
    });
    
    // Get controls
    const container = wrapper.closest('.diagram-container');
    const controls = container.querySelector('.diagram-controls');
    const zoomInBtn = controls.querySelector('.zoom-in');
    const zoomOutBtn = controls.querySelector('.zoom-out');
    const resetBtn = controls.querySelector('.reset');
    const fullscreenBtn = controls.querySelector('.fullscreen');
    
    // Bind control events
    zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.zoomIn();
    });
    
    zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.zoomOut();
    });
    
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.reset();
    });
    
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFullscreen(diagramId);
    });
    
    // Mouse wheel zoom
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        panzoomInstance.zoomWithWheel(e);
    });
    
    // Double click to reset
    wrapper.addEventListener('dblclick', () => {
        panzoomInstance.reset();
    });
}

// ===========================
// Fullscreen Management
// ===========================
function openFullscreen(diagramId) {
    const wrapper = document.getElementById(`wrapper-${diagramId}`);
    if (!wrapper) {
        console.error('Wrapper not found for diagram:', diagramId);
        return;
    }
    
    const svgElement = wrapper.querySelector('svg');
    if (!svgElement) {
        console.error('SVG element not found in wrapper');
        return;
    }
    
    // Clone SVG for fullscreen
    const svgClone = svgElement.cloneNode(true);
    
    // Setup fullscreen wrapper
    const fullscreenWrapper = fullscreenOverlay.querySelector('.fullscreen-diagram-wrapper');
    fullscreenWrapper.innerHTML = '';
    fullscreenWrapper.appendChild(svgClone);
    
    // Initialize panzoom for fullscreen
    const fullscreenPanzoom = Panzoom(svgClone, {
        maxScale: 10,
        minScale: 0.3,
        step: 0.2,
        cursor: 'grab',
        contain: 'outside'
    });
    
    // Store for cleanup
    fullscreenOverlay.panzoomInstance = fullscreenPanzoom;
    fullscreenOverlay.diagramId = diagramId;
    
    // Setup fullscreen controls with fresh event listeners
    setupFullscreenControls(fullscreenPanzoom, fullscreenWrapper);
    
    // Show fullscreen
    fullscreenOverlay.style.display = 'flex';
    
    // Focus for keyboard events
    fullscreenOverlay.focus();
}

function setupFullscreenControls(panzoomInstance, wrapper) {
    const controls = fullscreenOverlay.querySelector('.fullscreen-controls');
    const zoomInBtn = controls.querySelector('.zoom-in');
    const zoomOutBtn = controls.querySelector('.zoom-out');
    const resetBtn = controls.querySelector('.reset');
    const closeBtn = controls.querySelector('.close-fullscreen');
    
    // Remove old listeners by cloning
    const newZoomIn = zoomInBtn.cloneNode(true);
    const newZoomOut = zoomOutBtn.cloneNode(true);
    const newReset = resetBtn.cloneNode(true);
    const newClose = closeBtn.cloneNode(true);
    
    zoomInBtn.replaceWith(newZoomIn);
    zoomOutBtn.replaceWith(newZoomOut);
    resetBtn.replaceWith(newReset);
    closeBtn.replaceWith(newClose);
    
    // Add new listeners
    newZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.zoomIn();
    });
    
    newZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.zoomOut();
    });
    
    newReset.addEventListener('click', (e) => {
        e.stopPropagation();
        panzoomInstance.reset();
    });
    
    newClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFullscreen();
    });
    
    // Mouse wheel zoom - use passive: false to allow preventDefault
    const wheelHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        panzoomInstance.zoomWithWheel(e);
    };
    
    wrapper.addEventListener('wheel', wheelHandler, { passive: false });
    fullscreenOverlay.wheelHandler = wheelHandler;
    
    // Double click to reset
    const dblClickHandler = (e) => {
        e.stopPropagation();
        panzoomInstance.reset();
    };
    
    wrapper.addEventListener('dblclick', dblClickHandler);
    fullscreenOverlay.dblClickHandler = dblClickHandler;
}

function closeFullscreen() {
    // Cleanup panzoom instance
    if (fullscreenOverlay.panzoomInstance) {
        try {
            fullscreenOverlay.panzoomInstance.destroy();
        } catch (error) {
            console.error('Error destroying fullscreen panzoom:', error);
        }
        fullscreenOverlay.panzoomInstance = null;
    }
    
    // Remove event handlers
    const fullscreenWrapper = fullscreenOverlay.querySelector('.fullscreen-diagram-wrapper');
    
    if (fullscreenOverlay.wheelHandler) {
        fullscreenWrapper.removeEventListener('wheel', fullscreenOverlay.wheelHandler, { passive: false });
        fullscreenOverlay.wheelHandler = null;
    }
    
    if (fullscreenOverlay.dblClickHandler) {
        fullscreenWrapper.removeEventListener('dblclick', fullscreenOverlay.dblClickHandler);
        fullscreenOverlay.dblClickHandler = null;
    }
    
    // Hide fullscreen
    fullscreenOverlay.style.display = 'none';
    
    // Clear content
    fullscreenWrapper.innerHTML = '';
    fullscreenOverlay.diagramId = null;
}

// ===========================
// Cleanup
// ===========================
function cleanupPanzoomInstances() {
    currentPanzoomInstances.forEach(({ instance }) => {
        try {
            instance.destroy();
        } catch (error) {
            console.error('Error destroying panzoom instance:', error);
        }
    });
    currentPanzoomInstances = [];
}

function showDropZone() {
    // Cleanup
    cleanupPanzoomInstances();
    closeFullscreen();
    
    // Clear content
    markdownContent.innerHTML = '';
    fileName.textContent = '';
    fileInput.value = '';
    
    // Show drop zone, hide content
    contentArea.style.display = 'none';
    dropZone.style.display = 'flex';
}

// ===========================
// Re-render Mermaid (for theme change)
// ===========================
async function reRenderMermaidDiagrams() {
    // Update mermaid theme
    mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    });
    
    // Get all diagram containers
    const containers = markdownContent.querySelectorAll('.diagram-container');
    
    for (const container of containers) {
        const wrapper = container.querySelector('.diagram-wrapper');
        const diagramId = container.getAttribute('data-diagram-id');
        
        if (!wrapper || !diagramId) continue;
        
        // Find original mermaid code (stored in data attribute)
        const svgElement = wrapper.querySelector('svg');
        if (!svgElement) continue;
        
        // Get mermaid code from SVG or skip if not available
        const mermaidCode = svgElement.getAttribute('data-mermaid-source');
        if (!mermaidCode) continue;
        
        try {
            // Re-render with new theme
            const { svg } = await mermaid.render(`${diagramId}-rerender`, mermaidCode);
            
            // Clean up old panzoom
            const oldInstance = currentPanzoomInstances.find(p => p.id === diagramId);
            if (oldInstance) {
                oldInstance.instance.destroy();
                currentPanzoomInstances = currentPanzoomInstances.filter(p => p.id !== diagramId);
            }
            
            // Update wrapper content
            wrapper.innerHTML = svg;
            
            // Re-initialize panzoom
            initializePanzoom(diagramId);
            
        } catch (error) {
            console.error('Error re-rendering mermaid diagram:', error);
        }
    }
}

// ===========================
// Initialize App
// ===========================
init();
