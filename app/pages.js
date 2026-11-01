"use strict";
/* =============================================================================
   whiteprints · ecrãs: Hoje, Clientes (+ ficha), Trabalhos, Orçamentos, Tarefas, Avenças, Catálogo
   ============================================================================= */

const F = {   // filtros que se mantêm enquanto a janela está aberta
  jobs: { status: "open", owner: "", q: "" }, quotes: { status: "all", q: "" }, clients: { q: "" },
  tasks: { who: "me", done: false, q: "" }, clientTab: "Trabalhos", pendingJobStatus: null,
};

const payLabel = (j) => {
  const pi = payInfo(j);
  if (pi) return h("span", { class: pi.overdue ? "danger" : "warn" }, (pi.overdue ? "Em atraso" : "Por cobrar") + payText(pi));
  return j.paid ? "Pago" : Number(j.paid_amount_cents) > 0 ? `Parcial · ${eur(j.paid_amount_cents)}` : "Por pagar";
};
function searchBox(placeholder, value, onInput) {
  return h("input", { type: "search", class: "search", placeholder, value, oninput: debounce((e) => onInput(e.target.value), 120) });
}
function selectBox(options, value, onChange) {
  const s = h("select", { onchange: (e) => onChange(e.target.value) }, options.map(([l, v]) => h("option", { value: v }, l)));
  s.value = value;
  return s;
}

