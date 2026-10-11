import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePort, validateSocket, isMainPage, listTargets, connect, evaluate } from '../src/cdp.mjs';

test('only valid non-privileged local ports are accepted', () => {
  assert.equal(validatePort('9229'), 9229);
  for (const p of ['9229x', '1e4', '-1', '80', '65536', '0', '']) assert.throws(() => validatePort(p));
});
test('debugger addresses cannot escape the chosen loopback page', () => {
  assert.equal(validateSocket('ws://127.0.0.1:9229/devtools/page/abc', 9229, 'abc'), 'ws://127.0.0.1:9229/devtools/page/abc');
  for (const s of [
    'ws://example.com:9229/devtools/page/abc', 'ws://localhost:9229/devtools/page/abc',
    'ws://127.0.0.1:9230/devtools/page/abc', 'ws://127.0.0.1:9229/devtools/browser/abc',
    'ws://u:p@127.0.0.1:9229/devtools/page/abc', 'ws://127.0.0.1:9229/devtools/page/abc?q=1',
    'ws://127.0.0.1:9229/devtools/page/other', 'wss://127.0.0.1:9229/devtools/page/abc'
  ]) assert.throws(() => validateSocket(s, 9229, 'abc'));
});
test('normal web tabs and auxiliary app pages are never eligible', () => {
  assert.equal(isMainPage({ type:'page',url:'app://-/index.html#/chat/any' }), true);
  for (const url of ['https://codex.example/index.html', 'file:///index.html', 'app://-/avatar-overlay.html', 'app://-/index.html?mode=login', 'app://unrelated-app/index.html', 'app://-:9229/index.html', 'app://user@-/index.html']) {
    assert.equal(isMainPage({ type:'page',url,title:'Codex' }), false);
  }
  assert.equal(isMainPage({ type:'iframe',url:'app://-/index.html' }), false);
});
test('target discovery strips all conversation titles and URL fragments', async () => {
  const targets = await listTargets(9229, async (url, options) => {
    assert.equal(url,'http://127.0.0.1:9229/json/list');
    assert.equal(options.redirect,'error');
    return new Response(JSON.stringify([
      {id:'a',type:'page',url:'app://-/index.html#/private-thread',title:'PRIVATE TITLE',webSocketDebuggerUrl:'ws://127.0.0.1:9229/devtools/page/a'},
      {id:'b',type:'page',url:'https://example.com',title:'Codex',webSocketDebuggerUrl:'ws://127.0.0.1:9229/devtools/page/b'}
    ]));
  });
  assert.equal(targets.length,1);
  assert.equal(targets[0].url,'app://-/index.html');
  assert.ok(!JSON.stringify(targets).includes('PRIVATE'));
  assert.ok(!JSON.stringify(targets).includes('private-thread'));
});
test('oversized discovery is bounded', async () => {
  await assert.rejects(listTargets(9229,async()=>new Response('x'.repeat(262145))), /too large/);
});

class FakeSocket extends EventTarget {
  readyState = 0;
  sent = [];
  constructor() { super(); queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));}); FakeSocket.last=this; }
  send(data) { this.sent.push(JSON.parse(data)); }
  reply(data) { const e=new Event('message');e.data=JSON.stringify(data);this.dispatchEvent(e); }
  close() { this.readyState=3;this.dispatchEvent(new Event('close')); }
}
test('CDP replies correlate out of order and ignore unsolicited content', async () => {
  const c = await connect('ws://fixture', {WebSocketClass:FakeSocket,timeout:100});
  const a=c.call('Runtime.evaluate',{expression:'a'}), b=c.call('Runtime.evaluate',{expression:'b'});
  FakeSocket.last.reply({method:'Runtime.consoleAPICalled',params:{private:'ignore'}});
  FakeSocket.last.reply({id:2,result:{value:'B'}});
  FakeSocket.last.reply({id:1,result:{value:'A'}});
  assert.deepEqual(await a,{value:'A'});assert.deepEqual(await b,{value:'B'});
  c.close();
});
test('disconnection rejects operations instead of reporting success', async () => {
  const c=await connect('ws://fixture',{WebSocketClass:FakeSocket,timeout:100});
  const p=c.call('Runtime.evaluate',{});
  c.close();
  await assert.rejects(p,/disconnected/);
});
test('page errors never leak exception text or private data', async () => {
  await assert.rejects(evaluate({call:async()=>({exceptionDetails:{text:'PRIVATE'}})},'x'), err=>!err.message.includes('PRIVATE'));
});
