with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'theme', text, re.IGNORECASE)]
print(f"Theme matches in app.js: {len(matches)}")
for idx in matches[:10]:
    start = max(0, idx - 60)
    end = min(len(text), idx + 100)
    print("---", text[start:end].replace('\n', ' '))
