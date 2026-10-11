// Deliberately no app launching, native patching, persistent scripts or storage.
export function validatePort(value) {
  const text = String(value);
  if (!/^\d{1,5}$/.test(text)) throw new Error('Port must be an integer.');
  const port = Number(text);
  if (port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535.');
  return port;
}

export function validateSocket(address, port, id) {
  const u = new URL(address);
  if (u.protocol !== 'ws:' || u.hostname !== '127.0.0.1' || Number(u.port) !== port ||
      u.username || u.password || u.search || u.hash ||
      u.pathname !== `/devtools/page/${id}` || !/^[A-Za-z0-9._-]{1,200}$/.test(id)) {
    throw new Error('Refusing a non-loopback or unexpected debugger target.');
  }
  return u.href;
}

export function isMainPage(target) {
  try {
    const u = new URL(target.url);
    // Target titles can be user conversation content; never read or print them.
    return target.type === 'page' && u.protocol === 'app:' && u.hostname === '-' && !u.port &&
      u.pathname === '/index.html' && !u.search && !u.username && !u.password;
  } catch { return false; }
}

export async function listTargets(port, fetcher = fetch) {
  port = validatePort(port);
  const response = await fetcher(`http://127.0.0.1:${port}/json/list`, {
    redirect: 'error', signal: AbortSignal.timeout(3000)
  });
  if (!response.ok) throw new Error(`Debugger returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw new Error('Debugger target list is too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const entries = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid debugger target list.');
  return entries.filter(isMainPage).map(t => ({
    id: t.id,
    // Deliberately omit URL fragments, query strings and titles.
    url: 'app://-/index.html',
    socket: validateSocket(t.webSocketDebuggerUrl, port, t.id)
  }));
}

export async function connect(address, { timeout = 5000, WebSocketClass = WebSocket } = {}) {
  const ws = new WebSocketClass(address);
  let serial = 0;
  const pending = new Map();
  let openTimer;
  const opened = new Promise((resolve, reject) => {
    openTimer = setTimeout(() => { reject(new Error('Debugger connection timed out.')); ws.close(); }, timeout);
    ws.addEventListener('open', () => { clearTimeout(openTimer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(openTimer); reject(new Error('Debugger connection failed.')); }, { once: true });
    ws.addEventListener('close', () => { clearTimeout(openTimer); reject(new Error('Debugger connection closed.')); }, { once: true });
  });
  const cancel = () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Debugger disconnected.'));
    }
    pending.clear();
  };
  ws.addEventListener('close', cancel);
  ws.addEventListener('error', cancel);
  ws.addEventListener('message', ({ data }) => {
    // Process replies only. Never subscribe to network, console, cookies or chats.
    if (typeof data !== 'string') return;
    if (data.length > 1048576) { cancel(); ws.close(); return; }
    let message;
    try { message = JSON.parse(data); } catch { return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error('Debugger rejected the operation.'));
    else waiter.resolve(message.result);
  });
  await opened;
  return {
    call(method, params) {
      return new Promise((resolve, reject) => {
        if (ws.readyState !== 1) return reject(new Error('Debugger is not connected.'));
        const id = ++serial;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Debugger operation timed out.')); }, timeout);
        pending.set(id, { resolve, reject, timer });
        try { ws.send(JSON.stringify({ id, method, params })); }
        catch (err) { clearTimeout(timer); pending.delete(id); reject(err); }
      });
    },
    close() { cancel(); ws.close(); }
  };
}

export async function evaluate(connection, expression) {
  const response = await connection.call('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: false, userGesture: false
  });
  if (response.exceptionDetails) throw new Error('Page rejected the operation. No application content was collected.');
  return response.result?.value;
}
