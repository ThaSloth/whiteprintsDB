/* ---------- calculadora: impressão de grande formato e vinil de recorte ----------
   O papel / vinil gasta-se sempre pela largura total do rolo. Valores base editáveis em «Editar custos e margem». */

const CX_FORMATS = [ // lado curto × lado longo (m)
  { k: "A3", s: 0.297, g: 0.420 }, { k: "A2", s: 0.420, g: 0.594 }, { k: "A1", s: 0.594, g: 0.841 }, { k: "A0", s: 0.841, g: 1.189 },
];
const CX_A0_AREA = 0.841 * 1.189;
const CX_PROFILES = [["photo", "Fotográfica / cartaz"], ["cad_color", "Plantas a cores"], ["cad_bw", "Plantas a preto"]];

const CX_DEF = {
  photo: { margin: 0.55, waste: 0.10, ink: 4, machine: 0.5, time_fixed_min: 10, time_per_m2_min: 0, labour_hour: 18, fixed_cost: 2, min_price: 0, round_step: 0.5, edge_m: 0.10, gap_m: 0.02 },
  cad_color: { mode: "format", margin: 0.80, waste: 0.10, ink: 0.5, machine: 0.5, time_fixed_min: 0, time_per_m2_min: 0, labour_hour: 18, fixed_cost: 0, min_price: 0, round_step: 0.05, edge_m: 0.10, gap_m: 0.02,
    prices: { A0: 11.5, A1: 8.5, A2: 6.5, A3: 2.3 } },
  cad_bw: { mode: "format", margin: 0.35, waste: 0.10, ink: 0.10, machine: 0.5, time_fixed_min: 0, time_per_m2_min: 0, labour_hour: 18, fixed_cost: 0, min_price: 0, round_step: 0.05, edge_m: 0.10, gap_m: 0.02,
    prices: { A0: 2.5, A1: 1.45, A2: 1.05, A3: 1.1 } },
  fmt_tol_m: 0.01,
  ref_rolls: {},
  vinyl: { margin: 0.60, waste: 0.05, edge_m: 0.20, gap_m: 0.02, cut: 0.10, tape_waste: 0.05, time_fixed_min: 10, time_per_m2_min: 5, labour_hour: 18, fixed_cost: 2, round_step: 0.5 },
};

/* junta os valores guardados com os valores base (e aproveita as definições da versão antiga, que eram planas) */
function cxNormalize(stored) {
  const st = stored && typeof stored === "object" ? stored : {};
  const out = JSON.parse(JSON.stringify(CX_DEF));
  for (const k of Object.keys(CX_DEF.photo)) if (typeof st[k] === "number") out.photo[k] = st[k];
  for (const key of ["photo", "cad_color", "cad_bw", "vinyl"]) {
    const src = st[key] || {};
    for (const k of Object.keys(out[key])) {
      if (k === "prices") { for (const f of Object.keys(out[key].prices)) if (src.prices && typeof src.prices[f] === "number") out[key].prices[f] = src.prices[f]; }
      else if (k === "mode") { if (src.mode === "format" || src.mode === "margin") out[key].mode = src.mode; }
      else if (typeof src[k] === "number") out[key][k] = src[k];
    }
  }
  if (typeof st.fmt_tol_m === "number") out.fmt_tol_m = st.fmt_tol_m;
  if (st.ref_rolls && typeof st.ref_rolls === "object") out.ref_rolls = { ...st.ref_rolls };
  return out;
}

/* ---------- motor de cálculo (puro) ---------- */
function cxFit(rollW, w, l, copies, p, rotate) {
  const tries = rotate ? [[w, l], [l, w]] : [[w, l]];
  let best = null;
  for (const [ww, ll] of tries) {
    if (!(ww > 0) || !(ll > 0) || ww > rollW) continue;
    const per = Math.max(1, Math.floor(rollW / ww + 1e-6)), rows = Math.ceil(copies / per);
    const len = (rows * ll + Math.max(rows - 1, 0) * p.gap_m + p.edge_m) * (1 + p.waste);
    if (!best || len < best.len) best = { per, rows, len, w: ww, l: ll, rotated: ww !== w || ll !== l };
  }
  return best;
}
const cxRollM2 = (r) => (Number(r.width_m) * Number(r.length_m) > 0 ? r.price_cents / 100 / (Number(r.width_m) * Number(r.length_m)) : 0);
const cxRoundUp = (x, step) => (step > 0 ? Math.ceil(x / step - 1e-9) * step : x);

