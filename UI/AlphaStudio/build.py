#!/usr/bin/env python3
"""Assemble ALPHA Studio : src/ -> alpha-studio.html, puis ajoute le pont natif."""
import pathlib
import os

root = pathlib.Path(__file__).parent
src = root / "src"

css_names = ["style.css", "windows.css", "windows2.css", "windows3.css", "windows5.css"]
# audio-core.js précède le pont natif ; audio.js est chargé après lui pour céder
# la priorité au moteur JUCE quand WebView2 est présent.
js_names = ["app.js", "windows.js", "windows2.js", "windows3.js", "windows5.js", "audio-core.js"]
js_after_bridge = ["audio.js", "layout.js"]

css = "\n".join((src / name).read_text(encoding="utf-8") for name in css_names)
body = (src / "body.html").read_text(encoding="utf-8")
js = "\n".join((src / name).read_text(encoding="utf-8") for name in js_names)
js += "\n" + (root / "native-bridge.js").read_text(encoding="utf-8")
js += "\n" + "\n".join((src / name).read_text(encoding="utf-8") for name in js_after_bridge)

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALPHA Studio — Fenêtre de projet</title>
<meta name="description" content="ALPHA Studio — interface native reliée au moteur audio JUCE.">
<script>if (window.__JUCE__ && window.__JUCE__.backend) document.documentElement.dataset.alphaNative = '1';</script>
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
assert "class AlphaMixProcessor" in html, "worklet de mixage absent du livrable"
assert "window.ALPHA_AUDIO" in html, "moteur J1 absent du livrable"
assert "ALPHA_AUDIO_METERS" in html, "compteurs J1 absents du livrable"
assert "<script src=" not in html, "dépendance externe interdite dans le livrable"

out = root / "alpha-studio.html"
out.write_text(html, encoding="utf-8")
print(f"OK -> {out} : {os.path.getsize(out)} octets")
