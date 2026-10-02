import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-inspect-'));
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9450;

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`http://localhost:${port}/json`);
    const tabs = await res.json();
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('CSS.enable');
    await send('DOM.enable');

    await send('Page.navigate', { url: 'http://localhost:8888/' });
    await new Promise(r => setTimeout(r, 2000));

    const doc = await send('DOM.getDocument');
    const node = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#modalQuickEdit'
    });

    const matchedStyles = await send('CSS.getMatchedStylesForNode', { nodeId: node.nodeId });

    console.log('MATCHED CSS RULES:');
    for (const rule of (matchedStyles.matchedCSSRules || [])) {
      console.log('Selector:', rule.rule.selectorList.text, 'from', rule.rule.styleSheetId);
      for (const p of rule.rule.style.cssProperties) {
        if (['position', 'z-index', 'display', 'background'].includes(p.name)) {
          console.log(`  ${p.name}: ${p.value}`);
        }
      }
    }

    ws.close();
  } finally {
    edgeProc.kill();
  }
}

main().catch(console.error);
