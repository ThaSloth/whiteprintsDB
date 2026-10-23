"use strict";
/* =============================================================================
   whiteprints · janelas: formulários, editor de linhas, ficheiros, trabalho, orçamento
   ============================================================================= */

const S = { users: [], me: null, email: "" };   // estado global leve
const userOptions = () => S.users.map((u) => ({ label: u.name, value: u.id }));
const clientOptions = (clients) => clients.map((c) => ({ label: c.name, value: c.id }));
const priorityOptions = () => Object.entries(PRIORITIES).map(([k, v]) => ({ label: v, value: Number(k) }));
const refresh = () => (window.renderPage ? window.renderPage() : null);

/* ---------- clientes, contactos ---------- */
async function editClient(client) {
  const vals = await formDialog({
    title: client ? "Editar cliente" : "Novo cliente", values: client || { source: "outro", status: "lead" }, required: ["name"], validate: checkPhone,
    fields: [
      { key: "name", label: "Nome" }, { key: "tax_id", label: "NIF" }, { key: "email", label: "Email" },
      { key: "phone", label: "Telefone" }, { key: "address", label: "Morada" },
      { key: "source", label: "Como chegou", type: "select", options: opts(CLIENT_SOURCES) },
      { key: "status", label: "Estado", type: "select", options: opts(CLIENT_STATUSES) },
      { key: "vendus_ref", label: "Ref. no Vendus" }, { key: "notes", label: "Notas", type: "textarea" },
    ],
  });
  if (!vals) return null;
  const r = await run(() => API.save("clients", client ? { id: client.id, ...vals } : vals));
  return r.ok ? r.value.id : null;
}

async function editContact(clientId, contact) {
  const vals = await formDialog({
    title: contact ? "Editar contacto" : "Novo contacto", values: contact || {}, required: ["name"], validate: checkPhone,
    fields: [
      { key: "name", label: "Nome" }, { key: "role", label: "Cargo" }, { key: "email", label: "Email" },
      { key: "phone", label: "Telefone" }, { key: "is_primary", label: "Principal", type: "checkbox", text: "Contacto principal deste cliente" },
    ],
  });
  if (!vals) return false;
  return (await run(() => API.save("contacts", contact ? { id: contact.id, ...vals } : { client_id: clientId, ...vals }))).ok;
}

/* ---------- tarefas ---------- */
async function editTask(task, defaults) {
  const [jobs, clients] = await Promise.all([API.jobs(), API.clients()]).catch(() => [[], []]);
  const values = { priority: 2, status: "por fazer", assignee_id: S.me && S.me.id, ...(defaults || {}), ...(task || {}) };
  const vals = await formDialog({
    title: task ? "Editar tarefa" : "Nova tarefa", values, required: ["title"],
    onDelete: task ? () => confirmDialog("Apagar tarefa", `Apagar «${task.title}»?`, { yes: "Apagar", danger: true }) : null,
    fields: [
      { key: "title", label: "Tarefa" }, { key: "description", label: "Detalhes", type: "textarea" },
      { key: "due_date", label: "Prazo", type: "date" },
      { key: "priority", label: "Prioridade", type: "select", options: priorityOptions() },
      { key: "status", label: "Estado", type: "select", options: opts(TASK_STATUSES) },
      { key: "assignee_id", label: "Responsável", type: "select", none: "—", options: userOptions() },
      { key: "job_id", label: "Trabalho", type: "select", none: "—", options: jobs.map((j) => ({ label: `${j.reference} · ${j.title} (${j.client_name})`, value: j.id })) },
      { key: "client_id", label: "Cliente", type: "select", none: "—", options: clientOptions(clients) },
    ],
  });
  if (vals === null) return false;
  if (vals === DELETE) return (await run(() => API.remove("tasks", task.id))).ok;
  vals.completed_at = vals.status === "feito" ? ((task && task.completed_at) || todayISO()) : null;
  return (await run(() => API.save("tasks", task ? { id: task.id, ...vals } : vals))).ok;
}