/* ---------- Hoje ---------- */
async function pageToday(root) {
  const a = await API.home(S.me && S.me.id);
  const hour = new Date().getHours();
  const hello = hour < 6 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";
  const jobRow = (j) => rowCard(`${j.reference} · ${j.title}`, [j.client_name, `Prioridade ${PRIORITIES[j.priority].toLowerCase()}`].filter(Boolean).join(" · "),
    j.due_date, () => openJob({ jobId: j.id }), { status: j.status });
  const taskRow = (t) => rowCard(t.title, [t.client_name, t.job_ref].filter(Boolean).join(" · "), t.due_date,
    async () => { if (await editTask(t)) refresh(); }, { taskId: t.id });
  const kpis = h("div", { class: "kpis" }, JOB_STATUSES.map((st) => h("button", { type: "button", class: "card kpi", title: `Ver trabalhos «${st}»`,
    onclick: () => { F.jobs.status = st; location.hash = "#/trabalhos"; } }, h("span", { class: "num serif" }, String((a.counts || {})[st] || 0)), h("span", { class: "muted" }, st))));
  const shown = new Set([...a.overdue_tasks, ...a.due_tasks].map((t) => t.id));
  const evRow = (ev) => rowCard(`${ev.start_time ? fmtTime(ev.start_time) + " · " : ""}${ev.title}`, eventSubtitle(ev), ev.start_on < todayISO() ? todayISO() : ev.start_on,
    async () => { if (await editEvent(ev)) refresh(); }, { status: ev.kind });
  const proofRow = (j) => rowCard(`${j.reference} · ${j.title}`, [j.client_name, j.proof_kind === "design" ? "Prova digital (design)" : "Prova física (impressão)"].join(" · "),
    j.due_date, () => openJob({ jobId: j.id }), { status: j.proof_state });
  const unpaid = a.unpaid_jobs || [];
  const unpaidTotal = unpaid.reduce((t, j) => t + (payInfo(j) ? payInfo(j).missing || 0 : 0), 0);
  const unpaidRow = (j) => {
    const pi = payInfo(j); if (!pi) return null;
    return h("div", { class: "row-card", tabindex: 0, onclick: (e) => { if (!e.target.closest("button")) openJob({ jobId: j.id }); } },
      h("div", { class: "grow" }, h("b", {}, `${j.reference} · ${j.title}`), h("div", { class: "muted" }, [j.client_name, pi.since >= 1 ? `completo há ${pi.since} dia(s)` : "completo hoje"].join(" · "))),
      h("span", { class: pi.overdue ? "danger b" : "warn b" }, `${pi.overdue ? "Em atraso" : "Por cobrar"}${payText(pi)}`),
      btn("Marcar como pago", async () => { if ((await run(() => API.markJobPaid(j.id))).ok) { toast("Marcado como pago."); refresh(); } }));
  };
  const unpaidRows = unpaid.map(unpaidRow).filter(Boolean);
  const sections = [
    ["Agenda · próximos 7 dias", (a.events || []).map(evRow)],
    ["Provas", (a.proofs || []).map(proofRow)],
    ["Atrasado", [...a.overdue_jobs.map(jobRow), ...a.overdue_tasks.map(taskRow)]],
    [`Por cobrar${unpaidTotal ? " · " + eur(unpaidTotal) : ""}`, unpaidRows, true],
    ["Próximos 7 dias", [...a.due_jobs.map(jobRow), ...a.due_tasks.map(taskRow)]],
    ["As minhas tarefas", a.mine.filter((t) => !shown.has(t.id)).slice(0, 10).map(taskRow)],
  ].filter(([, rows]) => rows.length);
  root.append(h("h1", { class: "serif greet" }, `${hello}, ${S.me ? S.me.name : ""}`), h("p", { class: "muted" }, longDate(todayISO())),
    mindfulBox(), goalBox(a), compareStrip(a), kpis,
    sections.length ? sections.map(([t, rows, money]) => h("section", {}, sectionLabel(money ? `${t}  ·  ${rows.length} trabalho(s)` : `${t}  ·  ${rows.length}`), h("div", { class: "rows" }, rows)))
      : emptyNote("Nada atrasado nem a vencer esta semana. Boa altura para adiantar trabalho."));
}
/* Faturado no mês (total com IVA dos trabalhos que passaram a Completo/Entregue) vs objetivo partilhado. */
function goalBox(a) {
  const billed = Number(a.month_billed_cents || 0), goal = Number(a.month_goal_cents || 0);
  const now = new Date(), month = now.toLocaleDateString("pt-PT", { month: "long" });
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const pct = goal > 0 ? Math.round((billed / goal) * 100) : 0, C = 188.5;
  const reached = goal > 0 && billed >= goal, missing = Math.max(0, goal - billed);
  const svg = h("span", { class: "goal-ring" });
  svg.innerHTML = `<svg width="74" height="74" viewBox="0 0 74 74" role="img" aria-label="${pct}% do objetivo"><circle cx="37" cy="37" r="30" fill="none" stroke="#ebe8e0" stroke-width="9"/>`
    + `<circle cx="37" cy="37" r="30" fill="none" stroke="${reached ? "#24604a" : "#1d1d1b"}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(Math.min(pct, 100) / 100 * C).toFixed(1)} ${C}" transform="rotate(-90 37 37)"/>`
    + `<text x="37" y="42" text-anchor="middle" font-size="${pct >= 100 ? 14 : 16}" font-weight="700" fill="#1d1d1b">${pct}%</text></svg>`;
  const edit = async () => {
    const vals = await formDialog({
      title: "Objetivo mensal de faturação", values: { goal: goal / 100 }, ok: "Guardar", required: ["goal"],
      intro: "Valor a faturar neste mês (com IVA). É o mesmo para os dois. Os meses seguintes herdam este valor e os anteriores mantêm o que tinham.", fields: [{ key: "goal", label: "Objetivo (€)", type: "number", dec: 2 }],
      validate: (v) => (typeof v.goal === "number" && v.goal >= 0 ? null : "Indique um valor válido."),
    });
    if (vals && (await run(() => API.setGoal(Math.round(vals.goal * 100), todayISO().slice(0, 8) + "01"))).ok) { toast("Objetivo guardado."); refresh(); }
  };
  const tile = (lab, num, sub, cls) => h("div", { class: "t" }, h("span", { class: "lab2" }, lab), h("span", { class: "n serif " + (cls || "") }, num), sub);
  return h("div", { class: "goal" },
    h("div", { class: "t ring" }, svg, h("div", {}, h("div", { class: "lab2" }, month), h("div", { class: "muted small" }, "do objetivo mensal"))),
    tile("Faturado", eur(billed), h("span", { class: "muted small" }, "este mês")),
    tile("Objetivo", eur(goal), h("button", { type: "button", class: "linklike", onclick: edit }, "Editar")),
    reached ? tile("Excedido", "+" + eur(billed - goal), h("span", { class: "muted small" }, "objetivo atingido"), "ok")
      : tile("Falta", eur(missing), h("span", { class: "muted small" }, daysLeft === 0 ? "último dia do mês" : `${daysLeft} dia${daysLeft === 1 ? "" : "s"} até ao fim do mês`)));
}
/* Faixa discreta por baixo do objetivo: mês anterior (faturado, objetivo, o que faltou) e comparação com o mesmo dia. */
function compareStrip(a) {
  if (a.prev_month == null) return null;
  const [py, pm] = a.prev_month.split("-").map(Number), pname = MONTHS[pm - 1];
  const prevBilled = Number(a.prev_billed_cents || 0), prevGoal = Number(a.prev_goal_cents || 0);
  const same = Number(a.prev_billed_same_day_cents || 0), now = Number(a.month_billed_cents || 0);
  const day = Number(todayISO().slice(8, 10)), diff = now - same;
  const miss = Math.max(0, prevGoal - prevBilled);
  const cmp = prevBilled === 0 && now === 0 ? null
    : h("span", {}, `Hoje vs dia ${day} de ${pname}: `, h("b", { class: diff > 0 ? "ok" : diff < 0 ? "danger" : "" }, diff === 0 ? "igual" : `${diff > 0 ? "▲ +" : "▼ −"}${eur(Math.abs(diff))}`));
  void py;
  return h("div", { class: "strip" },
    h("span", {}, h("b", {}, pname.charAt(0).toUpperCase() + pname.slice(1))),
    h("span", {}, "Faturado ", h("b", {}, eur(prevBilled))),
    cmp,
    h("span", {}, "Objetivo ", h("b", {}, eur(prevGoal))),
    h("span", {}, miss > 0 ? ["Ficou a faltar ", h("b", {}, eur(miss))] : h("b", { class: "ok" }, "Objetivo atingido")),
    h("a", { href: `#/relatorio/${a.prev_month.slice(0, 7)}` }, "Ver relatório mensal →"));
}
function mindfulBox() {
  const m = momentoDoDia(), icon = h("span", { class: "mf-icon", title: m.nome });
  icon.innerHTML = m.svg;
  return h("div", { class: "mindful" }, h("div", { class: "mf-text" }, h("span", { class: "lab2" }, `Frase do dia · ${m.nome}`), h("q", {}, fraseDoDia())), icon);
}
function rowCard(title, subtitle, due, onClick, { status, taskId } = {}) {
  const late = due && daysBetween(todayISO(), due) < 0;
  return h("div", { class: "row-card", tabindex: 0, onclick: (e) => { if (!e.target.closest("input,label")) onClick(); }, onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) onClick(); } },
    taskId != null ? h("input", { type: "checkbox", title: "Marcar como feita", "aria-label": "Marcar como feita", onchange: async (e) => {
      if (e.target.checked && (await run(() => API.completeTask(taskId))).ok) refresh(); else e.target.checked = false; } }) : null,
    h("div", { class: "grow" }, h("b", {}, title), subtitle ? h("div", { class: "muted" }, subtitle) : null),
    status ? pill(status) : null,
    due ? h("span", { class: late ? "danger b" : "muted" }, `${fmtDate(due)} · ${dueLabel(due)}`) : null);
}