function cxPickFormat(w, l, tol) {
  const s = Math.min(w, l), g = Math.max(w, l);
  const fit = CX_FORMATS.find((f) => s <= f.s + tol && g <= f.g + tol);
  return fit ? { k: fit.k, above: false } : { k: "A0", above: true };
}

/* referência: guardada, ou o rolo «CAD A0» / «CAD A1» pelo nome */
function cxRefRoll(S, k, rolls) {
  const id = S.ref_rolls[k];
  const byId = id != null ? rolls.find((r) => r.id === Number(id)) : null;
  if (byId) return byId;
  const pre = k === "A0" ? "CAD A0" : "CAD A1";
  return rolls.find((r) => r.name.startsWith(pre)) || null;
}

function cxPrint(S, profile, mode, roll, rolls, w, l, copies, extra) {
  const p = S[profile], rotate = profile !== "photo";
  const f = cxFit(Number(roll.width_m), w, l, copies, p, rotate);
  if (!f) return { error: "wide" };
  const rollW = Number(roll.width_m), printed = w * l * copies;
  const parts = {
    paper: f.len * rollW * cxRollM2(roll), ink: printed * (1 + p.waste) * p.ink, machine: printed * (1 + p.waste) * p.machine,
    labour: (p.time_fixed_min + p.time_per_m2_min * printed) / 60 * p.labour_hour, fixed: p.fixed_cost + extra,
  };
  const cost = parts.paper + parts.ink + parts.machine + parts.labour + parts.fixed;
  const base = { fit: f, printed, parts, cost, copies };
  if (mode === "format") {
    const fm = cxPickFormat(w, l, S.fmt_tol_m);
    const unit = fm.above ? p.prices.A0 / CX_A0_AREA * w * l : p.prices[fm.k];
    const ref = cxRefRoll(S, fm.k, rolls);
    let adjust = 0, noRef = !ref, refFail = false;
    if (ref) {
      const fr = cxFit(Number(ref.width_m), w, l, copies, p, true);
      if (fr) adjust = f.len * rollW * cxRollM2(roll) - fr.len * Number(ref.width_m) * cxRollM2(ref); else refFail = true;
    }
    const raw = unit * copies + adjust + extra;
    const final = cxRoundUp(raw, p.round_step);
    return { ...base, mode, fm, unit, ref, adjust, noRef, refFail, final, profit: final - cost, realMargin: final > 0 ? (final - cost) / final : 0,
      perCopy: final / copies, perM2: printed > 0 ? final / printed : 0 };
  }
  const calc = p.margin >= 1 ? 0 : cost / (1 - p.margin);
  const rounded = cxRoundUp(calc, p.round_step);
  const final = Math.max(p.min_price, rounded);
  return { ...base, mode, calc, rounded, minApplied: p.min_price > 0 && rounded < p.min_price, final, profit: final - cost,
    realMargin: final > 0 ? (final - cost) / final : 0, perCopy: final / copies, perM2: printed > 0 ? final / printed : 0 };
}

function cxVinyl(S, lines, tape, extra) {
  const v = S.vinyl; const out = { lines: [], vinylCost: 0, area: 0, errors: [] };
  for (const ln of lines) {
    const area = ln.w * ln.l * ln.copies; out.area += area;
    const f = cxFit(Number(ln.vinyl.width_m), ln.w, ln.l, ln.copies, v, true);
    if (!f) { out.errors.push(`«${ln.vinyl.name}» (${numText(ln.vinyl.width_m, 3)} m) não comporta um trabalho de ${numText(ln.w, 3)} × ${numText(ln.l, 3)} m.`); continue; }
    const cost = f.len * Number(ln.vinyl.width_m) * ln.vinyl.cost_m2_cents / 100;
    out.vinylCost += cost; out.lines.push({ ln, f, cost, area });
  }
  if (out.errors.length) return out;
  const tapePerM2 = tape ? cxRollM2(tape) : 0;
  out.tapeCost = tape ? out.area * (1 + v.tape_waste) * tapePerM2 : 0;
  out.tapeNarrow = tape ? lines.some((ln) => Math.min(ln.w, ln.l) > Number(tape.width_m)) : false;
  out.cut = out.area * v.cut;
  out.labour = (v.time_fixed_min + v.time_per_m2_min * out.area) / 60 * v.labour_hour;
  out.fixed = v.fixed_cost + extra;
  out.cost = out.vinylCost + out.tapeCost + out.cut + out.labour + out.fixed;
  out.calc = v.margin >= 1 ? 0 : out.cost / (1 - v.margin);
  out.final = cxRoundUp(out.calc, v.round_step);
  out.profit = out.final - out.cost; out.realMargin = out.final > 0 ? out.profit / out.final : 0;
  out.perM2 = out.area > 0 ? out.final / out.area : 0;
  return out;
}

