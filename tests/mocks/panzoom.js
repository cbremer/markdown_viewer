/**
 * Mock for @panzoom/panzoom library
 */

class PanzoomMock {
  constructor(element, options = {}) {
    this.element = element;
    this.options = options;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.destroyed = false;
  }

  zoomIn(options) {
    if (!this.destroyed) {
      const step = this.options.step || 0.2;
      this.scale = Math.min(this.scale + step, this.options.maxScale || 5);
    }
    return this;
  }

  zoomOut(options) {
    if (!this.destroyed) {
      const step = this.options.step || 0.2;
      this.scale = Math.max(this.scale - step, this.options.minScale || 0.5);
    }
    return this;
  }

  zoom(scale, options) {
    if (!this.destroyed) {
      this.scale = scale;
    }
    return this;
  }

  reset(options) {
    if (!this.destroyed) {
      this.scale = 1;
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  pan(x, y, options) {
    if (!this.destroyed) {
      this.x = x;
      this.y = y;
    }
    return this;
  }

  destroy() {
    this.destroyed = true;
  }

  getScale() {
    return this.scale;
  }

  getPan() {
    return { x: this.x, y: this.y };
  }

  setOptions(options) {
    this.options = { ...this.options, ...options };
  }
}

const Panzoom = jest.fn((element, options) => {
  return new PanzoomMock(element, options);
});

// Attach the mock class for instanceof checks
Panzoom.PanzoomMock = PanzoomMock;

global.Panzoom = Panzoom;

module.exports = Panzoom;