/* ---------- Clientes ---------- */
async function pageClients(root) {
  const clients = await API.clients();
  const tableHost = h("div");
  const draw = () => {
    const rows = clients.filter((c) => matches(F.clients.q, c.name, c.email, c.phone, c.tax_id)).map((c) => ({
      onClick: () => { location.hash = `#/clientes/${c.id}`; },
      cells: [{ t: c.name, b: true }, pill(c.status), label(c.source), [c.phone, c.email].filter(Boolean).join(" · ") || "—", { t: String(c.open_jobs), r: true }, { t: String(c.total_jobs), r: true }],
    }));
    clear(tableHost).append(table(["Cliente", "Estado", "Como chegou", "Contacto", { t: "Em curso", r: true }, { t: "Trabalhos", r: true }], rows,
      { empty: clients.length ? "Nenhum cliente corresponde à pesquisa." : "Ainda não há clientes. Comece por «+ Novo cliente»." }));
  };
  root.append(pageHeader("Clientes", btn("+ Novo cliente", async () => { const id = await editClient(null); if (id) location.hash = `#/clientes/${id}`; }, "primary")),
    h("div", { class: "filters" }, searchBox("Pesquisar por nome, email, telefone ou NIF…", F.clients.q, (v) => { F.clients.q = v; draw(); })), tableHost);
  draw();
}