const cxEur = (x) => eur(Math.round(x * 100));
const cxM2 = (x) => `${numText(x, 3)} m²`;
const cxM = (x) => `${numText(x, 3)} m`;

/* ---------- gerir listas (rolos, vinis, fitas) ---------- */
function cxManager({ title, intro, load, table: build, edit, removeTable, newText, emptyText }) {
  const host = h("div");
  const draw = async () => {
    const r = await run(load); if (!r.ok) return;
    clear(host).append(table(build.headers, r.value.map((x) => ({
      onClick: async () => { if (await edit(x)) draw(); },
      cells: [...build.cells(x), { node: btn("Apagar", async () => {
        if (await confirmDialog("Apagar", `Apagar «${x.name}»?`, { yes: "Apagar", danger: true }) && (await run(() => API.remove(removeTable, x.id))).ok) draw();
      }, "danger") }],
    })), { empty: emptyText }));
  };
  return (async () => {
    await draw();
    await openModal({
      title, wide: true,
      body: (close) => h("div", { class: "modal-body" }, h("p", { class: "muted" }, intro), host,
        h("div", { class: "modal-foot" }, btn(newText, async () => { if (await edit(null)) draw(); }, "primary"), h("div", { class: "spacer" }), btn("Fechar", () => close()))),
    });
  })();
}

function cxEditRecord({ table: tbl, item, titles, fields, defaults, validate }) {
  return formDialog({
    title: item ? titles[1] : titles[0], required: ["name"], values: item ? { ...item } : defaults, validate, fields,
    onDelete: item ? () => confirmDialog("Apagar", `Apagar «${item.name}»?`, { yes: "Apagar", danger: true }) : null,
  }).then(async (vals) => {
    if (!vals) return false;
    if (vals === DELETE) return (await run(() => API.remove(tbl, item.id))).ok;
    return (await run(() => API.save(tbl, item ? { id: item.id, ...vals } : vals))).ok;
  });
}
const cxPos = (v, what) => (!(v > 0) ? `${what} tem de ser maior que 0.` : null);

const editRoll = (roll) => cxEditRecord({
  table: "rolls", item: roll, titles: ["Novo rolo", "Editar rolo"], defaults: { width_m: 0.914, length_m: 30, price_cents: 0 },
  validate: (v) => cxPos(v.width_m, "A largura") || cxPos(v.length_m, "O comprimento"),
  fields: [
    { key: "name", label: "Nome (ex.: A0 · Papel mate)" }, { key: "width_m", label: "Largura do rolo (m)", type: "number", dec: 3 },
    { key: "length_m", label: "Comprimento do rolo (m)", type: "number", dec: 2 }, { key: "price_cents", label: "Preço do rolo (€, s/ IVA)", type: "money" },
    { key: "notes", label: "Notas", type: "textarea" }],
});
const editVinyl = (item) => cxEditRecord({
  table: "vinyls", item, titles: ["Novo vinil", "Editar vinil"], defaults: { width_m: 0.61, cost_m2_cents: 0 },
  validate: (v) => cxPos(v.width_m, "A largura"),
  fields: [
    { key: "name", label: "Nome / cor (ex.: Preto mate)" }, { key: "width_m", label: "Largura do vinil (m)", type: "number", dec: 3 },
    { key: "cost_m2_cents", label: "Custo por m² (€, s/ IVA)", type: "money" }, { key: "notes", label: "Notas", type: "textarea" }],
});
const editTape = (item) => cxEditRecord({
  table: "tapes", item, titles: ["Nova fita de transferência", "Editar fita de transferência"], defaults: { width_m: 0.3, length_m: 50, price_cents: 0 },
  validate: (v) => cxPos(v.width_m, "A largura") || cxPos(v.length_m, "O comprimento"),
  fields: [
    { key: "name", label: "Nome (ex.: Fita 30 cm)" }, { key: "width_m", label: "Largura do rolo (m)", type: "number", dec: 3 },
    { key: "length_m", label: "Comprimento do rolo (m)", type: "number", dec: 2 }, { key: "price_cents", label: "Preço do rolo (€, s/ IVA)", type: "money" },
    { key: "notes", label: "Notas", type: "textarea" }],
});

