with open('styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'portal-table' in line.lower() or 'table' in line.lower():
        print(f"Line {i+1}: {line.strip()[:100]}")