async function pageClient(root, id) {
  const ov = await API.clientOverview(id);
  const c = ov.client;
  const [files] = [null];
  void files;
  const openJobs = ov.jobs.filter((j) => j.status !== "Entregue").length;
  const monthly = ov.retainers.filter((r) => r.status === "ativa").reduce((s, r) => s + r.monthly_price_cents, 0);
  const bits = [c.phone, c.email, c.tax_id ? `NIF ${c.tax_id}` : null, c.address, `Chegou por: ${label(c.source)}`, c.vendus_ref ? `Vendus: ${c.vendus_ref}` : null].filter(Boolean);
  const tabs = {
    Trabalhos: () => table(["Ref.", "Trabalho", "Estado", "Prioridade", "Prazo", "Pagamento", { t: "Valor s/ IVA", r: true }], ov.jobs.map((j) => ({
      onClick: () => openJob({ jobId: j.id }),
      cells: [j.reference, { t: j.title, b: true }, pill(j.status), priorityCell(j.priority), dueCell(j.due_date, j.delivered_on, j.status === "Entregue"), payLabel(j), moneyCell(j.net_cents)],
    })), { empty: "Este cliente ainda não tem trabalhos." }),
    Agenda: () => h("div", {}, h("div", { class: "toolbar" }, btn("+ Novo evento", async () => { if (await editEvent(null, { client_id: c.id })) refresh(); }, "primary")),
      eventsTable(ov.events || [], refresh)),
    Orçamentos: () => table(["Número", "Estado", "Emitido", "Válido até", { t: "Total c/ IVA", r: true }, "Trabalho"], ov.quotes.map((q) => ({
      onClick: () => openQuote({ quoteId: q.id }),
      cells: [{ t: q.number, b: true }, pill(q.status), fmtDate(q.issued_on), fmtDate(q.valid_until), moneyCell(q.gross_cents), q.job_ref || "—"],
    })), { empty: "Este cliente ainda não tem orçamentos." }),
    Ficheiros: () => filesPanel({ client: c }).el,
    Contactos: () => h("div", {}, h("div", { class: "toolbar" }, btn("+ Novo contacto", async () => { if (await editContact(c.id)) refresh(); }, "primary")),
      table(["Nome", "Cargo", "Email", "Telefone", "Principal", ""], ov.contacts.map((k) => ({
        onClick: async () => { if (await editContact(c.id, k)) refresh(); },
        cells: [{ t: k.name, b: true }, k.role || "—", k.email || "—", k.phone || "—", k.is_primary ? "✓" : "",
          { node: btn("Remover", async () => { if (await confirmDialog("Remover contacto", `Remover ${k.name}?`, { yes: "Remover", danger: true }) && (await run(() => API.remove("contacts", k.id))).ok) refresh(); }, "danger") }],
      })), { empty: "Sem contactos. Junte as pessoas com quem fala neste cliente." })),
    Avenças: () => h("div", {}, h("div", { class: "toolbar" }, btn("+ Nova avença", async () => { if (await editRetainer(null, c.id)) refresh(); }, "primary")),
      table(["Plano", { t: "Mensalidade", r: true }, "Dia", "Início", "Estado"], ov.retainers.map((r) => ({
        onClick: async () => { if (await editRetainer(r)) refresh(); },
        cells: [{ t: r.name, b: true }, moneyCell(r.monthly_price_cents), `dia ${r.billing_day}`, fmtDate(r.start_on), pill(r.status)],
      })), { empty: "Sem avenças." })),
  };
  const body = h("div", { class: "tab-body card" });
  const bar = h("div", { class: "tabs" });
  const show = () => {
    clear(bar); clear(body);
    Object.keys(tabs).forEach((k) => bar.append(h("button", { type: "button", class: "tab" + (F.clientTab === k ? " on" : ""), onclick: () => { F.clientTab = k; show(); } }, k)));
    body.append(tabs[F.clientTab]());
  };
  show();
  root.append(
    h("div", { class: "page-head" }, btn("← Clientes", () => { location.hash = "#/clientes"; }, "flat"), h("div", { class: "spacer" }),
      btn("Editar", async () => { if (await editClient(c)) refresh(); }), btn("+ Orçamento", () => openQuote({ clientId: c.id })),
      btn("+ Trabalho", () => openJob({ clientId: c.id }), "primary"),
      btn("Apagar", async () => {
        if (!(await confirmDialog("Apagar cliente", `Apagar «${c.name}» e TUDO o que tem: ${ov.jobs.length} trabalho(s), ${ov.quotes.length} orçamento(s), ${ov.retainers.length} avença(s), contactos, tarefas e ficheiros. Não dá para desfazer (faça antes uma cópia de segurança, se tiver dúvidas).`, { yes: "Apagar", danger: true }))) return;
        const r = await run(async () => {
          const fl = await API.files(c.id, null);
          await API.deleteClient(c.id);
          const paths = [...new Set(fl.map((f) => f.storage_path))];
          if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        });
        if (r.ok) location.hash = "#/clientes";
      }, "danger")),
    h("div", { class: "client-head" }, h("h1", { class: "serif" }, c.name), pill(c.status)),
    h("p", { class: "muted" }, bits.join("  ·  ")), c.notes ? h("p", { class: "notes" }, c.notes) : null,
    h("div", { class: "chips" },
      h("span", { class: "chip" }, h("b", {}, String(openJobs)), " em curso"),
      h("span", { class: "chip" }, h("b", {}, eur(ov.billed_net_cents)), " entregue (s/ IVA)"),
      monthly ? h("span", { class: "chip" }, h("b", {}, eur(monthly)), " / mês em avenças") : null),
    bar, body);
}

