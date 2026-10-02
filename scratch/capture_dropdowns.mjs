import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function captureDropdowns() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-dd-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9538;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1400,900',
    'about:blank'
  ]);

  const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

  try {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`http://localhost:${port}/json`);
    const tabs = await res.json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const send = (m, p = {}) => new Promise((resolve, reject) => {
      const mid = id++;
      const handler = e => {
        const d = JSON.parse(e.data);
        if (d.id === mid) {
          ws.removeEventListener('message', handler);
          d.error ? reject(d.error) : resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: mid, method: m, params: p }));
    });

    const ev = async s => {
      const r = await send('Runtime.evaluate', { expression: s, returnByValue: true });
      return r.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // 1. LIGHT MODE
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'light');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Click Ekspor button
    await ev(`document.getElementById('btnToggleExportMenu')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    let shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 600, y: 0, width: 800, height: 400, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'light_dropdown_export.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved light_dropdown_export.png');

    // Click Alat Portal button
    await ev(`document.getElementById('btnToggleToolsMenu')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 600, y: 0, width: 800, height: 400, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'light_dropdown_tools.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved light_dropdown_tools.png');

    // 2. DARK MODE
    await ev(`document.getElementById('themeToggleBtn')?.click()`);
    await new Promise(r => setTimeout(r, 800));

    await ev(`document.getElementById('btnToggleExportMenu')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 600, y: 0, width: 800, height: 400, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'dark_dropdown_export.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved dark_dropdown_export.png');

    await ev(`document.getElementById('btnToggleToolsMenu')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 600, y: 0, width: 800, height: 400, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'dark_dropdown_tools.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved dark_dropdown_tools.png');

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

captureDropdowns().catch(console.error);
