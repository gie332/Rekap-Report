#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Upload / Sync Script to Google Cloud Firestore
Network Operations & Infrastructure Lease Management Dashboard

Mendukung 2 metode:
1. Firebase Admin SDK (Jika memiliki file serviceAccountKey.json dan library firebase-admin)
2. Firestore REST API (Menggunakan pustaka standar Python urllib, tanpa dependensi eksternal)
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sitac_collo_data.json")
SERVICE_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "serviceAccountKey.json")

def load_local_data():
    if not os.path.exists(DATA_FILE):
        print(f"[ERROR] File data lokal tidak ditemukan di: {DATA_FILE}")
        print("Jalankan 'python extract_all_data.py' terlebih dahulu untuk menghasilkan data.")
        sys.exit(1)
    
    print(f"[INFO] Membaca data dari {DATA_FILE}...")
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

def convert_value_to_firestore(val):
    """Konversi tipe data Python ke format Firestore REST Value object."""
    if val is None:
        return {"nullValue": None}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, int):
        return {"integerValue": str(val)}
    elif isinstance(val, float):
        return {"doubleValue": val}
    elif isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, list):
        return {"arrayValue": {"values": [convert_value_to_firestore(x) for x in val]}}
    elif isinstance(val, dict):
        return {"mapValue": {"fields": {k: convert_value_to_firestore(v) for k, v in val.items()}}}
    else:
        return {"stringValue": str(val)}

def upload_via_rest(project_id, api_key, data):
    """Upload data menggunakan Cloud Firestore REST API tanpa dependensi eksternal."""
    print(f"\n[REST API] Menghubungkan ke Project ID: {project_id}")
    base_url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents"
    
    collections_to_upload = [
        ("summary", [{"id": "executive_summary", **data.get("summary", {})}]),
        ("rekap_efisiensi", [
            {"id": f"tahun_{r.get('tahun')}", **r} for r in data.get("rekap_efisiensi", [])
        ]),
        ("gangguan_records", [
            {"id": f"ticket_{g.get('id')}", **g} for g in data.get("gangguan_records", [])
        ]),
        ("sitac_records", [
            {"id": f"sitac_{s.get('id')}", **s} for s in data.get("sitac_records", [])
        ]),
        ("collo_records", [
            {"id": f"collo_{c.get('id')}", **c} for c in data.get("collo_records", [])
        ])
    ]

    total_uploaded = 0
    start_time = time.time()

    for col_name, items in collections_to_upload:
        count = len(items)
        print(f"\n--> Mengunggah koleksi '{col_name}' ({count} dokumen)...")
        
        # Batch upload menggunakan REST API batchWrite
        batch_size = 200
        for i in range(0, count, batch_size):
            chunk = items[i:i + batch_size]
            writes = []
            for item in chunk:
                doc_id = str(item.get("id"))
                doc_path = f"projects/{project_id}/databases/(default)/documents/{col_name}/{doc_id}"
                
                # Buat field map
                fields = {}
                for k, v in item.items():
                    if k != "id":
                        fields[k] = convert_value_to_firestore(v)
                
                writes.append({
                    "update": {
                        "name": doc_path,
                        "fields": fields
                    }
                })

            req_url = f"{base_url}:batchWrite"
            if api_key:
                req_url += f"?key={api_key}"

            payload = json.dumps({"writes": writes}).encode("utf-8")
            req = urllib.request.Request(
                req_url,
                data=payload,
                headers={"Content-Type": "application/json"}
            )

            try:
                with urllib.request.urlopen(req) as resp:
                    if resp.status == 200:
                        total_uploaded += len(chunk)
                        print(f"    Tersinkronisasi {min(i + batch_size, count)}/{count} dokumen...")
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode("utf-8")
                print(f"    [ERROR] HTTP Error {e.code}: {err_msg}")
                print("\n[TIPS]")
                print("1. Pastikan Firestore Security Rules mengizinkan write (misal di set test mode):")
                print("   allow read, write: if true;")
                print("2. Atau gunakan opsi Admin SDK dengan 'serviceAccountKey.json'")
                return
            except Exception as e:
                print(f"    [ERROR] Terjadi kesalahan: {e}")
                return

    elapsed = round(time.time() - start_time, 2)
    print(f"\n[SUKSES] Total {total_uploaded} dokumen berhasil diunggah ke Firestore dalam {elapsed} detik!")

