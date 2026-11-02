"""Loopback-only visual fixture for the bundled CSS, never the public service.

Uses the real website styles and component structure. It is NOT evidence of
native injection, a live map, actual prices, iOS rendering or a store release.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import html

ROOT = Path(__file__).resolve().parents[2]
PRESENTATION = Path(__file__).resolve().parent
NONCE = "localPreviewNonce0123456789"


def page(query):
    values = parse_qs(query)
    view = values.get("view", ["venue"])[0]
    plain = values.get("theme", ["new"])[0] == "original"
    stress = values.get("stress", ["no"])[0] == "yes"
    css = (PRESENTATION / "app-theme.js").read_text(encoding="utf-8").split("String.raw`", 1)[1].split("`;", 1)[0]
    title = "Locale di prova — nome molto lungo per verificare la leggibilità" if stress else "Locale di prova"
    row = '''<li class="price"><span class="price__icon"></span><span class="price__name">Birra media</span>
      <span class="price__value price__value--{tier}">{glyph} {price}</span>
      <span class="price__meta">Dati di prova · nessuna conferma <span class="price__stale">· da confermare</span></span>
      <span class="price__actions"><button class="btn btn--secondary" type="button" aria-disabled="true">Confermo</button>
      <button class="btn btn--secondary" type="button">È cambiato</button><button class="btn btn--ghost" type="button">Segnala un errore</button></span></li>'''
    rows = "".join(row.format(tier=t, glyph=g, price=p) for t, g, p in [
        ("affare", "↓", "4,00 €"), ("giusto", "=", "5,00 €"), ("salato", "↑", "8,00 €")
    ] * (3 if stress else 1))
    if view == "price":
        content = '''<div class="sheet__head"><h2 class="sheet__title" tabindex="-1">Aggiungi un prezzo</h2><button class="btn btn--ghost" type="button" data-close>Chiudi</button></div>
          <div class="sheet__body"><p class="hint">Anteprima locale · nessun invio pubblico</p>
          <form><h3 class="context-tag">Birra media · Locale di prova</h3><p class="question">Quanto hai pagato?</p>
          <label class="price-input"><span class="sr-only">Prezzo</span><input type="text" inputmode="decimal" autocomplete="off" aria-label="Prezzo" aria-invalid="false" aria-describedby="price-error" placeholder="0,00"><span aria-hidden="true">€</span></label>
          <p id="price-error" class="error" role="alert"></p><p class="hint">Solo dati di prova. Il modulo non contatta Dove Bevo.</p>
          <button type="button" role="switch" aria-checked="false" class="switch"><span class="switch__track" aria-hidden="true"></span>Happy hour</button>
          <button type="submit" class="btn btn--primary">Verifica anteprima</button><p id="local-result" role="status"></p></form></div>'''
        sheet_class = "sheet"
    else:
        content = f'''<div class="sheet__grip"><span aria-hidden="true"></span><button class="btn btn--ghost sheet__x" type="button" data-close>Chiudi</button></div>
          <div class="sheet__body"><div class="scontrino"><div class="scontrino__paper"><p class="bar__kind">Bar · anteprima locale</p>
          <h2 class="scontrino__name">{html.escape(title)}</h2><p class="bar__addr">Indirizzo di prova · dati sintetici, non pubblici</p>
          <h3 class="section-title">Prezzi</h3><ul class="prices">{rows if view != 'empty' else '<p>Nessun prezzo ancora.</p>'}</ul>
          <p class="scontrino__foot"><span>Segnati da chi ordina</span><span>Dati di prova</span></p></div>
          <div class="bar__actions"><button class="btn btn--secondary" type="button">Indicazioni</button><button class="btn btn--primary" type="button" data-price>Aggiungi un prezzo qui</button></div>
          <button class="btn btn--ghost" type="button">Segnala un problema con il bar</button><p><a href="/?view=venue">Privacy — prova locale</a> · Regole</p></div></div>'''
        sheet_class = "sheet sheet--bare"
    theme = "" if plain else f'<style nonce="{NONCE}">{css}</style>'
    marker = "" if plain else 'data-dovebevo-app-theme="1"'
    return f'''<!doctype html><html lang="it" {marker}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dove Bevo — anteprima locale CSS</title>
      <link rel="stylesheet" href="/styles/tokens.css"><link rel="stylesheet" href="/styles/base.css"><link rel="stylesheet" href="/styles/app.css">{theme}</head>
      <body><div id="app"><div class="app"><header class="top"><h1 class="brand">Dove Bevo</h1><p>Anteprima locale — dati sintetici</p></header><main class="main"></main><footer class="bottom"><button class="btn" id="open">Apri anteprima</button><a class="btn" href="/?view=price">Prezzo</a></footer></div></div>
      <dialog class="{sheet_class}" aria-label="Anteprima locale">{content}</dialog>
      <script nonce="{NONCE}">
      const dialog=document.querySelector('dialog');dialog.showModal();
      document.getElementById('open').onclick=()=>dialog.showModal();
      document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
      document.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>location.assign('/?view=price'));
      const form=document.querySelector('form');if(form){{form.onsubmit=e=>{{e.preventDefault();document.getElementById('local-result').textContent='Anteprima verificata — niente è stato pubblicato.';}};const toggle=document.querySelector('[role=switch]');toggle.onclick=()=>toggle.setAttribute('aria-checked',toggle.getAttribute('aria-checked')==='true'?'false':'true');}}
      </script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/":
            payload = page(parsed.query).encode()
            kind = "text/html; charset=utf-8"
        elif parsed.path in ["/styles/tokens.css", "/styles/base.css", "/styles/app.css"]:
            payload = (ROOT / "src/app" / parsed.path.lstrip("/")).read_bytes()
            kind = "text/css; charset=utf-8"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Content-Security-Policy", f"default-src 'self'; style-src 'self' 'nonce-{NONCE}'; script-src 'nonce-{NONCE}'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print("Local CSS fixture on http://127.0.0.1:4186/ — synthetic data only", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 4186), Handler).serve_forever()
