import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildExpression } from '../src/bootstrap.mjs';

const source = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const attr = 'data-codex-glass-experimental';

// This deliberately small DOM models only the nodes the renderer is allowed to own.
function fixture({ protocol = 'app:', pathname = '/index.html', search = '', hostname = '-', port = '', username = '', password = '',
  marked = false, electron = true, main = true, composer = true, sidebar = false, appComposer = true, appSidebar = false,
  topLevel = true, styleEffective = true, href } = {}) {
  function element(tagName) {
    const attributes = new Map();
    return {
      tagName, id: '', textContent: '', parentNode: null, children: [],
      getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
      hasAttribute: (name) => attributes.has(name),
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
    };
  }
  const root = element('HTML');
  const head = element('HEAD');
  const doc = {
    documentElement: root, head,
    createElement: element,
    getElementById: (id) => head.children.find((child) => child.id === id) || null,
    querySelector(selector) {
      if (selector.includes('MainContentSurface')) return main ? element('MAIN') : null;
      if (selector.startsWith('.app-shell-left-panel')) return appSidebar ? element('ASIDE') : null;
      if (selector.startsWith('[class*="ComposerLayoutRoot"]')) return appComposer && composer ? element('TEXTAREA') : null;
      if (selector.startsWith('textarea')) return composer ? element('TEXTAREA') : null;
      if (selector.startsWith('aside')) return sidebar ? element('ASIDE') : null;
      throw new Error('Unexpected DOM query: ' + selector);
    }
  };
  if (marked) root.setAttribute('data-codex-glass-fixture', '1');
  if (electron) root.setAttribute('data-codex-window-type', 'electron');
  Object.defineProperty(doc, 'cookie', { get() { throw new Error('Cookie access is forbidden'); } });
  const auth = username || password ? username + (password ? ':' + password : '') + '@' : '';
  const fullURL = href || (protocol === 'file:' ? 'file://' + pathname + search :
    protocol + '//' + auth + hostname + (port ? ':' + port : '') + pathname + search);
  const context = vm.createContext({ document: doc, URL, location: { href: fullURL } });
  context.window = context;
  context.top = topLevel ? context : {};
  context.getComputedStyle = () => ({
    getPropertyValue(name) {
      return name === '--cg-style-active' && styleEffective && root.hasAttribute(attr) &&
        head.children.some((child) => child.textContent.includes('--cg-style-active:1')) ? '1' : '';
    }
  });
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(context, name, { get() { throw new Error('Storage access is forbidden'); } });
  }
  context.fetch = () => { throw new Error('Network access is forbidden'); };
  vm.runInContext(source, context);
  return { api: context.__codexGlassExperimental, context, root, head, doc, element };
}

test('loading exposes an API without changing the document or claiming desktop glass', () => {
  const f = fixture();
  assert.equal(f.head.children.length, 0);
  assert.equal(f.root.hasAttribute(attr), false);
  assert.equal(f.api.status().applied, false);
  assert.equal(f.api.status().desktopGlass, 'unverified');
  assert.equal(f.api.version, '0.1.0-alpha.1');
  assert.equal(f.api.extensionId, 'codex-glass-experimental');
  assert.throws(() => { f.api.version = 'foreign'; }, TypeError);
  assert.throws(() => vm.runInContext(source, f.context), /already exists/);
});

test('apply is idempotent, update preserves options, restore returns the original attribute', () => {
  const f = fixture();
  f.root.setAttribute(attr, 'previous-theme');
  assert.equal(f.api.apply({ theme: 'dark', tint: 0.2, blur: 18 }).styling, 'applied');
  const style = f.head.children[0];
  const ownedValue = f.root.getAttribute(attr);
  assert.equal(f.api.apply({ theme: 'dark', tint: 0.2, blur: 18 }).desktopGlass, 'unverified');
  assert.equal(f.head.children.length, 1);
  assert.equal(f.head.children[0], style);
  assert.equal(f.root.getAttribute(attr), ownedValue);
  const updated = f.api.update({ tint: 0.3 });
  assert.equal(updated.config.tint, 0.3);
  assert.equal(updated.config.theme, 'dark');
  assert.equal(updated.config.blur, 18);
  assert.match(style.textContent, /--cg-window-tint:rgba\(19, 25, 36,0.3\)/);
  const restored = f.api.restore();
  assert.equal(restored.applied, false);
  assert.equal(f.head.children.length, 0);
  assert.equal(f.root.getAttribute(attr), 'previous-theme');
  assert.equal(f.api.restore().applied, false);
  assert.throws(() => f.api.update({ tint: 0.2 }), /before updating/);
});

