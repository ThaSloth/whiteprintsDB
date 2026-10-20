"use strict";
/* =============================================================================
   Whiteprints · Agenda: reuniões, instalações, visitas, entregas
   Datas e horas «flutuantes» (a hora que se escreve é a hora local de quem vê) — como as duas pessoas
   estão em Portugal, 14:00 é 14:00 em qualquer dispositivo.
   ============================================================================= */

const EVENT_KINDS = ["reuniao", "instalacao", "visita", "entrega", "outro"];
const WEEK_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
F.agenda = {
  view: window.matchMedia && window.matchMedia("(max-width:860px)").matches ? "lista" : "mes",
  date: todayISO(), who: "all", deadlines: true,
};

/* ---------- datas ---------- */
const fmtTime = (t) => (t ? String(t).slice(0, 5) : "");
function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;   // 0 = segunda
  return addDaysISO(iso, -wd);
}
function addMonthsISO(iso, n) {
  const [y, m] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1 + n, 1));
}
const monthStart = (iso) => iso.slice(0, 8) + "01";
function eventDays(ev, from, to) {
  const out = [], last = ev.end_on || ev.start_on;
  let d = ev.start_on;
  for (let i = 0; d <= last && i < 62; i++, d = addDaysISO(d, 1)) if ((!from || d >= from) && (!to || d <= to)) out.push(d);
  return out;
}
function eventWhen(ev) {
  const days = ev.end_on && ev.end_on !== ev.start_on ? ` · até ${fmtDate(ev.end_on)}` : "";
  if (!ev.start_time) return `Dia inteiro${days}`;
  return `${fmtTime(ev.start_time)}${ev.end_time ? "–" + fmtTime(ev.end_time) : ""}${days}`;
}
const eventSubtitle = (ev) => [ev.location, ev.client_name, ev.job_ref, ev.assignee_name || "Toda a equipa"].filter(Boolean).join(" · ");

