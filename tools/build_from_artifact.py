"""Rebuild index.html from a saved copy of the claude.ai artifact.

Usage: python3 tools/build_from_artifact.py path/to/artifact.html
Swaps the artifact's claude.ai progress sync for Supabase sync (tools/sync.js),
adds the account screen, service worker and PWA head, keeps the current Supabase
keys from index.html, and bumps the service-worker cache version.
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
s = pathlib.Path(sys.argv[1]).read_text()
s = s[s.index("<body>") + len("<body>"):]
s = s[:s.rindex("</body></html>")].lstrip("\n")
old = (root / "index.html").read_text()
url = re.search(r'const SUPABASE_URL = "[^"]*";', old).group(0)
key = re.search(r'const SUPABASE_KEY = "[^"]*";', old).group(0)
sync = (root / "tools/sync.js").read_text().replace('const SUPABASE_URL = "";', url).replace('const SUPABASE_KEY = "";', key)
defaults = re.search(r'store\.prefs = Object\.assign\((\{[^}]*\})', s).group(1)
sync = re.sub(r'Object\.assign\(\{auto:true[^}]*\}', 'Object.assign(' + defaults, sync)

def rep(o, n):
    global s
    assert s.count(o) == 1, (o[:70], s.count(o))
    s = s.replace(o, n)

a = s.index("let remoteRef = null"); b = s.index("/* ---------- app state ---------- */")
s = s[:a] + sync + "\n" + s[b:]
s = re.sub(r'<span class="sync" id="sync" data-s="local"><i></i><span id="syncText">[^<]*</span></span>',
           '<span class="sync" id="sync" data-s="local"><i></i><span id="syncText">Прогресс хранится на этом устройстве</span></span>\n    <button class="link" id="acctBtn" hidden>Войти</button>', s, count=1)
rep('  else if (mode==="dict") renderDict();\n', '  else if (mode==="dict") renderDict();\n  else if (mode==="account") renderAccount();\n')
rep('$("#reset").addEventListener', '$("#acctBtn").addEventListener("click", ()=>{ if (typeof view !== "undefined") view = "lesson"; mode = "account"; render(); panel.scrollIntoView({block:"start"}); });\n$("#reset").addEventListener')
rep('connect();\n</script>', 'connect();\nif ("serviceWorker" in navigator) window.addEventListener("load", ()=>{ navigator.serviceWorker.register("./sw.js").catch(()=>{}); });\n</script>')
rep('footer{font-size:12px;', '.auth{display:flex;flex-direction:column;gap:6px;max-width:420px}\n.auth label{font-size:13px;color:var(--muted)}\n.auth input{font:inherit;font-size:16px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--fg)}\n.auth .row{margin-top:8px}\nfooter{font-size:12px;')
rep('select,input[type=text]{', 'select,input[type=text],input[type=email],input[type=password]{')
assert not re.search(r'window\.claude|claude\.use|claude\.ai', s), "claude.ai references left"

t0 = s.index("<title>"); st_end = s.index("</style>") + len("</style>")
pre = old[:old.index("<title>")]
out = (pre + s[t0:st_end] +
       '\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>\n</head>\n<body>' +
       s[st_end:] + "\n</body>\n</html>\n")
(root / "index.html").write_text(out)
sw = (root / "sw.js").read_text()
n = int(re.search(r'"ko-study-v(\d+)"', sw).group(1)) + 1
(root / "sw.js").write_text(re.sub(r'"ko-study-v\d+"', f'"ko-study-v{n}"', sw))
print("built index.html,", len(out), "chars; cache", n)
