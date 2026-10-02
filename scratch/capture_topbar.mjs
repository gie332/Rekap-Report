import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function captureUpdatedTopbar() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-topbar-final-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9588;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
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
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin',full_name:'Administrator (Manajemen)'}));
        localStorage.setItem('portal_theme', 'dark');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    // Wait for fonts and network
    await send('Runtime.evaluate', {
      expression: 'document.fonts.ready',
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 2500));

    // Get the exact bounding box of .portal-topbar
    const evalRes = await send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('.portal-topbar');
        const r = el.getBoundingClientRect();
        JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });
      `,
      returnByValue: true
    });
    const box = JSON.parse(evalRes.result.value);

    // 1. Capture dark topbar full width
    const rDark = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    fs.writeFileSync(path.join(artifactDir, 'topbar_clean_dark.png'), Buffer.from(rDark.data, 'base64'));

    // Capture dark topbar right cluster close up
    const rRightDark = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: box.x + box.width - 640, y: box.y, width: 640, height: box.height, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'topbar_right_dark_cluster.png'), Buffer.from(rRightDark.data, 'base64'));
    console.log('Saved dark screenshots with fonts ready');

    // 2. Switch to light theme and capture
    await send('Runtime.evaluate', {
      expression: `
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('portal_theme', 'light');
        const seg = document.getElementById('themeToggleSegmented');
        if (seg) {
          seg.querySelectorAll('.theme-seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.themeVal === 'light');
          });
        }
      `
    });
    await new Promise(r => setTimeout(r, 600));

    const rLight = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    fs.writeFileSync(path.join(artifactDir, 'topbar_clean_light.png'), Buffer.from(rLight.data, 'base64'));

    const rRightLight = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: box.x + box.width - 640, y: box.y, width: 640, height: box.height, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'topbar_right_light_cluster.png'), Buffer.from(rRightLight.data, 'base64'));
    console.log('Saved light screenshots with fonts ready');

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    edgeProc.kill();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

captureUpdatedTopbar();
