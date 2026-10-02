import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-snooze-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9555;

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
        localStorage.setItem('portal_theme', 'dark');
        localStorage.removeItem('telecom_portal_alert_dismissed_date');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 3000));

    // Check banner text & button
    const btnText = await ev(`document.getElementById('btnDailyBannerDismissToday')?.innerText`);
    console.log('Button text:', btnText);

    // Click snooze button
    await ev(`document.getElementById('btnDailyBannerDismissToday')?.click()`);
    await new Promise(r => setTimeout(r, 400));

    // Get toast text
    const toastText = await ev(`document.querySelector('#toastContainer .toast')?.innerText || document.getElementById('toastContainer')?.innerText`);
    console.log('Toast text:', toastText);

    // Capture screenshot of bottom right toast area
    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 1000,
        y: 750,
        width: 440,
        height: 150,
        scale: 1
      }
    });
    fs.writeFileSync(path.join(artifactDir, 'snooze_toast_verification.png'), Buffer.from(r.data, 'base64'));
    console.log('Saved snooze_toast_verification.png');

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(console.error);