/* ---------- avenças ---------- */
async function editRetainer(retainer, clientId) {
  const clients = await API.clients();
  const vals = await formDialog({
    title: retainer ? "Editar avença" : "Nova avença", required: ["client_id", "name"],
    values: retainer || { client_id: clientId, billing_day: 1, status: "ativa", start_on: todayISO(), monthly_price_cents: 0 },
    validate: (v) => (v.start_on && v.end_on && v.end_on < v.start_on ? "A data de fim é anterior à data de início." : null),
    fields: [
      { key: "client_id", label: "Cliente", type: "select", options: clientOptions(clients) },
      { key: "name", label: "Plano" }, { key: "scope", label: "O que inclui", type: "textarea" },
      { key: "monthly_price_cents", label: "Mensalidade (€, s/ IVA)", type: "money" },
      { key: "billing_day", label: "Dia de faturação (1–28)", type: "int", min: 1, max: 28 },
      { key: "start_on", label: "Início", type: "date" }, { key: "end_on", label: "Fim", type: "date" },
      { key: "status", label: "Estado", type: "select", options: opts(["ativa", "pausada", "terminada"]) },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  });
  if (!vals) return false;
  if (retainer) vals.client_id = retainer.client_id;
  if (!vals.billing_day) vals.billing_day = 1;
  return (await run(() => API.save("retainers", retainer ? { id: retainer.id, ...vals } : vals))).ok;
}

/* ---------- catálogo ---------- */
async function editCatalogItem(item) {
  const vals = await formDialog({
    title: item ? "Editar item" : "Novo item", required: ["name"],
    values: item || { category: "impressao", unit: "un", vat_rate: 23, unit_price_cents: 0, active: true },
    validate: (v) => (v.vat_rate == null || v.vat_rate < 0 || v.vat_rate > 100 ? "O IVA tem de estar entre 0 e 100." : null),
    onDelete: item ? () => confirmDialog("Apagar item", `Apagar «${item.name}» do catálogo? Os orçamentos e trabalhos que já o usam não mudam.`, { yes: "Apagar", danger: true }) : null,
    fields: [
      { key: "name", label: "Nome" }, { key: "category", label: "Categoria", type: "select", options: opts(CATEGORIES) },
      { key: "unit", label: "Unidade" }, { key: "unit_price_cents", label: "Preço unitário (€, s/ IVA)", type: "money" },
      { key: "vat_rate", label: "IVA %", type: "number" }, { key: "description", label: "Descrição", type: "textarea" },
      { key: "active", label: "Ativo", type: "checkbox", text: "Aparece nos orçamentos" },
    ],
  });
  if (!vals) return false;
  if (vals === DELETE) return (await run(() => API.remove("catalog_items", item.id))).ok;
  vals.unit = vals.unit || "un";
  return (await run(() => API.save("catalog_items", item ? { id: item.id, ...vals } : vals))).ok;
}

/* ---------- editor de linhas (itens de trabalhos e orçamentos) ---------- */
function linesEditor({ catalog, withCost, lines, readOnly }) {
  const tbody = h("tbody");
  const totalsEl = h("div", { class: "totals" });
  const sel = h("select", { class: "catalog-select" }, catalog.map((c) =>
    h("option", { value: c.id }, c.name + (c.unit_price_cents ? " — " + eur(c.unit_price_cents) : ""))));
  const headers = ["Descrição", "Especificações", "Qtd", "Preço unit. (€)", "IVA %"].concat(withCost ? ["Custo unit. (€)"] : []);
  let locked = !!readOnly;

  const inp = (cls, value, extra) => h("input", { class: cls, type: "text", value, autocomplete: "off", disabled: locked, oninput: recalc, ...(extra || {}) });
  function addLine(line, focus) {
    const l = line || {};
    const tr = h("tr", {},
      h("td", {}, inp("f-desc", l.description || "", { placeholder: "Descrição" })),
      h("td", {}, inp("f-specs", l.specs || "", { placeholder: "Especificações" })),
      h("td", { class: "num sm", "data-l": "Qtd" }, inp("f-qty r", numText(l.quantity ?? 1), { inputMode: "decimal" })),
      h("td", { class: "num", "data-l": "Preço (€)" }, inp("f-price r", centsText(l.unit_price_cents || 0), { inputMode: "decimal" })),
      h("td", { class: "num sm", "data-l": "IVA %" }, inp("f-vat r", numText(l.vat_rate ?? 23), { inputMode: "decimal" })),
      withCost ? h("td", { class: "num", "data-l": "Custo (€)" }, inp("f-cost r", centsText(l.unit_cost_cents || 0), { inputMode: "decimal" })) : null,
      h("td", { class: "x" }, h("button", { type: "button", class: "icon", title: "Remover linha", "aria-label": "Remover linha", disabled: locked, onclick: () => { tr.remove(); recalc(); } }, "×")));
    tr._catalogId = l.catalog_item_id ?? null;
    if (l.supplier_id != null) tr._supplierId = l.supplier_id;
    tbody.append(tr);
    recalc();
    if (focus) tr.querySelector(".f-desc").focus();
  }
  function read() {
    const out = [];
    [...tbody.children].forEach((tr, i) => {
      const v = (c) => tr.querySelector(c).value.trim();
      const desc = v(".f-desc");
      const emptyRow = !desc && !v(".f-specs") && !v(".f-price").replace(/[0,.\s]/g, "");
      if (emptyRow) return;
      if (!desc) throw new Error(`Linha ${i + 1}: falta a descrição.`);
      try {
        const line = {
          description: desc, specs: v(".f-specs") || null, quantity: parseNumber(v(".f-qty") || "1"),
          unit_price_cents: parseEur(v(".f-price")), vat_rate: parseNumber(v(".f-vat") || "0"), catalog_item_id: tr._catalogId,
        };
        if (withCost) { line.unit_cost_cents = parseEur(v(".f-cost")); line.supplier_id = tr._supplierId ?? null; }
        out.push(line);
      } catch { throw new Error(`Linha ${i + 1}: confirme a quantidade, os preços e o IVA.`); }
    });
    return out;
  }
  function recalc() {
    let t;
    try { t = totalsOf(read(), withCost); } catch { t = null; }
    clear(totalsEl);
    if (!t) { totalsEl.append(h("span", { class: "danger" }, "Há valores por corrigir nas linhas.")); return; }
    totalsEl.append(h("span", {}, "Sem IVA ", h("b", {}, eur(t.net_cents))), h("span", {}, "IVA ", h("b", {}, eur(t.vat_cents))),
      h("span", {}, "Total ", h("b", { class: "big" }, eur(t.gross_cents))),
      withCost ? h("span", { class: "muted" }, `Custo ${eur(t.cost_cents)} · Margem ${eur(t.margin_cents)}`) : null);
  }
  function setLocked(v) {
    locked = v;
    el.classList.toggle("locked", v);
    el.querySelectorAll("input,select,button.icon,.bar .btn").forEach((n) => { n.disabled = v; });
  }
  const bar = h("div", { class: "bar" },
    catalog.length ? sel : null,
    catalog.length ? btn("+ Do catálogo", () => {
      const c = catalog.find((x) => String(x.id) === sel.value);
      if (c) addLine({ description: c.name, quantity: 1, unit_price_cents: c.unit_price_cents, vat_rate: c.vat_rate, catalog_item_id: c.id });
    }) : null,
    btn("+ Linha livre", () => addLine(null, true)));
  const el = h("div", { class: "lines" }, bar,
    h("div", { class: "table-wrap" }, h("table", { class: "data lines-table" },
      h("thead", {}, h("tr", {}, headers.map((x, i) => h("th", { class: i >= 2 ? "r" : "" }, x)), h("th", {}))), tbody)),
    totalsEl);
  (lines || []).forEach((l) => addLine(l));
  if (!(lines || []).length) recalc();
  if (locked) setLocked(true);
  return { el, getLines: read, setLocked };
}

/* ---------- ficheiros (no armazenamento privado do Supabase) ---------- */
async function openStored(path, name, download) {
  const win = download ? null : window.open("", "_blank");   // aberto já, para o browser não bloquear
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 120, download ? { download: name } : undefined);
  if (error || !data) { if (win) win.close(); throw new Error(friendly(error || "Ficheiro não encontrado.")); }
  if (win) win.location = data.signedUrl;
  else { const a = h("a", { href: data.signedUrl, download: name }); document.body.append(a); a.click(); a.remove(); }
}