/* ---------- Trabalhos ---------- */
const PHASE_SECTIONS = [["design", "Design"], ["impressao", "Impressão"], ["outros", "Outros"]];
/* Prova pendente de um trabalho (digital no design, física no início da impressão). */
function proofCell(j) {
  if (j.phase === "design" && ["Adjudicado", "Em criação"].includes(j.status)) return j.design_proof === "Por começar" ? { t: "—", c: "muted" } : pill(j.design_proof);
  if (j.phase === "impressao" && j.status === "Adjudicado" && j.print_proof !== "Não precisa") return pill(j.print_proof);
  return { t: "—", c: "muted" };
}
async function pageJobs(root) {
  if (F.pendingJobStatus) { F.jobs.status = F.pendingJobStatus; F.pendingJobStatus = null; }
  const jobs = await API.jobs();
  const host = h("div"), total = h("p", { class: "muted total" });
  const draw = () => {
    const f = F.jobs;
    const shown = jobs.filter((j) => (f.status === "all" || (f.status === "open" && j.status !== "Entregue") || j.status === f.status)
      && (!f.owner || String(j.owner_id) === f.owner) && matches(f.q, j.title, j.client_name, j.reference));
    clear(host);
    const head = ["Ref.", "Trabalho", "Cliente", "Estado", "Prova", "Prioridade", "Prazo", "Pagamento", { t: "Valor s/ IVA", r: true }];
    const rowOf = (j) => ({
      onClick: () => openJob({ jobId: j.id }),
      cells: [j.reference, { t: j.title, b: true },
        j.client_name, pill(j.status), proofCell(j), priorityCell(j.priority), dueCell(j.due_date, j.delivered_on, j.status === "Entregue"), payLabel(j), moneyCell(j.net_cents)],
    });
    let any = false;
    for (const [key, name] of PHASE_SECTIONS) {
      const rows = shown.filter((j) => (j.phase || "impressao") === key);
      if (!rows.length && key === "outros") continue;                    // «Outros» só aparece se tiver trabalhos
      if (!rows.length && !shown.length) continue;
      any = any || rows.length > 0;
      host.append(h("section", {}, sectionLabel(`${name}  ·  ${rows.length}`),
        rows.length ? table(head, rows.map(rowOf)) : emptyNote(`Sem trabalhos em ${name.toLowerCase()}.`)));
    }
    if (!shown.length) host.append(emptyNote(jobs.length ? "Nenhum trabalho com estes filtros." : "Ainda não há trabalhos. Crie um com «+ Novo trabalho»."));
    total.textContent = shown.length ? `${shown.length} trabalho(s) · ${eur(shown.reduce((s, j) => s + j.net_cents, 0))} s/ IVA` : "";
  };
  root.append(pageHeader("Trabalhos", btn("+ Novo trabalho", () => openJob({}), "primary")),
    h("div", { class: "filters" },
      selectBox([["Em curso (não entregues)", "open"], ["Todos", "all"], ...JOB_STATUSES.map((s) => [s, s])], F.jobs.status, (v) => { F.jobs.status = v; draw(); }),
      selectBox([["Todos os responsáveis", ""], ...S.users.map((u) => [u.name, String(u.id)])], F.jobs.owner, (v) => { F.jobs.owner = v; draw(); }),
      searchBox("Pesquisar por trabalho, cliente ou referência…", F.jobs.q, (v) => { F.jobs.q = v; draw(); })), host, total);
  draw();
}

/* ---------- Relatório mensal ---------- */
const monthKey = (iso) => iso.slice(0, 7);
function shiftMonth(key, n) { const [y, m] = key.split("-").map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
const monthName = (key) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`; };
/* Mês corrente compara-se com o mesmo dia do mês anterior; meses fechados, com o mês anterior inteiro. */
const reportBase = (r) => (r.is_current && r.prev_same_day_cents != null ? Number(r.prev_same_day_cents) : Number(r.prev_billed_cents));
const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

function reportChart(series, activeKey) {
  const W = 620, H = 220, top = 26, bottom = 28, left = 8, n = series.length, slot = (W - left * 2) / n, bw = Math.min(30, slot * 0.62);
  const max = Math.max(1, ...series.map((m) => Math.max(Number(m.billed_cents), Number(m.goal_cents)))) * 1.08, base = H - bottom;
  const y = (c) => base - (Number(c) / max) * (base - top);
  let g = "", step = "";
  series.forEach((m, i) => {
    const x = left + i * slot + slot / 2, k = monthKey(m.month), on = k === activeKey, yy = y(m.billed_cents);
    g += `<rect x="${(x - bw / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw}" height="${Math.max(0, base - yy).toFixed(1)}" rx="4" fill="${on ? "#1d1d1b" : "#c9c5b9"}"/>`;
    g += `<text x="${x.toFixed(1)}" y="${(yy - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#55524b">${Math.round(Number(m.billed_cents) / 100)}</text>`;
    g += `<text x="${x.toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="#77746c">${MONTHS_SHORT[Number(k.slice(5)) - 1]}</text>`;
    const gy = y(m.goal_cents).toFixed(1);
    step += `${i ? "L" : "M"}${(left + i * slot).toFixed(1)},${gy} L${(left + (i + 1) * slot).toFixed(1)},${gy} `;
  });
  const el = h("div", { class: "rp-chart" });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturado nos últimos 12 meses">${g}<path d="${step}" fill="none" stroke="#c0594a" stroke-width="1.5" stroke-dasharray="5 4"/></svg>`;
  return el;
}

