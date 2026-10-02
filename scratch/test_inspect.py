import subprocess
import os

html = """<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="/styles.css">
<style>
body { background: #0b1120; color: white; padding: 20px; font-family: sans-serif; }
.panel-body.overflow-x-auto {
  padding: 0 !important;
  margin: 0 !important;
  max-height: 220px;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
}
.portal-table thead {
  position: static !important;
}
.portal-table th {
  position: sticky !important;
  top: 0 !important;
  z-index: 25 !important;
  background: #0d1527 !important;
  border-bottom: 2px solid #06b6d4 !important;
}
.portal-table td:first-child {
  position: static !important;
}
</style>
</head>
<body>
<div class="panel-card" style="width: 800px; margin: 0 auto; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden;">
  <div class="panel-header" style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
    <h3 style="margin: 0; font-size: 15px;">Breakdown Pengelola Utama Skema Bagi Hasil</h3>
    <span style="font-size: 11px; color: #888;">MM2100, Patra Jasa, Solusi Jasa Teknologi, Krakatau IT, dll.</span>
  </div>
  <div class="panel-body overflow-x-auto" id="box">
    <table class="portal-table">
      <thead>
        <tr>
          <th>PENGELOLA / DATACENTER</th>
          <th>JUMLAH LINK</th>
          <th>TOTAL REVENUE</th>
          <th>BIAYA BAGI HASIL</th>
          <th>SHARING %</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Netciti Persada</td><td>10 Link</td><td>Rp 2.9B</td><td>Rp 1.0B</td><td>35%</td></tr>
        <tr><td>PT Patra Jasa</td><td>8 Link</td><td>Rp 4.1B</td><td>Rp 827M</td><td>20%</td></tr>
        <tr><td>PT Krakatau IT</td><td>21 Link</td><td>Rp 2.0B</td><td>Rp 704M</td><td>35%</td></tr>
        <tr><td>PT Megalopolis</td><td>29 Link</td><td>Rp 3.0B</td><td>Rp 450M</td><td>15%</td></tr>
        <tr><td>PT Netciti Persada</td><td>14 Link</td><td>Rp 1.2B</td><td>Rp 432M</td><td>34.3%</td></tr>
        <tr><td>PT Solusi Jasa</td><td>10 Link</td><td>Rp 1.4B</td><td>Rp 284M</td><td>20%</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div id="log" style="white-space: pre; font-family: monospace; margin-top: 20px;"></div>
<script>
window.onload = function() {
  const box = document.getElementById('box');
  box.style.scrollBehavior = 'auto';
  box.scrollTop = 70;
  
  setTimeout(() => {
    const thead = document.querySelector('thead');
    const th = document.querySelector('th');
    const trs = document.querySelectorAll('tbody tr');
    
    let out = "SCROLLED 70px (scrollBehavior: auto):\\n";
    out += "box.scrollTop: " + box.scrollTop + "\\n";
    out += "thead top: " + thead.getBoundingClientRect().top + "\\n";
    out += "th top: " + th.getBoundingClientRect().top + "\\n";
    out += "tr0 top: " + trs[0].getBoundingClientRect().top + "\\n";
    out += "tr1 top: " + trs[1].getBoundingClientRect().top + "\\n";
    out += "tr2 top: " + trs[2].getBoundingClientRect().top + "\\n";
    document.getElementById('log').textContent = out;
  }, 100);
};
</script>
</body>
</html>
"""

with open('test_inspect.html', 'w', encoding='utf-8') as f:
    f.write(html)

shot_path = os.path.abspath('inspect_shot.png')
cmd = [
    r'C:\Users\anggi\AppData\Local\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=2000',
    f'--screenshot={shot_path}',
    '--window-size=1000,700',
    'http://localhost:8888/test_inspect.html'
]
subprocess.run(cmd)
print('Screenshot generated at', shot_path)