async function uploadFiles(fileList, { client, jobs, jobId, kind, approved, existing }) {
  const job = jobs.find((j) => j.id === jobId);
  const folder = `${client.id}-${slug(client.name)}/${job ? job.reference : "geral"}`;
  let n = 0;
  for (const file of fileList) {
    const path = `${folder}/${Date.now()}-${n++}-${slug(file.name)}`;
    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (up.error) throw new Error(`«${file.name}»: ${friendly(up.error)}`);
    const version = 1 + Math.max(0, ...existing.filter((f) => f.name === file.name && (f.job_id ?? null) === (jobId ?? null)).map((f) => f.version));
    try {
      await API.save("files", { client_id: client.id, job_id: jobId ?? null, name: file.name, kind, storage_path: path, version, approved: !!approved, uploaded_by: S.me ? S.me.id : null });
    } catch (e) { await sb.storage.from(BUCKET).remove([path]); throw e; }
  }
}

/* Painel de ficheiros de um cliente (todos os trabalhos) ou de um trabalho. */
function filesPanel({ client, jobId }) {
  const host = h("div", { class: "files-panel" });
  const picker = h("input", { type: "file", multiple: true, hidden: true });
  let rows = [];

  async function load() {
    const r = await run(() => API.files(jobId ? null : client.id, jobId || null));
    if (!r.ok) return;
    rows = r.value;
    draw();
  }
  async function add(files) {
    if (!files.length) return;
    const jobs = jobId ? [] : await API.jobs(client.id);
    const jobRow = jobId ? null : null;
    const vals = await formDialog({
      title: "Adicionar ficheiros", ok: "Enviar", values: { kind: "outro", approved: false },
      intro: `${files.length} ficheiro(s): ${[...files].map((f) => f.name).join(", ")}`,
      fields: [
        { key: "kind", label: "Tipo", type: "select", options: opts(FILE_KINDS) },
        ...(jobId ? [] : [{ key: "job_id", label: "Trabalho", type: "select", none: "— sem trabalho (geral)", options: jobs.map((j) => ({ label: `${j.reference} · ${j.title}`, value: j.id })) }]),
        { key: "approved", label: "Aprovado", type: "checkbox", text: "Já está aprovado (arte final aprovada é copiada ao repetir um trabalho)" },
      ],
    });
    void jobRow;
    if (!vals) return;
    const allJobs = jobId ? await API.jobs(client.id) : jobs;
    const r = await run(async () => {
      toast("A enviar…");
      await uploadFiles(files, { client, jobs: allJobs, jobId: jobId || vals.job_id, kind: vals.kind, approved: vals.approved, existing: rows });
    });
    if (r.ok) toast("Ficheiros adicionados.");
    await load();
  }
  picker.addEventListener("change", () => { const f = [...picker.files]; picker.value = ""; add(f); });

  function draw() {
    clear(host);
    host.append(h("div", { class: "toolbar" }, btn("+ Adicionar ficheiros…", () => picker.click(), "primary"), h("span", { class: "muted" },
      "Ficam guardados em segurança na cloud, organizados por cliente e trabalho."), picker));
    const headers = ["Ficheiro", "Tipo"].concat(jobId ? [] : ["Trabalho"], ["Versão", "Aprovado", "Adicionado", ""]);
    host.append(table(headers, rows.map((f) => ({
      cells: [
        { t: f.name, b: true }, label(f.kind), ...(jobId ? [] : [f.job_ref || "—"]), { t: `v${f.version}`, r: true },
        f.approved ? { t: "✓ Aprovado", c: "ok", b: true } : { t: "—", c: "muted" }, fmtDate(isoOfTimestamp(f.created_at)),
        { node: h("span", { class: "row-actions" },
          btn("Abrir", async () => { const r = await run(() => openStored(f.storage_path, f.name, false)); void r; }),
          btn("Descarregar", async () => { await run(() => openStored(f.storage_path, f.name, true)); }),
          btn(f.approved ? "Desaprovar" : "Aprovar", async () => { if ((await run(() => API.save("files", { id: f.id, approved: !f.approved }))).ok) load(); }),
          btn("Remover", async () => {
            if (!(await confirmDialog("Remover ficheiro", `Remover «${f.name}»? O ficheiro é apagado da cloud.`, { yes: "Remover", danger: true }))) return;
            const r = await run(async () => {
              const res = await API.deleteFile(f.id);
              if (res && res.storage_path && res.remaining === 0) await sb.storage.from(BUCKET).remove([res.storage_path]);
            });
            if (r.ok) load();
          }, "danger")) },
      ],
    })), { empty: "Ainda não há ficheiros. Adicione briefings, provas, artes finais, contratos…" }));
  }
  draw();
  load();
  return { el: host, reload: load };
}

