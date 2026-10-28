"use strict";
/* =============================================================================
   whiteprints · núcleo: formatação, valores, ligação ao Supabase e componentes base
   (sem frameworks, sem passo de compilação)
   ============================================================================= */

/* ---------- listas e nomes ---------- */
const JOB_STATUSES = ["Em orçamento", "Adjudicado", "Em produção", "Completo", "Entregue"];
const CLIENT_SOURCES = ["formulario", "email", "whatsapp", "telefone", "recomendacao", "redes sociais", "presencial", "outro"];
const CLIENT_STATUSES = ["lead", "ativo", "recorrente", "inativo"];
const CATEGORIES = ["impressao", "vinil de recorte", "textil dtf", "redes sociais", "foto e video", "design", "mao de obra", "outro"];
const QUOTE_STATUSES = ["rascunho", "enviado", "aceite", "recusado"];
const TASK_STATUSES = ["por fazer", "em curso", "feito"];
const FILE_KINDS = ["briefing", "arte final", "prova", "contrato", "fatura", "foto", "video", "orçamento", "outro"];
const PRIORITIES = { 1: "Baixa", 2: "Normal", 3: "Alta", 4: "Urgente" };
const PRIORITY_COLORS = { 1: "#b9b6ae", 2: "#8a877f", 3: "#d48a1c", 4: "#c0392b" };
const BUCKET = "whiteprints-files";

const LABELS = {
  formulario: "Formulário do site", email: "E-mail", whatsapp: "WhatsApp", telefone: "Telefone", recomendacao: "Recomendação",
  "redes sociais": "Redes sociais", presencial: "Presencial", outro: "Outro",
  lead: "Lead", ativo: "Ativo", recorrente: "Recorrente", inativo: "Inativo",
  impressao: "Impressão", "vinil de recorte": "Vinil de Recorte", "textil dtf": "Têxtil DTF", "foto e video": "Foto e vídeo", design: "Design", "mao de obra": "Mão de Obra", "orçamento": "Orçamento",
  rascunho: "Rascunho", enviado: "Enviado", aceite: "Aceite", recusado: "Recusado",
  "por fazer": "Por fazer", "em curso": "Em curso", feito: "Feito",
  ativa: "Ativa", pausada: "Pausada", terminada: "Terminada",
  briefing: "Briefing", "arte final": "Arte final", prova: "Prova", contrato: "Contrato",
  fatura: "Fatura", foto: "Foto", video: "Vídeo",
  reuniao: "Reunião", instalacao: "Instalação", visita: "Visita a cliente", entrega: "Entrega",
};
const label = (v) => (v == null || v === "" ? "—" : LABELS[v] || v);
const opts = (values) => values.map((v) => ({ label: label(v), value: v }));

const STATUS_COLORS = {
  "Em orçamento": ["#efede7", "#5b5851"], Adjudicado: ["#e3eaf4", "#2d4b78"], "Em produção": ["#f7ebd0", "#85570b"],
  Completo: ["#dbeee3", "#24604a"], Entregue: ["#e6e4df", "#3d3b36"],
  rascunho: ["#efede7", "#5b5851"], enviado: ["#e3eaf4", "#2d4b78"], aceite: ["#dbeee3", "#24604a"], recusado: ["#f3dedb", "#8f2d1f"],
  reuniao: ["#e3eaf4", "#2d4b78"], instalacao: ["#f7ebd0", "#85570b"], visita: ["#dbeee3", "#24604a"], entrega: ["#e6e4df", "#3d3b36"],
  lead: ["#efede7", "#5b5851"], ativo: ["#dbeee3", "#24604a"], recorrente: ["#e3eaf4", "#2d4b78"], inativo: ["#e6e4df", "#77746c"],
  "por fazer": ["#efede7", "#5b5851"], "em curso": ["#f7ebd0", "#85570b"], feito: ["#dbeee3", "#24604a"],
  ativa: ["#dbeee3", "#24604a"], pausada: ["#f7ebd0", "#85570b"], terminada: ["#e6e4df", "#77746c"],
};

