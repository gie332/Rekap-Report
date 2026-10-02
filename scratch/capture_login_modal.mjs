import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-login-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9540;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1200,900',
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
      width: 1200,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Do NOT set telecom_portal_user in localStorage so login modal is shown!
    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Show login overlay and switch to register tab
    await ev(`
      const overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.style.display = 'flex';
      document.getElementById('tabModeRegister')?.click();
    `);
    await new Promise(r => setTimeout(r, 800));

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

    // Capture registration modal
    const shotReg = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'login_register_clean.png'), Buffer.from(shotReg.data, 'base64'));
    console.log('Saved login_register_clean.png');

    // Also switch to login tab and capture
    await ev(`document.getElementById('tabModeLogin')?.click();`);
    await new Promise(r => setTimeout(r, 500));
    const shotLogin = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'login_pane_clean.png'), Buffer.from(shotLogin.data, 'base64'));
    console.log('Saved login_pane_clean.png');

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main();
