import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-row-'));
  const port = 9534;
  const proc = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch(`http://localhost:${port}/json`);
  const tabs = await res.json();
  const page = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = id++;
    const h = e => { const d = JSON.parse(e.data); if (d.id === mid) { ws.removeEventListener('message', h); d.error ? rej(d.error) : res(d.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });

  const ev = async s => { const r = await send('Runtime.evaluate', { expression: s, returnByValue: true }); return r.result?.value; };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
      localStorage.setItem('portal_theme', 'light');
    `
  });

  await send('Page.navigate', { url: 'http://localhost:8888/' });
  await new Promise(r => setTimeout(r, 3000));
  await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
  await new Promise(r => setTimeout(r, 2000));

  const result = await ev(`
    (() => {
      const rec = state.collo.data.find(c => c.id == 842);
      if (!rec) return 'Record 842 not found';
      return {
        pelangganFormatted: formatPelangganCell(rec.pelanggan),
        rec
      };
    })()
  `);

  console.log('Result for 842:');
  console.log(result?.pelangganFormatted);

  ws.close();
  proc.kill();
}

main().catch(console.error);