test('root ownership changed by another participant is preserved', () => {
  const f = fixture();
  f.api.apply();
  f.root.setAttribute(attr, 'later-owner');
  assert.equal(f.api.status().applied, false);
  assert.throws(() => f.api.update({ blur: 10 }), /ownership changed/);
  assert.equal(f.head.children.length, 1);
  f.api.restore();
  assert.equal(f.head.children.length, 0);
  assert.equal(f.root.getAttribute(attr), 'later-owner');
});

test('strict main-window location and structure gates fail without mutations', () => {
  for (const options of [
    { protocol: 'https:', hostname: 'example.com' },
    { protocol: 'file:' },
    { hostname: 'another-app' },
    { hostname: '' },
    { port: '31337' },
    { username: 'user' },
    { username: 'user', password: 'pass' },
    { href: 'app:/index.html' },
    { pathname: '/settings.html' },
    { search: '?window=overlay' },
    { topLevel: false },
    { electron: false },
    { main: false },
    { composer: false, sidebar: false },
    { appComposer: false },
    { appComposer: false, sidebar: true }
  ]) {
    const f = fixture(options);
    assert.throws(() => f.api.apply(), undefined, JSON.stringify(options));
    assert.equal(f.head.children.length, 0);
    assert.equal(f.root.hasAttribute(attr), false);
  }
  const sidebarOnly = fixture({ composer: false, appSidebar: true });
  assert.equal(sidebarOnly.api.apply().applied, true);
});

test('preview is opt-in and limited to marked file or IPv4 loopback fixtures', () => {
  for (const options of [
    { protocol: 'file:', marked: true },
    { protocol: 'http:', hostname: '127.0.0.1', marked: true }
  ]) {
    const f = fixture(options);
    assert.equal(f.api.apply({ preview: true }).applied, true);
    assert.equal(f.api.status().desktopGlass, 'unverified');
  }
  for (const options of [
    { protocol: 'file:', marked: false },
    { protocol: 'http:', hostname: 'example.com', marked: true },
    { protocol: 'http:', hostname: 'localhost', marked: true },
    { protocol: 'https:', hostname: '127.0.0.1', marked: true },
    { protocol: 'app:', marked: true }
  ]) {
    const f = fixture(options);
    assert.throws(() => f.api.apply({ preview: true }), /local fixtures/);
    assert.equal(f.head.children.length, 0);
  }
});

test('invalid configuration never replaces an already active stylesheet', () => {
  const f = fixture();
  f.api.apply();
  const css = f.head.children[0].textContent;
  const badOptions = [null, [], { theme: 'sepia' }, { tint: 0.05 }, { tint: 0.46 },
    { tint: NaN }, { tint: Infinity }, { tint: '0.16' }, { blur: -1 }, { blur: 41 },
    { blur: Infinity }, { preview: 1 }, { accidental: true }];
  for (const options of badOptions) {
    assert.throws(() => f.api.apply(options));
    assert.equal(f.head.children[0].textContent, css);
    assert.equal(f.api.status().applied, true);
  }
});

test('an existing independent style is never overwritten or removed', () => {
  const f = fixture();
  const foreignStyle = f.element('STYLE');
  foreignStyle.id = 'codex-glass-experimental-style';
  foreignStyle.textContent = '/* another participant */';
  f.head.appendChild(foreignStyle);
  assert.throws(() => f.api.apply(), /style already exists/);
  f.api.restore();
  assert.equal(f.head.children[0], foreignStyle);
  assert.equal(f.root.hasAttribute(attr), false);
});

test('a failed insertion rolls back its root attribute and creates no active state', () => {
  const f = fixture();
  f.root.setAttribute(attr, 'prior');
  f.head.appendChild = () => { throw new Error('Cannot append'); };
  assert.throws(() => f.api.apply(), /Cannot append/);
  assert.equal(f.root.getAttribute(attr), 'prior');
  assert.equal(f.api.status().applied, false);
});

