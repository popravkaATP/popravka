"""Собирает приложение в папку www/ из исходников в src/.

    python tools/build.py

Делает: index.html (ядро + база пуль и заводских патронов внутри), manifest, service worker со списком файлов.
"""
import hashlib, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, WWW = os.path.join(ROOT, "src"), os.path.join(ROOT, "www")

def read(p): return open(os.path.join(SRC, p), encoding="utf-8").read()

html = read("index_src.html")
engine = read("engine.js").replace("if (typeof module !== 'undefined') module.exports = Ballistics;", "")
bullets = json.loads(read("bullets_db.json"))["bullets"]
# заводские патроны (Geco, RWS, S&B, Lapua…) — в той же базе, с пометкой kind: "factory"
bullets += json.loads(read("cartridges_db.json"))["cartridges"]

def must_replace(s, a, b):
    assert a in s, f"не найдено: {a[:60]}"
    return s.replace(a, b, 1)

# шрифты — локально, чтобы всё работало без интернета
html = must_replace(html, """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans+Extra+Condensed:wght@500;600;700&family=Golos+Text:wght@400;500;600&display=swap" rel="stylesheet">""",
"""<link rel="stylesheet" href="./fonts/fonts.css">
<link rel="manifest" href="./manifest.webmanifest">
<meta name="theme-color" content="#17201b">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Поправка">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png">""")

# мост к Android-приложению (Capacitor): нужен для «Поделиться» и сохранения файлов
CAP_JS = os.path.join(ROOT, "node_modules", "@capacitor", "core", "dist", "capacitor.js")
if os.path.exists(CAP_JS):
    shutil.copy(CAP_JS, os.path.join(WWW, "capacitor.js"))
    html = must_replace(html, "</head>", '<script src="./capacitor.js"></script>\n</head>')
else:
    print("ВНИМАНИЕ: нет node_modules/@capacitor/core — выполните npm ci; «Поделиться» в Android работать не будет")

# отступы под вырез экрана / строку состояния в режиме приложения
html = must_replace(html, '<meta name="viewport" content="width=device-width, initial-scale=1">',
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
html = must_replace(html, ".wrap { max-width: 1080px; margin: 0 auto; padding: 14px 16px 24px; }",
    ".wrap { max-width: 1080px; margin: 0 auto; padding: calc(14px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left)); }")

# регистрация service worker (только на сайте, не внутри Android-приложения)
html = must_replace(html, "renderChip(); renderDistance(); fillConditions(); renderClock(); renderAz(); renderWx(); show();", """renderChip(); renderDistance(); fillConditions(); renderClock(); renderAz(); renderWx(); show();

(function registerOffline() {
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (native || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reg = null;
  navigator.serviceWorker.register('./sw.js').then(r => { reg = r; }).catch(() => {});
  // новая версия скачалась и включилась — предлагаем перезагрузить страницу
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdate('Есть обновление «Поправки».', 'Обновить', () => location.reload());
  });
  // приложение часто не закрывают — при возврате к нему проверяем, не вышла ли новая версия
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && reg) reg.update().catch(() => {});
  });
})();""")

# безопасные зоны: в Android-приложении Capacitor передаёт их через --safe-area-inset-*, в браузере работает env()
html = re.sub(r"env\(safe-area-inset-(\w+)\)", r"var(--safe-area-inset-\1, env(safe-area-inset-\1))", html)

# версия по исходникам — одинаковая у сайта и APK из одного коммита (по ней Android-приложение узнаёт об обновлении)
_vh = hashlib.sha256()
for _p in ("index_src.html", "engine.js", "bullets_db.json"): _vh.update(read(_p).encode("utf-8"))
_vh.update(open(os.path.abspath(__file__), "rb").read())
APP_VERSION = _vh.hexdigest()[:10]
html = must_replace(html, "/*APP_VERSION*/", APP_VERSION)
json.dump({"version": APP_VERSION}, open(os.path.join(WWW, "version.json"), "w"))

html = html.replace("/*ENGINE*/", engine).replace("/*BULLETS*/", json.dumps(bullets, ensure_ascii=False))
open(os.path.join(WWW, "index.html"), "w", encoding="utf-8").write(html)

manifest = {
    "name": "Поправка — баллистический калькулятор",
    "short_name": "Поправка",
    "description": "Поправки прицела по дистанции, ветру и погоде. Работает без интернета.",
    "lang": "ru",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#eceee8",
    "theme_color": "#17201b",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
json.dump(manifest, open(os.path.join(WWW, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# список файлов для офлайна + версия по содержимому (меняется → телефоны получают обновление)
assets, h = ["./"], hashlib.sha256()
for dp, _, files in os.walk(WWW):
    for f in sorted(files):
        if f == "sw.js": continue
        p = os.path.join(dp, f)
        rel = "./" + os.path.relpath(p, WWW).replace(os.sep, "/")
        assets.append(rel); h.update(open(p, "rb").read())
version = h.hexdigest()[:10]

sw = f"""// Service worker «Поправки»: хранит приложение в телефоне, чтобы оно работало без интернета.
const CACHE = 'popravka-{version}';
const ASSETS = {json.dumps(sorted(set(assets)), ensure_ascii=False, indent=1)};

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});
self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('popravka-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});
self.addEventListener('fetch', e => {{
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, {{ ignoreSearch: true }}).then(hit => hit ||
      fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
}});
"""
open(os.path.join(WWW, "sw.js"), "w", encoding="utf-8").write(sw)
print(f"www/ собран, версия приложения {APP_VERSION}, кэш {version}, файлов в офлайн-кэше: {len(set(assets))}")