async function pageReport(root, arg) {
  const todayKey = monthKey(todayISO());
  const key = /^\d{4}-\d{2}$/.test(arg || "") ? arg : todayKey;
  const r = await API.monthReport(key + "-01");
  const billed = Number(r.billed_cents), goal = Number(r.goal_cents), prev = Number(r.prev_billed_cents);
  const prevKey = shiftMonth(key, -1), count = Number(r.jobs_count), avg = Number(r.avg_cents);
  const goPct = goal > 0 ? Math.round((billed / goal) * 100) : 0;
  const editGoal = async () => {
    const vals = await formDialog({
      title: `Objetivo de ${monthName(key).toLowerCase()}`, values: { goal: goal / 100 }, ok: "Guardar", required: ["goal"],
      intro: key === todayKey ? "Valor a faturar neste mês (com IVA). Os meses seguintes herdam este valor; os anteriores mantêm o que tinham." : "Só altera este mês.",
      fields: [{ key: "goal", label: "Objetivo (€)", type: "number", dec: 2 }],
      validate: (v) => (typeof v.goal === "number" && v.goal >= 0 ? null : "Indique um valor válido."),
    });
    if (vals && (await run(() => API.setGoal(Math.round(vals.goal * 100), key + "-01"))).ok) { toast("Objetivo guardado."); refresh(); }
  };
  const base = reportBase(r), ch = pctChange(billed, base), upto = r.is_current ? ` até ao dia ${Number(todayISO().slice(8, 10))}` : "";
  const pm = monthName(prevKey).split(" ")[0].toLowerCase();
  const stat = (lab, num, ...sub) => h("div", { class: "card stat" }, h("span", { class: "lab2" }, lab), h("span", { class: "n" }, num), h("div", { class: "muted small" }, sub));
  const catMax = Math.max(1, ...r.by_category.map((c) => Number(c.gross_cents)));
  const jobsList = r.jobs;
  const pdf = () => printReport(r, key);
  root.append(
    h("div", { class: "page-head" }, h("h1", {}, "Relatório mensal"), h("div", { class: "spacer" }),
      h("div", { class: "month-nav" },
        h("button", { type: "button", class: "btn", "aria-label": "Mês anterior", onclick: () => { location.hash = `#/relatorio/${prevKey}`; } }, "‹"),
        h("span", { class: "mn-label" }, monthName(key)),
        h("button", { type: "button", class: "btn", "aria-label": "Mês seguinte", disabled: key >= todayKey, onclick: () => { location.hash = `#/relatorio/${shiftMonth(key, 1)}`; } }, "›")),
      btn("Guardar em PDF", pdf, "primary")),
    h("div", { class: "rp-stats" },
      stat("Faturado", eur(billed),
        ch == null ? `${pm}${upto}: ${eur(base)}` : [h("b", { class: ch >= 0 ? "ok" : "danger" }, `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch)} %`), ` vs ${pm}${upto} (${eur(base)})`]),
      stat("Objetivo", eur(goal), `${goPct} % atingido · `, h("button", { type: "button", class: "linklike", onclick: editGoal }, "editar")),
      stat("Trabalhos", String(count), `${pm}: ${r.prev_jobs_count}`),
      stat("Valor médio", eur(avg), `${pm}: ${eur(r.prev_avg_cents)}`)),
    h("div", { class: "rp-grid" },
      h("div", { class: "card" }, h("h3", { class: "serif" }, `Últimos 12 meses · linha = objetivo`), reportChart(r.series, key)),
      h("div", { class: "card" },
        h("h3", { class: "serif" }, "Por categoria"),
        r.by_category.length ? h("div", { class: "rp-bars" }, r.by_category.map((c) => h("div", { class: "rp-bar" }, h("span", {}, label(c.category)),
          h("i", { style: { width: `${Math.max(4, (Number(c.gross_cents) / catMax) * 100)}%` } }), h("b", {}, eur(c.gross_cents))))) : emptyNote("Sem trabalhos faturados neste mês."),
        h("h3", { class: "serif" }, "Maiores clientes"),
        r.top_clients.length ? h("div", { class: "rp-clients" }, r.top_clients.map((c) => h("div", {}, h("span", {}, c.name), h("b", {}, eur(c.gross_cents))))) : emptyNote("—"))),
    h("div", { class: "card" }, h("h3", { class: "serif" }, `Trabalhos faturados em ${MONTHS[Number(key.slice(5)) - 1]}`),
      table(["Ref.", "Trabalho", "Cliente", "Pronto em", "Pagamento", { t: "Valor", r: true }], jobsList.map((j) => ({
        onClick: () => openJob({ jobId: j.id }),
        cells: [j.reference, { t: j.title, b: true }, j.client_name, fmtDate(j.ready_on), j.paid ? "Pago" : "Por pagar", moneyCell(j.gross_cents)],
      })), { empty: "Nenhum trabalho passou a «Completo» neste mês." })));
}

