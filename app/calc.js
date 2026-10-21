/* ---------- Calculadora de grande formato ----------
   Mesma lógica da folha «Whiteprints_Calculadora_Grande_Formato»: o papel gasta-se sempre pela largura total do rolo. */

const CALC_FIELDS = [
  { k: "margin", t: "Margem pretendida (%)", pct: true, note: "Sobre o preço de venda, não markup" },
  { k: "waste", t: "Desperdício / testes (%)", pct: true, note: "Papel, tinta e máquina" },
  { k: "ink", t: "Tinta (€/m²)" },
  { k: "machine", t: "Máquina / manutenção (€/m²)" },
  { k: "time_fixed_min", t: "Tempo fixo por trabalho (min)" },
  { k: "time_per_m2_min", t: "Tempo extra por m² (min)" },
  { k: "labour_hour", t: "Mão de obra (€/hora)" },
  { k: "fixed_cost", t: "Custos fixos por trabalho (€)" },
  { k: "min_price", t: "Preço mínimo por trabalho (€)", note: "0 = sem mínimo" },
  { k: "round_step", t: "Arredondar preço para cima a (€)", note: "0 = não arredondar" },
  { k: "edge_m", t: "Sobra de rolo no início/fim (m)" },
  { k: "gap_m", t: "Espaço entre filas de cópias (m)" },
];

const calcState = { rollId: null, w: "", l: "", copies: "1", extra: "" };

function calcPrice(roll, s, w, l, copies, extra) {
  const rollW = Number(roll.width_m), rollL = Number(roll.length_m), price = roll.price_cents / 100;
  const perRow = (w <= 0 || w > rollW) ? 0 : Math.max(1, Math.floor(rollW / w + 1e-6));
  const rows = perRow ? Math.ceil(copies / perRow) : 0;
  const lenUsed = rows ? (rows * l + Math.max(rows - 1, 0) * s.gap_m + s.edge_m) * (1 + s.waste) : 0;
  const paperPerM2 = rollW * rollL > 0 ? price / (rollW * rollL) : 0;
  const printed = w * l * copies;
  const paperArea = lenUsed * rollW;
  const c = {
    paper: paperArea * paperPerM2, ink: printed * (1 + s.waste) * s.ink, machine: printed * (1 + s.waste) * s.machine,
    labour: (s.time_fixed_min + s.time_per_m2_min * printed) / 60 * s.labour_hour, fixed: s.fixed_cost + extra,
  };
  const cost = c.paper + c.ink + c.machine + c.labour + c.fixed;
  const calc = s.margin >= 1 ? 0 : cost / (1 - s.margin);
  const rounded = s.round_step > 0 ? Math.ceil(calc / s.round_step - 1e-9) * s.round_step : calc;
  const final = perRow === 0 ? 0 : Math.max(s.min_price, rounded);
  const profit = final - cost;
  return { perRow, rows, lenUsed, paperArea, printed, c, cost, calc, rounded, minApplied: s.min_price > 0 && rounded < s.min_price,
    final, perCopy: copies > 0 ? final / copies : 0, perM2: printed > 0 ? final / printed : 0, profit, realMargin: final > 0 ? profit / final : 0 };
}

const eurF = (x) => eur(Math.round(x * 100));
const m2F = (x) => `${numText(x, 3)} m²`;
const mF = (x) => `${numText(x, 3)} m`;

function editRoll(roll) {
  return formDialog({
    title: roll ? "Editar rolo" : "Novo rolo", required: ["name"],
    values: roll ? { ...roll } : { width_m: 0.914, length_m: 30, price_cents: 0 },
    validate: (v) => (!(v.width_m > 0) ? "A largura tem de ser maior que 0." : !(v.length_m > 0) ? "O comprimento tem de ser maior que 0." : null),
    onDelete: roll ? () => confirmDialog("Apagar rolo", `Apagar o rolo «${roll.name}»?`, { yes: "Apagar", danger: true }) : null,
    fields: [
      { key: "name", label: "Nome (ex.: A0 · Papel mate)" },
      { key: "width_m", label: "Largura do rolo (m)", type: "number", dec: 3 },
      { key: "length_m", label: "Comprimento do rolo (m)", type: "number", dec: 2 },
      { key: "price_cents", label: "Preço do rolo (€, s/ IVA)", type: "money" },
      { key: "notes", label: "Notas", type: "textarea" },
    ],
  }).then(async (vals) => {
    if (!vals) return false;
    if (vals === DELETE) return (await run(() => API.remove("rolls", roll.id))).ok;
    return (await run(() => API.save("rolls", roll ? { id: roll.id, ...vals } : vals))).ok;
  });
}

