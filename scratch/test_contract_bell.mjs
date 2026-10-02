import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-bell-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9545;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--window-size=1400,900',
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
      width: 1400,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'dark');
        // Do not set telecom_portal_alert_dismissed_date so daily alert triggers!
        localStorage.removeItem('telecom_portal_alert_dismissed_date');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 3000));

    const artifactDir = 'C:\\Users\\anggi\\.gemini\\antigravity-ide\\brain\\2c63f812-2c94-4f6c-b883-beb4f4341743';

    // 1. Capture screen showing Bell button + Daily Alert Banner
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'bell_daily_alert.png'), Buffer.from(shot1.data, 'base64'));
    console.log('Saved bell_daily_alert.png');

    // 2. Click the Bell button to open notification panel
    await ev(`document.getElementById('btnContractAlertBell')?.click()`);
    await new Promise(r => setTimeout(r, 600));

    // Capture topbar + opened notification panel
    const bellBox = await ev(`(() => {
      const el = document.getElementById('contractAlertNotificationPanel');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 20), y: 0, width: r.width + 40, height: r.bottom + 40 };
    })()`);

    if (bellBox) {
      const shot2 = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: bellBox.x, y: 0, width: bellBox.width, height: 600, scale: 1 }
      });
      fs.writeFileSync(path.join(artifactDir, 'bell_notification_panel.png'), Buffer.from(shot2.data, 'base64'));
      console.log('Saved bell_notification_panel.png');
    }

    // 3. Switch to Light Mode and capture
    await ev(`
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('portal_theme', 'light');
    `);
    await new Promise(r => setTimeout(r, 500));

    if (bellBox) {
      const shot3 = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: bellBox.x, y: 0, width: bellBox.width, height: 600, scale: 1 }
      });
      fs.writeFileSync(path.join(artifactDir, 'bell_notification_panel_light.png'), Buffer.from(shot3.data, 'base64'));
      console.log('Saved bell_notification_panel_light.png');
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