/* Relatório em PDF (o browser guarda a página como PDF). */
async function printReport(r, key) {
  const area = document.getElementById("print-area") || h("div", { id: "print-area" });
  if (!area.parentNode) document.body.append(area);
  clear(area);
  const billed = Number(r.billed_cents), goal = Number(r.goal_cents), prev = reportBase(r), ch = pctChange(billed, prev);
  const logo = h("img", { src: "assets/logo.svg", alt: "whiteprints", class: "pq-logo" });
  area.append(
    h("div", { class: "pq-head" }, logo, h("div", { class: "pq-meta" }, h("div", { class: "pq-title" }, "Relatório mensal"), h("b", {}, monthName(key)), h("div", {}, `Emitido em ${fmtDateFull(todayISO())}`))),
    h("table", { class: "pq-totals rp-sum" },
      h("tr", {}, h("td", {}, "Faturado (com IVA)"), h("td", { class: "r" }, eur(billed))),
      h("tr", {}, h("td", {}, `${r.is_current ? "Mês anterior, até ao mesmo dia" : "Mês anterior"}${ch == null ? "" : ` (${ch >= 0 ? "+" : "−"}${Math.abs(ch)} %)`}`), h("td", { class: "r" }, eur(prev))),
      h("tr", {}, h("td", {}, "Objetivo"), h("td", { class: "r" }, `${eur(goal)} · ${goal > 0 ? Math.round((billed / goal) * 100) : 0} %`)),
      h("tr", {}, h("td", {}, "Trabalhos faturados"), h("td", { class: "r" }, String(r.jobs_count))),
      h("tr", {}, h("td", {}, "Valor médio por trabalho"), h("td", { class: "r" }, eur(r.avg_cents)))),
    h("h3", { class: "rp-h" }, "Últimos 12 meses"), reportChart(r.series, key),
    h("h3", { class: "rp-h" }, "Por categoria"),
    h("table", { class: "pq-lines" }, h("tbody", {}, r.by_category.map((c) => h("tr", {}, h("td", {}, label(c.category)), h("td", { class: "r" }, eur(c.gross_cents)))))),
    h("h3", { class: "rp-h" }, "Maiores clientes"),
    h("table", { class: "pq-lines" }, h("tbody", {}, r.top_clients.map((c) => h("tr", {}, h("td", {}, c.name), h("td", { class: "r" }, `${c.jobs} trabalho(s)`), h("td", { class: "r" }, eur(c.gross_cents)))))),
    h("h3", { class: "rp-h" }, "Trabalhos faturados"),
    h("table", { class: "pq-lines" },
      h("thead", {}, h("tr", {}, h("th", {}, "Ref."), h("th", {}, "Trabalho"), h("th", {}, "Cliente"), h("th", {}, "Pronto em"), h("th", { class: "r" }, "Valor"))),
      h("tbody", {}, r.jobs.map((j) => h("tr", {}, h("td", {}, j.reference), h("td", {}, j.title), h("td", {}, j.client_name), h("td", {}, fmtDate(j.ready_on)), h("td", { class: "r" }, eur(j.gross_cents)))))),
    h("div", { class: "pq-foot" }, `${COMPANY.name} · ${COMPANY.place} · ${COMPANY.web}`));
  try { await logo.decode(); } catch { /* sem logótipo, imprime na mesma */ }
  await new Promise((res) => setTimeout(res, 250));
  const old = document.title;
  document.title = `Relatório ${key}`;
  const done = () => { document.title = old; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

/* ---------- Orçamentos ---------- */
async function pageQuotes(root) {
  const quotes = await API.quotes();
  const host = h("div"), total = h("p", { class: "muted total" });
  const draw = () => {
    const f = F.quotes;
    const shown = quotes.filter((q) => (f.status === "all" || q.status === f.status) && matches(f.q, q.number, q.client_name));
    clear(host).append(table(["Número", "Cliente", "Estado", "Emitido", "Válido até", { t: "Total c/ IVA", r: true }, "Trabalho", ""], shown.map((q) => {
      const expired = q.valid_until && daysBetween(todayISO(), q.valid_until) < 0 && ["rascunho", "enviado"].includes(q.status);
      return {
        onClick: () => openQuote({ quoteId: q.id }),
        cells: [{ t: q.number, b: true }, q.client_name, pill(q.status), fmtDate(q.issued_on),
          { t: fmtDate(q.valid_until) + (expired ? " · expirou" : ""), c: expired ? "danger" : "" }, moneyCell(q.gross_cents), q.job_ref || "—",
          { node: btn("Apagar", async () => {
            const withJob = q.job_id != null;
            const msg = withJob ? `Apagar o orçamento ${q.number} E o trabalho ${q.job_ref} que nasceu dele (itens e tarefas incluídos)? Os ficheiros ficam na ficha do cliente.` : `Apagar o orçamento ${q.number}?`;
            if (await confirmDialog("Apagar orçamento", msg, { yes: "Apagar", danger: true })
              && (await run(() => (withJob ? API.deleteJob(q.job_id, true) : API.deleteQuote(q.id)))).ok) refresh();
          }, "danger") }],
      };
    }), { empty: quotes.length ? "Nenhum orçamento com estes filtros." : "Ainda não há orçamentos. Crie um com «+ Novo orçamento»." }));
    const open = shown.filter((q) => ["rascunho", "enviado"].includes(q.status)).reduce((s, q) => s + q.gross_cents, 0);
    total.textContent = shown.length ? `${shown.length} orçamento(s) · ${eur(open)} c/ IVA em aberto (rascunho + enviado)` : "";
  };
  root.append(pageHeader("Orçamentos", btn("+ Novo orçamento", () => openQuote({}), "primary")),
    h("div", { class: "filters" },
      selectBox([["Todos os estados", "all"], ...QUOTE_STATUSES.map((s) => [label(s), s])], F.quotes.status, (v) => { F.quotes.status = v; draw(); }),
      searchBox("Pesquisar por número ou cliente…", F.quotes.q, (v) => { F.quotes.q = v; draw(); })), host, total);
  draw();
}

/* ---------- Tarefas ---------- */
async function pageTasks(root) {
  const host = h("div");
  const load = async () => {
    const f = F.tasks;
    const assignee = f.who === "me" ? (S.me && S.me.id) : f.who === "all" ? null : Number(f.who);
    const rows = (await API.tasks(assignee, f.done)).filter((t) => matches(f.q, t.title, t.description, t.client_name, t.job_title));
    clear(host).append(table(["", "Tarefa", "Cliente / trabalho", "Prioridade", "Prazo", "Estado"], rows.map((t) => ({
      onClick: async () => { if (await editTask(t)) refresh(); },
      cells: [{ node: h("input", { type: "checkbox", checked: t.status === "feito", title: t.status === "feito" ? "Reabrir" : "Marcar como feita", "aria-label": "Concluir ou reabrir",
        onchange: async () => { if ((await run(() => (t.status === "feito" ? API.reopenTask(t.id) : API.completeTask(t.id)))).ok) refresh(); } }) },
        { t: t.title, b: true, c: t.status === "feito" ? "muted" : "" }, [t.client_name, t.job_ref].filter(Boolean).join(" · ") || "—", priorityCell(t.priority),
        t.status !== "feito" ? dueCell(t.due_date) : { t: `feito ${fmtDate(t.completed_at)}`, c: "muted" }, pill(t.status)],
    })), { empty: "Sem tarefas. Marque o que tem para fazer com «+ Nova tarefa»." }));
  };
  root.append(pageHeader("Tarefas", btn("+ Nova tarefa", async () => { if (await editTask(null)) refresh(); }, "primary")),
    h("div", { class: "filters" },
      selectBox([["As minhas", "me"], ["De toda a gente", "all"], ...S.users.map((u) => [`De ${u.name}`, String(u.id)])], F.tasks.who, (v) => { F.tasks.who = v; load(); }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: F.tasks.done, onchange: (e) => { F.tasks.done = e.target.checked; load(); } }), "Mostrar feitas"),
      searchBox("Pesquisar tarefas…", F.tasks.q, (v) => { F.tasks.q = v; load(); })), host);
  await load();
}