/* ---------- aceitar orçamento / repetir trabalho ---------- */
async function acceptQuoteDialog(quote) {
  return formDialog({
    title: `Aceitar ${quote.number}`, ok: "Criar trabalho", required: ["title"],
    intro: "O orçamento passa a «Aceite» e é criado um trabalho «Adjudicado» com as mesmas linhas.",
    values: { title: `${quote.client_name} — ${quote.number}`, category: "impressao", priority: 2, owner_id: S.me && S.me.id },
    fields: [
      { key: "title", label: "Título do trabalho" }, { key: "category", label: "Categoria", type: "select", options: opts(CATEGORIES) },
      { key: "priority", label: "Prioridade", type: "select", options: priorityOptions() },
      { key: "due_date", label: "Prazo de entrega", type: "date" },
      { key: "owner_id", label: "Responsável", type: "select", none: "—", options: userOptions() },
    ],
  });
}
async function repeatJobDialog(job) {
  const vals = await formDialog({
    title: `Repetir ${job.reference}`, ok: "Criar cópia", required: ["title"], values: { title: job.title },
    intro: "Cria um novo trabalho «Em orçamento» com os mesmos itens e a arte final aprovada. Pode ajustar quantidades e preços depois.",
    fields: [{ key: "title", label: "Título" }, { key: "due_date", label: "Prazo", type: "date" }],
  });
  if (!vals) return null;
  const r = await run(() => API.duplicateJob(job.id, vals.title, vals.due_date));
  if (r.ok) { await inform("Trabalho criado", "A cópia foi criada em «Em orçamento»."); return r.value; }
  return null;
}

/* ---------- janela de um trabalho ---------- */
async function openJob({ jobId, clientId } = {}) {
  let next = null;
  do {
    next = await showJob({ jobId: next || jobId, clientId });
    jobId = null;
  } while (next);
  refresh();
}

