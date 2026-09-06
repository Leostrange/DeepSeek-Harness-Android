#!/usr/bin/env node
/* Listen for page JS exceptions during a reload. */
const http = require('http');
function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
(async () => {
  const targets = await getJson('/json');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'));
  const errors = [];
  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable', params: {} }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable', params: {} }));
    setTimeout(() => ws.send(JSON.stringify({ id: 3, method: 'Page.reload', params: {} })), 300);
    setTimeout(() => {
      console.log(JSON.stringify(errors, null, 2));
      process.exit(0);
    }, 9000);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({
        text: d.exception && (d.exception.description || d.exception.value) || d.text,
        line: d.lineNumber, col: d.columnNumber, url: d.url,
      });
    }
  };
})();
