import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function testPopover() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-popover-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9536;

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

    // 1. TEST LIGHT MODE
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'light');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Switch to collo list
    await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
    await new Promise(r => setTimeout(r, 1500));

    // Find first tenant-badge and click it
    const badgeInfo = await ev(`
      (() => {
        const btn = document.querySelector('.tenant-cell .tenant-badge');
        if (!btn) return null;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return { text: btn.textContent.trim(), popoverVisible: !document.getElementById('tenantPopover').classList.contains('hidden') };
      })()
    `);
    console.log('Light Mode Tenant Badge Click Info:', badgeInfo);
    await new Promise(r => setTimeout(r, 500));

    const popState = await ev(`
      (() => {
        const pop = document.getElementById('tenantPopover');
        return {
          rect: pop.getBoundingClientRect(),
          classes: pop.className,
          display: pop.style.display,
          computedDisplay: window.getComputedStyle(pop).display,
          top: pop.style.top,
          left: pop.style.left
        };
      })()
    `);
    console.log('PopState before shot:', popState);

    // Capture screenshot of open popover
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'light_collo_popover_open.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved light_collo_popover_open.png');

    // Test SO badge click
    const soBadgeInfo = await ev(`
      (() => {
        const btn = document.querySelectorAll('button.tenant-badge')[1];
        if (!btn) return null;
        btn.click();
        return { text: btn.textContent.trim(), title: document.getElementById('tenantPopoverTitle').textContent };
      })()
    `);
    console.log('Light Mode SO Badge Click Info:', soBadgeInfo);
    await new Promise(r => setTimeout(r, 500));

    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'light_collo_so_popover_open.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved light_collo_so_popover_open.png');

    // 2. TEST DARK MODE
    await ev(`
      document.getElementById('themeToggleBtn')?.click();
    `);
    await new Promise(r => setTimeout(r, 800));

    // Click tenant badge in dark mode
    await ev(`
      (() => {
        const btn = document.querySelector('.tenant-cell .tenant-badge');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'dark_collo_popover_open.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved dark_collo_popover_open.png');

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

testPopover().catch(console.error);
