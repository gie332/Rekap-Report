import sqlite3
import hashlib

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()

conn = sqlite3.connect('telecom_portal.db')
cursor = conn.cursor()

# Check columns
cursor.execute("PRAGMA table_info(users)")
cols = [r[1] for r in cursor.fetchall()]
if 'pic_code' not in cols:
    cursor.execute("ALTER TABLE users ADD COLUMN pic_code TEXT DEFAULT ''")
    conn.commit()

pic_users = [
    ('harlan', 'Harlan', 'pic123', 'fa-helmet-safety', 'emerald', 'Harlan'),
    ('budi', 'Budi Rodiyah', 'pic123', 'fa-helmet-safety', 'cyan', 'Budi'),
    ('edi', 'Edi Swargaloka', 'pic123', 'fa-helmet-safety', 'amber', 'Edi'),
    ('abusopian', 'M. Abusopian', 'pic123', 'fa-helmet-safety', 'indigo', 'Abusopian'),
    ('muhidin', 'Muhidin', 'pic123', 'fa-helmet-safety', 'teal', 'Muhidin'),
    ('brian', 'Brian Ariyanto', 'pic123', 'fa-helmet-safety', 'purple', 'Brian'),
    ('zulhadi', 'Zulhadi Syahril', 'pic123', 'fa-helmet-safety', 'blue', 'Zulhadi'),
]

for username, full_name, pw, icon, color, pic_code in pic_users:
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, avatar_icon, badge_color, pic_code)
            VALUES (?, ?, ?, 'lapangan', ?, ?, ?)
        """, (username, hash_pw(pw), full_name, icon, color, pic_code))
        print(f"Added PIC user: {username} ({full_name})")
    else:
        cursor.execute("""
            UPDATE users SET full_name = ?, avatar_icon = ?, badge_color = ?, pic_code = ?
            WHERE username = ?
        """, (full_name, icon, color, pic_code, username))
        print(f"Updated PIC user: {username}")

conn.commit()

cursor.execute("SELECT id, username, full_name, role, pic_code FROM users")
print("Current users in DB:", cursor.fetchall())
conn.close()
