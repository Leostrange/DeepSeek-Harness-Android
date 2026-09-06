#!/usr/bin/env node
/* CDP eval against the DSHA WebView.
 * Usage: node cdp-eval.js "expression" [--async]
 * Requires: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 */
const http = require('http');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const expr = process.argv[2];
  const isAsync = process.argv.includes('--async');
  if (!expr) { console.error('no expression'); process.exit(1); }
  const targets = await getJson('/json');
  const pages = targets.filter(t => t.type === 'page');
  if (!pages.length) { console.error('no page target', targets); process.exit(1); }
  // Prefer the live (attached) webview target of the DSH page.
  const page = pages.find(t => (t.description || '').includes('"attached":true')) ||
    pages.find(t => t.url && t.url.includes('127.0.0.1:3080')) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'));
  ws.on = ws.on || (() => {});
  const dbg = (...a) => { if (process.env.CDP_DEBUG) console.error('[dbg]', ...a); };
  dbg('connecting', page.webSocketDebuggerUrl);
  const timer = setTimeout(() => { console.error('TIMEOUT readyState=' + ws.readyState); process.exit(2); }, 15000);
  ws.addEventListener('open', () => dbg('open'));
  ws.addEventListener('error', (e) => dbg('error', e.message || e));
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: isAsync },
    }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id === 1) {
      clearTimeout(timer);
      if (msg.result && msg.result.exceptionDetails) {
        console.error('EXCEPTION:', JSON.stringify(msg.result.exceptionDetails, null, 2));
      } else if (msg.result) {
        console.log(JSON.stringify(msg.result.result && msg.result.result.value, null, 2));
      }
      ws.close();
      process.exit(0);
    }
  };
  ws.onerror = (e) => { console.error('WS ERROR', e.message || e); process.exit(3); };
})();
