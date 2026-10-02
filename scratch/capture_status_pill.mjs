import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function captureStatus(theme, outFileName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `edge-${theme}-`));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9540 + Math.floor(Math.random() * 20);

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
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Get bounding box of sidebar-bottom
    const box = await ev(`
      (() => {
        const el = document.querySelector('.sidebar-bottom');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()
    `);

    console.log(`Box for ${theme}:`, box);

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';
    
    if (box && box.x >= 0) {
      const r = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x),
          y: Math.max(0, box.y),
          width: box.width,
          height: box.height,
          scale: 1
        }
      });
      fs.writeFileSync(path.join(artifactDir, outFileName), Buffer.from(r.data, 'base64'));
      console.log(`Saved clipped ${outFileName}`);
    } else {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artifactDir, outFileName), Buffer.from(r.data, 'base64'));
      console.log(`Saved full ${outFileName}`);
    }

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

async function run() {
  await captureStatus('light', 'sidebar_status_light.png');
  await captureStatus('dark', 'sidebar_status_dark.png');
}

run().catch(console.error);