async function showJob({ jobId, clientId }) {
  const load = await run(async () => {
    const [clients, catalog, job] = await Promise.all([API.clients(), API.catalog(true), jobId ? API.job(jobId) : null]);
    return { clients, catalog, job };
  });
  if (!load.ok) return null;
  let { clients, catalog, job } = load.value;
  let openNext = null;

  return openModal({
    title: job ? job.reference : "Novo trabalho", wide: true,
    body: (close) => {
      const F = {};
      F.client = h("select", { disabled: !!job }, clients.map((c) => h("option", { value: c.id }, c.name)));
      F.client.value = String((job && job.client_id) || clientId || (clients[0] && clients[0].id) || "");
      F.title = h("input", { type: "text", value: job ? job.title : "", autocomplete: "off" });
      F.category = h("select", {}, CATEGORIES.map((c) => h("option", { value: c }, label(c))));
      F.category.value = job ? job.category : "outro";
      F.priority = h("select", {}, Object.entries(PRIORITIES).map(([k, v]) => h("option", { value: k }, v)));
      F.priority.value = String(job ? job.priority : 2);
      F.due = h("input", { type: "date", value: (job && job.due_date) || "" });
      F.owner = h("select", {}, h("option", { value: "" }, "—"), S.users.map((u) => h("option", { value: u.id }, u.name)));
      F.owner.value = String(job ? (job.owner_id ?? "") : (S.me ? S.me.id : ""));
      F.invoice = h("input", { type: "text", placeholder: "n.º da fatura no Vendus", value: (job && job.invoice_ref) || "" });
      const payState0 = job ? (job.paid ? "pago" : (Number(job.paid_amount_cents) > 0 ? "parcial" : "por pagar")) : "por pagar";
      F.pay = h("select", {}, [["por pagar", "Por pagar"], ["parcial", "Parcialmente pago"], ["pago", "Pago"]].map(([v, t]) => h("option", { value: v }, t)));
      F.pay.value = payState0;
      F.paidAmt = h("input", { type: "text", inputMode: "decimal", placeholder: "Valor já pago (€)", value: job && !job.paid && Number(job.paid_amount_cents) > 0 ? centsText(job.paid_amount_cents) : "" });
      const payNote = h("span", { class: "muted pay-info" });
      F.notes = h("textarea", { rows: 2, value: (job && job.notes) || "" });
      const editor = linesEditor({ catalog, withCost: true, lines: job ? job.items : [] });
      const err = h("p", { class: "danger form-error", hidden: true });
      const problem = (t) => { err.textContent = t; err.hidden = false; };
      const grossNow = () => { try { return totalsOf(editor.getLines(), false).gross_cents; } catch { return null; } };
      const updatePay = () => {
        F.paidAmt.hidden = F.pay.value !== "parcial";
        payNote.textContent = "";
        if (F.pay.value === "parcial") {
          const g = grossNow(); let paid = 0;
          try { paid = parseEur(F.paidAmt.value); } catch { return; }
          if (g != null && paid > 0) payNote.textContent = `Em falta: ${eur(Math.max(g - paid, 0))} (total c/ IVA ${eur(g)})`;
        }
      };
      F.pay.addEventListener("change", updatePay); F.paidAmt.addEventListener("input", updatePay);
      editor.el.addEventListener("input", updatePay); editor.el.addEventListener("click", () => setTimeout(updatePay, 0));
      setTimeout(updatePay, 0);

      const head = h("div", { class: "dialog-title" });
      const origin = h("p", { class: "muted" });
      const banner = h("div", { class: "pay-banner", hidden: true });
      const tabsBar = h("div", { class: "tabs" });
      const tabBody = h("div", { class: "tab-body" });
      let tab = "itens", filesP = null;

      function renderHead() {
        clear(head); clear(origin);
        if (!job) { head.append(h("h2", { class: "serif" }, "Novo trabalho")); return; }
        const i = JOB_STATUSES.indexOf(job.status);
        head.append(h("h2", { class: "serif" }, job.reference), pill(job.status), h("div", { class: "spacer" }),
          i > 0 ? btn(`← ${JOB_STATUSES[i - 1]}`, () => move(-1)) : null,
          i < JOB_STATUSES.length - 1 ? btn(`${JOB_STATUSES[i + 1]} →`, () => move(1), "primary") : null);
        const bits = [];
        if (job.quote_number) bits.push(`Veio do orçamento ${job.quote_number}`);
        if (job.repeat_ref) bits.push(`Repete o trabalho ${job.repeat_ref}`);
        if (job.delivered_on) bits.push(`Entregue em ${fmtDateFull(job.delivered_on)}`);
        origin.textContent = bits.join(" · ");
        origin.hidden = !bits.length;
        clear(banner); banner.hidden = true;
        const pi = payInfo(job, grossNow());
        if (pi) {
          banner.hidden = false; banner.className = "pay-banner " + (pi.overdue ? "late" : "soon");
          const paidTxt = Number(job.paid_amount_cents) > 0 ? ` (${eur(job.paid_amount_cents)} já pagos)` : "";
          banner.append(h("span", {}, h("b", {}, pi.overdue ? "Em atraso" : "Por cobrar"), pi.missing != null ? `: ${eur(pi.missing)}${paidTxt}` : "",
            pi.overdue ? ` · completo há ${pi.since} dia(s)` : ""),
            btn("Marcar como pago", async () => { if ((await run(() => API.markJobPaid(job.id))).ok) { toast("Marcado como pago."); await reload(); F.pay.value = "pago"; updatePay(); } }));
        }
      }
      async function reload() {
        const r = await run(() => API.job(job.id));
        if (r.ok) { job = r.value; renderHead(); renderTabs(); }
      }
      async function move(step) {
        const target = JOB_STATUSES[JOB_STATUSES.indexOf(job.status) + step];
        if (target === "Entregue" && !(await confirmDialog("Marcar como entregue", "Confirma que o trabalho já foi entregue ao cliente?", { yes: "Entregue" }))) return;
        if ((await run(() => API.setJobStatus(job.id, target))).ok) reload();
      }

      function tasksView() {
        const tasks = job.tasks || [];
        const rows = tasks.map((t) => ({
          onClick: async () => { if (await editTask(t)) reload(); },
          cells: [{ t: t.title, b: true, c: t.status === "feito" ? "muted" : "" }, t.assignee_name || "—", priorityCell(t.priority),
            t.status !== "feito" ? dueCell(t.due_date) : "—", pill(t.status),
            { node: btn(t.status === "feito" ? "Reabrir" : "Concluir", async () => {
              if ((await run(() => (t.status === "feito" ? API.reopenTask(t.id) : API.completeTask(t.id)))).ok) reload();
            }) }],
        }));
        return h("div", {}, h("div", { class: "toolbar" }, btn("+ Nova tarefa", async () => { if (await editTask(null, { job_id: job.id })) reload(); }, "primary")),
          table(["Tarefa", "Responsável", "Prioridade", "Prazo", "Estado", ""], rows, { empty: "Sem tarefas neste trabalho." }));
      }
      function renderTabs() {
        clear(tabsBar); clear(tabBody);
        const open = job ? (job.tasks || []).filter((t) => t.status !== "feito").length : 0;
        const defs = job ? [["itens", "Itens"], ["ficheiros", "Ficheiros"], ["tarefas", `Tarefas (${open})`], ["agenda", `Agenda (${(job.events || []).length})`]] : [["itens", "Itens"], ["x", "Ficheiros e tarefas"]];
        defs.forEach(([k, t]) => tabsBar.append(h("button", { type: "button", class: "tab" + (tab === k ? " on" : ""), disabled: k === "x",
          onclick: () => { tab = k; renderTabs(); } }, t)));
        if (tab === "itens") tabBody.append(editor.el);
        else if (tab === "agenda") tabBody.append(h("div", {}, h("div", { class: "toolbar" }, btn("+ Novo evento", async () => { if (await editEvent(null, { job_id: job.id, client_id: job.client_id })) reload(); }, "primary")), eventsTable(job.events || [], reload)));
        else if (tab === "ficheiros") { filesP = filesPanel({ client: { id: job.client_id, name: job.client_name }, jobId: job.id }); tabBody.append(filesP.el); }
        else tabBody.append(tasksView());
        if (!job) tabBody.append(h("p", { class: "muted", style: { marginTop: "10px" } }, "Guarde o trabalho primeiro para poder juntar ficheiros e tarefas."));
      }

      async function save() {
        err.hidden = true;
        const title = F.title.value.trim();
        if (!title) return problem("Falta o título do trabalho.");
        if (!F.client.value) return problem("Crie primeiro um cliente (ecrã Clientes).");
        let items;
        try { items = editor.getLines(); } catch (e) { return problem(e.message); }
        let paidAmount = 0;
        if (F.pay.value === "parcial") {
          try { paidAmount = parseEur(F.paidAmt.value); } catch { return problem("Valor já pago inválido."); }
          if (paidAmount <= 0) return problem("Indique o valor já pago (maior que zero) ou escolha «Por pagar».");
          const g = grossNow();
          if (g != null && paidAmount >= g && g > 0) return problem("O valor já pago cobre o total do trabalho: escolha «Pago».");
        }
        const data = {
          title, category: F.category.value, priority: Number(F.priority.value), due_date: F.due.value || null,
          owner_id: F.owner.value ? Number(F.owner.value) : null, invoice_ref: F.invoice.value.trim() || null,
          paid: F.pay.value === "pago", paid_amount_cents: paidAmount, notes: F.notes.value.trim() || null,
        };
        if (job) data.id = job.id; else data.client_id = Number(F.client.value);
        if ((await run(() => API.saveJob(data, items))).ok) close(null);
      }

      const grid = h("div", { class: "job-grid" },
        h("div", { class: "form-grid" },
          h("label", { class: "field" }, h("span", { class: "lab" }, "Cliente *"), F.client),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Título *"), F.title),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Categoria"), F.category),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Responsável"), F.owner)),
        h("div", { class: "form-grid" },
          h("label", { class: "field" }, h("span", { class: "lab" }, "Prioridade"), F.priority),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Prazo"), F.due),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Fatura"), F.invoice),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Pagamento"), F.pay, F.paidAmt, payNote)));
      renderHead(); renderTabs();
      return h("div", { class: "modal-body" }, head, origin, banner, grid,
        h("label", { class: "field block" }, h("span", { class: "lab" }, "Notas"), F.notes),
        tabsBar, tabBody, err,
        h("div", { class: "modal-foot" },
          job ? btn("Repetir trabalho", async () => { const id = await repeatJobDialog(job); if (id) { openNext = id; close(id); } }) : null,
          job ? btn("Apagar", async () => {
            const msg = `Apagar o trabalho ${job.reference} «${job.title}»? Apaga também os itens e as tarefas do trabalho. Os ficheiros ficam na ficha do cliente.`
              + (job.quote_number ? ` O orçamento ${job.quote_number} volta ao estado «enviado».` : "");
            if (await confirmDialog("Apagar trabalho", msg, { yes: "Apagar", danger: true }) && (await run(() => API.deleteJob(job.id, false))).ok) close(null);
          }, "danger") : null,
          h("div", { class: "spacer" }), btn("Fechar", () => close(openNext)), btn("Guardar", save, "primary")));
    },
  }).then((r) => (typeof r === "number" ? r : null));
}

