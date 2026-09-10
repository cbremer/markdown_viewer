const {
  APP_ICONS,
  createAppIconController,
} = require('../../desktop/app-icons');

describe('native app icon switching', () => {
  let app, nativeImage, store, window, controller, onError, onChange;
  const make = (platform = 'darwin') =>
    createAppIconController({
      app,
      nativeImage,
      platform,
      getStore: () => store,
      getWindow: () => window,
      onError,
      onChange,
    });
  beforeEach(() => {
    app = { dock: { setIcon: jest.fn() } };
    nativeImage = { createFromPath: jest.fn(() => ({ isEmpty: () => false })) };
    store = { get: jest.fn(() => 'original'), set: jest.fn() };
    window = { setIcon: jest.fn(), isDestroyed: () => false };
    onError = jest.fn();
    onChange = jest.fn();
    controller = make();
  });
  it('offers every bundled choice and changes the real platform target before persisting', () => {
    for (const id of APP_ICONS) controller.apply(id);
    expect(app.dock.setIcon).toHaveBeenCalledTimes(7);
    expect(store.set).toHaveBeenLastCalledWith('appIcon', 'minimal');
    expect(
      controller.menu()[0].submenu.find((item) => item.label === 'Minimal')
        .checked
    ).toBe(true);
    expect(window.setIcon).not.toHaveBeenCalled();
  });
  it('restores a saved choice on launch without rewriting settings', () => {
    store.get.mockReturnValue('glass');
    controller.restore();
    expect(controller.getSelected()).toBe('glass');
    expect(store.set).not.toHaveBeenCalled();
    expect(app.dock.setIcon).toHaveBeenCalledTimes(1);
  });
  it('leaves a fresh installation on its bundled primary icon', () => {
    controller.restore();
    expect(app.dock.setIcon).not.toHaveBeenCalled();
  });
  it('ignores unknown saved IDs and rejects arbitrary paths', () => {
    store.get.mockReturnValue('../../evil');
    controller.restore();
    expect(() => controller.apply('../../evil')).toThrow();
    expect(nativeImage.createFromPath).not.toHaveBeenCalled();
  });
  it('preserves the selected icon and settings if decoding fails', () => {
    controller.apply('flat');
    store.set.mockClear();
    nativeImage.createFromPath.mockReturnValue({ isEmpty: () => true });
    controller
      .menu()[0]
      .submenu.find((item) => item.label === 'Glass')
      .click();
    expect(onError).toHaveBeenCalled();
    expect(controller.getSelected()).toBe('flat');
    expect(store.set).not.toHaveBeenCalled();
  });
  it('preserves selection when the native API throws', () => {
    app.dock.setIcon.mockImplementation(() => {
      throw Error('OS error');
    });
    expect(() => controller.apply('glass')).toThrow('OS error');
    expect(store.set).not.toHaveBeenCalled();
    expect(controller.getSelected()).toBe('original');
  });
  it.each(['win32', 'linux'])(
    'changes running window icons on %s',
    (platform) => {
      make(platform).apply('ceramic');
      expect(window.setIcon).toHaveBeenCalled();
      expect(app.dock.setIcon).not.toHaveBeenCalled();
    }
  );
});
