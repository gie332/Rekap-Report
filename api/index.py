import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import DashboardServer

class handler(DashboardServer):
    def do_GET(self):
        try:
            super().do_GET()
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(traceback.format_exc().encode('utf-8'))
            
    def do_POST(self):
        try:
            super().do_POST()
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(traceback.format_exc().encode('utf-8'))
