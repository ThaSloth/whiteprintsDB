"use strict";
/* =============================================================================
   whiteprints · ecrãs: Hoje, Clientes (+ ficha), Trabalhos, Orçamentos, Tarefas, Avenças, Catálogo
   ============================================================================= */

const F = {   // filtros que se mantêm enquanto a janela está aberta
  jobs: { status: "open", owner: "", q: "" }, quotes: { status: "all", q: "" }, clients: { q: "" },
  tasks: { who: "me", done: false, q: "" }, clientTab: "Trabalhos", pendingJobStatus: null,
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
  const hello = hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";
  const jobRow = (j) => rowCard(`${j.reference} · ${j.title}`, [j.client_name, `Prioridade ${PRIORITIES[j.priority].toLowerCase()}`].filter(Boolean).join(" · "),
    j.due_date, () => openJob({ jobId: j.id }), { status: j.status });
  const taskRow = (t) => rowCard(t.title, [t.client_name, t.job_ref, t.assignee_name].filter(Boolean).join(" · "), t.due_date,
    async () => { if (await editTask(t)) refresh(); }, { taskId: t.id });
  const kpis = h("div", { class: "kpis" }, JOB_STATUSES.map((st) => h("button", { type: "button", class: "card kpi", title: `Ver trabalhos «${st}»`,
    onclick: () => { F.jobs.status = st; location.hash = "#/trabalhos"; } }, h("span", { class: "num serif" }, String((a.counts || {})[st] || 0)), h("span", { class: "muted" }, st))));
  const shown = new Set([...a.overdue_tasks, ...a.due_tasks].map((t) => t.id));
  const evRow = (ev) => rowCard(`${ev.start_time ? fmtTime(ev.start_time) + " · " : ""}${ev.title}`, eventSubtitle(ev), ev.start_on < todayISO() ? todayISO() : ev.start_on,
    async () => { if (await editEvent(ev)) refresh(); }, { status: ev.kind });
  const sections = [
    ["Agenda · próximos 7 dias", (a.events || []).map(evRow)],
    ["Atrasado", [...a.overdue_jobs.map(jobRow), ...a.overdue_tasks.map(taskRow)]],
    ["Próximos 7 dias", [...a.due_jobs.map(jobRow), ...a.due_tasks.map(taskRow)]],
    ["As minhas tarefas", a.mine.filter((t) => !shown.has(t.id)).slice(0, 10).map(taskRow)],
  ].filter(([, rows]) => rows.length);
  root.append(h("h1", { class: "serif greet" }, `${hello}, ${S.me ? S.me.name : ""}`), h("p", { class: "muted" }, longDate(todayISO())), kpis,
    sections.length ? sections.map(([t, rows]) => h("section", {}, sectionLabel(`${t}  ·  ${rows.length}`), h("div", { class: "rows" }, rows)))
      : emptyNote("Nada atrasado nem a vencer esta semana. Boa altura para adiantar trabalho."));
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
    Trabalhos: () => table(["Ref.", "Trabalho", "Estado", "Prioridade", "Prazo", { t: "Valor s/ IVA", r: true }], ov.jobs.map((j) => ({
      onClick: () => openJob({ jobId: j.id }),
      cells: [j.reference, { t: j.title, b: true }, pill(j.status), priorityCell(j.priority), dueCell(j.due_date, j.delivered_on, j.status === "Entregue"), moneyCell(j.net_cents)],
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
async function pageJobs(root) {
  if (F.pendingJobStatus) { F.jobs.status = F.pendingJobStatus; F.pendingJobStatus = null; }
  const jobs = await API.jobs();
  const host = h("div"), total = h("p", { class: "muted total" });
  const draw = () => {
    const f = F.jobs;
    const shown = jobs.filter((j) => (f.status === "all" || (f.status === "open" && j.status !== "Entregue") || j.status === f.status)
      && (!f.owner || String(j.owner_id) === f.owner) && matches(f.q, j.title, j.client_name, j.reference));
    clear(host).append(table(["Ref.", "Trabalho", "Cliente", "Estado", "Prioridade", "Prazo", "Responsável", { t: "Valor s/ IVA", r: true }], shown.map((j) => ({
      onClick: () => openJob({ jobId: j.id }),
      cells: [j.reference, { t: j.title, b: true }, j.client_name, pill(j.status), priorityCell(j.priority), dueCell(j.due_date, j.delivered_on, j.status === "Entregue"), j.owner_name || "—", moneyCell(j.net_cents)],
    })), { empty: jobs.length ? "Nenhum trabalho com estes filtros." : "Ainda não há trabalhos. Crie um com «+ Novo trabalho»." }));
    total.textContent = shown.length ? `${shown.length} trabalho(s) · ${eur(shown.reduce((s, j) => s + j.net_cents, 0))} s/ IVA` : "";
  };
  root.append(pageHeader("Trabalhos", btn("+ Novo trabalho", () => openJob({}), "primary")),
    h("div", { class: "filters" },
      selectBox([["Em curso (não entregues)", "open"], ["Todos", "all"], ...JOB_STATUSES.map((s) => [s, s])], F.jobs.status, (v) => { F.jobs.status = v; draw(); }),
      selectBox([["Todos os responsáveis", ""], ...S.users.map((u) => [u.name, String(u.id)])], F.jobs.owner, (v) => { F.jobs.owner = v; draw(); }),
      searchBox("Pesquisar por trabalho, cliente ou referência…", F.jobs.q, (v) => { F.jobs.q = v; draw(); })), host, total);
  draw();
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
    clear(host).append(table(["", "Tarefa", "Cliente / trabalho", "Responsável", "Prioridade", "Prazo", "Estado"], rows.map((t) => ({
      onClick: async () => { if (await editTask(t)) refresh(); },
      cells: [{ node: h("input", { type: "checkbox", checked: t.status === "feito", title: t.status === "feito" ? "Reabrir" : "Marcar como feita", "aria-label": "Concluir ou reabrir",
        onchange: async () => { if ((await run(() => (t.status === "feito" ? API.reopenTask(t.id) : API.completeTask(t.id)))).ok) refresh(); } }) },
        { t: t.title, b: true, c: t.status === "feito" ? "muted" : "" }, [t.client_name, t.job_ref].filter(Boolean).join(" · ") || "—", t.assignee_name || "—", priorityCell(t.priority),
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
