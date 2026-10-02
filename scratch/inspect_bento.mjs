import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-inspect-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9585;
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch(`http://localhost:${port}/json`);
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = id++;
    const h = e => { const d = JSON.parse(e.data); if (d.id === mid) { ws.removeEventListener('message', h); d.error ? rej(d.error) : res(d.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8888/' });
  await new Promise(r => setTimeout(r, 3000));
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const g = document.querySelector('.bento-kpi-grid');
      const c = document.querySelector('.bento-kpi-card');
      const gStyle = g ? window.getComputedStyle(g) : null;
      const cStyle = c ? window.getComputedStyle(c) : null;
      return {
        gridExists: !!g,
        gridDisplay: gStyle ? gStyle.display : null,
        gridCols: gStyle ? gStyle.gridTemplateColumns : null,
        cardExists: !!c,
        cardDisplay: cStyle ? cStyle.display : null,
        cardBg: cStyle ? cStyle.backgroundColor : null,
        cardBgImg: cStyle ? cStyle.backgroundImage : null,
        cardBorder: cStyle ? cStyle.border : null,
        cardW: c ? c.offsetWidth : null,
        cardH: c ? c.offsetHeight : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Inspection result:', r.result ? r.result.value : null);
  ws.close();
  edgeProc.kill();
}

run().catch(console.error);