async function manageRolls() {
  let rolls = [];
  const host = h("div");
  const draw = async () => {
    const r = await run(() => API.rolls()); if (!r.ok) return;
    rolls = r.value;
    clear(host).append(table(["Rolo", { t: "Largura", r: true }, { t: "Comprimento", r: true }, { t: "Preço", r: true }, { t: "€/m²", r: true }, ""],
      rolls.map((x) => ({
        onClick: async () => { if (await editRoll(x)) draw(); },
        cells: [{ t: x.name, b: true }, { t: mF(x.width_m), r: true }, { t: `${numText(x.length_m)} m`, r: true }, moneyCell(x.price_cents),
          { t: eurF(x.price_cents / 100 / (x.width_m * x.length_m)), r: true },
          { node: btn("Apagar", async () => {
            if (await confirmDialog("Apagar rolo", `Apagar o rolo «${x.name}»?`, { yes: "Apagar", danger: true }) && (await run(() => API.remove("rolls", x.id))).ok) draw();
          }, "danger") }],
      })), { empty: "Ainda não há rolos. Crie o primeiro com «+ Novo rolo»." }));
  };
  await draw();
  await openModal({
    title: "Rolos e materiais", wide: true,
    body: (close) => h("div", { class: "modal-body" },
      h("p", { class: "muted" }, "Clique num rolo para o editar. O custo do papel por m² calcula-se a partir do preço, da largura e do comprimento do rolo."),
      host, h("div", { class: "modal-foot" }, btn("+ Novo rolo", async () => { if (await editRoll(null)) draw(); }, "primary"), h("div", { class: "spacer" }), btn("Fechar", () => close()))),
  });
}

