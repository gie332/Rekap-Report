import subprocess
import time
import json
import urllib.request
import os
import websocket
import base64

cmd = [
    r'C:\Users\anggi\AppData\Local\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--remote-debugging-port=9224',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--window-size=1280,900',
    'http://localhost:8888/'
]
proc = subprocess.Popen(cmd)
time.sleep(2)

try:
    tabs = json.loads(urllib.request.urlopen('http://localhost:9224/json').read().decode())
    ws_url = tabs[0]['webSocketDebuggerUrl']
    ws = websocket.create_connection(ws_url)
    
    def cdp_send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        ws.send(json.dumps(msg))
        return json.loads(ws.recv())

    # Wait for page to load, set auth
    set_auth = """
    localStorage.setItem('telecom_portal_user', JSON.stringify({id: 1, username: 'admin', role: 'superadmin', name: 'Super Admin'}));
    localStorage.setItem('telecom_portal_token', 'test_token');
    location.reload();
    """
    cdp_send('Runtime.evaluate', {'expression': set_auth})
    time.sleep(2)

    # Switch to view-collo-rev-sharing
    script = """
    const nav = document.querySelector('[data-view="view-collo-rev-sharing"]');
    if (nav) nav.click();
    """
    cdp_send('Runtime.evaluate', {'expression': script})
    time.sleep(1.5)

    # Inspect the Breakdown table and its scroll container
    inspect_script = """
    (() => {
        const table = document.querySelector('#revSharePengelolaTableBody').closest('table');
        const container = table.parentElement;
        const thead = table.querySelector('thead');
        const firstTr = table.querySelector('tbody tr');
        const secondTr = table.querySelectorAll('tbody tr')[1];
        
        return JSON.stringify({
            containerClass: container.className,
            containerScrollHeight: container.scrollHeight,
            containerClientHeight: container.clientHeight,
            containerScrollTop: container.scrollTop,
            theadRect: thead.getBoundingClientRect(),
            firstTrRect: firstTr ? firstTr.getBoundingClientRect() : null,
            secondTrRect: secondTr ? secondTr.getBoundingClientRect() : null,
            pageScrollTop: document.querySelector('.portal-content-body')?.scrollTop,
            pageScrollHeight: document.querySelector('.portal-content-body')?.scrollHeight
        });
    })()
    """
    res = cdp_send('Runtime.evaluate', {'expression': inspect_script, 'returnByValue': True})
    print("EVAL RESULT:", res)
    if 'result' in res and 'result' in res['result'] and 'value' in res['result']['result']:
        data = json.loads(res['result']['result']['value'])
        print("INITIAL STATE:", json.dumps(data, indent=2))
    else:
        print("EVAL ERROR:", res)

    # Scroll page down to Breakdown table
    scroll_page_script = """
    (() => {
        const table = document.querySelector('#revSharePengelolaTableBody').closest('.panel-card');
        table.scrollIntoView();
        return JSON.stringify({
            pageScrollTop: document.querySelector('.portal-content-body')?.scrollTop,
            tableCardRect: table.getBoundingClientRect()
        });
    })()
    """
    res = cdp_send('Runtime.evaluate', {'expression': scroll_page_script, 'returnByValue': True})
    print("AFTER SCROLL INTO VIEW:", res['result']['result']['value'])
    time.sleep(0.5)

    # Take screenshot 1
    shot_res = cdp_send('Page.captureScreenshot')
    with open('actual_portal_view1.png', 'wb') as f:
        f.write(base64.b64decode(shot_res['result']['data']))
    print("Screenshot 1 saved to actual_portal_view1.png")

    # Now scroll the table's container itself
    scroll_table_script = """
    (() => {
        const table = document.querySelector('#revSharePengelolaTableBody').closest('table');
        const container = table.parentElement;
        container.scrollTop = 100;
        return JSON.stringify({
            containerScrollTop: container.scrollTop,
            theadRect: table.querySelector('thead').getBoundingClientRect(),
            firstThRect: table.querySelector('th').getBoundingClientRect(),
            firstTrRect: table.querySelector('tbody tr').getBoundingClientRect(),
            secondTrRect: table.querySelectorAll('tbody tr')[1].getBoundingClientRect(),
            thirdTrRect: table.querySelectorAll('tbody tr')[2].getBoundingClientRect()
        });
    })()
    """
    res = cdp_send('Runtime.evaluate', {'expression': scroll_table_script, 'returnByValue': True})
    print("AFTER CONTAINER SCROLL:", res['result']['result']['value'])

    # Take screenshot 2
    shot_res = cdp_send('Page.captureScreenshot')
    with open('actual_portal_view2.png', 'wb') as f:
        f.write(base64.b64decode(shot_res['result']['data']))
    print("Screenshot 2 saved to actual_portal_view2.png")

finally:
    proc.terminate()