/* ---------- ficheiro .ics (Calendário da Apple, Google, Outlook) ---------- */
const icsEscape = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  let out = "", cur = "", len = 0, first = true;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > (first ? 75 : 74)) { out += cur + "\r\n "; cur = ""; len = 0; first = false; }
    cur += ch; len += b;
  }
  return out + cur;
}
const icsDate = (iso) => iso.replace(/-/g, "");
const icsDateTime = (iso, time) => `${icsDate(iso)}T${fmtTime(time).replace(":", "")}00`;
function buildIcs(ev) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Whiteprints//Agenda//PT", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:wp-event-${ev.id || now.getTime()}@whiteprints`, `DTSTAMP:${stamp}`];
  if (!ev.start_time) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.start_on)}`, `DTEND;VALUE=DATE:${icsDate(addDaysISO(ev.end_on || ev.start_on, 1))}`);
  } else {
    let endDay = ev.end_on || ev.start_on, endTime = ev.end_time;
    if (!endTime) {   // sem hora de fim: 1 hora
      const [h0, m0] = fmtTime(ev.start_time).split(":").map(Number);
      const t = h0 * 60 + m0 + 60;
      if (t >= 1440) { endDay = addDaysISO(endDay, 1); }
      endTime = `${pad2(Math.floor((t % 1440) / 60))}:${pad2(t % 60)}`;
    }
    lines.push(`DTSTART:${icsDateTime(ev.start_on, ev.start_time)}`, `DTEND:${icsDateTime(endDay, endTime)}`);
  }
  lines.push(`SUMMARY:${icsEscape(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  const desc = [label(ev.kind), ev.client_name && `Cliente: ${ev.client_name}`, ev.job_ref && `Trabalho: ${ev.job_ref}`,
    `Quem: ${ev.assignee_name || "Toda a equipa"}`, ev.notes].filter(Boolean).join("\n");
  lines.push(`DESCRIPTION:${icsEscape(desc)}`, "END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
function downloadIcs(ev) {
  const url = URL.createObjectURL(new Blob([buildIcs(ev)], { type: "text/calendar;charset=utf-8" }));
  const a = h("a", { href: url, download: `${slug(ev.title)}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- criar / editar um evento ---------- */
async function editEvent(ev, defaults) {
  const [jobs, clients] = await Promise.all([API.jobs(), API.clients()]).catch(() => [[], []]);
  const values = { kind: "reuniao", start_on: todayISO(), ...(defaults || {}), ...(ev || {}) };
  const names = (list, id) => (list.find((x) => x.id === id) || {});
  const withNames = (v) => {
    const job = names(jobs, v.job_id), client = names(clients, v.client_id || job.client_id), user = S.users.find((u) => u.id === v.assignee_id) || {};
    return { ...v, id: ev && ev.id, client_name: client.name || (job.client_name), job_ref: job.reference, assignee_name: user.name };
  };
  const vals = await formDialog({
    title: ev ? "Editar evento" : "Novo evento", values, required: ["title", "start_on"],
    intro: "Deixe a hora de início vazia para um evento de dia inteiro.",
    validate: (v) => {
      if (v.end_on && v.end_on < v.start_on) return "O dia de fim é anterior ao dia de início.";
      if (v.end_time && !v.start_time) return "Indique também a hora de início.";
      const sameDay = !v.end_on || v.end_on === v.start_on;
      if (sameDay && v.start_time && v.end_time && v.end_time < v.start_time) return "A hora de fim é anterior à hora de início.";
      return null;
    },
    onDelete: ev ? () => confirmDialog("Apagar evento", `Apagar «${ev.title}»?`, { yes: "Apagar", danger: true }) : null,
    extra: [{ text: "Adicionar ao calendário (.ics)", onClick: (v) => downloadIcs(withNames(v)) }],
    fields: [
      { key: "title", label: "Título", placeholder: "Ex.: Instalação de vinil — Café Sol" },
      { key: "kind", label: "Tipo", type: "select", options: opts(EVENT_KINDS) },
      { key: "start_on", label: "Dia", type: "date" }, { key: "start_time", label: "Hora de início", type: "time" },
      { key: "end_on", label: "Até ao dia (se durar mais de um dia)", type: "date" }, { key: "end_time", label: "Hora de fim", type: "time" },
      { key: "location", label: "Local", placeholder: "Morada ou sítio" },
      { key: "assignee_id", label: "Quem vai", type: "select", none: "Toda a equipa", options: userOptions() },
      { key: "client_id", label: "Cliente", type: "select", none: "—", options: clientOptions(clients) },
      { key: "job_id", label: "Trabalho", type: "select", none: "—", options: jobs.map((j) => ({ label: `${j.reference} · ${j.title} (${j.client_name})`, value: j.id })) },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  });
  if (vals === null) return false;
  if (vals === DELETE) return (await run(() => API.remove("events", ev.id))).ok;
  if (vals.end_on === vals.start_on) vals.end_on = null;
  return (await run(() => API.save("events", ev ? { id: ev.id, ...vals } : vals))).ok;
}

/* Tabela de eventos (ficha do cliente e janela do trabalho). */
function eventsTable(events, onChange) {
  const edit = async (ev) => { if (await editEvent(ev)) onChange(); };
  return table(["Dia", "Hora", "Tipo", "Evento", "Local", "Quem", ""], events.map((ev) => ({
    onClick: () => edit(ev),
    cells: [`${fmtDate(ev.start_on)}${ev.end_on && ev.end_on !== ev.start_on ? " → " + fmtDate(ev.end_on) : ""}`, ev.start_time ? fmtTime(ev.start_time) + (ev.end_time ? "–" + fmtTime(ev.end_time) : "") : "dia inteiro",
      pill(ev.kind), { t: ev.title, b: true }, ev.location || "—", ev.assignee_name || "Toda a equipa",
      { node: btn(".ics", () => downloadIcs(ev), null, { title: "Adicionar ao Calendário da Apple / Google" }) }],
  })), { empty: "Ainda não há eventos. Marque reuniões, visitas e instalações com «+ Novo evento»." });
}

/* ---------- ecrã Agenda ---------- */
function agendaRange(f) {
  if (f.view === "mes") { const from = mondayOf(monthStart(f.date)); return { from, to: addDaysISO(from, 41) }; }
  if (f.view === "semana") { const from = mondayOf(f.date); return { from, to: addDaysISO(from, 6) }; }
  return { from: f.date, to: addDaysISO(f.date, 29) };
}
function agendaTitle(f, r) {
  if (f.view === "mes") { const [y, m] = f.date.split("-").map(Number); return `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} de ${y}`; }
  if (f.view === "semana") return `${fmtDate(r.from)} – ${fmtDateFull(r.to)}`;
  return `A partir de ${fmtDateFull(f.date)}`;
}
function buildAgendaItems(f, r, events, jobs, tasks) {
  const by = {}, who = f.who === "all" ? null : Number(f.who);
  const push = (day, it) => { if (day >= r.from && day <= r.to) (by[day] = by[day] || []).push(it); };
  for (const ev of events) {
    if (who && ev.assignee_id && ev.assignee_id !== who) continue;
    for (const day of eventDays(ev, r.from, r.to)) {
      push(day, { type: "event", ev, cls: `k-${ev.kind}`, sort: ev.start_time ? `1${ev.start_time}` : "0",
        text: `${ev.start_time && day === ev.start_on ? fmtTime(ev.start_time) + " " : ""}${ev.title}` });
    }
  }
  for (const j of jobs) {
    if (j.status === "Entregue" || !j.due_date || (who && j.owner_id && j.owner_id !== who)) continue;
    push(j.due_date, { type: "job", j, cls: "k-job", sort: "2", text: `Prazo · ${j.reference} ${j.title}` });
  }
  for (const t of tasks) {
    if (t.status === "feito" || !t.due_date || (who && t.assignee_id && t.assignee_id !== who)) continue;
    push(t.due_date, { type: "task", t, cls: "k-task", sort: "3", text: `☐ ${t.title}` });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.text.localeCompare(b.text)));
  return by;
}

async function pageAgenda(root) {
  const f = F.agenda, r = agendaRange(f), today = todayISO();
  const [events, jobs, tasks] = await Promise.all([API.events(r.from, r.to), f.deadlines ? API.jobs() : [], f.deadlines ? API.tasks(null, false) : []]);
  const by = buildAgendaItems(f, r, events, jobs, tasks);

  const open = async (it) => {
    if (it.type === "event") { if (await editEvent(it.ev)) refresh(); }
    else if (it.type === "job") openJob({ jobId: it.j.id });
    else if (await editTask(it.t)) refresh();
  };
  const newOn = async (day) => { if (await editEvent(null, { start_on: day, assignee_id: null })) refresh(); };
  const showDay = (day) => { f.date = day; f.view = "lista"; refresh(); };
  const chip = (it) => h("button", { type: "button", class: `cal-item ${it.cls}`, title: it.text, onclick: () => open(it) }, it.text);

  const step = (dir) => {
    f.date = f.view === "mes" ? addMonthsISO(f.date, dir) : addDaysISO(f.date, dir * (f.view === "semana" ? 7 : 14));
    refresh();
  };
  const seg = [["mes", "Mês"], ["semana", "Semana"], ["lista", "Lista"]].map(([k, t]) =>
    h("button", { type: "button", class: "seg-btn" + (f.view === k ? " on" : ""), onclick: () => { f.view = k; refresh(); } }, t));
  const bar = h("div", { class: "cal-bar" },
    h("div", { class: "cal-nav" }, btn("‹", () => step(-1), null, { "aria-label": "Anterior" }), btn("Hoje", () => { f.date = today; refresh(); }), btn("›", () => step(1), null, { "aria-label": "Seguinte" })),
    h("h2", { class: "cal-title serif" }, agendaTitle(f, r)), h("div", { class: "spacer" }),
    h("div", { class: "seg" }, seg),
    selectBox([["Toda a equipa", "all"], ...S.users.map((u) => [u.name, String(u.id)])], f.who, (v) => { f.who = v; refresh(); }),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: f.deadlines, onchange: (e) => { f.deadlines = e.target.checked; refresh(); } }), "Prazos e tarefas"));
  const legend = h("div", { class: "cal-legend" }, EVENT_KINDS.map((k) => h("span", { class: `k-${k}` }, label(k))),
    f.deadlines ? [h("span", { class: "k-job" }, "Prazo de trabalho"), h("span", { class: "k-task" }, "Tarefa")] : null);

  let view;
  if (f.view === "mes") {
    const [cy, cm] = f.date.split("-").map(Number);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = addDaysISO(r.from, i), items = by[day] || [], [, dm, dd] = day.split("-").map(Number);
      cells.push(h("div", { class: "cal-day" + (dm !== cm ? " other" : "") + (day === today ? " today" : "") },
        h("div", { class: "cal-dh" }, h("button", { type: "button", class: "cal-num", title: "Ver o dia", onclick: () => showDay(day) }, String(dd)),
          h("button", { type: "button", class: "cal-add", title: "Novo evento neste dia", "aria-label": `Novo evento a ${fmtDate(day)}`, onclick: () => newOn(day) }, "+")),
        h("div", { class: "cal-items" }, items.slice(0, 3).map(chip)),
        items.length > 3 ? h("button", { type: "button", class: "cal-more", onclick: () => showDay(day) }, `+${items.length - 3} mais`) : null));
    }
    void cy;
    view = h("div", { class: "cal-grid" }, WEEK_SHORT.map((w) => h("div", { class: "cal-wd" }, w)), cells);
  } else if (f.view === "semana") {
    view = h("div", { class: "cal-week" }, Array.from({ length: 7 }, (_, i) => {
      const day = addDaysISO(r.from, i), items = by[day] || [];
      return h("div", { class: "cal-col" + (day === today ? " today" : "") },
        h("div", { class: "cal-dh" }, h("button", { type: "button", class: "cal-num wide", onclick: () => showDay(day) }, `${WEEK_SHORT[i]} ${fmtDate(day)}`),
          h("button", { type: "button", class: "cal-add", title: "Novo evento neste dia", "aria-label": `Novo evento a ${fmtDate(day)}`, onclick: () => newOn(day) }, "+")),
        h("div", { class: "cal-items" }, items.length ? items.map(chip) : h("span", { class: "muted small" }, "—")));
    }));
  } else {
    const days = Object.keys(by).sort();
    view = days.length ? h("div", {}, days.map((day) => h("section", {},
      h("h3", { class: "section" }, `${longDate(day)}${day === today ? "  ·  hoje" : ""}`),
      h("div", { class: "rows" }, by[day].map((it) => {
        const sub = it.type === "event" ? eventSubtitle(it.ev) : it.type === "job" ? [it.j.client_name, it.j.status].filter(Boolean).join(" · ")
          : [it.t.client_name, it.t.job_ref, it.t.assignee_name].filter(Boolean).join(" · ");
        const when = it.type === "event" ? eventWhen(it.ev) : it.type === "job" ? "Prazo" : "Tarefa";
        return h("div", { class: "row-card", tabindex: 0, onclick: () => open(it), onkeydown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(it); } },
          h("span", { class: `cal-when ${it.cls}` }, when), h("div", { class: "grow" }, h("b", {}, it.type === "event" ? it.ev.title : it.text.replace(/^(Prazo · |☐ )/, "")),
            sub ? h("div", { class: "muted" }, sub) : null), it.type === "event" ? pill(it.ev.kind) : null);
      })))))
      : emptyNote("Nada agendado neste período. Use «+ Novo evento» para marcar uma reunião, visita ou instalação.");
  }
  root.append(pageHeader("Agenda", btn("+ Novo evento", () => newOn(today >= r.from && today <= r.to ? today : f.date), "primary")), bar, legend, view);
}