const manageRolls = () => cxManager({
  title: "Rolos e materiais", newText: "+ Novo rolo", removeTable: "rolls", edit: editRoll, load: () => API.rolls(), emptyText: "Ainda não há rolos. Crie o primeiro com «+ Novo rolo».",
  intro: "Clique num rolo para o editar. O custo do papel por m² calcula-se a partir do preço, da largura e do comprimento do rolo.",
  table: { headers: ["Rolo", { t: "Largura", r: true }, { t: "Comprimento", r: true }, { t: "Preço", r: true }, { t: "€/m²", r: true }, ""],
    cells: (x) => [{ t: x.name, b: true }, { t: cxM(x.width_m), r: true }, { t: `${numText(x.length_m)} m`, r: true }, moneyCell(x.price_cents), { t: cxEur(cxRollM2(x)), r: true }] },
});
const manageVinyls = () => cxManager({
  title: "Vinis de recorte", newText: "+ Novo vinil", removeTable: "vinyls", edit: editVinyl, load: () => API.vinyls(), emptyText: "Ainda não há vinis. Crie o primeiro com «+ Novo vinil».",
  intro: "Cada vinil tem a sua largura e o custo por m². Pode ter o mesmo vinil em larguras diferentes, ou cores com preços diferentes.",
  table: { headers: ["Vinil", { t: "Largura", r: true }, { t: "Custo por m²", r: true }, ""],
    cells: (x) => [{ t: x.name, b: true }, { t: cxM(x.width_m), r: true }, moneyCell(x.cost_m2_cents)] },
});
const manageTapes = () => cxManager({
  title: "Fitas de transferência", newText: "+ Nova fita", removeTable: "tapes", edit: editTape, load: () => API.tapes(), emptyText: "Ainda não há fitas. Crie a primeira com «+ Nova fita».",
  intro: "O custo por m² calcula-se a partir do preço, da largura e do comprimento do rolo da fita.",
  table: { headers: ["Fita", { t: "Largura", r: true }, { t: "Comprimento", r: true }, { t: "Preço", r: true }, { t: "€/m²", r: true }, ""],
    cells: (x) => [{ t: x.name, b: true }, { t: cxM(x.width_m), r: true }, { t: `${numText(x.length_m)} m`, r: true }, moneyCell(x.price_cents), { t: cxEur(cxRollM2(x)), r: true }] },
});

/* ---------- editar custos e margem ---------- */
const CX_BASE_FIELDS = [
  { k: "margin", t: "Margem pretendida (%)", pct: true }, { k: "waste", t: "Desperdício / testes (%)", pct: true },
  { k: "ink", t: "Tinta (€/m²)" }, { k: "machine", t: "Máquina / manutenção (€/m²)" },
  { k: "time_fixed_min", t: "Tempo fixo por trabalho (min)" }, { k: "time_per_m2_min", t: "Tempo extra por m² (min)" },
  { k: "labour_hour", t: "Mão de obra (€/hora)" }, { k: "fixed_cost", t: "Custos fixos por trabalho (€)" },
  { k: "min_price", t: "Preço mínimo por trabalho (€, 0 = sem mínimo)" }, { k: "round_step", t: "Arredondar preço para cima a (€, 0 = não)" },
  { k: "edge_m", t: "Sobra de rolo no início/fim (m)" }, { k: "gap_m", t: "Espaço entre filas de cópias (m)" },
];
const CX_VINYL_FIELDS = [
  { k: "margin", t: "Margem pretendida (%)", pct: true }, { k: "waste", t: "Desperdício para testes e erros (%)", pct: true },
  { k: "edge_m", t: "Sobra de vinil por linha (m): corte final" }, { k: "gap_m", t: "Espaço entre filas de peças (m)" },
  { k: "cut", t: "Corte: máquina / desgaste (€/m²)" }, { k: "tape_waste", t: "Desperdício da fita de transferência (%)", pct: true },
  { k: "time_fixed_min", t: "Tempo de base por trabalho (min)" }, { k: "time_per_m2_min", t: "Tempo extra por m² (min)" },
  { k: "labour_hour", t: "Mão de obra (€/hora)" }, { k: "fixed_cost", t: "Custos fixos por trabalho (€)" },
  { k: "round_step", t: "Arredondar preço para cima a (€, 0 = não)" },
];
const cxNum = (f, v) => (f.pct ? Math.round(v * 100000) / 1000 : v);
const cxBad = (vals, fields) => {
  for (const f of fields) if (vals[f.key] == null || vals[f.key] < 0) return `«${f.label}»: indique um valor igual ou superior a 0.`;
  return null;
};

