with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'portal_theme' in l or 'data-theme' in l or 'toggleTheme' in l or 'switchTheme' in l:
        print(f"Line {i+1}: {l.strip()}")