const COMPANY = {
  name: "whiteprints", tagline: "Artes Gráficas e Design", place: "Silves, Algarve",
  email: "info@whiteprints.pt", phone: "+351 915 645 596", web: "www.whiteprints.pt",
};

/* ---------- datas (sempre texto AAAA-MM-DD, na hora do computador de quem usa) ---------- */
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const pad2 = (n) => String(n).padStart(2, "0");

function isoOf(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function todayISO() { return isoOf(new Date()); }
function isoOfTimestamp(ts) { return ts ? isoOf(new Date(ts)) : null; }
function addDaysISO(iso, n) { const [y, m, d] = iso.split("-").map(Number); return isoOf(new Date(y, m - 1, d + n)); }
function daysBetween(aISO, bISO) {
  const t = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(bISO) - t(aISO)) / 86400000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const thisYear = Number(todayISO().slice(0, 4));
  return `${d} ${MONTHS_SHORT[m - 1]}${y === thisYear ? "" : " " + y}`;
}
function fmtDateFull(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}
function dueLabel(iso) {
  if (!iso) return "sem prazo";
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n < 0 ? `há ${-n} dias` : `em ${n} dias`;
}
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/* ---------- dinheiro e números (euros inteiros em cêntimos) ---------- */
const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const eur = (cents) => eurFmt.format((cents || 0) / 100).replace(/ /g, " ");
function centsText(cents) {
  const c = Math.round(cents || 0), sign = c < 0 ? "-" : "";
  return `${sign}${Math.floor(Math.abs(c) / 100)},${pad2(Math.abs(c) % 100)}`;
}
function parseNumber(text) {
  let t = String(text ?? "").trim().replace(/\s/g, "").replace("€", "");
  if (t === "") throw new Error("vazio");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("número inválido");
  return n;
}
function parseEur(text) {
  const t = String(text ?? "").trim();
  return t === "" ? 0 : Math.round(parseNumber(t) * 100);
}
function numText(v, dec = 2) {
  const n = Number(v), k = 10 ** dec;
  return Number.isFinite(n) ? String(Math.round(n * k) / k).replace(".", ",") : "";
}

/* Arredondamento "meio para cima", igual ao da base de dados e ao da app do Mac:
   líquido = floor((qtd*100*preço + 50) / 100) ; IVA = floor((líquido*taxa*100 + 5000) / 10000). */
const lineNet = (qty, unitCents) => Math.floor((Math.round(qty * 100) * unitCents + 50) / 100);
const lineVat = (net, rate) => Math.floor((net * Math.round(rate * 100) + 5000) / 10000);
function totalsOf(lines, withCost) {
  let net = 0, vat = 0, cost = 0;
  for (const l of lines) {
    const n = lineNet(l.quantity, l.unit_price_cents);
    net += n;
    vat += lineVat(n, l.vat_rate);
    if (withCost) cost += lineNet(l.quantity, l.unit_cost_cents || 0);
  }
  return { net_cents: net, vat_cents: vat, gross_cents: net + vat, cost_cents: cost, margin_cents: net - cost };
}


/* cobrança: só trabalhos Completo/Entregue ainda não pagos; em atraso 1 dia depois de ficarem Completo */
function payInfo(j, gross) {
  if (!j || j.paid || (j.status !== "Completo" && j.status !== "Entregue")) return null;
  const total = gross != null ? gross : (j.gross_cents != null ? j.gross_cents : null);
  const missing = total == null ? null : Math.max(total - Number(j.paid_amount_cents || 0), 0);
  if (missing === 0) return null;
  const since = j.ready_on ? daysBetween(j.ready_on, todayISO()) : 0;
  return { missing, since, overdue: since >= 1 };
}
const payText = (pi) => (pi.missing == null ? "" : ` · falta ${eur(pi.missing)}`);

