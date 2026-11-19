#!/usr/bin/env python3
"""Assemble ALPHA Studio : src/ -> alpha-studio.html, puis ajoute le pont natif."""
import pathlib
import os

root = pathlib.Path(__file__).parent
src = root / "src"

css_names = ["style.css", "windows.css", "windows2.css", "windows3.css", "windows5.css"]
js_names = ["app.js", "windows.js", "windows2.js", "windows3.js", "windows5.js"]

css = "\n".join((src / name).read_text(encoding="utf-8") for name in css_names)
body = (src / "body.html").read_text(encoding="utf-8")
js = "\n".join((src / name).read_text(encoding="utf-8") for name in js_names)
js += "\n" + (root / "native-bridge.js").read_text(encoding="utf-8")

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALPHA Studio — Fenêtre de projet</title>
<meta name="description" content="ALPHA Studio — interface native reliée au moteur audio JUCE.">
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{js}
</script>
</body>
</html>
"""
out = root / "alpha-studio.html"
out.write_text(html, encoding="utf-8")
print(f"OK -> {out} : {os.path.getsize(out)} octets")
