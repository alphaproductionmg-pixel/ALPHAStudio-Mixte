#!/usr/bin/env python3
"""Assemble ALPHA Studio : src/ -> alpha-studio.html (fichier unique, zéro dépendance)."""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
css = (root/'src/style.css').read_text(encoding='utf-8') + "\n" + (root/'src/windows.css').read_text(encoding='utf-8') + "\n" + (root/'src/windows2.css').read_text(encoding='utf-8') + "\n" + (root/'src/windows3.css').read_text(encoding='utf-8') + "\n" + (root/'src/windows5.css').read_text(encoding='utf-8')
body = (root/'src/body.html').read_text(encoding='utf-8')
js = (root/'src/app.js').read_text(encoding='utf-8') + "\n" + (root/'src/windows.js').read_text(encoding='utf-8') + "\n" + (root/'src/windows2.js').read_text(encoding='utf-8') + "\n" + (root/'src/windows3.js').read_text(encoding='utf-8') + "\n" + (root/'src/windows5.js').read_text(encoding='utf-8')

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALPHA Studio — Fenêtre de projet</title>
<meta name="description" content="ALPHA Studio : station audio numérique inspirée de l'ergonomie de Nuendo 4. Étape 1 — interface.">
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
out = root/'alpha-studio.html'
out.write_text(html, encoding='utf-8')
import os
print(f"OK -> {out} : {os.path.getsize(out)} octets ({os.path.getsize(out)/1024:.1f} Kio)")