async function cxEditSettings(S, which, rolls) {
  const isVinyl = which === "vinyl", plant = which === "cad_color" || which === "cad_bw";
  const src = isVinyl ? CX_VINYL_FIELDS : CX_BASE_FIELDS, p = S[which];
  const values = {}, fields = [];
  for (const f of src) { values[f.k] = cxNum(f, p[f.k]); fields.push({ key: f.k, label: f.t, type: "number", dec: 3 }); }
  if (plant) {
    values.mode = p.mode;
    fields.unshift({ key: "mode", label: "Cálculo por defeito", type: "select", options: [{ label: "Por tabela de formato", value: "format" }, { label: "Por custo + margem", value: "margin" }] });
    for (const f of CX_FORMATS.slice().reverse()) { values["price_" + f.k] = p.prices[f.k]; fields.push({ key: "price_" + f.k, label: `Preço ${f.k} (€, s/ IVA)`, type: "number", dec: 2 }); }
    values.tol = Math.round(S.fmt_tol_m * 10000) / 100;
    fields.push({ key: "tol", label: "Folga ao escolher o formato (cm)", type: "number", dec: 2 });
    for (const f of CX_FORMATS.slice().reverse()) {
      const ref = cxRefRoll(S, f.k, rolls); values["ref_" + f.k] = ref ? ref.id : null;
      fields.push({ key: "ref_" + f.k, label: `Rolo de referência de ${f.k}`, type: "select", none: "— sem referência (sem ajuste)", options: rolls.map((r) => ({ label: r.name, value: r.id })) });
    }
  }
  const title = isVinyl ? "Custos e margem — vinil de recorte" : `Custos e margem — ${CX_PROFILES.find((x) => x[0] === which)[1]}`;
  const vals = await formDialog({
    title, wide: true, values, fields, ok: "Guardar",
    intro: plant ? "Preços por formato e rolo de referência (cálculo por tabela) e bases do cálculo por custo + margem. Ficam guardados para os dois." : "Alterações valem para todos os cálculos futuros e ficam guardadas para os dois.",
    validate: (v) => {
      const bad = cxBad(v, src.map((f) => ({ key: f.k, label: f.t }))) || (plant ? cxBad(v, [...CX_FORMATS.map((f) => ({ key: "price_" + f.k, label: `Preço ${f.k}` })), { key: "tol", label: "Folga" }]) : null);
      return bad || (v.margin >= 100 ? "A margem tem de ser inferior a 100%." : v.waste >= 100 ? "O desperdício tem de ser inferior a 100%." : null);
    },
  });
  if (!vals) return false;
  const next = JSON.parse(JSON.stringify(S)); const q = next[which];
  for (const f of src) q[f.k] = f.pct ? vals[f.k] / 100 : vals[f.k];
  if (plant) {
    q.mode = vals.mode;
    for (const f of CX_FORMATS) { q.prices[f.k] = vals["price_" + f.k]; if (vals["ref_" + f.k] != null) next.ref_rolls[f.k] = vals["ref_" + f.k]; else delete next.ref_rolls[f.k]; }
    next.fmt_tol_m = vals.tol / 100;
  }
  const r = await run(() => API.saveCalcSettings(next));
  if (r.ok) toast("Custos e margem guardados.");
  return r.ok;
}

/* ---------- página ---------- */
const cxState = { tab: "print", profile: "photo", mode: null, rollId: null, w: "", l: "", copies: "1", extra: "", tapeId: "", vextra: "", vlines: [{ vinylId: null, w: "", l: "", copies: "1" }] };
const cxLine = (lab, val, strong) => h("div", { class: "calc-line" + (strong ? " strong" : "") }, h("span", {}, lab), h("b", {}, val));
const cxNumIn = (txt) => { try { return Math.max(0, parseNumber(txt)); } catch { return 0; } };
const cxField = (lab, el, hint) => h("label", { class: "field block" }, h("span", { class: "lab" }, lab), el, hint ? h("span", { class: "muted small" }, hint) : null);