/* ---------- texto ---------- */
function slug(text) {
  const s = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (s || "ficheiro").slice(0, 80);
}
const matches = (q, ...fields) => {
  q = (q || "").trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? "").toLowerCase().includes(q));
};

/* ---------- DOM ---------- */
/* append() que ignora null/false e aceita listas — evita que «null» apareça escrito no ecrã. */
const _append = Element.prototype.append;
Element.prototype.append = function (...kids) { return _append.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") value = v;
    else if (k in el && !k.includes("-")) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  if (value !== undefined) el.value = value;
  return el;
}
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- componentes visuais ---------- */
function btn(text, onclick, variant, attrs) {
  return h("button", { type: "button", class: "btn" + (variant ? " " + variant : ""), onclick, ...(attrs || {}) }, text);
}
function pill(status, text) {
  const [bg, fg] = STATUS_COLORS[status] || ["#efede7", "#5b5851"];
  return h("span", { class: "pill", style: { background: bg, color: fg } }, text || label(status));
}
function priorityCell(p) {
  return h("span", { class: "prio" }, h("i", { style: { background: PRIORITY_COLORS[p] || "#8a877f" } }), PRIORITIES[p] || "—");
}
function dueCell(iso, deliveredOn, done) {
  if (done) return deliveredOn ? `Entregue ${fmtDate(deliveredOn)}` : "—";
  if (!iso) return { t: "sem prazo", c: "muted" };
  const late = daysBetween(todayISO(), iso) < 0;
  return { t: `${fmtDate(iso)} · ${dueLabel(iso)}`, c: late ? "danger" : "", b: late };
}
const moneyCell = (c) => ({ t: eur(c), r: true });
function emptyNote(text) { return h("p", { class: "empty" }, text); }
function sectionLabel(text) { return h("h3", { class: "section" }, text); }
function pageHeader(title, ...actions) { return h("div", { class: "page-head" }, h("h1", {}, title), h("div", { class: "spacer" }), actions); }
function card(...kids) { return h("div", { class: "card" }, kids); }

/* Tabela. rows: [{cells:[…], onClick, key}] ; célula = texto | Node | {t, b, r, c}  */
function table(headers, rows, { empty = "Sem resultados." } = {}) {
  if (!rows.length) return emptyNote(empty);
  const cell = (c) => {
    if (c instanceof Node || typeof c === "string" || typeof c === "number" || c == null) return h("td", {}, c ?? "—");
    const content = c.node || c.t;
    return h("td", { class: [c.r ? "r" : "", c.c || "", c.b ? "b" : ""].join(" ").trim() }, content);
  };
  const thead = h("thead", {}, h("tr", {}, headers.map((x, i) => {
    const right = typeof x === "object" && x.r;
    return h("th", { class: right ? "r" : "" }, typeof x === "object" ? x.t : x);
  })));
  const tbody = h("tbody", {}, rows.map((r) => h("tr", {
    class: r.onClick ? "click" : "", onclick: r.onClick ? (e) => { if (!e.target.closest("button,input,a,select,label")) r.onClick(r); } : null,
    tabindex: r.onClick ? 0 : null,
    onkeydown: r.onClick ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) r.onClick(r); } : null,
  }, r.cells.map(cell))));
  return h("div", { class: "table-wrap" }, h("table", { class: "data" }, thead, tbody));
}

