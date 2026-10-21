"use strict";
/* =============================================================================
   whiteprints · arranque: configuração, início de sessão, «quem sou eu», navegação, cópia de segurança
   ============================================================================= */

const app = document.getElementById("app");
const NAV = [["hoje", "Hoje"], ["agenda", "Agenda"], ["clientes", "Clientes"], ["trabalhos", "Trabalhos"], ["orcamentos", "Orçamentos"], ["tarefas", "Tarefas"], ["avencas", "Avenças"], ["catalogo", "Catálogo"], ["calculadora", "Calculadora"]];
const storeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const logoImg = (white) => h("img", { src: white ? "assets/logo-white.svg" : "assets/logo.svg", alt: "whiteprints", class: "logo" });

/* ---------- configuração da ligação ---------- */
function getConfig() {
  const c = window.WP_CONFIG || {};
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) return { url: c.SUPABASE_URL.trim(), key: c.SUPABASE_ANON_KEY.trim() };
  try { const s = JSON.parse(storeGet("wp_cfg") || "null"); if (s && s.url && s.key) return s; } catch { /* ignora */ }
  return null;
}
function screen(...kids) { clear(app).append(h("div", { class: "center-screen" }, h("div", { class: "card login" }, logoImg(false), kids))); }

function showSetup() {
  const url = h("input", { type: "text", placeholder: "https://xxxxxxxx.supabase.co", autocomplete: "off" });
  const key = h("input", { type: "text", placeholder: "chave «anon public» (começa por eyJ… ou sb_publishable_…)", autocomplete: "off" });
  const err = h("p", { class: "danger", hidden: true });
  screen(h("h1", { class: "serif" }, "Ligar à cloud"),
    h("p", { class: "muted" }, "Falta ligar esta página ao seu projeto Supabase. Cole os dois valores (Supabase → Project Settings → API). Ficam guardados só neste browser; para ficarem para sempre, ponha-os no ficheiro config.js."),
    h("form", { onsubmit: (e) => {
      e.preventDefault();
      const u = url.value.trim().replace(/\/+$/, ""), k = key.value.trim();
      if (!/^https?:\/\//.test(u) || k.length < 20) { err.textContent = "Confirme o endereço (https://…supabase.co) e a chave."; err.hidden = false; return; }
      storeSet("wp_cfg", JSON.stringify({ url: u, key: k }));
      location.reload();
    } }, h("label", { class: "field block" }, h("span", { class: "lab" }, "Project URL"), url),
    h("label", { class: "field block" }, h("span", { class: "lab" }, "Chave anon public"), key), err,
    h("button", { type: "submit", class: "btn primary wide-btn" }, "Guardar e continuar")));
}

/* ---------- início de sessão ---------- */
function showLogin(message) {
  const email = h("input", { type: "email", autocomplete: "username", required: true, value: storeGet("wp_last_email") || "" });
  const pass = h("input", { type: "password", autocomplete: "current-password", required: true });
  const err = h("p", { class: "danger", hidden: !message }, message || "");
  const go = h("button", { type: "submit", class: "btn primary wide-btn" }, "Entrar");
  screen(h("h1", { class: "serif" }, "Entrar"), h("p", { class: "muted" }, "Área privada da whiteprints."),
    h("form", { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; go.disabled = true; go.textContent = "A entrar…";
      const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      go.disabled = false; go.textContent = "Entrar";
      if (error) {
        err.textContent = /invalid login/i.test(error.message) ? "Email ou palavra-passe incorretos." : friendly(error);
        err.hidden = false; return;
      }
      storeSet("wp_last_email", email.value.trim());
      enter(data.session);
    } }, h("label", { class: "field block" }, h("span", { class: "lab" }, "Email"), email),
    h("label", { class: "field block" }, h("span", { class: "lab" }, "Palavra-passe"), pass), err, go));
  (email.value ? pass : email).focus();
}
async function logout() { await sb.auth.signOut(); showLogin(); }

async function enter(session) {
  S.email = (session.user.email || "").toLowerCase();
  screen(h("p", { class: "muted" }, "A carregar…"));
  let users;
  try { users = await API.users(); }
  catch (e) {
    screen(h("p", { class: "danger" }, friendly(e)), h("div", { class: "row-actions" }, btn("Tentar outra vez", () => enter(session), "primary"), btn("Terminar sessão", logout)));
    return;
  }
  if (!users.length) {
    screen(h("h1", { class: "serif" }, "Sem acesso"),
      h("p", {}, `A conta ${S.email} existe, mas não está na lista de pessoas autorizadas desta app.`),
      h("p", { class: "muted" }, "No Supabase, volte a correr o script supabase_setup.sql depois de criar o utilizador (ele autoriza quem já existe)."),
      btn("Terminar sessão", logout, "primary"));
    return;
  }
  S.users = users;
  const saved = Number(storeGet("wp_me:" + S.email));
  S.me = users.find((u) => u.id === saved) || null;
  if (!S.me) return pickMe();
  showApp();
}
function pickMe() {
  screen(h("h1", { class: "serif" }, "Quem está a usar?"), h("p", { class: "muted" }, "Serve para mostrar as suas tarefas e marcar quem faz o quê. Pode trocar a qualquer momento."),
    h("div", { class: "pick" }, S.users.map((u) => btn(u.name, () => { S.me = u; storeSet("wp_me:" + S.email, String(u.id)); showApp(); }, "primary"))));
}