async function pageCalc(root) {
  const load = await run(async () => ({ rolls: await API.rolls(), vinyls: await API.vinyls(), tapes: await API.tapes(), s: await API.calcSettings() }));
  if (!load.ok) return;
  const { rolls, vinyls, tapes } = load.value; const S = cxNormalize(load.value.s);
  const tabs = h("div", { class: "tabs" }, [["print", "Impressão"], ["vinyl", "Vinil de recorte"]].map(([k, t]) =>
    h("button", { type: "button", class: "tab" + (cxState.tab === k ? " on" : ""), onclick: () => { cxState.tab = k; refresh(); } }, t)));

  const body = h("div");
  const actions = cxState.tab === "print"
    ? [btn("Editar custos e margem", async () => { if (await cxEditSettings(S, cxState.profile, rolls)) refresh(); }), btn("Gerir rolos", async () => { await manageRolls(); refresh(); })]
    : [btn("Editar custos e margem", async () => { if (await cxEditSettings(S, "vinyl", rolls)) refresh(); }), btn("Gerir vinis", async () => { await manageVinyls(); refresh(); }), btn("Gerir fitas", async () => { await manageTapes(); refresh(); })];
  root.append(pageHeader("Calculadora", ...actions), tabs, body);
  if (cxState.tab === "print") cxPrintTab(body, S, rolls); else cxVinylTab(body, S, vinyls, tapes);
}

function cxPrintTab(body, S, rolls) {
  if (!rolls.find((r) => r.id === cxState.rollId)) cxState.rollId = rolls[0] ? rolls[0].id : null;
  const plant = cxState.profile !== "photo";
  const mode = plant ? (cxState.mode || S[cxState.profile].mode) : "margin";

  const profSel = h("select", {}, CX_PROFILES.map(([k, t]) => h("option", { value: k }, t))); profSel.value = cxState.profile;
  profSel.addEventListener("change", () => { cxState.profile = profSel.value; cxState.mode = null; refresh(); });
  const modeSel = plant ? h("select", {}, [["format", "Por tabela de formato"], ["margin", "Por custo + margem"]].map(([k, t]) => h("option", { value: k }, t))) : null;
  if (modeSel) { modeSel.value = mode; modeSel.addEventListener("change", () => { cxState.mode = modeSel.value; refresh(); }); }
  const rollSel = h("select", {}, rolls.map((r) => h("option", { value: r.id }, r.name)));
  if (cxState.rollId != null) rollSel.value = String(cxState.rollId);
  rollSel.addEventListener("change", () => { cxState.rollId = Number(rollSel.value); update(); });
  const inp = (key, ph) => h("input", { type: "text", inputMode: "decimal", placeholder: ph, value: cxState[key], autocomplete: "off", oninput: (e) => { cxState[key] = e.target.value; update(); } });
  const fW = inp("w", "ex.: 0,8"), fL = inp("l", "ex.: 1"), fC = inp("copies", "1"), fE = inp("extra", "0,00");
  const out = h("div", { class: "calc-out" }), det = h("div");

  function update() {
    clear(out); clear(det);
    const roll = rolls.find((r) => r.id === Number(rollSel.value));
    if (!roll) { out.append(h("p", { class: "notice" }, "Crie primeiro um rolo (botão «Gerir rolos»).")); return; }
    const w = cxNumIn(fW.value), l = cxNumIn(fL.value), copies = Math.max(1, Math.round(cxNumIn(fC.value) || 1)), extra = cxNumIn(fE.value);
    if (!(w > 0) || !(l > 0)) { out.append(h("p", { class: "muted" }, "Indique a largura e o comprimento do trabalho para ver o preço.")); return; }
    const r = cxPrint(S, cxState.profile, mode, roll, rolls, w, l, copies, extra);
    if (r.error) { out.append(h("p", { class: "notice" }, `O trabalho (${cxM(w)} × ${cxM(l)}) não cabe na largura do rolo (${cxM(roll.width_m)}). Escolha outro rolo ou reduza a largura.`)); return; }
    out.append(h("div", { class: "calc-final" }, h("span", {}, "PREÇO FINAL (sem IVA)"), h("b", {}, cxEur(r.final))));
    if (mode === "format") {
      out.append(cxLine("Formato aplicado", r.fm.above ? "acima do A0 (preço do A0 por m²)" : r.fm.k),
        cxLine(r.fm.above ? "Preço por m² do A0 × área" : "Preço da tabela (por cópia)", cxEur(r.unit)),
        cxLine("Ajuste pelo rolo escolhido", r.noRef ? "sem rolo de referência" : r.refFail ? "sem ajuste (não cabe no rolo de referência)" : Math.abs(r.adjust) < 0.005 ? "sem ajuste" : `${r.adjust >= 0 ? "+" : "−"}${cxEur(Math.abs(r.adjust))}`),
        extra ? cxLine("Acabamentos extra", cxEur(extra)) : null);
    } else {
      out.append(cxLine("Preço calculado pela margem", cxEur(r.calc)), cxLine("Após arredondamento", cxEur(r.rounded)), cxLine("Preço mínimo aplicado?", r.minApplied ? "Sim" : "Não"));
    }
    out.append(cxLine("Preço por cópia", cxEur(r.perCopy)), cxLine("Preço por m² impresso", cxEur(r.perM2)), cxLine("Custo total", cxEur(r.cost)),
      cxLine("Lucro bruto", cxEur(r.profit)), cxLine("Margem real", `${numText(r.realMargin * 100, 1)}%`));
    det.append(h("details", { class: "calc-details" }, h("summary", {}, "Ver detalhe do cálculo"),
      cxLine("Cópias lado a lado (por fila)", String(r.fit.per)), cxLine("Filas de rolo necessárias", String(r.fit.rows)),
      r.fit.rotated ? cxLine("Trabalho rodado para poupar rolo", "sim") : null,
      cxLine("Comprimento de rolo gasto", cxM(r.fit.len)), cxLine("Área de papel gasta (largura total do rolo)", cxM2(r.fit.len * Number(roll.width_m))), cxLine("Área impressa", cxM2(r.printed)),
      cxLine("Papel", cxEur(r.parts.paper)), cxLine("Tinta", cxEur(r.parts.ink)), cxLine("Máquina / manutenção", cxEur(r.parts.machine)),
      cxLine("Mão de obra", cxEur(r.parts.labour)), cxLine("Custos fixos + acabamentos", cxEur(r.parts.fixed)), cxLine("CUSTO TOTAL", cxEur(r.cost), true)));
  }

  const hint = mode === "format" ? "Soma-se ao preço tal como o escreve (dobras, corte, etc.)" : "Entra no custo (leva margem): corte, laminação, ilhós, instalação…";
  body.append(h("div", { class: "calc-grid" },
    h("div", { class: "card" }, h("h2", { class: "serif" }, "Trabalho"),
      cxField("Tipo de impressão", profSel), modeSel ? cxField("Cálculo", modeSel) : null, cxField("Rolo", rollSel),
      cxField("Largura do trabalho (m)", fW), cxField("Comprimento do trabalho (m)", fL), cxField("Cópias", fC), cxField("Acabamentos extra (€)", fE, hint)),
    h("div", { class: "card" }, h("h2", { class: "serif" }, "Preço"), out)), det);
  update();
}