/* ---------- janela de um orçamento ---------- */
async function openQuote({ quoteId, clientId } = {}) {
  const res = await showQuote({ quoteId, clientId });
  refresh();
  if (res && res.jobId) openJob({ jobId: res.jobId });
}

async function showQuote({ quoteId, clientId }) {
  const load = await run(async () => {
    const [clients, catalog, quote] = await Promise.all([API.clients(), API.catalog(true), quoteId ? API.quote(quoteId) : null]);
    return { clients, catalog, quote };
  });
  if (!load.ok) return null;
  let { clients, catalog, quote } = load.value;
  let createdJob = null;

  await openModal({
    title: quote ? quote.number : "Novo orçamento", wide: true,
    body: (close) => {
      const locked = () => !!quote && quote.status === "aceite";
      const client = h("select", { disabled: !!quote }, clients.map((c) => h("option", { value: c.id }, c.name)));
      client.value = String((quote && quote.client_id) || clientId || (clients[0] && clients[0].id) || "");
      const valid = h("input", { type: "date", value: quote ? (quote.valid_until || "") : addDaysISO(todayISO(), 30) });
      const notes = h("textarea", { rows: 2, value: (quote && quote.notes) || "", placeholder: "Condições, prazos de entrega, forma de pagamento…" });
      const editor = linesEditor({ catalog, withCost: false, lines: quote ? quote.lines : [] });
      const err = h("p", { class: "danger form-error", hidden: true });
      const head = h("div", { class: "dialog-title" });
      const jobNote = h("p", { class: "muted" });
      const foot = h("div", { class: "modal-foot" });
      const problem = (t) => { err.textContent = t; err.hidden = false; return false; };

      function render() {
        clear(head); clear(foot);
        const L = locked();
        const st = h("select", { class: "status-select", onchange: async (e) => {
          if (!(await persist())) { e.target.value = quote.status; return; }
          if ((await run(() => API.setQuoteStatus(quote.id, e.target.value))).ok) await reload();
        } }, ["rascunho", "enviado", "recusado"].map((s) => h("option", { value: s }, label(s))));
        head.append(h("h2", { class: "serif" }, quote ? quote.number : "Novo orçamento"), pill(quote ? quote.status : "rascunho"),
          h("div", { class: "spacer" }), quote && !L ? [h("span", { class: "muted" }, "Estado"), st] : null);
        if (quote && !L) st.value = quote.status;
        jobNote.textContent = L ? (quote.job_ref ? `Aceite — gerou o trabalho ${quote.job_ref}.` : "Aceite.") : "";
        jobNote.hidden = !L;
        client.disabled = !!quote || L; valid.disabled = L; notes.disabled = L; editor.setLocked(L);
        foot.append(quote ? btn("Exportar PDF", exportPdf) : null, h("div", { class: "spacer" }), btn("Fechar", () => close(createdJob ? { jobId: createdJob } : null)),
          quote && !L && quote.status !== "recusado" ? btn("Aceitar e criar trabalho", accept, "primary") : null,
          !L ? btn("Guardar", async () => { if (await persist()) close(null); }, "primary") : null);
      }
      async function reload() {
        const r = await run(() => API.quote(quote.id));
        if (r.ok) { quote = r.value; render(); }
      }
      async function persist() {
        if (locked()) return true;
        err.hidden = true;
        let lines;
        try { lines = editor.getLines(); } catch (e) { return problem(e.message); }
        if (!client.value) return problem("Crie primeiro um cliente (ecrã Clientes).");
        if (!lines.length) return problem("Adicione pelo menos uma linha ao orçamento.");
        const data = { valid_until: valid.value || null, notes: notes.value.trim() || null };
        if (quote) data.id = quote.id; else { data.client_id = Number(client.value); data.created_by = S.me ? S.me.id : null; }
        const r = await run(() => API.saveQuote(data, lines));
        if (!r.ok) return false;
        const fresh = await run(() => API.quote(r.value));
        if (fresh.ok) { quote = fresh.value; render(); }
        return true;
      }
      async function exportPdf() {
        if (!(await persist())) return;
        await printQuote(quote);
      }
      async function accept() {
        if (!(await persist())) return;
        const vals = await acceptQuoteDialog(quote);
        if (!vals) return;
        const r = await run(() => API.acceptQuote(quote.id, vals));
        if (r.ok) { createdJob = r.value; close({ jobId: r.value }); }
      }
      render();
      return h("div", { class: "modal-body" }, head, jobNote,
        h("div", { class: "form-grid two" },
          h("label", { class: "field" }, h("span", { class: "lab" }, "Cliente *"), client),
          h("label", { class: "field" }, h("span", { class: "lab" }, "Válido até"), valid)),
        h("label", { class: "field block" }, h("span", { class: "lab" }, "Notas"), notes),
        editor.el, err, foot);
    },
  }).then((r) => { createdJob = r && r.jobId ? r.jobId : createdJob; });
  return createdJob ? { jobId: createdJob } : null;
}

