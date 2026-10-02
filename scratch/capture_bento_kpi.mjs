import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-bento-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9536;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1500,1000',
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
      width: 1500,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'dark');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    // Wait until dashboard loads
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const val = await ev(`document.getElementById('execActiveCollo')?.textContent`);
      if (val && val !== '880' && val !== '0') break;
    }
    await new Promise(r => setTimeout(r, 1500));

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

    // 1. Dark Mode Full Screen & Bento Zoom
    const darkFull = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'bento_executive_dark.png'), Buffer.from(darkFull.data, 'base64'));
    console.log('Saved bento_executive_dark.png');

    // Also clip specifically to Bento KPI Grid
    const bentoBox = await ev(`(() => {
      const el = document.querySelector('.bento-kpi-grid');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);

    if (bentoBox) {
      const darkBentoClip = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: bentoBox.x - 10, y: bentoBox.y - 10, width: bentoBox.width + 20, height: bentoBox.height + 20, scale: 1 }
      });
      fs.writeFileSync(path.join(artifactDir, 'bento_cards_dark_zoom.png'), Buffer.from(darkBentoClip.data, 'base64'));
      console.log('Saved bento_cards_dark_zoom.png');
    }

    // 2. Light Mode Bento Capture
    await ev(`
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('portal_theme', 'light');
      window.dispatchEvent(new Event('themechange'));
    `);
    await new Promise(r => setTimeout(r, 1000));

    const lightFull = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'bento_executive_light.png'), Buffer.from(lightFull.data, 'base64'));
    console.log('Saved bento_executive_light.png');

    if (bentoBox) {
      const lightBentoClip = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: bentoBox.x - 10, y: bentoBox.y - 10, width: bentoBox.width + 20, height: bentoBox.height + 20, scale: 1 }
      });
      fs.writeFileSync(path.join(artifactDir, 'bento_cards_light_zoom.png'), Buffer.from(lightBentoClip.data, 'base64'));
      console.log('Saved bento_cards_light_zoom.png');
    }

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main();