function cxVinylTab(body, S, vinyls, tapes) {
  const out = h("div", { class: "calc-out" }), det = h("div"), linesHost = h("div", { class: "vl-lines" });
  if (!cxState.vlines.length) cxState.vlines.push({ vinylId: null, w: "", l: "", copies: "1" });
  for (const ln of cxState.vlines) if (!vinyls.find((v) => v.id === ln.vinylId)) ln.vinylId = vinyls[0] ? vinyls[0].id : null;
  const tapeSel = h("select", {}, h("option", { value: "" }, "— sem fita de transferência"), tapes.map((t) => h("option", { value: t.id }, `${t.name} (${numText(t.width_m, 3)} m)`)));
  tapeSel.value = tapes.find((t) => String(t.id) === String(cxState.tapeId)) ? String(cxState.tapeId) : "";
  tapeSel.addEventListener("change", () => { cxState.tapeId = tapeSel.value; update(); });
  const fExtra = h("input", { type: "text", inputMode: "decimal", placeholder: "0,00", value: cxState.vextra, autocomplete: "off", oninput: (e) => { cxState.vextra = e.target.value; update(); } });

  function drawLines() {
    clear(linesHost);
    cxState.vlines.forEach((ln, i) => {
      const sel = h("select", {}, vinyls.map((v) => h("option", { value: v.id }, `${v.name} (${numText(v.width_m, 3)} m)`)));
      if (ln.vinylId != null) sel.value = String(ln.vinylId);
      sel.addEventListener("change", () => { ln.vinylId = Number(sel.value); update(); });
      const mk = (key, ph) => h("input", { type: "text", inputMode: "decimal", placeholder: ph, value: ln[key], autocomplete: "off", "aria-label": ph, oninput: (e) => { ln[key] = e.target.value; update(); } });
      linesHost.append(h("div", { class: "vl-row" }, sel, mk("w", "Largura (m)"), mk("l", "Comprimento (m)"), mk("copies", "Cópias"),
        cxState.vlines.length > 1 ? h("button", { type: "button", class: "icon", title: "Remover vinil", "aria-label": "Remover vinil", onclick: () => { cxState.vlines.splice(i, 1); drawLines(); update(); } }, "×") : h("span")));
    });
  }

  function update() {
    clear(out); clear(det);
    if (!vinyls.length) { out.append(h("p", { class: "notice" }, "Crie primeiro um vinil (botão «Gerir vinis»).")); return; }
    const lines = [];
    for (const ln of cxState.vlines) {
      const w = cxNumIn(ln.w), l = cxNumIn(ln.l);
      if (!(w > 0) || !(l > 0)) continue;
      lines.push({ vinyl: vinyls.find((v) => v.id === Number(ln.vinylId)), w, l, copies: Math.max(1, Math.round(cxNumIn(ln.copies) || 1)) });
    }
    if (!lines.length) { out.append(h("p", { class: "muted" }, "Indique a largura e o comprimento do trabalho para ver o preço.")); return; }
    const tape = tapes.find((t) => String(t.id) === String(tapeSel.value)) || null;
    const r = cxVinyl(S, lines, tape, cxNumIn(fExtra.value));
    if (r.errors.length) { out.append(...r.errors.map((e) => h("p", { class: "notice" }, e + " Escolha outro vinil ou reduza o trabalho."))); return; }
    out.append(h("div", { class: "calc-final" }, h("span", {}, "PREÇO FINAL (sem IVA)"), h("b", {}, cxEur(r.final))),
      cxLine("Preço calculado pela margem", cxEur(r.calc)), cxLine("Preço por m² do trabalho", cxEur(r.perM2)), cxLine("Área do trabalho (retângulos)", cxM2(r.area)),
      cxLine("Custo total", cxEur(r.cost)), cxLine("Lucro bruto", cxEur(r.profit)), cxLine("Margem real", `${numText(r.realMargin * 100, 1)}%`),
      r.tapeNarrow ? h("p", { class: "notice" }, "A fita escolhida é mais estreita do que alguma peça: confirme a fita.") : null);
    det.append(h("details", { class: "calc-details" }, h("summary", {}, "Ver detalhe do cálculo"),
      r.lines.map((x) => [
        cxLine(`${x.ln.vinyl.name}: cópias lado a lado / filas`, `${x.f.per} / ${x.f.rows}${x.f.rotated ? " (rodado)" : ""}`),
        cxLine(`${x.ln.vinyl.name}: comprimento de vinil gasto`, cxM(x.f.len)), cxLine(`${x.ln.vinyl.name}: custo do vinil`, cxEur(x.cost))]),
      cxLine("Vinil", cxEur(r.vinylCost)), cxLine("Fita de transferência", cxEur(r.tapeCost)), cxLine("Corte (máquina / desgaste)", cxEur(r.cut)),
      cxLine("Mão de obra", cxEur(r.labour)), cxLine("Custos fixos + extras", cxEur(r.fixed)), cxLine("CUSTO TOTAL", cxEur(r.cost), true)));
  }

  body.append(h("div", { class: "calc-grid" },
    h("div", { class: "card" }, h("h2", { class: "serif" }, "Trabalho"),
      h("div", { class: "vl-head muted small" }, h("span", {}, "Vinil"), h("span", {}, "Largura (m)"), h("span", {}, "Comprimento (m)"), h("span", {}, "Cópias"), h("span")),
      linesHost,
      btn("+ Adicionar vinil", () => { cxState.vlines.push({ vinylId: vinyls[0] ? vinyls[0].id : null, w: "", l: "", copies: "1" }); drawLines(); update(); }),
      cxField("Fita de transferência", tapeSel), cxField("Acabamentos extra (€)", fExtra, "Entra no custo (leva margem): variantes fora do normal")),
    h("div", { class: "card" }, h("h2", { class: "serif" }, "Preço"), out)), det);
  drawLines(); update();
}
