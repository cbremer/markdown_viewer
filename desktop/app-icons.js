const path = require('path');

const APP_ICONS = [
  'original',
  'flat',
  'glass',
  'ceramic',
  'metallic',
  'layered',
  'minimal',
];

// Native menus own this feature: document JavaScript cannot change an OS icon.
function createAppIconController({
  app,
  nativeImage,
  platform,
  getStore,
  getWindow,
  onChange,
  onError,
}) {
  let selected = 'original';
  const supported = ['darwin', 'win32', 'linux'].includes(platform);
  const iconPath = (id) => path.join(__dirname, 'icons', `${id}.png`);

  function apply(id, persist = true) {
    if (!supported || !APP_ICONS.includes(id))
      throw new Error('Unknown or unsupported app icon');
    const image = nativeImage.createFromPath(iconPath(id));
    if (image.isEmpty()) throw new Error(`The ${id} icon could not be loaded.`);
    if (platform === 'darwin') {
      app.dock.setIcon(image);
    } else {
      const window = getWindow();
      if (!window || window.isDestroyed())
        throw new Error('Open a window before changing its icon.');
      window.setIcon(image);
    }
    selected = id;
    if (persist) getStore()?.set('appIcon', id);
    onChange();
  }

  function restore() {
    const saved = getStore()?.get('appIcon', 'original');
    const id = APP_ICONS.includes(saved) ? saved : 'original';
    // Keep the OS-provided primary icon on an unchanged installation.
    if (id === 'original') {
      selected = id;
      return;
    }
    try {
      apply(id, false);
    } catch (error) {
      onError(error);
    }
  }

  function menu() {
    if (!supported) return [];
    return [
      {
        label: platform === 'darwin' ? 'Dock Icon' : 'Window Icon',
        submenu: [
          {
            label:
              platform === 'darwin'
                ? 'While running · Finder icon stays the same'
                : 'Running windows · shortcuts stay the same',
            enabled: false,
          },
          { type: 'separator' },
          ...APP_ICONS.map((id) => ({
            label: id[0].toUpperCase() + id.slice(1),
            type: 'radio',
            checked: selected === id,
            click: () => {
              try {
                apply(id);
              } catch (error) {
                onChange();
                onError(error);
              }
            },
          })),
        ],
      },
    ];
  }

  return { apply, restore, menu, getSelected: () => selected };
}

module.exports = { APP_ICONS, createAppIconController };