/* ---------- impressão / PDF do orçamento (o browser guarda como PDF) ---------- */
async function printQuote(quote) {
  const lines = quote.lines || [];
  const t = totalsOf(lines, false);
  const c = COMPANY;
  const area = document.getElementById("print-area") || h("div", { id: "print-area" });
  if (!area.parentNode) document.body.append(area);
  clear(area);
  const logo = h("img", { src: "assets/logo.svg", alt: "whiteprints", class: "pq-logo" });
  const clientLines = [quote.client_name, quote.client_address, quote.client_email, quote.client_phone, quote.client_tax_id ? `NIF ${quote.client_tax_id}` : null].filter(Boolean);
  area.append(
    h("div", { class: "pq-head" }, logo, h("div", { class: "pq-meta" }, h("div", { class: "pq-title" }, "Orçamento"), h("b", {}, quote.number),
      h("div", {}, `Emitido em ${fmtDateFull(quote.issued_on)}`), h("div", {}, `Válido até ${fmtDateFull(quote.valid_until)}`))),
    h("div", { class: "pq-parties" },
      h("div", {}, h("div", { class: "pq-lab" }, "De"), h("b", {}, c.name), h("div", {}, c.tagline), h("div", {}, c.place), h("div", {}, c.email), h("div", {}, c.phone), h("div", {}, c.web)),
      h("div", {}, h("div", { class: "pq-lab" }, "Para"), clientLines.map((l, i) => h("div", i === 0 ? { class: "b" } : {}, l)))),
    h("table", { class: "pq-lines" },
      h("thead", {}, h("tr", {}, h("th", {}, "Descrição"), h("th", { class: "r" }, "Qtd"), h("th", { class: "r" }, "Preço unit."), h("th", { class: "r" }, "IVA"), h("th", { class: "r" }, "Total s/ IVA"))),
      h("tbody", {}, lines.map((l) => h("tr", {}, h("td", {}, l.description, l.specs ? h("div", { class: "pq-specs" }, l.specs) : null),
        h("td", { class: "r" }, numText(l.quantity)), h("td", { class: "r" }, eur(l.unit_price_cents)), h("td", { class: "r" }, `${numText(l.vat_rate)}%`),
        h("td", { class: "r" }, eur(lineNet(Number(l.quantity), l.unit_price_cents))))))),
    h("table", { class: "pq-totals" },
      h("tr", {}, h("td", {}, "Total sem IVA"), h("td", { class: "r" }, eur(t.net_cents))),
      h("tr", {}, h("td", {}, "IVA"), h("td", { class: "r" }, eur(t.vat_cents))),
      h("tr", { class: "grand" }, h("td", {}, "Total"), h("td", { class: "r" }, eur(t.gross_cents)))),
    quote.notes ? h("div", { class: "pq-notes" }, h("b", {}, "Notas"), h("div", { style: { whiteSpace: "pre-wrap" } }, quote.notes)) : null,
    h("div", { class: "pq-foot" }, `${c.name} · ${c.place} · ${c.email} · ${c.phone} · ${c.web}`));
  try { await logo.decode(); } catch { /* sem logótipo, imprime na mesma */ }
  await new Promise((r) => setTimeout(r, 250));   // deixa o browser pintar o logótipo antes de abrir a impressão
  const old = document.title;
  document.title = `${quote.number} - ${slug(quote.client_name)}`;
  const done = () => { document.title = old; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}
