import subprocess
import os

html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/styles.css">
<style>
body { background: #0b1120; color: white; padding: 20px; font-family: sans-serif; }
</style>
</head>
<body>
<div class="panel-card" style="width: 800px; margin: 0 auto;">
  <div class="panel-header" style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
    <h3 style="margin: 0;">Breakdown Pengelola Utama Skema Bagi Hasil</h3>
    <span style="font-size: 11px; color: #888;">MM2100, Patra Jasa, Solusi Jasa Teknologi, Krakatau IT, dll.</span>
  </div>
  <div class="panel-body overflow-x-auto" id="scrollBox">
    <table class="portal-table">
      <thead>
        <tr>
          <th>Pengelola / Datacenter</th>
          <th style="text-align: center;">Jumlah Link</th>
          <th style="text-align: right;">Total Revenue Pelanggan</th>
          <th style="text-align: right;">Biaya Bagi Hasil Mitra</th>
          <th style="text-align: center;">Rata-rata % Sharing</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Netciti Persada</td><td style="text-align: center;">10 Link</td><td style="text-align: right;">Rp 2.937.471.360</td><td style="text-align: right;">Rp 1.028.114.976</td><td style="text-align: center;">35%</td></tr>
        <tr><td>PT Patra Jasa</td><td style="text-align: center;">8 Link</td><td style="text-align: right;">Rp 4.138.254.540</td><td style="text-align: right;">Rp 827.650.908</td><td style="text-align: center;">20%</td></tr>
        <tr><td>PT Krakatau IT</td><td style="text-align: center;">21 Link</td><td style="text-align: right;">Rp 2.014.200.000</td><td style="text-align: right;">Rp 704.970.000</td><td style="text-align: center;">35%</td></tr>
        <tr><td>PT Megalopolis</td><td style="text-align: center;">29 Link</td><td style="text-align: right;">Rp 3.004.599.000</td><td style="text-align: right;">Rp 450.689.850</td><td style="text-align: center;">15%</td></tr>
        <tr><td>PT Netciti Persada</td><td style="text-align: center;">14 Link</td><td style="text-align: right;">Rp 1.274.901.816</td><td style="text-align: right;">Rp 432.259.636</td><td style="text-align: center;">34.3%</td></tr>
        <tr><td>PT Solusi Jasa</td><td style="text-align: center;">10 Link</td><td style="text-align: right;">Rp 1.423.224.000</td><td style="text-align: right;">Rp 284.644.800</td><td style="text-align: center;">20%</td></tr>
        <tr><td>PT Kurnadi Abadi</td><td style="text-align: center;">13 Link</td><td style="text-align: right;">Rp 587.610.876</td><td style="text-align: right;">Rp 117.522.176</td><td style="text-align: center;">20%</td></tr>
        <tr><td>PT CBN Nusantara</td><td style="text-align: center;">6 Link</td><td style="text-align: right;">Rp 567.891.912</td><td style="text-align: right;">Rp 85.183.787</td><td style="text-align: center;">15%</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
document.getElementById('scrollBox').scrollTop = 90;
</script>
</body>
</html>
"""

with open('test_sticky.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

import os
shot_path = os.path.abspath('scratch_scrolled.png')
chrome_cmd = [
    r'C:\Users\anggi\AppData\Local\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--disable-gpu',
    f'--screenshot={shot_path}',
    '--window-size=1000,700',
    'http://localhost:8888/test_sticky.html'
]

subprocess.run(chrome_cmd)
print('Screenshot generated at scratch_scrolled.png')
