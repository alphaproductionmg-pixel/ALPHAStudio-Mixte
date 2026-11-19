#!/usr/bin/env python3
"""Sert le livrable J1 en HTTP pour la validation manuelle (AudioWorklet inclus)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

UI_DIR = Path(__file__).resolve().parent.parent / "UI" / "AlphaStudio"
PORT = int(os.environ.get("PORT", "8000"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.path = "/alpha-studio.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    if not (UI_DIR / "alpha-studio.html").exists():
        raise SystemExit("Livrable absent : exécuter d'abord python3 UI/AlphaStudio/build.py")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"ALPHA Studio J1 : http://0.0.0.0:{PORT}/ -> alpha-studio.html", flush=True)
    server.serve_forever()
