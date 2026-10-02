with open('styles.css', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.findall(r'(\[data-theme="light"\][^{]*\{[^}]*\})', content)
print(f"Total light theme rules found: {len(matches)}")
for m in matches[:15]:
    selector = m.split('{')[0].strip()
    print("  ->", selector)