/* ---------- janelas ---------- */
function openModal({ title, wide, body, onClose }) {
  return new Promise((resolve) => {
    let result;
    const dlg = h("dialog", { class: "modal" + (wide ? " wide" : "") });
    const close = (v) => { result = v; dlg.close(); };
    const head = h("div", { class: "modal-head" },
      h("h2", {}, title), h("div", { class: "spacer" }),
      h("button", { type: "button", class: "x", "aria-label": "Fechar", onclick: () => close(undefined) }, "×"));
    const content = body(close, dlg);
    dlg.append(head, content);
    dlg.addEventListener("close", () => { dlg.remove(); if (onClose) onClose(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    const first = dlg.querySelector("[autofocus]") || dlg.querySelector("input:not([type=checkbox]),select,textarea");
    if (first && !dlg.querySelector("[autofocus]")) first.focus();
  });
}
async function confirmDialog(title, message, { yes = "Confirmar", danger = false } = {}) {
  const r = await openModal({
    title, body: (close) => h("div", { class: "modal-body" }, h("p", {}, message),
      h("div", { class: "modal-foot" }, h("div", { class: "spacer" }),
        btn("Cancelar", () => close(false)), h("button", { type: "button", class: "btn " + (danger ? "danger-solid" : "primary"), autofocus: true, onclick: () => close(true) }, yes))),
  });
  return r === true;
}
function inform(title, message, { error = false } = {}) {
  return openModal({
    title, body: (close) => h("div", { class: "modal-body" }, h("p", { class: error ? "danger" : "" }, message),
      h("div", { class: "modal-foot" }, h("div", { class: "spacer" }), h("button", { type: "button", class: "btn primary", autofocus: true, onclick: () => close() }, "Ok"))),
  });
}
/* ---------- telefones: +351 912 345 678 ---------- */
// Devolve o número formatado, "" se vazio, ou null se for inválido.
function fmtPhone(raw) {
  let t = String(raw == null ? "" : raw).trim();
  if (!t) return "";
  let plus = t.startsWith("+");
  let d = t.replace(/\D/g, "");
  if (!plus && d.startsWith("00")) { plus = true; d = d.slice(2); }
  if (!plus) { if (d.length === 9) d = "351" + d; else if (d.startsWith("351") && d.length === 12) { /* já tem indicativo */ } else return null; }
  if (d.length < 8 || d.length > 15) return null;
  let cc;
  if (d.startsWith("351")) cc = "351";
  else if (/^[17]/.test(d)) cc = d.slice(0, 1);
  else if (/^(2[1-9]|35|37|38|42|50|59|67|68|69|80|85|88|96|97|98|99)/.test(d)) cc = d.slice(0, 3);
  else cc = d.slice(0, 2);
  const rest = d.slice(cc.length);
  if (cc === "351" && rest.length !== 9) return null;
  const g = rest.match(/\d{1,3}/g);
  if (g.length > 1 && g[g.length - 1].length < 3) { const last = g.pop(); g[g.length - 1] += last; }
  return `+${cc} ${g.join(" ")}`;
}
// Para usar em validate(): normaliza v.phone e devolve mensagem se inválido.
function checkPhone(v) {
  const f = fmtPhone(v.phone);
  if (f === null) return "Telefone inválido. Use por exemplo +351 912 345 678 (9 dígitos, ou indicativo + número).";
  v.phone = f || null;
  return null;
}

let toastTimer;
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status" }); document.body.append(el); }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* Formulário genérico em janela. Devolve os valores, null se cancelou, ou DELETE se carregou em «Apagar». */
const DELETE = Symbol("delete");
function formDialog({ title, fields, values = {}, ok = "Guardar", required = [], intro, validate, onDelete, wide, extra }) {
  const inputs = {};
  const err = h("p", { class: "danger form-error", hidden: true });
  const rows = fields.map((f) => {
    const v = values[f.key];
    let input;
    if (f.type === "textarea") input = h("textarea", { rows: f.rows || 3, value: v ?? "", placeholder: f.placeholder });
    else if (f.type === "select") {
      const list = f.options || [];
      input = h("select", {}, f.none != null ? h("option", { value: "" }, f.none) : null,
        list.map((o, i) => h("option", { value: String(i) }, o.label)));
      const idx = list.findIndex((o) => String(o.value) === String(v));
      input.value = idx >= 0 ? String(idx) : (f.none != null ? "" : "0");
      input._options = list;
    } else if (f.type === "date") input = h("input", { type: "date", value: v || "" });
    else if (f.type === "time") input = h("input", { type: "time", value: v ? String(v).slice(0, 5) : "" });
    else if (f.type === "money") input = h("input", { type: "text", inputMode: "decimal", value: v != null ? centsText(v) : "", placeholder: "0,00" });
    else if (f.type === "number") input = h("input", { type: "text", inputMode: "decimal", value: v != null ? numText(v, f.dec ?? 2) : (f.def ?? "") });
    else if (f.type === "int") input = h("input", { type: "number", min: f.min, max: f.max, step: 1, value: v ?? f.def ?? "" });
    else if (f.type === "checkbox") input = h("input", { type: "checkbox", checked: v != null ? !!v : !!f.def });
    else input = h("input", { type: "text", value: v ?? "", placeholder: f.placeholder, autocomplete: "off" });
    input.dataset.key = f.key;
    inputs[f.key] = input;
    if (f.type === "checkbox") return h("div", { class: "field" }, h("span", { class: "lab" }), h("label", { class: "check" }, input, f.text || f.label));
    return h("label", { class: "field" }, h("span", { class: "lab" }, f.label + (required.includes(f.key) ? " *" : "")), input);
  });

  const read = () => {
    const out = {};
    for (const f of fields) {
      const el = inputs[f.key];
      if (f.type === "checkbox") out[f.key] = el.checked;
      else if (f.type === "select") out[f.key] = el.value === "" ? null : el._options[Number(el.value)].value;
      else if (f.type === "date" || f.type === "time") out[f.key] = el.value || null;
      else if (f.type === "money") { try { out[f.key] = parseEur(el.value); } catch { throw new Error(`«${f.label}»: valor inválido.`); } }
      else if (f.type === "number") { try { out[f.key] = el.value.trim() === "" ? null : parseNumber(el.value); } catch { throw new Error(`«${f.label}»: número inválido.`); } }
      else if (f.type === "int") out[f.key] = el.value === "" ? null : Number(el.value);
      else out[f.key] = el.value.trim() || null;
    }
    return out;
  };

  return openModal({
    title, wide, body: (close) => {
      const submit = () => {
        try {
          const vals = read();
          const missing = fields.find((f) => required.includes(f.key) && (vals[f.key] == null || vals[f.key] === ""));
          if (missing) throw new Error(`Falta preencher «${missing.label}».`);
          const problem = validate && validate(vals);
          if (problem) throw new Error(problem);
          close(vals);
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      };
      const form = h("form", { class: "modal-body", onsubmit: (e) => { e.preventDefault(); submit(); } },
        intro ? h("p", { class: "muted" }, intro) : null, h("div", { class: "form-grid" }, rows), err,
        h("div", { class: "modal-foot" },
          onDelete ? btn("Apagar", async () => { if (await onDelete()) close(DELETE); }, "danger") : null,
          (extra || []).map((x) => btn(x.text, () => { try { x.onClick(read()); err.hidden = true; } catch (e) { err.textContent = e.message; err.hidden = false; } })),
          h("div", { class: "spacer" }), btn("Cancelar", () => close(null)),
          h("button", { type: "submit", class: "btn primary" }, ok)));
      return form;
    },
  }).then((r) => (r === undefined ? null : r));
}

/* ---------- ligação ao Supabase ---------- */
let sb = null;
function friendly(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Sem ligação à internet (ou ao Supabase). Tente outra vez daqui a pouco.";
  if (/JWT|expired|not authenticated/i.test(m)) return "A sessão expirou. Recarregue a página e volte a entrar.";
  if (/violates foreign key constraint/i.test(m)) return "Não é possível apagar: há trabalhos, orçamentos ou avenças ligados a este registo.";
  if (/permission denied|row-level security/i.test(m)) return "Sem permissão: este email não está na lista de pessoas autorizadas.";
  if (/violates unique constraint/i.test(m)) return "Já existe um registo igual.";
  return m;
}
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw new Error(friendly(error));
  return data;
}
/* Corre uma ação que fala com a base de dados; em caso de erro mostra-o e devolve {ok:false}. */
async function run(action) {
  try { return { ok: true, value: await action() }; }
  catch (e) { await inform("Não foi possível concluir", friendly(e), { error: true }); return { ok: false }; }
}

const API = {
  users: () => rpc("wp_list_users"),
  clients: () => rpc("wp_list_clients"),
  clientOverview: (id) => rpc("wp_client_overview", { p_id: id }),
  jobs: (client) => rpc("wp_list_jobs", { p_client: client ?? null }),
  job: (id) => rpc("wp_get_job", { p_id: id }),
  quotes: (client) => rpc("wp_list_quotes", { p_client: client ?? null }),
  quote: (id) => rpc("wp_get_quote", { p_id: id }),
  tasks: (assignee, showDone) => rpc("wp_list_tasks", { p_assignee: assignee ?? null, p_show_done: !!showDone }),
  retainers: () => rpc("wp_list_retainers", { p_client: null }),
  catalog: (activeOnly) => rpc("wp_list_catalog", { p_active_only: !!activeOnly }),
  files: (client, job, quote) => rpc("wp_list_files", { p_client: client ?? null, p_job: job ?? null, p_quote: quote ?? null }),
  events: (from, to, client, job) => rpc("wp_list_events", { p_from: from ?? null, p_to: to ?? null, p_client: client ?? null, p_job: job ?? null }),
  home: (me) => rpc("wp_home", { p_today: todayISO(), p_days: 7, p_me: me ?? null }),
  dump: () => rpc("wp_dump"),
  save: (table, data) => rpc("wp_upsert", { p_table: table, p_data: data }),
  remove: (table, id) => rpc("wp_delete", { p_table: table, p_id: id }),
  deleteFile: (id) => rpc("wp_delete_file", { p_id: id }),
  markJobPaid: (id) => rpc("wp_mark_job_paid", { p_id: id }),
  completeTask: (id) => rpc("wp_complete_task", { p_id: id, p_today: todayISO() }),
  reopenTask: (id) => rpc("wp_reopen_task", { p_id: id }),
  saveQuote: (data, lines) => rpc("wp_save_quote", { p_data: data, p_lines: lines, p_today: todayISO() }),
  setQuoteStatus: (id, st) => rpc("wp_set_quote_status", { p_id: id, p_status: st }),
  deleteQuote: (id) => rpc("wp_delete_quote", { p_id: id }),
  deleteJob: (id, withQuote) => rpc("wp_delete_job", { p_id: id, p_delete_quote: !!withQuote }),
  deleteClient: (id) => rpc("wp_delete_client", { p_id: id }),
  rolls: () => rpc("wp_list_rolls"),
  vinyls: () => rpc("wp_list_vinyls"),
  tapes: () => rpc("wp_list_tapes"),
  calcSettings: () => rpc("wp_get_calc"),
  saveCalcSettings: (data) => rpc("wp_save_calc", { p_data: data }),
  setGoal: (cents) => rpc("wp_set_goal", { p_cents: cents }),
  acceptQuote: (id, v) => rpc("wp_accept_quote", {
    p_id: id, p_title: v.title, p_category: v.category, p_due: v.due_date, p_owner: v.owner_id, p_priority: v.priority, p_today: todayISO(),
  }),
  saveJob: (data, items) => rpc("wp_save_job", { p_data: data, p_items: items, p_today: todayISO() }),
  setJobStatus: (id, st) => rpc("wp_set_job_status", { p_id: id, p_status: st, p_today: todayISO() }),
  duplicateJob: (id, title, due) => rpc("wp_duplicate_job", { p_id: id, p_title: title || "", p_due: due, p_today: todayISO() }),
};