def upload_via_admin_sdk(service_key_path, data):
    """Upload data menggunakan Firebase Admin SDK."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("[ERROR] Library 'firebase_admin' belum terpasang.")
        print("Silakan jalankan: pip install firebase-admin")
        sys.exit(1)

    print(f"\n[ADMIN SDK] Menginisialisasi Firebase menggunakan: {service_key_path}")
    cred = credentials.Certificate(service_key_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    collections = [
        ("summary", [{"id": "executive_summary", **data.get("summary", {})}]),
        ("rekap_efisiensi", [{"id": f"tahun_{r.get('tahun')}", **r} for r in data.get("rekap_efisiensi", [])]),
        ("gangguan_records", [{"id": f"ticket_{g.get('id')}", **g} for g in data.get("gangguan_records", [])]),
        ("sitac_records", [{"id": f"sitac_{s.get('id')}", **s} for s in data.get("sitac_records", [])]),
        ("collo_records", [{"id": f"collo_{c.get('id')}", **c} for c in data.get("collo_records", [])])
    ]

    total_uploaded = 0
    start_time = time.time()

    for col_name, items in collections:
        count = len(items)
        print(f"\n--> Mengunggah koleksi '{col_name}' ({count} dokumen)...")
        batch = db.batch()
        batch_counter = 0

        for idx, item in enumerate(items):
            doc_id = str(item.get("id"))
            doc_ref = db.collection(col_name).document(doc_id)
            doc_data = {k: v for k, v in item.items() if k != "id"}
            batch.set(doc_ref, doc_data)
            batch_counter += 1

            # Firestore batch limit is 500
            if batch_counter >= 450 or idx == count - 1:
                batch.commit()
                total_uploaded += batch_counter
                print(f"    Tersinkronisasi {idx + 1}/{count} dokumen...")
                batch = db.batch()
                batch_counter = 0

    elapsed = round(time.time() - start_time, 2)
    print(f"\n[SUKSES] Total {total_uploaded} dokumen berhasil diunggah via Admin SDK dalam {elapsed} detik!")

def main():
    parser = argparse.ArgumentParser(description="Upload Network Infrastructure Data to Cloud Firestore")
    parser.add_argument("--project", help="Firebase Project ID")
    parser.add_argument("--api-key", help="Firebase Web API Key (opsional jika rule terbuka)")
    parser.add_argument("--key-file", default=SERVICE_KEY_FILE, help="Path ke serviceAccountKey.json")
    args = parser.parse_args()

    data = load_local_data()

    # Cek apakah serviceAccountKey.json ada
    if os.path.exists(args.key_file):
        print(f"[INFO] Ditemukan file kredensial Admin: {args.key_file}")
        upload_via_admin_sdk(args.key_file, data)
        return

    # Jika tidak ada service key, minta atau gunakan Project ID untuk REST API
    project_id = args.project
    if not project_id:
        # Coba baca dari firebase-config.js jika ada
        cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "firebase-config.js")
        if os.path.exists(cfg_file):
            try:
                with open(cfg_file, "r", encoding="utf-8") as f:
                    content = f.read()
                    import re
                    m_proj = re.search(r'projectId:\s*["\']([^"\']+)["\']', content)
                    m_key = re.search(r'apiKey:\s*["\']([^"\']+)["\']', content)
                    if m_proj and m_proj.group(1):
                        project_id = m_proj.group(1)
                    if m_key and m_key.group(1) and not args.api_key:
                        args.api_key = m_key.group(1)
            except Exception:
                pass

    if not project_id:
        print("\n=======================================================")
        print("          UPLOAD DATA KE GOOGLE CLOUD FIRESTORE        ")
        print("=======================================================")
        print("Masukkan Project ID Firebase Anda.")
        print("(Contoh: network-ops-12345 atau lihat di console.firebase.google.com)")
        try:
            project_id = input("\nFirebase Project ID: ").strip()
        except EOFError:
            project_id = ""

    if not project_id:
        print("[ERROR] Project ID diperlukan untuk menghubungkan ke Firestore.")
        print("Jalankan dengan parameter: python upload_to_firebase.py --project NAMA_PROJECT_ANDA")
        sys.exit(1)

    upload_via_rest(project_id, args.api_key, data)

if __name__ == "__main__":
    main()
