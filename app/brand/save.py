# A tiny local server for render.html: serves this folder and saves the PNGs it posts. Local only (127.0.0.1).
import http.server, os, urllib.parse
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get("name", [""])[0])
        if not name.endswith(".png"): self.send_response(400); self.end_headers(); return
        data = self.rfile.read(int(self.headers.get("content-length", 0)))
        os.makedirs("out", exist_ok=True)
        open(os.path.join("out", name), "wb").write(data)
        self.send_response(204); self.end_headers()
http.server.ThreadingHTTPServer(("127.0.0.1", 5303), H).serve_forever()