test('CSS preserves text opacity, has system/accessibility modes and opaque popovers', () => {
  const f = fixture();
  f.api.apply({ theme: 'system' });
  const css = f.head.children[0].textContent;
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /forced-colors:active/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /--cg-solid:rgba\([^)]*,0\.97\)/);
  assert.doesNotMatch(css, /(?:^|[;{\s])opacity\s*:/);
  assert.doesNotMatch(css, /(?:^|[;{\s])filter\s*:/);
  const status = f.api.status();
  status.config.tint = 0.45;
  assert.equal(f.api.status().config.tint, 0.16);
  f.api.restore();
  assert.equal(f.root.hasAttribute(attr), false);
});

test('an inserted style is not reported as applied when the CSS engine does not apply it', () => {
  for (const missingEngine of [false, true]) {
    const f = fixture({ styleEffective: false });
    if (missingEngine) delete f.context.getComputedStyle;
    const status = f.api.apply();
    assert.equal(f.head.children.length, 1);
    assert.equal(status.applied, false);
    assert.equal(status.styling, 'blocked-or-inactive');
    assert.equal(status.desktopGlass, 'unverified');
    f.api.restore();
    assert.equal(f.head.children.length, 0);
    assert.equal(f.root.hasAttribute(attr), false);
  }
});

test('shared bootstrap supports cold apply, repeat apply, restore, and reapply without duplicate styles', () => {
  const f = fixture();
  delete f.context.__codexGlassExperimental;
  const run = (command, config = {}) => vm.runInContext(buildExpression(command, { source, config }), f.context);
  assert.equal(run('apply', { theme: 'dark', tint: 0.12, blur: 16 }).applied, true);
  const api = f.context.__codexGlassExperimental;
  const firstStyle = f.head.children[0];
  assert.equal(f.head.children.length, 1);
  assert.match(firstStyle.textContent, /--cg-window-tint:rgba\(19, 25, 36,0\.12\)/);
  assert.equal(run('apply', { theme: 'light', tint: 0.3, blur: 8 }).applied, true);
  assert.equal(f.head.children.length, 1);
  assert.equal(f.head.children[0], firstStyle);
  assert.equal(f.context.__codexGlassExperimental, api);
  assert.match(firstStyle.textContent, /--cg-window-tint:rgba\(245, 248, 253,0\.3\)/);
  assert.match(firstStyle.textContent, /--cg-blur:8px/);
  assert.equal(run('restore').styling, 'inactive');
  assert.equal(f.head.children.length, 0);
  assert.equal(f.root.hasAttribute(attr), false);
  assert.equal(run('apply', { theme: 'system', tint: 0.24, blur: 25 }).styling, 'applied');
  assert.equal(f.head.children.length, 1);
  assert.notEqual(f.head.children[0], firstStyle);
  assert.equal(f.context.__codexGlassExperimental, api);
  assert.equal(run('status').desktopGlass, 'unverified');
  run('restore');
});

test('shared bootstrap rejects foreign API identities and incompatible versions for every command', () => {
  let foreignCalls = 0;
  const foreignMethod = () => { foreignCalls += 1; return { applied: true }; };
  const methods = { apply: foreignMethod, status: foreignMethod, restore: foreignMethod };
  const conflicts = [
    null,
    { ...methods },
    { ...methods, version: '0.0.1', extensionId: 'codex-glass-experimental' },
    { ...methods, version: '0.1.0-alpha.1', extensionId: 'another-extension' },
    { version: '0.1.0-alpha.1', extensionId: 'codex-glass-experimental', apply: foreignMethod }
  ];
  for (const conflictingAPI of conflicts) {
    const f = fixture();
    delete f.context.__codexGlassExperimental;
    f.context.__codexGlassExperimental = conflictingAPI;
    for (const command of ['apply', 'status', 'restore']) {
      assert.throws(() => vm.runInContext(buildExpression(command, { source }), f.context), /Conflicting Codex Glass API/);
      assert.equal(f.context.__codexGlassExperimental, conflictingAPI);
      assert.equal(f.head.children.length, 0);
      assert.equal(f.root.hasAttribute(attr), false);
    }
  }
  assert.equal(foreignCalls, 0);
});

test('shared bootstrap status and restore stay inactive when there is no installed API', () => {
  const f = fixture();
  delete f.context.__codexGlassExperimental;
  for (const command of ['status', 'restore']) {
    const result = vm.runInContext(buildExpression(command), f.context);
    assert.equal(result.applied, false);
    assert.equal(result.styling, 'inactive');
    assert.equal(result.desktopGlass, 'unverified');
    assert.equal('__codexGlassExperimental' in f.context, false);
    assert.equal(f.head.children.length, 0);
    assert.equal(f.root.hasAttribute(attr), false);
  }
});
