/* Codex Glass experimental renderer. Independent, dependency-free implementation. */
(function installCodexGlass(global) {
  'use strict';

  const API_NAME = '__codexGlassExperimental';
  const ATTRIBUTE = 'data-codex-glass-experimental';
  const STYLE_ID = 'codex-glass-experimental-style';
  const MAIN = '[class*="MainContentSurface"], [class*="main-surface"]';
  const COMPOSER = 'textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]';
  const SIDEBAR = 'aside, [role="complementary"], [data-sidebar="sidebar"]';
  const APP_MAIN = '[class*="MainContentSurface"]';
  const APP_SIDEBAR = '.app-shell-left-panel[data-app-shell-left-panel-appearance]';
  const APP_COMPOSER = '[class*="ComposerLayoutRoot"] textarea, [class*="ComposerLayoutRoot"] [contenteditable="true"], [class*="ComposerLayoutRoot"] [contenteditable="plaintext-only"], [class*="ComposerLayoutRoot"] [contenteditable=""]';
  const DEFAULTS = Object.freeze({ theme: 'system', tint: 0.16, blur: 22, preview: false });
  const owner = 'cg-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  let active = null;

  if (API_NAME in global) {
    throw new Error('Codex Glass API already exists; refusing to replace it.');
  }

  function configuration(input, base) {
    if (input === undefined) input = {};
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Codex Glass configuration must be an object.');
    }
    const values = { ...base };
    for (const key of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        throw new TypeError('Unknown Codex Glass option: ' + key);
      }
      values[key] = input[key];
    }
    if (!['light', 'dark', 'system'].includes(values.theme)) {
      throw new TypeError('theme must be light, dark, or system.');
    }
    if (typeof values.tint !== 'number' || !Number.isFinite(values.tint) || values.tint < 0.06 || values.tint > 0.45) {
      throw new RangeError('tint must be a finite number from 0.06 to 0.45.');
    }
    if (typeof values.blur !== 'number' || !Number.isFinite(values.blur) || values.blur < 0 || values.blur > 40) {
      throw new RangeError('blur must be a finite number from 0 to 40.');
    }
    if (typeof values.preview !== 'boolean') {
      throw new TypeError('preview must be a boolean.');
    }
    return Object.freeze(values);
  }

  function target(config) {
    const w = global.window;
    const doc = global.document;
    if (!w || w.top !== w || !doc || !doc.documentElement || !doc.head) {
      throw new Error('Codex Glass requires a top-level document with an existing head.');
    }
    const location = w.location;
    if (!location) throw new Error('Codex Glass cannot verify the page location.');
    let url;
    try { url = new global.URL(location.href); }
    catch (_) { throw new Error('Codex Glass cannot verify the full page URL.'); }
    if (config.preview) {
      const local = url.protocol === 'file:' ||
        (url.protocol === 'http:' && url.hostname === '127.0.0.1');
      if (!local || doc.documentElement.getAttribute('data-codex-glass-fixture') !== '1') {
        throw new Error('Preview is restricted to explicitly marked local fixtures.');
      }
      if (!doc.querySelector(MAIN) || !(doc.querySelector(COMPOSER) || doc.querySelector(SIDEBAR))) {
        throw new Error('Codex Glass fixture structure was not found; no styles were changed.');
      }
    } else {
      if (url.protocol !== 'app:' || url.hostname !== '-' || url.port !== '' || url.username !== '' ||
          url.password !== '' || url.pathname !== '/index.html' || url.search !== '') {
        throw new Error('Codex Glass only styles app://-/index.html without credentials, a port, or a query.');
      }
      if (doc.documentElement.getAttribute('data-codex-window-type') !== 'electron' ||
          !doc.querySelector(APP_MAIN) || !(doc.querySelector(APP_SIDEBAR) || doc.querySelector(APP_COMPOSER))) {
        throw new Error('Codex Glass verified Electron main-window structure was not found; no styles were changed.');
      }
    }
    return { doc, root: doc.documentElement };
  }

  function palette(selector, mode, tint) {
    const dark = mode === 'dark';
    const rgb = dark ? '19, 25, 36' : '245, 248, 253';
    return selector + '{\n' +
      '--cg-window-tint:rgba(' + rgb + ',' + tint + ');\n' +
      '--cg-surface:rgba(' + rgb + ',' + Math.min(tint + 0.12, 0.58) + ');\n' +
      '--cg-control:rgba(' + rgb + ',' + Math.min(tint + 0.39, 0.84) + ');\n' +
      '--cg-solid:rgba(' + rgb + ',0.97);\n' +
      '--cg-code:rgba(' + (dark ? '11, 16, 25' : '255, 255, 255') + ',0.82);\n' +
      '--cg-text:' + (dark ? '#edf2f9' : '#182232') + ';\n' +
      '--cg-muted:' + (dark ? '#c0cbdc' : '#46566c') + ';\n' +
      '--cg-edge:rgba(' + (dark ? '220, 232, 255,0.16' : '40, 59, 86,0.18') + ');\n' +
      'color-scheme:' + mode + ';\n}\n';
  }

  function stylesheet(config) {
    const scope = 'html[' + ATTRIBUTE + '="' + owner + '"]';
    const list = (selectors) => selectors.map((selector) => scope + ' ' + selector).join(',\n');
    let css = '/* Codex Glass: rendering only; native desktop transparency is unverified. */\n';
    css += palette(scope, config.theme === 'dark' ? 'dark' : 'light', config.tint);
    if (config.theme === 'system') {
      css += '@media(prefers-color-scheme:dark){\n' + palette(scope, 'dark', config.tint) + '}\n';
    }
    css += scope + '{background:transparent!important;--cg-style-active:1;--cg-blur:' + config.blur + 'px;}\n';
    css += list(['body']) + '{background:var(--cg-window-tint)!important;color:var(--cg-text)!important;}\n';
    css += list(['#root', '#app', 'main', '[role="main"]', '[class*="MainContentSurface"]', '[class*="main-surface"]']) +
      '{background-color:transparent!important;background-image:none!important;color:var(--cg-text)!important;}\n';
    css += list(['aside', '[role="complementary"]', '[data-sidebar="sidebar"]', APP_SIDEBAR, '[data-glass-sidebar]', '.glass-topbar']) +
      '{background:var(--cg-surface)!important;color:var(--cg-text)!important;border-color:var(--cg-edge)!important;' +
      'backdrop-filter:blur(var(--cg-blur));-webkit-backdrop-filter:blur(var(--cg-blur));}\n';
    css += list(['textarea', '[contenteditable="true"]', '[contenteditable="plaintext-only"]', '[contenteditable=""]', '[class*="ComposerLayoutRoot"]', '[data-testid="composer"]']) +
      '{background-color:var(--cg-control)!important;color:var(--cg-text)!important;caret-color:var(--cg-text)!important;border-color:var(--cg-edge)!important;}\n';
    css += list(['textarea::placeholder', 'input::placeholder']) + '{color:var(--cg-muted)!important;}\n';
    css += list(['pre']) + '{background:var(--cg-code)!important;color:var(--cg-text)!important;border-color:var(--cg-edge)!important;}\n';
    css += list([':not(pre) > code']) + '{background:var(--cg-code)!important;color:var(--cg-text)!important;}\n';
    css += list(['dialog', '[role="dialog"]', '[role="alertdialog"]', '[role="menu"]', '[role="listbox"]', '[role="tooltip"]', '[data-glass-popover]', '[data-state="open"][data-radix-popper-content-wrapper]']) +
      '{background:var(--cg-solid)!important;color:var(--cg-text)!important;border-color:var(--cg-edge)!important;' +
      'backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}\n';
    css += '@media(prefers-reduced-transparency:reduce){' + scope +
      '{--cg-window-tint:var(--cg-solid);--cg-surface:var(--cg-solid);--cg-control:var(--cg-solid);--cg-blur:0px;}}\n';
    css += '@media(forced-colors:active){' + scope +
      '{--cg-window-tint:Canvas;--cg-surface:Canvas;--cg-control:Canvas;--cg-solid:Canvas;--cg-code:Canvas;--cg-text:CanvasText;--cg-muted:CanvasText;--cg-edge:CanvasText;--cg-blur:0px;}}\n';
    return css;
  }

  function ownsActiveStyle() {
    return Boolean(active && active.style.parentNode === active.doc.head &&
      active.root.getAttribute(ATTRIBUTE) === owner && active.doc.getElementById(STYLE_ID) === active.style);
  }

  function status() {
    let effective = false;
    if (ownsActiveStyle() && typeof global.getComputedStyle === 'function') {
      try {
        effective = global.getComputedStyle(active.root).getPropertyValue('--cg-style-active').trim() === '1';
      } catch (_) { /* An unavailable CSS engine cannot verify that the style took effect. */ }
    }
    const applied = effective;
    return {
      applied,
      styling: applied ? 'applied' : active ? 'blocked-or-inactive' : 'inactive',
      desktopGlass: 'unverified',
      config: active ? { ...active.config } : null
    };
  }

  function apply(input) {
    const config = configuration(input, DEFAULTS);
    const { doc, root } = target(config);
    const css = stylesheet(config);
    if (active) {
      if (doc !== active.doc || root !== active.root || !ownsActiveStyle()) {
        throw new Error('Codex Glass ownership changed; restore before applying again.');
      }
      active.style.textContent = css;
      active.config = config;
      return status();
    }
    if (doc.getElementById(STYLE_ID)) {
      throw new Error('A Codex Glass style already exists; refusing to replace it.');
    }
    const previous = { present: root.hasAttribute(ATTRIBUTE), value: root.getAttribute(ATTRIBUTE) };
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    try {
      root.setAttribute(ATTRIBUTE, owner);
      doc.head.appendChild(style);
    } catch (error) {
      if (style.parentNode) style.parentNode.removeChild(style);
      if (root.getAttribute(ATTRIBUTE) === owner) {
        if (previous.present) root.setAttribute(ATTRIBUTE, previous.value);
        else root.removeAttribute(ATTRIBUTE);
      }
      throw error;
    }
    active = { doc, root, style, previous, config };
    return status();
  }

  function update(input) {
    if (!active) throw new Error('Apply Codex Glass before updating it.');
    return apply(configuration(input, active.config));
  }

  function restore() {
    if (!active) return status();
    const { root, style, previous } = active;
    if (style.parentNode) style.parentNode.removeChild(style);
    // A later owner of the root attribute must keep its value.
    if (root.getAttribute(ATTRIBUTE) === owner) {
      if (previous.present) root.setAttribute(ATTRIBUTE, previous.value);
      else root.removeAttribute(ATTRIBUTE);
    }
    active = null;
    return status();
  }

  Object.defineProperty(global, API_NAME, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.freeze({ version: '0.1.0-alpha.1', extensionId: 'codex-glass-experimental', apply, update, status, restore })
  });
})(globalThis);
