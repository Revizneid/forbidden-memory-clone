import http.server, socketserver, functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

Handler = functools.partial(NoCacheHandler, directory='.')
with socketserver.ThreadingTCPServer(('127.0.0.1', 8619), Handler) as httpd:
    print('Serving on http://127.0.0.1:8619/ (no-cache)')
    httpd.serve_forever()