async function pageCalc(root) {
  const load = await run(async () => ({ rolls: await API.rolls(), s: await API.calcSettings() }));
  if (!load.ok) return;
  const { rolls } = load.value; const S0 = load.value.s;
  if (!rolls.find((r) => r.id === calcState.rollId)) calcState.rollId = rolls[0] ? rolls[0].id : null;

  const num = (txt) => { try { return Math.max(0, parseNumber(txt)); } catch { return 0; } };
  const sel = h("select", {}, rolls.map((r) => h("option", { value: r.id }, r.name)));
  if (calcState.rollId != null) sel.value = String(calcState.rollId);
  const inp = (key, ph) => h("input", { type: "text", inputMode: "decimal", placeholder: ph, value: calcState[key], autocomplete: "off",
    oninput: (e) => { calcState[key] = e.target.value; update(); } });
  const fW = inp("w", "ex.: 0,8"), fL = inp("l", "ex.: 1"), fC = inp("copies", "1"), fE = inp("extra", "0,00");
  sel.addEventListener("change", () => { calcState.rollId = Number(sel.value); update(); });
  const field = (lab, el, hint) => h("label", { class: "field block" }, h("span", { class: "lab" }, lab), el, hint ? h("span", { class: "muted small" }, hint) : null);

  const out = h("div", { class: "calc-out" }), det = h("div");
  const line = (lab, val, strong) => h("div", { class: "calc-line" + (strong ? " strong" : "") }, h("span", {}, lab), h("b", {}, val));

  function update() {
    const roll = rolls.find((r) => r.id === Number(sel.value));
    clear(out); clear(det);
    if (!roll) { out.append(h("p", { class: "notice" }, "Crie primeiro um rolo (botão «Gerir rolos»).")); return; }
    const w = num(fW.value), l = num(fL.value), copies = Math.max(1, Math.round(num(fC.value) || 1)), extra = num(fE.value);
    const r = calcPrice(roll, S0, w, l, copies, extra);
    if (!(w > 0) || !(l > 0)) { out.append(h("p", { class: "muted" }, "Indique a largura e o comprimento do trabalho para ver o preço.")); return; }
    if (r.perRow === 0) { out.append(h("p", { class: "notice" }, `O trabalho (${mF(w)}) é mais largo do que o rolo (${mF(roll.width_m)}). Escolha outro rolo ou reduza a largura.`)); return; }
    out.append(
      h("div", { class: "calc-final" }, h("span", {}, "PREÇO FINAL (sem IVA)"), h("b", {}, eurF(r.final))),
      line("Preço calculado pela margem", eurF(r.calc)),
      line("Após arredondamento", eurF(r.rounded)),
      line("Preço mínimo aplicado?", r.minApplied ? "Sim" : "Não"),
      line("Preço por cópia", eurF(r.perCopy)),
      line("Preço por m² impresso", eurF(r.perM2)),
      line("Lucro bruto", eurF(r.profit)),
      line("Margem real", `${numText(r.realMargin * 100, 1)}%`));
    det.append(h("details", { class: "calc-details" }, h("summary", {}, "Ver detalhe do cálculo"),
      line("Cópias lado a lado (por fila)", String(r.perRow)), line("Filas de rolo necessárias", String(r.rows)),
      line("Comprimento de rolo gasto", mF(r.lenUsed)), line("Área de papel gasta (largura total do rolo)", m2F(r.paperArea)), line("Área impressa", m2F(r.printed)),
      line("Papel", eurF(r.c.paper)), line("Tinta", eurF(r.c.ink)), line("Máquina / manutenção", eurF(r.c.machine)),
      line("Mão de obra", eurF(r.c.labour)), line("Custos fixos + acabamentos", eurF(r.c.fixed)), line("CUSTO TOTAL", eurF(r.cost), true)));
  }

  // definições de custo (valores da folha de cálculo; partilhadas pelos dois)
  const sInputs = {};
  const sGrid = h("div", { class: "calc-settings" }, CALC_FIELDS.map((f) => {
    const v = f.pct ? S0[f.k] * 100 : S0[f.k];
    sInputs[f.k] = h("input", { type: "text", inputMode: "decimal", value: numText(v, 3) });
    return field(f.t, sInputs[f.k], f.note);
  }));
  const sErr = h("p", { class: "danger form-error", hidden: true });
  const saveS = h("button", { type: "button", class: "btn primary" }, "Guardar definições");
  saveS.onclick = async () => {
    const data = {};
    try {
      for (const f of CALC_FIELDS) {
        const n = parseNumber(sInputs[f.k].value);
        if (n < 0) throw new Error(`«${f.t}»: não pode ser negativo.`);
        data[f.k] = f.pct ? n / 100 : n;
      }
    } catch (e) { sErr.textContent = e.message === "vazio" || e.message === "número inválido" ? "Há um valor inválido nas definições." : e.message; sErr.hidden = false; return; }
    if (data.margin >= 1) { sErr.textContent = "A margem tem de ser inferior a 100%."; sErr.hidden = false; return; }
    sErr.hidden = true;
    if ((await run(() => API.saveCalcSettings(data))).ok) { toast("Definições guardadas."); refresh(); }
  };

  root.append(pageHeader("Calculadora", btn("Gerir rolos", async () => { await manageRolls(); refresh(); })),
    h("div", { class: "calc-grid" },
      h("div", { class: "card" }, h("h2", { class: "serif" }, "Trabalho"),
        field("Rolo", sel), field("Largura do trabalho (m)", fW), field("Comprimento do trabalho (m)", fL),
        field("Cópias", fC), field("Acabamentos extra (€)", fE, "Corte, laminação, ilhós, instalação, transporte…")),
      h("div", { class: "card" }, h("h2", { class: "serif" }, "Preço"), out)),
    det,
    h("details", { class: "calc-details card" }, h("summary", {}, "Definições de custo e margem"),
      h("p", { class: "muted" }, "Valores usados em todos os cálculos (tinta, máquina, mão de obra, margem…). Partilhados entre os dois."),
      sGrid, sErr, h("div", { class: "modal-foot" }, h("div", { class: "spacer" }), saveS)));
  update();
}