/* ---------- estrutura da app e navegação ---------- */
let shellBuilt = false, lastRender = 0, renderToken = 0;
function showApp() {
  clear(app);
  const nav = h("nav", { class: "side" }, h("div", { class: "top" }, h("a", { href: "#/hoje", class: "brand", "aria-label": "Início" }, logoImg(true)),
    h("div", { class: "nav-links" }, NAV.map(([k, t]) => h("a", { href: `#/${k}`, "data-k": k }, t)))),
    h("div", { class: "spacer" }),
    h("div", { class: "side-foot" },
      h("div", { class: "me" }, h("span", {}, "Sessão de "), h("b", {}, S.me.name)),
      h("button", { type: "button", class: "ghost", onclick: pickMe }, "Trocar de pessoa"),
      h("button", { type: "button", class: "ghost", onclick: exportBackup }, "Cópia de segurança"),
      h("button", { type: "button", class: "ghost", onclick: logout }, "Terminar sessão")));
  app.append(h("div", { class: "shell" }, nav, h("main", { id: "view" })));
  if (!shellBuilt) {
    window.addEventListener("hashchange", () => renderPage());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && S.me && Date.now() - lastRender > 20000 && !document.querySelector("dialog[open]")) renderPage();
    });
    shellBuilt = true;
  }
  if (!location.hash || location.hash === "#") location.hash = "#/hoje"; else renderPage();
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return { page: parts[0] || "hoje", id: parts[1] ? Number(parts[1]) : null };
}
window.renderPage = async function renderPage() {
  const view = document.getElementById("view");
  if (!view || !S.me) return;
  const { page, id } = parseRoute();
  const token = ++renderToken;
  document.querySelectorAll(".nav-links a").forEach((a) => a.classList.toggle("on", a.dataset.k === page));
  const scroll = view.scrollTop;
  const fresh = h("div", { class: "page" });
  try {
    if (page === "clientes" && id) await pageClient(fresh, id);
    else if (page === "clientes") await pageClients(fresh);
    else if (page === "trabalhos") await pageJobs(fresh);
    else if (page === "agenda") await pageAgenda(fresh);
    else if (page === "orcamentos") await pageQuotes(fresh);
    else if (page === "tarefas") await pageTasks(fresh);
    else if (page === "avencas") await pageRetainers(fresh);
    else if (page === "catalogo") await pageCatalog(fresh);
    else if (page === "calculadora") await pageCalc(fresh);
    else await pageToday(fresh);
  } catch (e) {
    fresh.append(h("p", { class: "danger" }, friendly(e)), btn("Tentar outra vez", () => renderPage(), "primary"));
  }
  if (token !== renderToken) return;   // entretanto abriu-se outro ecrã
  clear(view).append(fresh);
  view.scrollTop = scroll;
  lastRender = Date.now();
  document.title = "whiteprints";
};

/* ---------- cópia de segurança: um ZIP com um CSV por tabela ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4],
      [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}
function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
async function exportBackup() {
  const r = await run(async () => {
    const dump = await API.dump(), enc = new TextEncoder(), day = todayISO();
    const files = Object.entries(dump).map(([name, rows]) => ({ name: `${name}.csv`, data: enc.encode("﻿" + toCsv(rows)) }));
    files.push({ name: "LEIA-ME.txt", data: enc.encode(`Cópia de segurança da whiteprints — ${day}\r\nUm ficheiro CSV por tabela (abre no Excel/Numbers).\r\nOs ficheiros de clientes (artes, provas…) não vão aqui: continuam guardados no Supabase.\r\n`) });
    const url = URL.createObjectURL(zipStore(files));
    const a = h("a", { href: url, download: `whiteprints-copia-${day}.zip` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  if (r.ok) await inform("Cópia de segurança criada", "O ficheiro whiteprints-copia-….zip foi descarregado (pasta Transferências). Tem uma folha CSV por tabela. Os ficheiros de clientes continuam guardados na cloud e não vão neste ZIP.");
}

/* ---------- arranque ---------- */
(async function start() {
  const cfg = getConfig();
  if (!cfg) return showSetup();
  if (!window.supabase) { screen(h("p", { class: "danger" }, "Não foi possível carregar a biblioteca do Supabase (vendor/supabase.js).")); return; }
  sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && S.me) { S.me = null; showLogin(); } });
  const { data } = await sb.auth.getSession();
  if (data && data.session) enter(data.session); else showLogin();
})();
