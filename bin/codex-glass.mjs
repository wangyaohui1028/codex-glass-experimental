#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listTargets, validatePort, connect, evaluate } from '../src/cdp.mjs';
import { buildExpression } from '../src/bootstrap.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command = 'help', ...args] = process.argv.slice(2);
const allowed = new Set(['port', 'target', 'theme', 'tint', 'blur', 'manual-session']);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || !allowed.has(key) || key in opts) throw new Error('Unknown or duplicate option.');
  if (key === 'manual-session') opts[key] = true;
  else {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing --${key} value.`);
    opts[key] = value;
  }
}

function config() {
  const c = { theme: opts.theme ?? 'system', tint: Number(opts.tint ?? 0.16), blur: Number(opts.blur ?? 22) };
  if (!['light', 'dark', 'system'].includes(c.theme) || !Number.isFinite(c.tint) || c.tint < .06 || c.tint > .45 ||
      !Number.isFinite(c.blur) || c.blur < 0 || c.blur > 40) throw new Error('Invalid theme, tint (0.06–0.45), or blur (0–40).');
  return c;
}

async function main() {
  const port = validatePort(opts.port ?? 9229);
  if (command === 'help' || command === '--help') {
    console.log(`Codex Glass 0.1.0-alpha.1 — experimental, unofficial\n\n` +
      `node bin/codex-glass.mjs preview\n` +
      `node bin/codex-glass.mjs export [--theme dark] [--tint .16] [--blur 22]\n` +
      `node bin/codex-glass.mjs list --manual-session [--port 9229]\n` +
      `node bin/codex-glass.mjs apply --manual-session --target ID [--port 9229]\n` +
      `node bin/codex-glass.mjs status|restore --manual-session --target ID\n\n` +
      `No automatic launch, restart, bundle patch, startup service or persistent injection.\n` +
      `The optional CDP adapter is for an explicitly user-opened local developer session.\n` +
      `It must not be used by an agent to bypass a restriction on controlling its host.\n` +
      `Applied CSS does not prove native desktop transparency. Read README.md.`);
    return;
  }
  if (command === 'export') {
    const js = await readFile(path.join(root, 'src/renderer.js'), 'utf8');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist/apply.js'), buildExpression('apply', {source:js, config:config()}) + ';\n');
    await writeFile(path.join(root, 'dist/restore.js'), buildExpression('restore') + ';\n');
    console.log('Exported dist/apply.js and dist/restore.js. No app was contacted.');
    return;
  }
  if (command === 'preview') {
    const routes = new Map([
      ['/', ['demo/index.html', 'text/html; charset=utf-8']],
      ['/demo/index.html', ['demo/index.html', 'text/html; charset=utf-8']],
      ['/src/renderer.js', ['src/renderer.js', 'text/javascript; charset=utf-8']]
    ]);
    const server = createServer(async (req, res) => {
      if (req.method !== 'GET' || !routes.has(req.url)) { res.writeHead(404).end(); return; }
      const [file, type] = routes.get(req.url);
      try {
        const body = await readFile(path.join(root, file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(body);
      } catch { res.writeHead(500).end('Preview file is unavailable.'); }
    });
    server.listen(0, '127.0.0.1', () => console.log(`Independent preview only: http://127.0.0.1:${server.address().port}/demo/index.html\nCtrl+C to close.`));
    return;
  }
  if (!['list', 'apply', 'status', 'restore'].includes(command)) throw new Error('Unknown command. Use help.');
  if (!opts['manual-session']) throw new Error('Requires --manual-session: you must deliberately open and select the local developer session. No app has been contacted.');
  if (command === 'apply') config();
  if (command !== 'list' && !/^[A-Za-z0-9._-]{1,200}$/.test(opts.target ?? '')) throw new Error('Provide an explicit --target ID from list. No app has been contacted.');
  const targets = await listTargets(port);
  if (command === 'list') {
    console.log(JSON.stringify(targets.map(({ id }) => ({ id, candidate: true, nativeGlass: 'unverified' })), null, 2));
    return;
  }
  const matches = targets.filter(t => t.id === opts.target);
  if (matches.length !== 1) throw new Error('The selected ID is not a unique eligible main app page.');
  const cdp = await connect(matches[0].socket);
  try {
    let expression;
    if (command === 'apply') {
      expression = buildExpression('apply', { source:await readFile(path.join(root, 'src/renderer.js'), 'utf8'), config:config() });
    } else {
      expression = buildExpression(command);
    }
    console.log(JSON.stringify(await evaluate(cdp, expression), null, 2));
  } finally { cdp.close(); }
}

main().catch(err => { console.error(`Codex Glass: ${err.message}`); process.exitCode = 1; });
