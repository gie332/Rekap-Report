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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    if count == 0:
        default_users = [
            ('admin', hash_pw('admin123'), 'Administrator (Manajemen)', 'admin', 'fa-shield-halved', 'cyan'),
            ('lapangan', hash_pw('lapangan123'), 'Tim SITAC & Teknisi Lapangan', 'lapangan', 'fa-helmet-safety', 'emerald'),
        ]
        cursor.executemany("INSERT INTO users (username, password_hash, full_name, role, avatar_icon, badge_color) VALUES (?, ?, ?, ?, ?, ?)", default_users)
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
                elif path == "/api/sitac":
                    self.handle_get_sitac(query)
                elif path == "/api/gangguan":
                    self.handle_get_gangguan(query)
                elif path == "/api/pic-performance":
                    self.handle_get_pic_performance()
                elif path == "/api/rekap-efisiensi":
                    self.handle_get_rekap_efisiensi()
                elif path == "/api/map-coordinates":
                    self.handle_get_map_coordinates(query)
                elif path == "/api/meta/options":
                    self.handle_get_filter_options()
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

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        try:
            if path == "/api/auth/login":
                self.handle_auth_login(body)
            elif path == "/api/collo":
                self.handle_post_collo(body)
            elif path == "/api/sitac":
                self.handle_post_sitac(body)
            elif path == "/api/gangguan":
                self.handle_post_gangguan(body)
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
            self.send_error_json("Username dan password harus diisi", 400)
            return

        pw_hash = hash_pw(password)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, full_name, role, avatar_icon, badge_color, password_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()

        if not row or row['password_hash'] != pw_hash:
            self.send_error_json("Username atau password tidak sesuai. Coba 'lapangan' / 'lapangan123' atau 'admin' / 'admin123'.", 401)
            return

        user_info = {
            "id": row['id'],
            "username": row['username'],
            "full_name": row['full_name'],
            "role": row['role'],
            "avatar_icon": row['avatar_icon'],
            "badge_color": row['badge_color']
        }
        token = f"sess_{row['role']}_{hashlib.md5((username + str(datetime.datetime.now())).encode()).hexdigest()[:16]}"
        self.send_json({
            "success": True,
            "message": f"Login berhasil sebagai {row['full_name']}",
            "user": user_info,
            "token": token
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
        page_size = max(5, min(100, int(q.get('pageSize', ['25'])[0])))

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

    def handle_get_sitac(self, q):
        conn = get_db()
        cursor = conn.cursor()

        status_filter = q.get('status', ['ALL'])[0]
        pic_filter = q.get('pic', ['ALL'])[0]
        year_filter = q.get('year', ['ALL'])[0]
        aging_filter = q.get('aging', ['ALL'])[0]
        search = q.get('search', [''])[0].strip().lower()
        page = max(1, int(q.get('page', ['1'])[0]))
        page_size = max(5, min(100, int(q.get('pageSize', ['25'])[0])))

        conditions = []
        params = []

        if status_filter != 'ALL':
            conditions.append("progress = ?")
            params.append(status_filter)

        if pic_filter != 'ALL':
            conditions.append("pic_perijinan = ?")
            params.append(pic_filter)

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
        conn.close()

        self.send_json({
            "data": records,
            "total": total_count,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total_count + page_size - 1) // page_size if total_count > 0 else 1
        })

    def handle_get_gangguan(self, q):
        conn = get_db()
        cursor = conn.cursor()

        is_selesai = q.get('status', ['ALL'])[0]
        search = q.get('search', [''])[0].strip().lower()

        conditions = []
        params = []

        if is_selesai == '1':
            conditions.append("is_selesai = 1")
        elif is_selesai == '0':
            conditions.append("is_selesai = 0")

        if search:
            search_param = f"%{search}%"
            conditions.append("(LOWER(no_tiket) LIKE ? OR LOWER(terminating) LIKE ? OR LOWER(pic_perijinan) LIKE ? OR LOWER(jenis_gangguan) LIKE ?)")
            params.extend([search_param, search_param, search_param, search_param])

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        cursor.execute(f"""
            SELECT * FROM gangguan_records
            {where_clause}
            ORDER BY id ASC
        """, params)
        records = [dict(r) for r in cursor.fetchall()]
        conn.close()

        self.send_json({"data": records, "total": len(records)})

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

        allowed_fields = ['status', 'spp', 'po_baru', 'ref_spp', 'proses_admin', 'keterangan', 'rev_sewa_tahun', 'biaya_otc', 'biaya_sewa_tahun']
        for f in allowed_fields:
            if f in body:
                val = body[f]
                if f in ['rev_sewa_tahun', 'biaya_otc', 'biaya_sewa_tahun']:
                    val = safe_int(val)
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

        allowed = ['progress', 'biaya_final', 'update_pekerjaan', 'date_close']
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

        allowed = ['is_selesai', 'status_pekerjaan', 'tgl_selesai', 'update_gangguan']
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
        cursor.execute("""
            INSERT INTO sitac_records (
                no_pa, pelanggan, ptl, pic_perijinan, terminating,
                latitude, longitude, coord_type, biaya_permintaan_awal, biaya_final,
                efisiensi_rupiah, efisiensi_persen, is_berbiaya, progress, date_dispos, date_close,
                durasi_hari, aging_category, update_pekerjaan, bulan, tahun
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            no_pa, pelanggan, str(b.get('ptl', '')).strip(), str(b.get('pic_perijinan', '')).strip(),
            str(b.get('terminating', '')).strip(), lat, lon, "USER_INPUT",
            b_awal, b_final, eff_rp, eff_pct, is_berbiaya, progress,
            date_dispos, date_close, durasi_hari, aging, str(b.get('update_pekerjaan', '')).strip(),
            now.month, now.year
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

        cursor.execute("""
            INSERT INTO gangguan_records (
                no_tiket, tgl_dispos, tgl_selesai, terminating, jenis_gangguan,
                pic_perijinan, biaya_gangguan, status_pekerjaan, is_selesai,
                update_gangguan, sla_target
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            no_tiket, tgl_dispos, tgl_selesai, str(b.get('terminating', '')).strip(),
            str(b.get('jenis_gangguan', 'FO Cut / Utilitas')).strip(), str(b.get('pic_perijinan', '')).strip(),
            b_gangguan, status_pekerjaan, is_selesai,
            str(b.get('update_gangguan', '')).strip() or 'Tiket baru dibuat dalam penanganan tim',
            sla_target
        ))
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM gangguan_records WHERE id = ?", (new_id,))
        rec = dict(cursor.fetchone())
        conn.close()

        self.send_json({"success": True, "message": "Tiket gangguan baru berhasil ditambahkan", "record": rec}, 201)

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