/* ---------- Avenças ---------- */
async function pageRetainers(root) {
  const rows = await API.retainers();
  const monthly = rows.filter((r) => r.status === "ativa").reduce((s, r) => s + r.monthly_price_cents, 0);
  root.append(pageHeader("Avenças", btn("+ Nova avença", async () => { if (await editRetainer(null)) refresh(); }, "primary")),
    table(["Cliente", "Plano", { t: "Mensalidade s/ IVA", r: true }, "Faturar", "Início", "Estado"], rows.map((r) => ({
      onClick: async () => { if (await editRetainer(r)) refresh(); },
      cells: [{ t: r.client_name, b: true }, r.name, moneyCell(r.monthly_price_cents), `dia ${r.billing_day}`, fmtDate(r.start_on), pill(r.status)],
    })), { empty: "Ainda não há avenças. Registe aqui os clientes com serviço mensal." }),
    rows.length ? h("p", { class: "muted total" }, `Avenças ativas: ${eur(monthly)} por mês s/ IVA`) : null);
}

/* ---------- Catálogo ---------- */
async function pageCatalog(root) {
  const items = await API.catalog(false);
  const missing = items.filter((c) => c.active && !c.unit_price_cents).length;
  root.append(pageHeader("Catálogo", btn("+ Novo item", async () => { if (await editCatalogItem(null)) refresh(); }, "primary")),
    missing ? h("p", { class: "notice" }, `${missing} item(ns) ativo(s) ainda sem preço. Clique num item para definir o preço — é o que aparece nos orçamentos.`) : null,
    table(["Serviço / produto", "Categoria", "Unidade", { t: "Preço unit. s/ IVA", r: true }, { t: "IVA", r: true }, "Ativo", ""], items.map((c) => ({
      onClick: async () => { if (await editCatalogItem(c)) refresh(); },
      cells: [{ t: c.name, b: true }, label(c.category), c.unit, c.unit_price_cents ? moneyCell(c.unit_price_cents) : { t: "por definir", r: true, c: "danger" },
        { t: `${numText(c.vat_rate)}%`, r: true }, c.active ? "Sim" : { t: "Não", c: "muted" },
        { node: btn("Apagar", async () => {
          if (await confirmDialog("Apagar item", `Apagar «${c.name}» do catálogo? Os orçamentos e trabalhos que já o usam não mudam.`, { yes: "Apagar", danger: true })
            && (await run(() => API.remove("catalog_items", c.id))).ok) refresh();
        }, "danger") }],
    })), { empty: "O catálogo está vazio." }));
}
