import json

with open(r'C:\Users\anggi\.gemini\antigravity-ide\brain\2c63f812-2c94-4f6c-b883-beb4f4341743\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    with open(r'scratch/all_prompts.txt', 'w', encoding='utf-8') as out:
        for line in f:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT':
                txt = data.get('content', '').replace('\n', ' ')
                out.write(f"[{data.get('step_index')}] {txt}\n")

print("Done writing scratch/all_prompts.txt")
