import http.server
import socketserver
import os

PORT = 8080

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # If file does not exist and URL has no extension, serve 404.html / index.html SPA entry
        url_path = self.path.split('?')[0]
        full_path = self.translate_path(url_path)
        if not os.path.exists(full_path) and '.' not in os.path.basename(url_path):
            self.path = '/404.html'
        return super().do_GET()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"Serving ioclick SPA locally at http://localhost:{PORT}")
        httpd.serve_forever()
