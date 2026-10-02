with open('styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'portal-modal' in l or 'modal-card' in l or 'modal-body' in l:
        print(f"Line {i+1}: {l.strip()[:100]}")
