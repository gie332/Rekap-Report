import os
import sys

# Tambahkan direktori root ke path agar bisa meng-import server.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import DashboardServer

class handler(DashboardServer):
    """
    Vercel Serverless Handler for Python.
    Vercel otomatis mengenali class 'handler' yang mewarisi BaseHTTPRequestHandler.
    """
    pass
