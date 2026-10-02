import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function captureCollo(theme, outFileName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `edge-collo-${theme}-`));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9570 + Math.floor(Math.random() * 20);

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);

  try {
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

    const ev = async s => { const r = await send('Runtime.evaluate', { expression: s, returnByValue: true }); return r.result?.value; };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', '${theme}');
        localStorage.setItem('telecom_portal_alert_dismissed_date', new Date().toISOString().slice(0, 10));
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Navigate to collo list view
    await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
    await new Promise(r => setTimeout(r, 1500));

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, outFileName), Buffer.from(r.data, 'base64'));
    console.log(`Saved ${outFileName}`);

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

async function run() {
  await captureCollo('light', 'collo_light_view.png');
  await captureCollo('dark', 'collo_dark_view.png');
}

run().catch(console.error);
