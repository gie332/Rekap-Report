import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function testNextScroll() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-scroll-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9539;

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

    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('telecom_portal_user', JSON.stringify({username:'admin',role:'admin'}));
        localStorage.setItem('portal_theme', 'dark');
      `
    });

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2500));

    // Switch to collo list
    await ev(`document.querySelector('[data-view="view-collo-list"]')?.click()`);
    await new Promise(r => setTimeout(r, 1500));

    const beforeScroll = await ev(`
      (() => {
        const body = document.querySelector('.portal-content-body');
        const nextBtn = document.getElementById('colloNextPageBtn');
        nextBtn?.scrollIntoView();
        return {
          bodyClientHeight: body?.clientHeight,
          bodyScrollHeight: body?.scrollHeight,
          bodyScrollTop: body?.scrollTop,
          docScrollTop: document.documentElement.scrollTop,
          winScrollY: window.scrollY
        };
      })()
    `);
    console.log('Scrolled down with nextBtn.scrollIntoView():', beforeScroll);
    await new Promise(r => setTimeout(r, 500));

    // 2. Click Next Button
    const clickResult = await ev(`
      (() => {
        const btn = document.getElementById('colloNextPageBtn');
        if (!btn) return 'no btn';
        btn.click();
        return 'clicked';
      })()
    `);
    console.log('Click next result:', clickResult);

    // Wait for data load and scroll animation
    await new Promise(r => setTimeout(r, 1200));

    // 3. Verify scrollTop is now near the top (< 100px)
    const afterScroll = await ev(`
      (() => {
        const body = document.querySelector('.portal-content-body');
        const card = document.querySelector('#view-collo-list .table-container-card');
        const cardRect = card.getBoundingClientRect();
        const pageText = document.getElementById('colloPaginationInfo').textContent;
        return {
          scrollTop: body.scrollTop,
          cardTopViewport: cardRect.top,
          pageText: pageText
        };
      })()
    `);
    console.log('After Next click state:', afterScroll);

    // 4. Capture screenshot of page 2 scrolled to top
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'collo_page2_scrolled_to_top.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved collo_page2_scrolled_to_top.png');

    // 5. Scroll down to row 47 on page 2 to verify SID compaction
    await ev(`
      (() => {
        const rows = document.querySelectorAll('#colloTableBody tr');
        let targetRow = null;
        rows.forEach(r => {
          if (r.textContent.includes('Fukoku Tokai Rubber')) targetRow = r;
        });
        if (targetRow) {
          targetRow.scrollIntoView({ block: 'center' });
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'collo_row47_compact_sid.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved collo_row47_compact_sid.png');

    ws.close();
  } finally {
    edgeProc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

testNextScroll().catch(console.error);
