#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Telecom Infrastructure & Lease Operations Portal - Backend REST API Server
Built with Python standard library (http.server, sqlite3, json, urllib.parse)
Zero external pip packages required. Runs anywhere.
"""

import os
import sys
import json
import sqlite3
import datetime
import urllib.parse
import hashlib
try:
    from http.server import ThreadingHTTPServer as ServerClass, SimpleHTTPRequestHandler
except ImportError:
    from http.server import HTTPServer as ServerClass, SimpleHTTPRequestHandler

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = 8888
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "telecom_portal.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()

def init_users_table():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar_icon TEXT DEFAULT 'fa-user',
            badge_color TEXT DEFAULT 'cyan',
            pic_code TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("PRAGMA table_info(users)")
    cols = [r[1] for r in cursor.fetchall()]
    if 'pic_code' not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN pic_code TEXT DEFAULT ''")
        conn.commit()

    default_users = [
        ('admin', hash_pw('admin123'), 'Administrator (Manajemen)', 'admin', 'fa-shield-halved', 'cyan', ''),
        ('lapangan', hash_pw('lapangan123'), 'Tim SITAC & Lapangan (Umum)', 'lapangan', 'fa-helmet-safety', 'emerald', 'Harlan'),
        ('harlan', hash_pw('pic123'), 'Harlan', 'lapangan', 'fa-helmet-safety', 'emerald', 'Harlan'),
        ('budi', hash_pw('pic123'), 'Budi Rodiyah', 'lapangan', 'fa-helmet-safety', 'cyan', 'Budi'),
        ('edi', hash_pw('pic123'), 'Edi Swargaloka', 'lapangan', 'fa-helmet-safety', 'amber', 'Edi'),
        ('abusopian', hash_pw('pic123'), 'M. Abusopian', 'lapangan', 'fa-helmet-safety', 'indigo', 'Abusopian'),
        ('muhidin', hash_pw('pic123'), 'Muhidin', 'lapangan', 'fa-helmet-safety', 'teal', 'Muhidin'),
        ('brian', hash_pw('pic123'), 'Brian Ariyanto', 'lapangan', 'fa-helmet-safety', 'purple', 'Brian'),
        ('zulhadi', hash_pw('pic123'), 'Zulhadi Syahril', 'lapangan', 'fa-helmet-safety', 'blue', 'Zulhadi'),
    ]
    for u in default_users:
        cursor.execute("SELECT id FROM users WHERE username = ?", (u[0],))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO users (username, password_hash, full_name, role, avatar_icon, badge_color, pic_code) VALUES (?, ?, ?, ?, ?, ?, ?)", u)
    conn.commit()
    conn.close()

def safe_int(v, default=0):
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).replace('Rp', '').replace('rp', '').replace('IDR', '').replace('idr', '').replace(' ', '').replace(',', '').strip()
    if s.count('.') > 1 or ('.' in s and len(s.rsplit('.', 1)[1]) == 3 and not '.' in s[:-4]):
        s = s.replace('.', '')
    try:
        return int(float(s)) if s else default
    except Exception:
        return default

def safe_float(v, default=0.0):
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace('%', '').replace(' ', '').replace(',', '.').strip()
    try:
        return float(s) if s else default
    except Exception:
        return default

class TelecomPortalAPIHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Connection", "close")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, message, status=400):
        self.send_json({"error": True, "message": message}, status=status)

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(raw)
        except Exception as e:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Route matching for /api/...
        if path.startswith("/api/"):
            try:
                if path == "/api/executive/summary":
                    self.handle_executive_summary()
                elif path == "/api/collo":
                    self.handle_get_collo(query)
                elif path == "/api/collo/rev-sharing":
                    self.handle_get_rev_sharing(query)
                elif path == "/api/collo/expirations":
                    self.handle_get_expirations(query)
                elif path == "/api/collo/expiring-3months":
                    self.handle_get_expiring_3months(query)
                elif path.startswith("/api/collo/"):
                    rec_id = int(path.split("/")[-1])
                    self.handle_get_single_collo(rec_id)
                elif path == "/api/sitac":
                    self.handle_get_sitac(query)
                elif path.startswith("/api/sitac/"):
                    rec_id = int(path.split("/")[-1])
                    self.handle_get_single_sitac(rec_id)
                elif path == "/api/gangguan":
                    self.handle_get_gangguan(query)
                elif path.startswith("/api/gangguan/"):
                    rec_id = int(path.split("/")[-1])
                    self.handle_get_single_gangguan(rec_id)
                elif path == "/api/pic-performance":
                    self.handle_get_pic_performance()
                elif path == "/api/rekap-efisiensi":
                    self.handle_get_rekap_efisiensi()
                elif path == "/api/map-coordinates":
                    self.handle_get_map_coordinates(query)
                elif path == "/api/meta/options":
                    self.handle_get_filter_options()
                elif path == "/api/download/pdf-report":
                    self.handle_download_pdf_report()
                elif path == "/api/download/excel-report":
                    self.handle_download_excel_report(query)
                elif path == "/api/auth/registered-pics":
                    self.handle_get_registered_pics()
                elif path == "/api/database/overview":
                    self.handle_get_database_overview()
                else:
                    self.send_error_json(f"Endpoint {path} not found", 404)
            except Exception as e:
                self.send_error_json(f"Server Error: {str(e)}", 500)
            return

        # Static files fallback
        super().do_GET()

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        try:
            if path.startswith("/api/collo/"):
                rec_id = int(path.split("/")[-1])
                self.handle_patch_collo(rec_id, body)
            elif path.startswith("/api/sitac/"):
                rec_id = int(path.split("/")[-1])
                self.handle_patch_sitac(rec_id, body)
            elif path.startswith("/api/gangguan/"):
                rec_id = int(path.split("/")[-1])
                self.handle_patch_gangguan(rec_id, body)
            else:
                self.send_error_json(f"Cannot PATCH {path}", 404)
        except Exception as e:
            self.send_error_json(f"Patch Error: {str(e)}", 500)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            if path.startswith("/api/collo/"):
                rec_id = int(path.split("/")[-1])
                self.handle_delete_collo(rec_id)
            elif path.startswith("/api/sitac/"):
                rec_id = int(path.split("/")[-1])
                self.handle_delete_sitac(rec_id)
            elif path.startswith("/api/gangguan/"):
                rec_id = int(path.split("/")[-1])
                self.handle_delete_gangguan(rec_id)
            else:
                self.send_error_json(f"Cannot DELETE {path}", 404)
        except Exception as e:
            self.send_error_json(f"Delete Error: {str(e)}", 500)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        try:
            if path == "/api/auth/login":
                self.handle_auth_login(body)
            elif path == "/api/auth/register":
                self.handle_auth_register(body)
            elif path == "/api/auth/change-password":
                self.handle_auth_change_password(body)
            elif path == "/api/auth/admin-reset-password":
                self.handle_admin_reset_password(body)
            elif path == "/api/auth/delete-user":
                self.handle_delete_user(body)
            elif path == "/api/collo":
                self.handle_post_collo(body)
            elif path.startswith("/api/collo/") and path.endswith("/delete"):
                rec_id = int(path.split("/")[-2])
                self.handle_delete_collo(rec_id)
            elif path == "/api/sitac":
                self.handle_post_sitac(body)
            elif path.startswith("/api/sitac/") and path.endswith("/delete"):
                rec_id = int(path.split("/")[-2])
                self.handle_delete_sitac(rec_id)
            elif path == "/api/gangguan":
                self.handle_post_gangguan(body)
            elif path.startswith("/api/gangguan/") and path.endswith("/delete"):
                rec_id = int(path.split("/")[-2])
                self.handle_delete_gangguan(rec_id)
            elif path == "/api/upload":
                self.handle_upload_file(body)
            else:
                self.send_error_json(f"Cannot POST {path}", 404)
        except Exception as e:
            self.send_error_json(f"Create Error: {str(e)}", 500)

    # =========================================================================
    # API HANDLERS IMPLEMENTATION
    # =========================================================================

    def handle_auth_login(self, body):
        username = str(body.get('username', '')).strip().lower()
        password = str(body.get('password', '')).strip()

        if not username or not password:
            self.send_error_json("Username dan password harus diisi untuk keamanan akses", 400)
            return

        pw_hash = hash_pw(password)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, full_name, role, avatar_icon, badge_color, password_hash, pic_code FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            self.send_error_json("Akun tidak ditemukan. Silakan daftarkan akun PIC Anda terlebih dahulu.", 401)
            return

        # Secure verification: password hash MUST match
        if row['password_hash'] != pw_hash:
            conn.close()
            self.send_error_json("Password yang Anda masukkan salah. Pastikan sandi akun Anda benar.", 401)
            return

        is_lapangan = row['role'] == 'lapangan'
        pic_code = row['pic_code'] if row['pic_code'] else (row['full_name'].split()[0] if is_lapangan else '')
        
        # Calculate task counts for this PIC
        sitac_count = 0
        gangguan_count = 0
        if pic_code:
            cursor.execute("SELECT COUNT(*) FROM sitac_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            sitac_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM gangguan_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            gangguan_count = cursor.fetchone()[0]
        conn.close()

        user_info = {
            "id": row['id'],
            "username": row['username'],
            "full_name": row['full_name'],
            "role": row['role'],
            "avatar_icon": row['avatar_icon'],
            "badge_color": row['badge_color'],
            "pic_code": pic_code,
            "sitac_count": sitac_count,
            "gangguan_count": gangguan_count
        }
        token = f"sess_{row['role']}_{hashlib.md5((username + str(datetime.datetime.now())).encode()).hexdigest()[:16]}"
        self.send_json({
            "success": True,
            "message": f"Login berhasil sebagai {row['full_name']}",
            "user": user_info,
            "token": token
        })

    def handle_get_registered_pics(self):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, full_name, role, avatar_icon, badge_color, pic_code, created_at 
            FROM users 
            WHERE role = 'lapangan' AND username != 'lapangan'
            ORDER BY full_name ASC
        """)
        pics = []
        for r in cursor.fetchall():
            p_dict = dict(r)
            pic_code = p_dict['pic_code'] or p_dict['full_name'].split()[0]
            cursor.execute("SELECT COUNT(*) FROM sitac_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            p_dict['sitac_count'] = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM gangguan_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            p_dict['gangguan_count'] = cursor.fetchone()[0]
            pics.append(p_dict)
        conn.close()
        self.send_json({"success": True, "pics": pics})

    def handle_auth_register(self, body):
        username = str(body.get('username', '')).strip().lower()
        password = str(body.get('password', '')).strip()
        full_name = str(body.get('full_name', '')).strip()
        pic_code = str(body.get('pic_code', '')).strip()
        role = str(body.get('role', 'lapangan')).strip().lower()

        if not username or len(username) < 3:
            self.send_error_json("Username harus diisi (minimal 3 karakter, huruf/angka tanpa spasi)", 400)
            return
        if not password or len(password) < 4:
            self.send_error_json("Password harus diisi (minimal 4 karakter)", 400)
            return
        if not full_name:
            self.send_error_json("Nama lengkap petugas PIC harus diisi", 400)
            return

        if not pic_code:
            pic_code = full_name.split()[0]

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            conn.close()
            self.send_error_json(f"Username '{username}' sudah terdaftar. Silakan gunakan username lain atau login.", 400)
            return

        pw_hash = hash_pw(password)
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, avatar_icon, badge_color, pic_code)
            VALUES (?, ?, ?, ?, 'fa-helmet-safety', 'emerald', ?)
        """, (username, pw_hash, full_name, role, pic_code))
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM sitac_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
        sitac_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM gangguan_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
        gangguan_count = cursor.fetchone()[0]
        conn.close()

        user_info = {
            "id": new_id,
            "username": username,
            "full_name": full_name,
            "role": role,
            "avatar_icon": "fa-helmet-safety",
            "badge_color": "emerald",
            "pic_code": pic_code,
            "sitac_count": sitac_count,
            "gangguan_count": gangguan_count
        }
        token = f"sess_{role}_{hashlib.md5((username + str(datetime.datetime.now())).encode()).hexdigest()[:16]}"
        self.send_json({
            "success": True,
            "message": f"Akun PIC '{full_name}' berhasil didaftarkan ke database! Silakan login dengan password yang telah dibuat.",
            "user": user_info,
            "token": token
        })

    def handle_auth_change_password(self, body):
        username = str(body.get('username', '')).strip().lower()
        old_password = str(body.get('old_password', '')).strip()
        new_password = str(body.get('new_password', '')).strip()

        if not username or not old_password or not new_password:
            self.send_error_json("Username, password lama, dan password baru harus diisi", 400)
            return
        if len(new_password) < 4:
            self.send_error_json("Password baru minimal 4 karakter", 400)
            return

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, password_hash, full_name FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_error_json("Akun tidak ditemukan di database", 404)
            return

        if row['password_hash'] != hash_pw(old_password):
            conn.close()
            self.send_error_json("Password lama yang Anda masukkan salah", 400)
            return

        cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_pw(new_password), username))
        conn.commit()
        conn.close()

        self.send_json({
            "success": True,
            "message": f"Password untuk akun '{row['full_name']}' berhasil diperbarui di database!"
        })

    def handle_admin_reset_password(self, body):
        """Admin: reset password user lain tanpa perlu password lama.
        Hanya bisa dipanggil jika requester adalah admin."""
        admin_username = str(body.get('admin_username', '')).strip().lower()
        admin_password = str(body.get('admin_password', '')).strip()
        target_username = str(body.get('target_username', '')).strip().lower()
        new_password = str(body.get('new_password', '')).strip()

        if not admin_username or not admin_password or not target_username or not new_password:
            self.send_error_json("Semua field wajib diisi (admin_username, admin_password, target_username, new_password)", 400)
            return
        if len(new_password) < 4:
            self.send_error_json("Password baru minimal 4 karakter", 400)
            return

        conn = get_db()
        cursor = conn.cursor()

        # Verify admin credentials and role
        cursor.execute("SELECT id, password_hash, role, full_name FROM users WHERE username = ?", (admin_username,))
        admin_row = cursor.fetchone()
        if not admin_row or admin_row['role'] != 'admin':
            conn.close()
            self.send_error_json("Akses ditolak: hanya admin yang dapat mereset password user lain", 403)
            return
        if admin_row['password_hash'] != hash_pw(admin_password):
            conn.close()
            self.send_error_json("Password admin salah", 401)
            return

        # Reset target user's password
        cursor.execute("SELECT id, full_name FROM users WHERE username = ?", (target_username,))
        target_row = cursor.fetchone()
        if not target_row:
            conn.close()
            self.send_error_json(f"User '{target_username}' tidak ditemukan di database", 404)
            return

        cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_pw(new_password), target_username))
        conn.commit()
        conn.close()

        self.send_json({
            "success": True,
            "message": f"Password untuk akun '{target_row['full_name']}' (@{target_username}) berhasil direset oleh admin!"
        })

    def handle_delete_user(self, body):
        """Admin: hapus akun user dari database."""
        admin_username = str(body.get('admin_username', '')).strip().lower()
        admin_password = str(body.get('admin_password', '')).strip()
        target_username = str(body.get('target_username', '')).strip().lower()

        if not admin_username or not admin_password or not target_username:
            self.send_error_json("Semua field wajib diisi", 400)
            return

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id, password_hash, role FROM users WHERE username = ?", (admin_username,))
        admin_row = cursor.fetchone()
        if not admin_row or admin_row['role'] != 'admin':
            conn.close()
            self.send_error_json("Akses ditolak: hanya admin yang dapat menghapus akun", 403)
            return
        if admin_row['password_hash'] != hash_pw(admin_password):
            conn.close()
            self.send_error_json("Password admin salah", 401)
            return
        if target_username == admin_username:
            conn.close()
            self.send_error_json("Admin tidak dapat menghapus akun sendiri", 400)
            return

        cursor.execute("SELECT id, full_name FROM users WHERE username = ?", (target_username,))
        target_row = cursor.fetchone()
        if not target_row:
            conn.close()
            self.send_error_json(f"User '{target_username}' tidak ditemukan", 404)
            return

        cursor.execute("DELETE FROM users WHERE username = ?", (target_username,))
        conn.commit()
        conn.close()

        self.send_json({
            "success": True,
            "message": f"Akun '{target_row['full_name']}' (@{target_username}) berhasil dihapus dari database!"
        })

    def handle_get_database_overview(self):
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, full_name, role, pic_code, created_at 
            FROM users 
            ORDER BY id ASC
        """)
        users = []
        for r in cursor.fetchall():
            u_dict = dict(r)
            pic_code = u_dict['pic_code'] or u_dict['full_name'].split()[0]
            cursor.execute("SELECT COUNT(*) FROM sitac_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            u_dict['sitac_count'] = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM gangguan_records WHERE LOWER(pic_perijinan) LIKE ?", (f"%{pic_code.lower()}%",))
            u_dict['gangguan_count'] = cursor.fetchone()[0]
            users.append(u_dict)

        cursor.execute("SELECT COUNT(*) FROM sitac_records")
        sitac_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM gangguan_records")
        gangguan_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM collo_records")
        collo_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]

        db_size_mb = 0
        if os.path.exists(DB_PATH):
            db_size_mb = round(os.path.getsize(DB_PATH) / (1024 * 1024), 2)

        conn.close()

        self.send_json({
            "success": True,
            "database_info": {
                "file": "telecom_portal.db",
                "size_mb": db_size_mb,
                "status": "Connected & Active"
            },
            "tables": [
                {"name": "users", "label": "Pengguna / PIC Accounts", "count": user_count, "description": "Tabel Akun & Hak Akses User"},
                {"name": "sitac_records", "label": "Monitoring SITAC & Perizinan", "count": sitac_count, "description": "Tabel Berkas SITAC & Dokumen PA"},
                {"name": "gangguan_records", "label": "Tiket Gangguan Darurat", "count": gangguan_count, "description": "Tabel Penanganan Gangguan FO"},
                {"name": "collo_records", "label": "Aset Colocation & Finansial", "count": collo_count, "description": "Tabel Sewa Link & Revenue Sharing"}
            ],
            "users": users
        })

    def handle_executive_summary(self):
        conn = get_db()
        cursor = conn.cursor()

        # 1. Collo active metrics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_records,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN status = 'NON ACTIVE' THEN 1 ELSE 0 END) as non_active_count,
                SUM(CASE WHEN status = 'DEACTIVASI' THEN 1 ELSE 0 END) as deactivasi_count,
                SUM(CASE WHEN status = 'ACTIVE' THEN rev_sewa_tahun ELSE 0 END) as active_revenue,
                SUM(CASE WHEN status = 'ACTIVE' THEN biaya_sewa_tahun ELSE 0 END) as active_biaya,
                SUM(CASE WHEN status = 'ACTIVE' THEN margin_rupiah ELSE 0 END) as active_margin,
                SUM(CASE WHEN rev_sharing_pct > 0 THEN 1 ELSE 0 END) as rev_sharing_count,
                SUM(biaya_rev_sharing) as total_rev_sharing_cost
            FROM collo_records
        """)
        c_stats = dict(cursor.fetchone())

        # 2. SITAC summary
        cursor.execute("""
            SELECT 
                COUNT(*) as total_pa,
                SUM(CASE WHEN progress = 'Finish' THEN 1 ELSE 0 END) as finish_count,
                SUM(CASE WHEN progress = 'Ongoing' THEN 1 ELSE 0 END) as ongoing_count,
                SUM(CASE WHEN progress = 'Hold' THEN 1 ELSE 0 END) as hold_count,
                SUM(CASE WHEN progress = 'Cancel' THEN 1 ELSE 0 END) as cancel_count,
                SUM(biaya_permintaan_awal) as total_biaya_awal,
                SUM(biaya_final) as total_biaya_final,
                SUM(efisiensi_rupiah) as total_efisiensi_rupiah,
                AVG(CASE WHEN durasi_hari IS NOT NULL AND durasi_hari >= 0 THEN durasi_hari ELSE NULL END) as avg_sla_hari
            FROM sitac_records
        """)
        s_stats = dict(cursor.fetchone())

        # 3. Gangguan summary
        cursor.execute("""
            SELECT 
                COUNT(*) as total_gangguan,
                SUM(CASE WHEN is_selesai = 1 THEN 1 ELSE 0 END) as selesai_count,
                SUM(CASE WHEN is_selesai = 0 THEN 1 ELSE 0 END) as aktif_count
            FROM gangguan_records
        """)
        g_stats = dict(cursor.fetchone())

        # 4. Top 10 Pengelola (Active circuits)
        cursor.execute("""
            SELECT 
                pengelola,
                COUNT(*) as sirkuit_count,
                SUM(biaya_sewa_tahun) as total_biaya,
                SUM(rev_sewa_tahun) as total_rev,
                SUM(margin_rupiah) as total_margin
            FROM collo_records
            WHERE status = 'ACTIVE' AND pengelola != ''
            GROUP BY pengelola
            ORDER BY total_biaya DESC
            LIMIT 10
        """)
        top_pengelola = [dict(r) for r in cursor.fetchall()]

        # 5. Monthly SITAC trend
        cursor.execute("""
            SELECT 
                tahun, bulan,
                COUNT(*) as count_masuk,
                SUM(CASE WHEN progress = 'Finish' THEN 1 ELSE 0 END) as count_selesai
            FROM sitac_records
            WHERE tahun IN (2025, 2026) AND bulan IS NOT NULL
            GROUP BY tahun, bulan
            ORDER BY tahun, bulan
        """)
        monthly_trend = [dict(r) for r in cursor.fetchall()]

        # 6. Power BI Visuals: Jenis Sewa distribution (Active)
        cursor.execute("""
            SELECT COALESCE(NULLIF(jenis_sewa, ''), 'Lainnya') as jenis, COUNT(*) as cnt, SUM(rev_sewa_tahun) as rev, SUM(biaya_sewa_tahun) as biaya
            FROM collo_records WHERE status = 'ACTIVE'
            GROUP BY jenis ORDER BY cnt DESC LIMIT 6
        """)
        jenis_sewa_dist = [dict(r) for r in cursor.fetchall()]

        # 7. Power BI Visuals: Status distribution for all 3,123 circuits
        cursor.execute("""
            SELECT status, COUNT(*) as cnt, SUM(rev_sewa_tahun) as rev
            FROM collo_records GROUP BY status
        """)
        collo_status_dist = [dict(r) for r in cursor.fetchall()]

        # 8. Power BI Visuals: Expiration alert category distribution
        cursor.execute("""
            SELECT alert_category, COUNT(*) as cnt
            FROM collo_records WHERE status = 'ACTIVE' GROUP BY alert_category
        """)
        expiration_dist = [dict(r) for r in cursor.fetchall()]

        # 9. Power BI Visuals: SITAC Aging SLA
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN durasi_hari <= 7 THEN 1 ELSE 0 END) as green,
                SUM(CASE WHEN durasi_hari > 7 AND durasi_hari <= 14 THEN 1 ELSE 0 END) as yellow,
                SUM(CASE WHEN durasi_hari > 14 THEN 1 ELSE 0 END) as red
            FROM sitac_records WHERE durasi_hari IS NOT NULL AND durasi_hari >= 0
        """)
        sitac_aging_dist = dict(cursor.fetchone() or {})

        # 10. Power BI Visuals: Rekap Efisiensi Tahunan
        cursor.execute("""
            SELECT tahun, nilai_awal, nilai_akhir, efisiensi_rupiah, efisiensi_persen
            FROM rekap_efisiensi ORDER BY tahun ASC
        """)
        rekap_efisiensi_list = [dict(r) for r in cursor.fetchall()]

        # 11. Power BI Visuals: Top Vendors by Active Circuits
        cursor.execute("""
            SELECT pengelola, COUNT(*) as sirkuit_count, SUM(rev_sewa_tahun) as rev
            FROM collo_records WHERE status = 'ACTIVE' AND pengelola != ''
            GROUP BY pengelola ORDER BY sirkuit_count DESC LIMIT 8
        """)
        top_collo_vendors = [dict(r) for r in cursor.fetchall()]

        conn.close()

        rev = c_stats.get('active_revenue') or 0
        biaya = c_stats.get('active_biaya') or 0
        margin_pct = round(((rev - biaya) / rev * 100), 2) if rev > 0 else 0.0

        b_awal = s_stats.get('total_biaya_awal') or 0
        b_eff = s_stats.get('total_efisiensi_rupiah') or 0
        eff_pct = round((b_eff / b_awal * 100), 2) if b_awal > 0 else 0.0

        res_data = {
            "collo": {
                **c_stats,
                "margin_pct": margin_pct
            },
            "sitac": {
                **s_stats,
                "efisiensi_pct": eff_pct,
                "avg_sla_hari": round(s_stats.get('avg_sla_hari') or 0, 1)
            },
            "gangguan": {
                **g_stats,
                "resolution_rate": round(((g_stats.get('selesai_count', 0) / (g_stats.get('total_gangguan', 1) or 1)) * 100), 1)
            },
            "top_pengelola": top_pengelola,
            "monthly_trend": monthly_trend,
            "jenis_sewa_dist": jenis_sewa_dist,
            "collo_status_dist": collo_status_dist,
            "expiration_dist": expiration_dist,
            "sitac_aging_dist": sitac_aging_dist,
            "rekap_efisiensi_list": rekap_efisiensi_list,
            "top_collo_vendors": top_collo_vendors
        }
        self.send_json(res_data)

    def handle_get_single_collo(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM collo_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            self.send_json(dict(row))
        else:
            self.send_error_json(f"Record with ID {rec_id} not found", 404)

    def handle_get_single_sitac(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sitac_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            self.send_json(dict(row))
        else:
            self.send_error_json(f"SITAC record with ID {rec_id} not found", 404)

    def handle_get_single_gangguan(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM gangguan_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            self.send_json(dict(row))
        else:
            self.send_error_json(f"Gangguan record with ID {rec_id} not found", 404)

    def handle_get_collo(self, q):
        conn = get_db()
        cursor = conn.cursor()

        # Query filters
        status_filter = q.get('status', ['ACTIVE'])[0].upper()
        pengelola_filter = q.get('pengelola', ['ALL'])[0]
        jenis_filter = q.get('jenis_sewa', ['ALL'])[0]
        search = q.get('search', [''])[0].strip().lower()
        sort = q.get('sort', ['margin_desc'])[0]
        page = max(1, int(q.get('page', ['1'])[0]))
        page_size = max(5, min(5000, int(q.get('pageSize', ['25'])[0])))

        conditions = []
        params = []

        if status_filter != 'ALL':
            conditions.append("status = ?")
            params.append(status_filter)

        if pengelola_filter != 'ALL':
            conditions.append("pengelola = ?")
            params.append(pengelola_filter)

        if jenis_filter != 'ALL':
            conditions.append("jenis_sewa = ?")
            params.append(jenis_filter)

        if search:
            search_param = f"%{search}%"
            conditions.append("(LOWER(pelanggan) LIKE ? OR LOWER(pengelola) LIKE ? OR LOWER(no_so) LIKE ? OR LOWER(sid) LIKE ? OR LOWER(terminating) LIKE ?)")
            params.extend([search_param, search_param, search_param, search_param, search_param])

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        # Count total
        cursor.execute(f"SELECT COUNT(*), SUM(rev_sewa_tahun), SUM(biaya_sewa_tahun), SUM(margin_rupiah), SUM(biaya_otc) FROM collo_records {where_clause}", params)
        total_row = cursor.fetchone()
        total_count = total_row[0] or 0
        tot_rev = total_row[1] or 0
        tot_biaya = total_row[2] or 0
        tot_margin = total_row[3] or 0
        tot_otc = total_row[4] or 0

        # Sort order
        sort_col = "margin_rupiah DESC"
        if sort == 'rev_desc': sort_col = "rev_sewa_tahun DESC"
        elif sort == 'biaya_desc': sort_col = "biaya_sewa_tahun DESC"
        elif sort == 'sisa_hari_asc': sort_col = "sisa_hari ASC"
        elif sort == 'pengelola_asc': sort_col = "pengelola ASC, pelanggan ASC"
        elif sort == 'id_asc': sort_col = "id ASC"

        offset = (page - 1) * page_size
        cursor.execute(f"""
            SELECT * FROM collo_records
            {where_clause}
            ORDER BY {sort_col}
            LIMIT ? OFFSET ?
        """, params + [page_size, offset])

        records = [dict(r) for r in cursor.fetchall()]
        conn.close()

        self.send_json({
            "data": records,
            "total": total_count,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total_count + page_size - 1) // page_size if total_count > 0 else 1,
            "totals": {
                "revenue": tot_rev,
                "biaya": tot_biaya,
                "margin": tot_margin,
                "biaya_otc": tot_otc
            }
        })

    def handle_get_rev_sharing(self, q):
        conn = get_db()
        cursor = conn.cursor()

        search = q.get('search', [''])[0].strip().lower()
        search_clause = ""
        params = []
        if search:
            search_clause = " AND (LOWER(pelanggan) LIKE ? OR LOWER(pengelola) LIKE ? OR LOWER(no_so) LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        # Summary of revenue sharing
        cursor.execute(f"""
            SELECT 
                COUNT(*) as total_links,
                SUM(rev_sewa_tahun) as total_rev,
                SUM(biaya_rev_sharing) as total_sharing,
                AVG(rev_sharing_pct) as avg_pct
            FROM collo_records
            WHERE rev_sharing_pct > 0 {search_clause}
        """, params)
        summary = dict(cursor.fetchone())

        # Top pengelola breakdown
        cursor.execute(f"""
            SELECT 
                pengelola,
                COUNT(*) as link_count,
                SUM(rev_sewa_tahun) as total_rev,
                SUM(biaya_rev_sharing) as total_sharing,
                AVG(rev_sharing_pct) as avg_pct
            FROM collo_records
            WHERE rev_sharing_pct > 0 {search_clause}
            GROUP BY pengelola
            ORDER BY total_sharing DESC
            LIMIT 15
        """, params)
        top_pengelola = [dict(r) for r in cursor.fetchall()]

        # All records
        cursor.execute(f"""
            SELECT * FROM collo_records
            WHERE rev_sharing_pct > 0 {search_clause}
            ORDER BY biaya_rev_sharing DESC
        """, params)
        records = [dict(r) for r in cursor.fetchall()]
        conn.close()

        self.send_json({
            "summary": {
                "total_links": summary.get('total_links') or 0,
                "total_rev": summary.get('total_rev') or 0,
                "total_sharing": summary.get('total_sharing') or 0,
                "avg_pct_display": f"{round((summary.get('avg_pct') or 0) * 100, 1)}%"
            },
            "top_pengelola": top_pengelola,
            "data": records
        })

    def handle_get_expirations(self, q):
        conn = get_db()
        cursor = conn.cursor()

        cat = q.get('category', ['ALL'])[0].upper()
        search = q.get('search', [''])[0].strip().lower()

        # Count per alert category for ACTIVE circuits
        cursor.execute("""
            SELECT 
                alert_category,
                COUNT(*) as count
            FROM collo_records
            WHERE status = 'ACTIVE'
            GROUP BY alert_category
        """)
        counts = {r['alert_category']: r['count'] for r in cursor.fetchall()}

        conditions = ["status = 'ACTIVE'"]
        params = []
        if cat != 'ALL':
            conditions.append("alert_category = ?")
            params.append(cat)

        if search:
            conditions.append("(LOWER(pelanggan) LIKE ? OR LOWER(pengelola) LIKE ? OR LOWER(no_so) LIKE ? OR LOWER(sid) LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

        where_clause = " WHERE " + " AND ".join(conditions)

        cursor.execute(f"""
            SELECT * FROM collo_records
            {where_clause}
            ORDER BY sisa_hari ASC
        """, params)
        records = [dict(r) for r in cursor.fetchall()]
        conn.close()

        self.send_json({
            "counts": {
                "critical": counts.get('CRITICAL', 0),
                "warning": counts.get('WARNING', 0),
                "safe": counts.get('SAFE', 0),
                "expired": counts.get('EXPIRED', 0),
                "total": sum(counts.values())
            },
            "data": records
        })

    def handle_get_expiring_3months(self, q):
        conn = get_db()
        cursor = conn.cursor()

        today = datetime.date.today()
        today_str = today.isoformat()

        cursor.execute("""
            SELECT *
            FROM collo_records
            WHERE status = 'ACTIVE' AND end_date IS NOT NULL AND TRIM(end_date) != ''
            ORDER BY sisa_hari ASC
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        expiring_items = []
        counts = {
            "critical": 0,    # <= 30 days
            "warning": 0,     # 31 - 90 days (1 - 3 months)
            "expired": 0,     # <= 0 days (lewat jatuh tempo)
            "total": 0
        }

        for r in rows:
            ed_str = str(r['end_date']).strip()
            try:
                ed = datetime.date.fromisoformat(ed_str)
                days_left = (ed - today).days
            except Exception:
                days_left = r['sisa_hari'] if r['sisa_hari'] is not None else 999

            r['sisa_hari_actual'] = days_left

            # <= 90 days represents 3 months or less
            if days_left <= 90:
                if days_left <= 0:
                    r['alert_cat_calc'] = 'EXPIRED'
                    r['alert_lbl_calc'] = 'Lewat Jatuh Tempo'
                    r['alert_clr_calc'] = '#ef4444'
                    counts['expired'] += 1
                elif days_left <= 30:
                    r['alert_cat_calc'] = 'CRITICAL'
                    r['alert_lbl_calc'] = f"Sisa {days_left} Hari"
                    r['alert_clr_calc'] = '#f97316'
                    counts['critical'] += 1
                else:
                    r['alert_cat_calc'] = 'WARNING'
                    r['alert_lbl_calc'] = f"Sisa {days_left} Hari"
                    r['alert_clr_calc'] = '#eab308'
                    counts['warning'] += 1

                expiring_items.append(r)

        # Sort items: expired first, then critical, then warning
        expiring_items.sort(key=lambda x: x['sisa_hari_actual'])
        counts['total'] = len(expiring_items)

        self.send_json({
            "today": today_str,
            "counts": counts,
            "items": expiring_items
        })

    def handle_get_sitac(self, q):
        conn = get_db()
        cursor = conn.cursor()

        status_filter = q.get('status', ['ALL'])[0]
        pic_filter = q.get('pic', ['ALL'])[0]
        year_filter = q.get('year', ['ALL'])[0]
        aging_filter = q.get('aging', ['ALL'])[0]
        search = q.get('search', [''])[0].strip().lower()
        page = max(1, int(q.get('page', ['1'])[0]))
        page_size = max(5, min(5000, int(q.get('pageSize', ['25'])[0])))

        conditions = []
        params = []

        if status_filter != 'ALL':
            conditions.append("progress = ?")
            params.append(status_filter)

        if pic_filter != 'ALL':
            conditions.append("(LOWER(pic_perijinan) = ? OR LOWER(pic_perijinan) LIKE ?)")
            params.extend([pic_filter.lower(), f"%{pic_filter.lower()}%"])

        if year_filter != 'ALL':
            conditions.append("tahun = ?")
            params.append(int(year_filter))

        if aging_filter != 'ALL':
            conditions.append("aging_category = ?")
            params.append(aging_filter.lower())

        if search:
            search_param = f"%{search}%"
            conditions.append("(LOWER(no_pa) LIKE ? OR LOWER(pelanggan) LIKE ? OR LOWER(terminating) LIKE ? OR LOWER(pic_perijinan) LIKE ?)")
            params.extend([search_param, search_param, search_param, search_param])

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        cursor.execute(f"SELECT COUNT(*) FROM sitac_records {where_clause}", params)
        total_count = cursor.fetchone()[0]

        offset = (page - 1) * page_size
        cursor.execute(f"""
            SELECT * FROM sitac_records
            {where_clause}
            ORDER BY id ASC
            LIMIT ? OFFSET ?
        """, params + [page_size, offset])

        records = [dict(r) for r in cursor.fetchall()]

        # Base conditions excluding status_filter to calculate breakdown for tabs & chart
        other_conditions = []
        other_params = []
        if pic_filter != 'ALL':
            other_conditions.append("(LOWER(pic_perijinan) = ? OR LOWER(pic_perijinan) LIKE ?)")
            other_params.extend([pic_filter.lower(), f"%{pic_filter.lower()}%"])
        if year_filter != 'ALL':
            other_conditions.append("tahun = ?")
            other_params.append(int(year_filter))
        if aging_filter != 'ALL':
            other_conditions.append("aging_category = ?")
            other_params.append(aging_filter.lower())
        if search:
            search_param = f"%{search}%"
            other_conditions.append("(LOWER(no_pa) LIKE ? OR LOWER(pelanggan) LIKE ? OR LOWER(terminating) LIKE ? OR LOWER(pic_perijinan) LIKE ?)")
            other_params.extend([search_param, search_param, search_param, search_param])

        other_where = " WHERE " + " AND ".join(other_conditions) if other_conditions else ""
        cursor.execute(f"SELECT progress, COUNT(*) FROM sitac_records {other_where} GROUP BY progress", other_params)
        raw_status = dict(cursor.fetchall())
        status_counts = {
            "Finish": raw_status.get("Finish", 0),
            "Ongoing": raw_status.get("Ongoing", 0),
            "Hold": raw_status.get("Hold", 0),
            "Cancel": raw_status.get("Cancel", 0)
        }
        status_counts["ALL"] = sum(status_counts.values())

        # Aging distribution for the currently filtered result (including status_filter)
        cursor.execute(f"SELECT aging_category, COUNT(*) FROM sitac_records {where_clause} GROUP BY aging_category", params)
        raw_aging = dict(cursor.fetchall())
        aging_dist = {
            "green": raw_aging.get("green", 0),
            "yellow": raw_aging.get("yellow", 0),
            "red": raw_aging.get("red", 0)
        }

        conn.close()

        self.send_json({
            "data": records,
            "total": total_count,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total_count + page_size - 1) // page_size if total_count > 0 else 1,
            "status_counts": status_counts,
            "aging_dist": aging_dist
        })

    def handle_get_gangguan(self, q):
        conn = get_db()
        cursor = conn.cursor()

        is_selesai = q.get('status', ['ALL'])[0]
        search = q.get('search', [''])[0].strip().lower()
        pic = q.get('pic', ['ALL'])[0].strip()
        exact_date = q.get('date', [''])[0].strip()
        start_date = q.get('start_date', [''])[0].strip()
        end_date = q.get('end_date', [''])[0].strip()
        date_type = q.get('date_type', ['dispos'])[0].strip().lower()

        # Date column determination
        if date_type == 'selesai':
            date_col = "tgl_selesai"
        else:
            # Fallback to SUBSTR(created_at, 1, 10) if tgl_dispos is empty
            date_col = "COALESCE(NULLIF(tgl_dispos, ''), SUBSTR(created_at, 1, 10))"

        conditions = []
        params = []

        if is_selesai == '1':
            conditions.append("is_selesai = 1")
        elif is_selesai == '0':
            conditions.append("is_selesai = 0")

        if pic and pic != 'ALL':
            conditions.append("LOWER(pic_perijinan) LIKE ?")
            params.append(f"%{pic.lower()}%")

        if search:
            search_param = f"%{search}%"
            conditions.append("(LOWER(no_tiket) LIKE ? OR LOWER(terminating) LIKE ? OR LOWER(pic_perijinan) LIKE ? OR LOWER(jenis_gangguan) LIKE ? OR LOWER(COALESCE(update_gangguan, '')) LIKE ?)")
            params.extend([search_param, search_param, search_param, search_param, search_param])

        if exact_date:
            conditions.append(f"{date_col} = ?")
            params.append(exact_date)
        else:
            if start_date:
                conditions.append(f"{date_col} >= ?")
                params.append(start_date)
            if end_date:
                conditions.append(f"{date_col} <= ?")
                params.append(end_date)

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        cursor.execute(f"""
            SELECT * FROM gangguan_records
            {where_clause}
            ORDER BY COALESCE(NULLIF(tgl_dispos, ''), SUBSTR(created_at, 1, 10)) DESC, id DESC
        """, params)
        records = [dict(r) for r in cursor.fetchall()]

        # Tab badge counts calculation (respects date and search filters, but ignores is_selesai)
        date_conditions = []
        date_params = []
        if pic and pic != 'ALL':
            date_conditions.append("LOWER(pic_perijinan) LIKE ?")
            date_params.append(f"%{pic.lower()}%")
        if search:
            search_param = f"%{search}%"
            date_conditions.append("(LOWER(no_tiket) LIKE ? OR LOWER(terminating) LIKE ? OR LOWER(pic_perijinan) LIKE ? OR LOWER(jenis_gangguan) LIKE ? OR LOWER(COALESCE(update_gangguan, '')) LIKE ?)")
            date_params.extend([search_param, search_param, search_param, search_param, search_param])
        if exact_date:
            date_conditions.append(f"{date_col} = ?")
            date_params.append(exact_date)
        else:
            if start_date:
                date_conditions.append(f"{date_col} >= ?")
                date_params.append(start_date)
            if end_date:
                date_conditions.append(f"{date_col} <= ?")
                date_params.append(end_date)

        date_where = " WHERE " + " AND ".join(date_conditions) if date_conditions else ""
        cursor.execute(f"""
            SELECT 
                COUNT(*) as all_cnt,
                SUM(CASE WHEN is_selesai = 1 THEN 1 ELSE 0 END) as selesai_cnt,
                SUM(CASE WHEN is_selesai = 0 THEN 1 ELSE 0 END) as open_cnt
            FROM gangguan_records
            {date_where}
        """, date_params)
        counts_row = cursor.fetchone()
        tab_counts = {
            "all": counts_row['all_cnt'] if counts_row and counts_row['all_cnt'] is not None else 0,
            "selesai": counts_row['selesai_cnt'] if counts_row and counts_row['selesai_cnt'] is not None else 0,
            "open": counts_row['open_cnt'] if counts_row and counts_row['open_cnt'] is not None else 0
        }

        total_biaya = sum((r.get('biaya_gangguan') or 0) for r in records)

        conn.close()

        self.send_json({
            "data": records, 
            "total": len(records),
            "total_biaya": total_biaya,
            "counts": tab_counts
        })

    def handle_get_pic_performance(self):
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 
                pic_perijinan as pic,
                COUNT(*) as total_penugasan,
                SUM(CASE WHEN progress = 'Finish' THEN 1 ELSE 0 END) as finish,
                SUM(CASE WHEN progress = 'Ongoing' THEN 1 ELSE 0 END) as ongoing,
                SUM(CASE WHEN progress = 'Hold' THEN 1 ELSE 0 END) as hold,
                SUM(CASE WHEN progress = 'Cancel' THEN 1 ELSE 0 END) as cancel,
                SUM(biaya_permintaan_awal) as biaya_awal,
                SUM(biaya_final) as biaya_final,
                SUM(efisiensi_rupiah) as efisiensi_rupiah,
                AVG(CASE WHEN durasi_hari IS NOT NULL AND durasi_hari >= 0 THEN durasi_hari ELSE NULL END) as avg_sla_hari
            FROM sitac_records
            WHERE pic_perijinan != ''
            GROUP BY pic_perijinan
            ORDER BY total_penugasan DESC
        """)
        raw_pics = [dict(r) for r in cursor.fetchall()]

        # Query gangguan count per pic
        cursor.execute("""
            SELECT pic_perijinan, COUNT(*) as cnt 
            FROM gangguan_records 
            WHERE pic_perijinan != ''
            GROUP BY pic_perijinan
        """)
        g_map = {r['pic_perijinan']: r['cnt'] for r in cursor.fetchall()}

        result = []
        for p in raw_pics:
            tot = p['total_penugasan']
            fin = p['finish']
            fin_rate = round((fin / tot * 100), 1) if tot > 0 else 0.0
            b_awal = p['biaya_awal'] or 0
            b_eff = p['efisiensi_rupiah'] or 0
            eff_pct = round((b_eff / b_awal * 100), 1) if b_awal > 0 else 0.0
            sla = round(p['avg_sla_hari'] or 0, 1)

            result.append({
                "pic": p['pic'],
                "total_penugasan": tot,
                "finish": fin,
                "ongoing": p['ongoing'],
                "hold": p['hold'],
                "cancel": p['cancel'],
                "finish_rate": fin_rate,
                "biaya_awal": b_awal,
                "biaya_final": p['biaya_final'] or 0,
                "efisiensi_rupiah": b_eff,
                "efisiensi_persen": eff_pct,
                "avg_sla_hari": sla,
                "gangguan_count": g_map.get(p['pic'], 0)
            })

        conn.close()
        self.send_json(result)

    def handle_get_rekap_efisiensi(self):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rekap_efisiensi ORDER BY tahun ASC")
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json(rows)

    def handle_download_pdf_report(self):
        pdf_path = os.path.join(BASE_DIR, "Laporan_Rekap_Telecom_Ops.pdf")
        try:
            import generate_pdf_report
            generate_pdf_report.build_pdf_report()
        except Exception as e:
            print(f"Error rebuilding PDF: {e}")

        if not os.path.exists(pdf_path):
            self.send_error_json("File PDF belum tersedia.", 404)
            return

        try:
            with open(pdf_path, 'rb') as f:
                pdf_data = f.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Disposition', 'attachment; filename="Laporan_Rekap_Telecom_Ops.pdf"')
            self.send_header('Content-Length', str(len(pdf_data)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(pdf_data)
        except Exception as e:
            self.send_error_json(f"Gagal mengirim file PDF: {str(e)}", 500)

    def handle_download_excel_report(self, q):
        import openpyxl
        import io
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        module = q.get('module', ['gangguan'])[0].lower()
        conn = get_db()
        cursor = conn.cursor()

        wb = openpyxl.Workbook()
        ws = wb.active

        header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        title_font = Font(name="Arial", size=13, bold=True, color="0F172A")
        sub_font = Font(name="Arial", size=9, italic=True, color="64748B")
        data_font = Font(name="Arial", size=9)
        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        today_str = datetime.date.today().strftime("%Y-%m-%d")

        if module == 'sitac':
            filename = f"Rekap_Proyek_SITAC_{today_str}.xlsx"
            ws.title = "Proyek SITAC"

            ws["A1"] = "REKAPITULASI PENUGASAN PERIZINAN SITAC (PA)"
            ws["A1"].font = title_font
            ws["A2"] = f"Diekspor pada: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Telecom Operations Portal"
            ws["A2"].font = sub_font

            headers = [
                "No", "Nomor PA", "Pelanggan", "PTL", "PIC SITAC", "Alamat / Terminating",
                "Biaya Pengajuan (Rp)", "Biaya Realisasi (Rp)", "Efisiensi (Rp)", "Efisiensi (%)",
                "Status Progress", "Durasi (Hari)", "Aging SLA", "Tgl Disposisi", "Tgl Selesai", "Catatan Lapangan"
            ]
            ws.append([])
            ws.append(headers)

            cursor.execute("SELECT * FROM sitac_records ORDER BY id ASC")
            rows = cursor.fetchall()
            for idx, r in enumerate(rows, start=1):
                ws.append([
                    idx, r['no_pa'] or '-', r['pelanggan'] or '-', r['ptl'] or '-', r['pic_perijinan'] or '-',
                    r['terminating'] or '-', r['biaya_permintaan_awal'] or 0, r['biaya_final'] or 0,
                    r['efisiensi_rupiah'] or 0, r['efisiensi_persen'] or 0.0, r['progress'] or '-',
                    r['durasi_hari'] if r['durasi_hari'] is not None else '-', r['aging_category'] or '-',
                    r['date_dispos'] or '-', r['date_close'] or '-', r['update_pekerjaan'] or '-'
                ])

        elif module == 'collo':
            filename = f"Rekap_Kontrak_Colocation_{today_str}.xlsx"
            ws.title = "Colocation"

            ws["A1"] = "REKAPITULASI KONTRAK SEWA COLOCATION & INTERKONEKSI"
            ws["A1"].font = title_font
            ws["A2"] = f"Diekspor pada: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Telecom Operations Portal"
            ws["A2"].font = sub_font

            headers = [
                "No", "Pengelola", "Pelanggan", "Nomor SO", "SID Sirkuit", "Jenis Sewa", "Layanan",
                "Originating", "Terminating", "Rev Sewa 1 Thn (Rp)", "Biaya OTC (Rp)", "Biaya Sewa 1 Thn (Rp)",
                "Margin (Rp)", "Margin (%)", "Rev Sharing", "Status", "Tgl Mulai", "Tgl Berakhir",
                "Sisa Hari", "Kategori Alert", "Nomor SPP / PO", "PIC Rekanan", "Catatan"
            ]
            ws.append([])
            ws.append(headers)

            cursor.execute("SELECT * FROM collo_records ORDER BY id ASC")
            rows = cursor.fetchall()
            for idx, r in enumerate(rows, start=1):
                ws.append([
                    idx, r['pengelola'] or '-', r['pelanggan'] or '-', r['no_so'] or '-', r['sid'] or '-',
                    r['jenis_sewa'] or '-', r['layanan'] or '-', r['originating'] or '-', r['terminating'] or '-',
                    r['rev_sewa_tahun'] or 0, r['biaya_otc'] or 0, r['biaya_sewa_tahun'] or 0,
                    r['margin_rupiah'] or 0, r['margin_persen'] or 0.0, r['rev_sharing_raw'] or '-',
                    r['status'] or '-', r['start_date'] or '-', r['end_date'] or '-',
                    r['sisa_hari'] if r['sisa_hari'] is not None else 0, r['alert_category'] or '-',
                    r['spp'] or r['po_baru'] or '-', r['pic_rekanan'] or '-', r['keterangan'] or '-'
                ])

        else: # gangguan
            filename = f"Rekap_Tiket_Gangguan_{today_str}.xlsx"
            ws.title = "Tiket Gangguan"

            ws["A1"] = "REKAPITULASI TIKET GANGGUAN DARURAT & MAINTENANCE FO"
            ws["A1"].font = title_font
            ws["A2"] = f"Diekspor pada: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Telecom Operations Portal"
            ws["A2"].font = sub_font

            headers = [
                "No", "Nomor Tiket", "Tgl Disposisi", "Tgl Selesai", "Lokasi Gangguan / Terminating",
                "Jenis Insiden", "Target SLA", "PIC Lapangan / Perizinan", "Biaya Penanganan (Rp)",
                "Status Pekerjaan", "Catatan Update Gangguan", "Foto Bukti"
            ]
            ws.append([])
            ws.append(headers)

            cursor.execute("SELECT * FROM gangguan_records ORDER BY COALESCE(NULLIF(tgl_dispos, ''), SUBSTR(created_at, 1, 10)) DESC, id DESC")
            rows = cursor.fetchall()
            for idx, r in enumerate(rows, start=1):
                st_text = "Selesai" if r['is_selesai'] == 1 else "Proses (Open)"
                ws.append([
                    idx, r['no_tiket'] or '-', r['tgl_dispos'] or '-', r['tgl_selesai'] or '-',
                    r['terminating'] or '-', r['jenis_gangguan'] or '-', r['sla_target'] or 'H+1',
                    r['pic_perijinan'] or '-', r['biaya_gangguan'] or 0, st_text,
                    r['update_gangguan'] or '-', r['foto_bukti'] or '-'
                ])

        conn.close()

        # Format header row (row 4)
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=4, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        # Format data rows & column widths
        for row in ws.iter_rows(min_row=5, max_row=ws.max_row, min_col=1, max_col=len(headers)):
            for cell in row:
                cell.font = data_font
                cell.border = thin_border
                if isinstance(cell.value, (int, float)) and cell.column not in [1]:
                    if cell.value >= 1000 or 'Rp' in headers[cell.column - 1]:
                        cell.number_format = '#,##0'

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2]: continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 10), 40)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        excel_bytes = output.getvalue()

        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Content-Length', str(len(excel_bytes)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(excel_bytes)

    def handle_get_map_coordinates(self, q):
        conn = get_db()
        cursor = conn.cursor()
        st = q.get('status', ['ALL'])[0]

        cond = ["latitude IS NOT NULL AND longitude IS NOT NULL"]
        params = []
        if st != 'ALL':
            cond.append("progress = ?")
            params.append(st)

        where_clause = " WHERE " + " AND ".join(cond)
        cursor.execute(f"SELECT id, no_pa, pelanggan, terminating, latitude, longitude, progress, biaya_final, efisiensi_rupiah, pic_perijinan FROM sitac_records {where_clause}", params)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json(rows)

    def handle_get_filter_options(self):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT pengelola FROM collo_records WHERE pengelola != '' ORDER BY pengelola")
        pengelola_list = [r[0] for r in cursor.fetchall()]

        cursor.execute("SELECT DISTINCT pic_perijinan FROM sitac_records WHERE pic_perijinan != '' ORDER BY pic_perijinan")
        pic_list = [r[0] for r in cursor.fetchall()]

        cursor.execute("SELECT DISTINCT jenis_sewa FROM collo_records WHERE jenis_sewa != '' ORDER BY jenis_sewa")
        jenis_list = [r[0] for r in cursor.fetchall()]

        conn.close()
        self.send_json({
            "pengelola": pengelola_list,
            "pic": pic_list,
            "jenis_sewa": jenis_list
        })

    # =========================================================================
    # PATCH & POST HANDLERS (LIVE CRUD)
    # =========================================================================

    def handle_patch_collo(self, rec_id, body):
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM collo_records WHERE id = ?", (rec_id,))
        cur_row = cursor.fetchone()
        if not cur_row:
            conn.close()
            return self.send_error_json("Record not found", 404)

        cur_rec = dict(cur_row)
        fields = []
        params = []

        allowed_fields = [
            'status', 'spp', 'po_baru', 'ref_spp', 'proses_admin', 'keterangan',
            'rev_sewa_tahun', 'biaya_otc', 'biaya_sewa_tahun', 'foto_bukti',
            'pengelola', 'pelanggan', 'sid', 'no_so', 'originating', 'terminating',
            'jenis_sewa', 'layanan', 'rev_sharing_pct', 'start_date', 'end_date'
        ]
        for f in allowed_fields:
            if f in body:
                val = body[f]
                if f in ['rev_sewa_tahun', 'biaya_otc', 'biaya_sewa_tahun']:
                    val = safe_int(val)
                elif f == 'rev_sharing_pct':
                    val = safe_float(val)
                fields.append(f"{f} = ?")
                params.append(val)

        if 'status' in body:
            st = str(body['status']).upper()
            is_active = 1 if st == 'ACTIVE' else 0
            fields.append("is_active = ?")
            params.append(is_active)

        if 'rev_sewa_tahun' in body or 'biaya_sewa_tahun' in body:
            rev_sewa = safe_int(body['rev_sewa_tahun']) if 'rev_sewa_tahun' in body else cur_rec.get('rev_sewa_tahun', 0)
            biaya_sewa = safe_int(body['biaya_sewa_tahun']) if 'biaya_sewa_tahun' in body else cur_rec.get('biaya_sewa_tahun', 0)
            margin_rp = rev_sewa - biaya_sewa
            margin_pct = round((margin_rp / rev_sewa * 100), 1) if rev_sewa > 0 else 0.0
            fields.append("margin_rupiah = ?")
            params.append(margin_rp)
            fields.append("margin_persen = ?")
            params.append(margin_pct)

        # Recalculate revenue sharing if percentage or rev_sewa changed
        if 'rev_sharing_pct' in body or 'rev_sewa_tahun' in body:
            rev_sewa = safe_int(body['rev_sewa_tahun']) if 'rev_sewa_tahun' in body else cur_rec.get('rev_sewa_tahun', 0)
            pct = safe_float(body['rev_sharing_pct']) if 'rev_sharing_pct' in body else float(cur_rec.get('rev_sharing_pct') or 0.0)
            if pct > 0 and rev_sewa > 0:
                biaya_sharing = int(round(rev_sewa * (pct / 100.0)))
                fields.append("biaya_rev_sharing = ?")
                params.append(biaya_sharing)
                fields.append("rev_sharing_raw = ?")
                params.append(f"{pct}%")

        # Recalculate sisa_hari and alerts if end_date changed
        if 'end_date' in body and body['end_date']:
            try:
                ed = datetime.date.fromisoformat(str(body['end_date']).strip())
                sisa = (ed - datetime.date.today()).days
                fields.append("sisa_hari = ?")
                params.append(sisa)
                if sisa <= 0:
                    alert_cat = 'EXPIRED'
                    alert_label = 'Expired / Lewat Jatuh Tempo'
                    alert_color = '#ef4444'
                elif sisa < 30:
                    alert_cat = 'CRITICAL'
                    alert_label = f"Sisa {sisa} Hari"
                    alert_color = '#f97316'
                elif sisa <= 60:
                    alert_cat = 'WARNING'
                    alert_label = f"Sisa {sisa} Hari"
                    alert_color = '#eab308'
                else:
                    alert_cat = 'SAFE'
                    alert_label = f"Sisa {sisa} Hari"
                    alert_color = '#10b981'
                fields.append("alert_category = ?")
                params.append(alert_cat)
                fields.append("alert_label = ?")
                params.append(alert_label)
                fields.append("alert_color = ?")
                params.append(alert_color)
            except Exception:
                pass

        if not fields:
            conn.close()
            return self.send_error_json("No valid fields provided for update")

        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(rec_id)

        sql = f"UPDATE collo_records SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(sql, params)
        conn.commit()

        cursor.execute("SELECT * FROM collo_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return self.send_error_json("Record not found", 404)

        self.send_json({"success": True, "message": f"Sirkuit ID #{rec_id} berhasil diperbarui", "record": dict(row)})

    def handle_patch_sitac(self, rec_id, body):
        conn = get_db()
        cursor = conn.cursor()

        fields = []
        params = []

        allowed = ['progress', 'biaya_final', 'update_pekerjaan', 'date_close', 'foto_bukti']
        for f in allowed:
            if f in body:
                fields.append(f"{f} = ?")
                params.append(body[f])

        if 'biaya_final' in body:
            # Recalculate efisiensi
            cursor.execute("SELECT biaya_permintaan_awal FROM sitac_records WHERE id = ?", (rec_id,))
            r = cursor.fetchone()
            if r:
                b_awal = r[0] or 0
                b_fin = safe_int(body['biaya_final'])
                eff_rp = max(0, b_awal - b_fin)
                eff_pct = round((eff_rp / b_awal * 100), 2) if b_awal > 0 else 0.0
                fields.append("biaya_final = ?")
                params.append(b_fin)
                fields.append("efisiensi_rupiah = ?")
                params.append(eff_rp)
                fields.append("efisiensi_persen = ?")
                params.append(eff_pct)
                fields.append("is_berbiaya = ?")
                params.append(1 if (b_fin > 0 or b_awal > 0) else 0)

        if 'date_close' in body:
            cursor.execute("SELECT date_dispos FROM sitac_records WHERE id = ?", (rec_id,))
            r = cursor.fetchone()
            if r and r[0] and body['date_close']:
                try:
                    d1 = datetime.datetime.strptime(r[0], "%Y-%m-%d")
                    d2 = datetime.datetime.strptime(body['date_close'], "%Y-%m-%d")
                    durasi = max(0, (d2 - d1).days)
                    aging = "green" if durasi <= 7 else ("yellow" if durasi <= 14 else "red")
                    fields.append("durasi_hari = ?")
                    params.append(durasi)
                    fields.append("aging_category = ?")
                    params.append(aging)
                except Exception: pass

        if not fields:
            conn.close()
            return self.send_error_json("No valid fields provided for update")

        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(rec_id)

        sql = f"UPDATE sitac_records SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(sql, params)
        conn.commit()

        cursor.execute("SELECT * FROM sitac_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return self.send_error_json("Record not found", 404)

        self.send_json({"success": True, "message": f"Penugasan SITAC #{rec_id} berhasil diperbarui", "record": dict(row)})

    def handle_patch_gangguan(self, rec_id, body):
        conn = get_db()
        cursor = conn.cursor()

        fields = []
        params = []

        allowed = ['is_selesai', 'status_pekerjaan', 'tgl_selesai', 'update_gangguan', 'biaya_gangguan', 'foto_bukti']
        for f in allowed:
            if f in body:
                fields.append(f"{f} = ?")
                params.append(body[f])

        if 'is_selesai' in body:
            is_s = 1 if str(body['is_selesai']).strip() in ('1', 'true', 'True', 'Selesai') else 0
            if 'status_pekerjaan' not in body:
                fields.append("status_pekerjaan = ?")
                params.append("Selesai" if is_s == 1 else "Proses (Open)")
            if is_s == 1 and 'tgl_selesai' not in body:
                fields.append("tgl_selesai = ?")
                params.append(datetime.date.today().isoformat())

        if not fields:
            conn.close()
            return self.send_error_json("No valid fields provided for update")

        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(rec_id)

        sql = f"UPDATE gangguan_records SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(sql, params)
        conn.commit()

        cursor.execute("SELECT * FROM gangguan_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return self.send_error_json("Record not found", 404)

        self.send_json({"success": True, "message": f"Tiket Gangguan #{rec_id} berhasil diperbarui", "record": dict(row)})

    def handle_delete_collo(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, no_so, pelanggan FROM collo_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return self.send_error_json(f"Data Colocation dengan ID #{rec_id} tidak ditemukan", 404)

        cursor.execute("DELETE FROM collo_records WHERE id = ?", (rec_id,))
        conn.commit()
        conn.close()
        self.send_json({"success": True, "message": f"Data Colocation ID #{rec_id} ({row['pelanggan'] or '-'}) berhasil dihapus!"})

    def handle_delete_sitac(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, no_pa, pelanggan FROM sitac_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return self.send_error_json(f"Data SITAC dengan ID #{rec_id} tidak ditemukan", 404)

        cursor.execute("DELETE FROM sitac_records WHERE id = ?", (rec_id,))
        conn.commit()
        conn.close()
        self.send_json({"success": True, "message": f"Penugasan SITAC ID #{rec_id} ({row['no_pa'] or '-'}) berhasil dihapus!"})

    def handle_delete_gangguan(self, rec_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, no_tiket FROM gangguan_records WHERE id = ?", (rec_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return self.send_error_json(f"Data Gangguan dengan ID #{rec_id} tidak ditemukan", 404)

        cursor.execute("DELETE FROM gangguan_records WHERE id = ?", (rec_id,))
        conn.commit()
        conn.close()
        self.send_json({"success": True, "message": f"Tiket Gangguan ID #{rec_id} ({row['no_tiket'] or '-'}) berhasil dihapus!"})

    def handle_post_collo(self, b):
        conn = get_db()
        cursor = conn.cursor()

        pengelola = str(b.get('pengelola', '')).strip()
        pelanggan = str(b.get('pelanggan', '')).strip()
        if not pengelola or not pelanggan:
            conn.close()
            return self.send_error_json("Pengelola dan Pelanggan wajib diisi")

        rev_sewa = safe_int(b.get('rev_sewa_tahun', 0))
        biaya_otc = safe_int(b.get('biaya_otc', 0))
        biaya_sewa = safe_int(b.get('biaya_sewa_tahun', 0))
        margin_rp = rev_sewa - biaya_sewa
        margin_pct = round((margin_rp / rev_sewa * 100), 1) if rev_sewa > 0 else 0.0

        rev_share_pct = safe_float(b.get('rev_sharing_pct', 0.0))
        if rev_share_pct > 1.0: rev_share_pct = rev_share_pct / 100.0
        biaya_share = int(round(rev_sewa * rev_share_pct)) if rev_share_pct > 0 else 0
        rev_share_raw = f"{round(rev_share_pct * 100, 1)}%" if rev_share_pct > 0 else ""

        st = str(b.get('status', 'ACTIVE')).upper().strip()
        if not st: st = 'ACTIVE'
        is_active = 1 if st == 'ACTIVE' else 0

        start_date = b.get('start_date') or None
        end_date = b.get('end_date') or None
        sisa_hari = 999
        if end_date:
            try:
                ed = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
                sisa_hari = (ed - datetime.date.today()).days
            except Exception: pass

        if sisa_hari <= 0:
            alert_cat = "EXPIRED"
            alert_label = "Lewat Jatuh Tempo"
            alert_color = "red"
        elif sisa_hari < 30:
            alert_cat = "CRITICAL"
            alert_label = f"Sisa {sisa_hari} Hari"
            alert_color = "red"
        elif sisa_hari <= 60:
            alert_cat = "WARNING"
            alert_label = f"Sisa {sisa_hari} Hari"
            alert_color = "yellow"
        else:
            alert_cat = "SAFE"
            alert_label = f"Sisa {sisa_hari} Hari"
            alert_color = "green"

        cursor.execute("""
            INSERT INTO collo_records (
                pengelola, pelanggan, no_so, sid, jenis_sewa, layanan,
                rev_sewa_tahun, biaya_otc, biaya_sewa_tahun, margin_rupiah, margin_persen,
                rev_sharing_raw, rev_sharing_pct, biaya_rev_sharing,
                start_date, end_date, status, is_active, sisa_hari, alert_category,
                alert_label, alert_color, spp, po_baru, pic_admin, keterangan
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pengelola, pelanggan, str(b.get('no_so', '')).strip(), str(b.get('sid', '')).strip(),
            str(b.get('jenis_sewa', 'Colocation')).strip() or 'Colocation', str(b.get('layanan', '')).strip(),
            rev_sewa, biaya_otc, biaya_sewa, margin_rp, margin_pct,
            rev_share_raw, rev_share_pct, biaya_share,
            start_date, end_date, st, is_active, sisa_hari, alert_cat,
            alert_label, alert_color, str(b.get('spp', '')).strip(), str(b.get('po_baru', '')).strip(),
            str(b.get('pic_admin', '')).strip(), str(b.get('keterangan', '')).strip()
        ))
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM collo_records WHERE id = ?", (new_id,))
        rec = dict(cursor.fetchone())
        conn.close()

        self.send_json({"success": True, "message": "Link sewa baru berhasil ditambahkan", "record": rec}, 201)

    def handle_post_sitac(self, b):
        conn = get_db()
        cursor = conn.cursor()

        no_pa = str(b.get('no_pa', '')).strip()
        pelanggan = str(b.get('pelanggan', '')).strip()
        if not no_pa or not pelanggan:
            conn.close()
            return self.send_error_json("No PA dan Pelanggan wajib diisi")

        b_awal = safe_int(b.get('biaya_permintaan_awal', 0))
        b_final = safe_int(b.get('biaya_final', 0))
        eff_rp = max(0, b_awal - b_final)
        eff_pct = round((eff_rp / b_awal * 100), 2) if b_awal > 0 else 0.0
        is_berbiaya = 1 if (b_final > 0 or b_awal > 0) else 0

        today_str = datetime.date.today().isoformat()
        date_dispos = b.get('date_dispos') or today_str
        progress = str(b.get('progress', 'Ongoing')).strip() or 'Ongoing'
        date_close = b.get('date_close') or (today_str if progress == 'Finish' else None)

        durasi_hari = None
        if date_close:
            try:
                d1 = datetime.datetime.strptime(date_dispos, "%Y-%m-%d")
                d2 = datetime.datetime.strptime(date_close, "%Y-%m-%d")
                durasi_hari = max(0, (d2 - d1).days)
            except Exception: pass

        aging = "green" if (durasi_hari is None or durasi_hari <= 7) else ("yellow" if durasi_hari <= 14 else "red")
        lat = safe_float(b.get('latitude', -6.2000), -6.2000)
        lon = safe_float(b.get('longitude', 106.8200), 106.8200)

        now = datetime.date.today()
        foto_bukti = str(b.get('foto_bukti', '')).strip() or None
        cursor.execute("""
            INSERT INTO sitac_records (
                no_pa, pelanggan, ptl, pic_perijinan, terminating,
                latitude, longitude, coord_type, biaya_permintaan_awal, biaya_final,
                efisiensi_rupiah, efisiensi_persen, is_berbiaya, progress, date_dispos, date_close,
                durasi_hari, aging_category, update_pekerjaan, bulan, tahun, foto_bukti
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            no_pa, pelanggan, str(b.get('ptl', '')).strip(), str(b.get('pic_perijinan', '')).strip(),
            str(b.get('terminating', '')).strip(), lat, lon, "USER_INPUT",
            b_awal, b_final, eff_rp, eff_pct, is_berbiaya, progress,
            date_dispos, date_close, durasi_hari, aging, str(b.get('update_pekerjaan', '')).strip(),
            now.month, now.year, foto_bukti
        ))
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM sitac_records WHERE id = ?", (new_id,))
        rec = dict(cursor.fetchone())
        conn.close()

        self.send_json({"success": True, "message": "Disposisi SITAC baru berhasil ditambahkan", "record": rec}, 201)

    def handle_post_gangguan(self, b):
        conn = get_db()
        cursor = conn.cursor()

        no_tiket = str(b.get('no_tiket', '')).strip()
        if not no_tiket:
            cursor.execute("SELECT COUNT(*) FROM gangguan_records")
            cnt = cursor.fetchone()[0] + 1
            no_tiket = f"TIKET-EMERGENCY-{cnt:04d}"

        today_str = datetime.date.today().isoformat()
        tgl_dispos = b.get('tgl_dispos') or today_str
        is_selesai = 1 if str(b.get('is_selesai', '0')).strip() in ('1', 'true', 'True', 'Selesai') else 0
        status_pekerjaan = "Selesai" if is_selesai == 1 else "Proses (Open)"
        tgl_selesai = b.get('tgl_selesai') if is_selesai == 1 else (today_str if is_selesai == 1 else None)
        sla_target = str(b.get('sla_target', 'H+1')).strip() or 'H+1'
        b_gangguan = safe_int(b.get('biaya_gangguan', 0))

        foto_bukti = str(b.get('foto_bukti', '')).strip() or None

        cursor.execute("""
            INSERT INTO gangguan_records (
                no_tiket, tgl_dispos, tgl_selesai, terminating, jenis_gangguan,
                pic_perijinan, biaya_gangguan, status_pekerjaan, is_selesai,
                update_gangguan, sla_target, foto_bukti
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            no_tiket, tgl_dispos, tgl_selesai, str(b.get('terminating', '')).strip(),
            str(b.get('jenis_gangguan', 'FO Cut / Utilitas')).strip(), str(b.get('pic_perijinan', '')).strip(),
            b_gangguan, status_pekerjaan, is_selesai,
            str(b.get('update_gangguan', '')).strip() or 'Tiket baru dibuat dalam penanganan tim',
            sla_target, foto_bukti
        ))
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM gangguan_records WHERE id = ?", (new_id,))
        rec = dict(cursor.fetchone())
        conn.close()

        self.send_json({"success": True, "message": "Tiket gangguan baru berhasil ditambahkan", "record": rec}, 201)

    def handle_upload_file(self, body):
        import base64
        import time

        filename = body.get('filename', 'upload.jpg')
        data_uri = body.get('data', '')
        target_type = body.get('type', '')
        target_id = body.get('id', None)

        if not data_uri:
            return self.send_error_json("Data file base64 tidak ditemukan", 400)

        if "," in data_uri:
            data_b64 = data_uri.split(",", 1)[1]
        else:
            data_b64 = data_uri

        try:
            file_bytes = base64.b64decode(data_b64)
        except Exception as e:
            return self.send_error_json(f"Gagal mendekode base64: {str(e)}", 400)

        safe_name = "".join(c for c in filename if c.isalnum() or c in "._-").strip()
        if not safe_name:
            safe_name = "bukti_lapangan.jpg"
        ts = int(time.time())
        saved_filename = f"{ts}_{safe_name}"

        uploads_dir = os.path.join(BASE_DIR, "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        file_path = os.path.join(uploads_dir, saved_filename)

        with open(file_path, "wb") as f:
            f.write(file_bytes)

        if target_type and target_id:
            table = None
            if target_type == 'gangguan':
                table = 'gangguan_records'
            elif target_type == 'sitac':
                table = 'sitac_records'
            elif target_type == 'collo':
                table = 'collo_records'

            if table:
                conn = get_db()
                cur = conn.cursor()
                cur.execute(f"UPDATE {table} SET foto_bukti = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saved_filename, int(target_id)))
                conn.commit()
                conn.close()

        file_url = f"/uploads/{saved_filename}"
        self.send_json({
            "success": True,
            "message": "File bukti lapangan berhasil diunggah",
            "filename": saved_filename,
            "file_url": file_url
        })

def run():
    init_users_table()
    server_address = ('', PORT)
    httpd = ServerClass(server_address, TelecomPortalAPIHandler)
    print(f"\n=================================================================")
    print(f" TELECOM INFRASTRUCTURE & LEASE OPERATIONS PORTAL - REST API")
    print(f" URL: http://localhost:{PORT}/")
    print(f" SQLite Database: {DB_PATH}")
    print(f" REST API: http://localhost:{PORT}/api/executive/summary")
    print(f"=================================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped by user.")
        httpd.server_close()

if __name__ == '__main__':
    run()
