"""HTTP server: static SPA + JSON API + background scheduler. Stdlib only."""
import json
import mimetypes
import os
import threading
import traceback
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qsl

from .db import transaction, ROOT
from . import api, core, mail
from .core import ApiError

WEB = os.path.join(ROOT, "web")
COOKIE = "ib_session"
TRUST_PROXY = os.environ.get("IB_TRUST_PROXY") == "1"
SECURE_COOKIE = mail.BASE_URL.startswith("https://")
MAX_BODY = 256 * 1024

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(BaseHTTPRequestHandler):
    server_version = "InsightBacklog/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("IB_QUIET") != "1":
            super().log_message(fmt, *args)

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")

    # ------------------------------------------------------------------

    def _handle(self, method):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            return self._api(method, url)
        if method != "GET":
            return self._send(405, b"Method not allowed", "text/plain")
        return self._static(url.path)

    def _ip(self):
        if TRUST_PROXY and self.headers.get("X-Forwarded-For"):
            return self.headers["X-Forwarded-For"].split(",")[0].strip()
        return self.client_address[0]

    def _api(self, method, url):
        body = {}
        if method in ("POST", "PATCH", "DELETE"):
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self._json(413, {"error": "payload_too_large"})
            raw = self.rfile.read(length) if length else b""
            # Requiring JSON blocks cross-site form posts (no CORS preflight bypass).
            if raw and "application/json" not in (self.headers.get("Content-Type") or ""):
                return self._json(415, {"error": "json_required"})
            try:
                body = json.loads(raw or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                return self._json(400, {"error": "invalid_json"})
        cookie = SimpleCookie(self.headers.get("Cookie") or "")
        token = cookie[COOKIE].value if COOKIE in cookie else None
        query = dict(parse_qsl(url.query))
        try:
            with transaction():
                req = api.Req(method, url.path, query, body, token, self._ip())
                result = api.dispatch(req)
            self._json(200, result, req.set_cookie)
        except ApiError as e:
            self._json(e.status, dict({"error": e.code}, **e.extra))
        except Exception:
            traceback.print_exc()
            self._json(500, {"error": "server_error"})

    def _json(self, status, data, cookie=None):
        payload = json.dumps(data, ensure_ascii=False, default=str).encode()
        headers = {"Cache-Control": "no-store"}
        if cookie is not None:
            token, max_age = cookie
            headers["Set-Cookie"] = "%s=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s" % (
                COOKIE, token, max_age, "; Secure" if SECURE_COOKIE else "")
        self._send(status, payload, "application/json; charset=utf-8", headers)

    def _static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
        if not full.startswith(WEB) or not os.path.isfile(full):
            full = os.path.join(WEB, "index.html")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype, {"Cache-Control": "no-cache"})

    def _send(self, status, payload, ctype, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)


def scheduler(stop):
    """Auto-close cycles on their date (board timezone), reminders, scheduled starts."""
    while not stop.wait(20):
        try:
            with transaction():
                core.tick()
        except Exception:
            traceback.print_exc()


def serve(host="0.0.0.0", port=8000):
    stop = threading.Event()
    with transaction():
        core.tick()
    threading.Thread(target=scheduler, args=(stop,), daemon=True).start()
    threading.Thread(target=mail.smtp_worker, args=(stop,), daemon=True).start()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("Insight Backlog → %s  (local: http://localhost:%d)" % (mail.BASE_URL, port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        httpd.server_close()
