/* ---------- cloud sync (Supabase) ---------- */
// Fill these two values from Supabase → Project Settings → API. The publishable (anon) key is meant to be public:
// row-level security on the `progress` table lets each signed-in person read and write only their own row.
const SUPABASE_URL = "";
const SUPABASE_KEY = "";
const sb = (SUPABASE_URL && SUPABASE_KEY && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let sbUser = null, saveTimer = null, writing = false, dirty = false, pulling = false;
const SYNC_TEXT = {
  off: "Прогресс хранится только на этом устройстве: синхронизация ещё не настроена.",
  local: "Прогресс хранится только на этом устройстве. Войдите, чтобы он был одинаковым на всех ваших устройствах.",
  connecting: "Проверяю облако…",
  saving: "Сохраняю…",
  saved: "Прогресс сохранён в облаке и одинаков на всех ваших устройствах",
  error: "Нет связи с облаком. Прогресс сохранён на этом устройстве и отправится позже."
};
function setSync(s){
  if (s === "off" && SUPABASE_URL && SUPABASE_KEY) s = "error";
  $("#sync").dataset.s = s; $("#syncText").textContent = SYNC_TEXT[s];
  const b = $("#acctBtn"); b.hidden = !sb; b.textContent = sbUser ? "Аккаунт" : "Войти";
}
function queueRemote(){ if (!sbUser) return; dirty = true; setSync("saving"); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1200); }
async function flush(){
  if (!sbUser || writing || !dirty) return;
  writing = true; dirty = false;
  let error = null;
  try { ({ error } = await sb.from("progress").upsert({ user_id: sbUser.id, data: JSON.parse(JSON.stringify(store)), updated_at: new Date().toISOString() })); }
  catch(e){ error = e; }
  writing = false;
  if (error){ dirty = true; setSync("error"); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 8000); return; }
  if (dirty){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1200); } else setSync("saved");
}
function applyRemote(r){
  store = JSON.parse(JSON.stringify(r));
  store.lessons = store.lessons || {};
  store.prefs = Object.assign({auto:true, slow:false, writeDir:"ru"}, store.prefs || {});
  saveLocal(); syncPrefsUI(); updateStats();
  if (mode === "dict") drawDictList();
}
async function pull(){
  if (!sbUser || pulling || writing) return;
  pulling = true;
  try {
    const { data, error } = await sb.from("progress").select("data").eq("user_id", sbUser.id).maybeSingle();
    if (error){ setSync("error"); return; }
    const r = data && data.data;
    if (!r || !r.lessons){ if (hasProgress()){ dirty = true; flush(); } else setSync("saved"); return; }
    const ru = r.updatedAt || 0, lu = store.updatedAt || 0;
    if (ru > lu){ applyRemote(r); setSync("saved"); }
    else if (ru < lu){ dirty = true; flush(); }
    else setSync(dirty ? "saving" : "saved");
  } catch(e){ setSync("error"); }
  finally { pulling = false; }
}
async function connect(){
  if (!sb){ setSync("off"); return; }
  try { const { data } = await sb.auth.getSession(); sbUser = data.session ? data.session.user : null; } catch(e){ sbUser = null; }
  sb.auth.onAuthStateChange((ev, session) => {
    const u = session ? session.user : null;
    const changed = (u && u.id) !== (sbUser && sbUser.id);
    sbUser = u;
    if (!changed) return;
    // supabase-js: don't await other client calls inside this callback
    setTimeout(() => { if (u){ setSync("connecting"); pull(); } else setSync("local"); if (mode === "account") renderAccount(); }, 0);
  });
  if (sbUser){ setSync("connecting"); pull(); } else setSync("local");
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); else if (dirty){ clearTimeout(saveTimer); flush(); } });
  setInterval(() => { if (document.visibilityState === "visible" && !dirty) pull(); }, 60000);
}

/* ---------- account screen ---------- */
const AUTH_ERR = [
  [/invalid login credentials/i, "Неверная почта или пароль."],
  [/email not confirmed/i, "Сначала подтвердите почту: откройте письмо от Supabase и нажмите ссылку."],
  [/already registered|already been registered/i, "Такой аккаунт уже есть. Нажмите «Войти»."],
  [/password should be at least|password.*characters/i, "Пароль должен быть не короче 6 символов."],
  [/signups? not allowed|signup is disabled/i, "Регистрация новых аккаунтов выключена."],
  [/rate limit/i, "Слишком много попыток. Подождите минуту и попробуйте снова."],
  [/fetch|network/i, "Нет связи с интернетом."]
];
const authMsg = e => { const m = (e && e.message) || String(e); for (const [re, t] of AUTH_ERR) if (re.test(m)) return t; return m; };
function renderAccount(){
  if (!sb){ panel.innerHTML = `<div class="empty">Синхронизация ещё не настроена.</div>`; return; }
  if (sbUser){
    panel.innerHTML = `
      <div class="meta"><span>Аккаунт</span></div>
      <p>Вы вошли как <b id="acctEmail"></b>. Прогресс сохраняется в облаке и одинаков на всех устройствах, где вы вошли.</p>
      <div class="row"><button class="btn-main" id="syncNow">Синхронизировать сейчас</button><button id="signOut">Выйти</button></div>
      <p class="note" id="acctMsg" role="status"></p>`;
    $("#acctEmail").textContent = sbUser.email || "";
    $("#syncNow").addEventListener("click", async ()=>{ $("#acctMsg").textContent = "Синхронизирую…"; if (dirty){ clearTimeout(saveTimer); await flush(); } await pull(); $("#acctMsg").textContent = $("#syncText").textContent; });
    $("#signOut").addEventListener("click", async ()=>{ if (dirty){ clearTimeout(saveTimer); await flush(); } await sb.auth.signOut(); });
    return;
  }
  panel.innerHTML = `
    <div class="meta"><span>Вход для синхронизации</span></div>
    <p>Войдите на каждом устройстве под одной почтой — прогресс будет одинаковым везде. В первый раз нажмите «Создать аккаунт».</p>
    <form id="authForm" class="auth" autocomplete="on">
      <label for="authEmail">Почта</label>
      <input type="email" id="authEmail" autocomplete="email" required>
      <label for="authPass">Пароль (не короче 6 символов)</label>
      <input type="password" id="authPass" autocomplete="current-password" minlength="6" required>
      <div class="row"><button class="btn-main" type="submit" id="signIn">Войти</button><button type="button" id="signUp">Создать аккаунт</button></div>
    </form>
    <p class="note" id="acctMsg" role="status"></p>`;
  const msg = t => { $("#acctMsg").textContent = t; };
  const creds = () => ({ email: $("#authEmail").value.trim(), password: $("#authPass").value });
  $("#authForm").addEventListener("submit", async e=>{
    e.preventDefault(); msg("Вхожу…");
    try { const { error } = await sb.auth.signInWithPassword(creds()); msg(error ? authMsg(error) : ""); } catch(err){ msg(authMsg(err)); }
  });
  $("#signUp").addEventListener("click", async ()=>{
    const c = creds();
    if (!c.email || c.password.length < 6){ msg("Введите почту и пароль не короче 6 символов."); return; }
    msg("Создаю аккаунт…");
    try {
      const { data, error } = await sb.auth.signUp({ ...c, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) msg(authMsg(error));
      else if (!data.session) msg("Готово. Мы отправили письмо на " + c.email + ": откройте его, нажмите ссылку для подтверждения, затем вернитесь сюда и нажмите «Войти».");
      else msg("");
    } catch(err){ msg(authMsg(err)); }
  });
}
