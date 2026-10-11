// One shared entry point for exported scripts and the optional manual CDP adapter.
// No native app access occurs while constructing these expressions.
export function buildExpression(command, { source = '', config = {} } = {}) {
  if (!['apply', 'status', 'restore'].includes(command)) throw new Error('Unknown operation.');
  if (command === 'apply' && !source.trim()) throw new Error('Renderer source is required.');
  return `(() => {
    const key = '__codexGlassExperimental';
    let api = globalThis[key];
    if (api === undefined) {
      ${command === 'apply' ? `(function () {\n${source}\n})(); api = globalThis[key];` : "return {applied:false,styling:'inactive',desktopGlass:'unverified'};"}
    }
    if (!api || api.version !== '0.1.0-alpha.1' || api.extensionId !== 'codex-glass-experimental' ||
        !['apply', 'status', 'restore'].every(method => typeof api[method] === 'function')) {
      throw new Error('Conflicting Codex Glass API. Reload the page before changing versions.');
    }
    const result = api.${command}(${command === 'apply' ? JSON.stringify(config) : ''});
    return {
      applied: result?.applied === true,
      styling: ['applied','inactive','blocked-or-inactive'].includes(result?.styling) ? result.styling : 'unknown',
      desktopGlass: 'unverified'
    };
  })()`;
}
