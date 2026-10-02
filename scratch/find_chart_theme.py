import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'chart' in l.lower() and ('color' in l.lower() or 'grid' in l.lower() or 'text' in l.lower() or 'theme' in l.lower()):
        print(f"Line {i+1}: {l.strip()[:100]}")
