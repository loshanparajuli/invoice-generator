(() => {
  "use strict";

  const STORAGE_KEY = "invoiceMakerState.v2";

  const formatters = {
    USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }),
    NPR: new Intl.NumberFormat("en-US", { style: "currency", currency: "NPR", minimumFractionDigits: 2 }),
  };

  function currencyCode() {
    return state.mode === "internal" ? "NPR" : "USD";
  }

  function fmtMoney(n) {
    const v = Number(n);
    return formatters[currencyCode()].format(Number.isFinite(v) ? v : 0);
  }

  function fmtDate(isoStr) {
    if (!isoStr) return "";
    const [y, m, d] = isoStr.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  // Team payday falls on Wednesdays. Given an issue date, roll forward to
  // that date if it's already a Wednesday, otherwise the next one.
  function nextWednesdayISO(isoStr) {
    const [y, m, d] = isoStr.split("-").map(Number);
    if (!y || !m || !d) return isoStr;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay(); // 0=Sun ... 3=Wed ... 6=Sat
    const diff = (3 - day + 7) % 7;
    dt.setUTCDate(dt.getUTCDate() + diff);
    return dt.toISOString().slice(0, 10);
  }

  function randomGenNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 900000) + 100000;
    return `INV-${year}-${rand}`;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function defaultState(mode) {
    if (mode === "internal") {
      const issue = todayISO();
      return {
        mode: "internal",
        fromName: "",
        fromSub: "",
        pan: "",
        billName: "Loshan Parajuli",
        billSub: "on behalf of fromSilicon",
        invoiceNumber: "007612",
        genNumber: randomGenNumber(),
        dateIssue: issue,
        dueDate: nextWednesdayISO(issue),
        taxLabel: "",
        taxRate: 0,
        terms: "Thank you for your work this pay period.",
        remittance: "",
        items: [{ id: uid(), name: "Work Completed", desc: "", qty: 1, rate: 0 }],
      };
    }
    return {
      mode: "external",
      fromName: "Loshan Parajuli",
      fromSub: "on behalf of fromSilicon",
      pan: "",
      billName: "Losh Prashad",
      billSub: "Founder & MP at fromSilicon LLC",
      invoiceNumber: "007612",
      genNumber: randomGenNumber(),
      dateIssue: todayISO(),
      dueDate: todayISO(7),
      taxLabel: "Contractor Tax",
      taxRate: 5,
      terms:
        "The amount listed under “Tax” represents a 5% Contractor Tax levied by the Federal Government of the service provider’s country of origin.",
      remittance:
        "Please remit payment by the due date. Reference the invoice number on all transfers.\nlosh@fromsilicon.com",
      items: [
        { id: uid(), name: "Long Form Media Production", desc: "Includes direction and post production", qty: 4, rate: 99 },
        { id: uid(), name: "Thumbnails", desc: "From conceptualization to execution", qty: 4, rate: 9 },
        { id: uid(), name: "Project Backup as per the SLAs", desc: "Includes Hi-res copy of every composition\nincluding the original project file", qty: 4, rate: 0 },
      ],
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  const store = loadStore();
  let state = null; // set once a mode is chosen

  function saveStore() {
    store[state.mode] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);

  const fields = {
    fromName: $("f-fromName"),
    fromSub: $("f-fromSub"),
    pan: $("f-pan"),
    billName: $("f-billName"),
    billSub: $("f-billSub"),
    invoiceNumber: $("f-invoiceNumber"),
    genNumber: $("f-genNumber"),
    dateIssue: $("f-dateIssue"),
    dueDate: $("f-dueDate"),
    taxLabel: $("f-taxLabel"),
    taxRate: $("f-taxRate"),
    terms: $("f-terms"),
    remittance: $("f-remittance"),
  };

  const itemsEditor = $("items-editor");
  const itemsBody = $("items-body");
  const modeOverlay = $("mode-overlay");

  function applyModeLocks() {
    const internal = state.mode === "internal";
    document.body.classList.toggle("mode-internal", internal);
    document.body.classList.toggle("mode-external", !internal);

    fields.billName.disabled = internal;
    fields.billSub.disabled = internal;
    fields.dueDate.disabled = internal;
  }

  function syncFormFromState() {
    fields.fromName.value = state.fromName;
    fields.fromSub.value = state.fromSub;
    fields.pan.value = state.pan || "";
    fields.billName.value = state.billName;
    fields.billSub.value = state.billSub;
    fields.invoiceNumber.value = state.invoiceNumber;
    fields.genNumber.value = state.genNumber;
    fields.dateIssue.value = state.dateIssue;
    fields.dueDate.value = state.dueDate;
    fields.taxLabel.value = state.taxLabel;
    fields.taxRate.value = state.taxRate;
    fields.terms.value = state.terms;
    fields.remittance.value = state.remittance;
    applyModeLocks();
  }

  function renderItemsEditor() {
    itemsEditor.innerHTML = "";
    const code = currencyCode();
    state.items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "line-item-card";
      card.innerHTML = `
        <div class="line-item-head">
          <span>Item ${idx + 1}</span>
          <button class="remove-btn" type="button" data-remove="${item.id}">Remove</button>
        </div>
        <div class="field">
          <label>Description</label>
          <input type="text" data-field="name" data-id="${item.id}" value="${escapeAttr(item.name)}">
        </div>
        <div class="field">
          <label>Details</label>
          <textarea data-field="desc" data-id="${item.id}">${escapeHtml(item.desc)}</textarea>
        </div>
        <div class="row-2">
          <div class="field">
            <label>Qty</label>
            <input type="number" min="0" step="1" data-field="qty" data-id="${item.id}" value="${item.qty}">
          </div>
          <div class="field">
            <label>Rate (${code})</label>
            <input type="number" min="0" step="0.01" data-field="rate" data-id="${item.id}" value="${item.rate}">
          </div>
        </div>
      `;
      itemsEditor.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function computeTotals() {
    const subtotal = state.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
    const taxRate = state.mode === "internal" ? 0 : Number(state.taxRate) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total, taxRate };
  }

  function renderPreview() {
    const internal = state.mode === "internal";

    $("p-fromName").textContent = state.fromName;
    $("p-fromSub").textContent = state.fromSub;
    $("p-fromPan").textContent = state.pan ? `PAN: ${state.pan}` : "";
    $("p-billName").textContent = state.billName;
    $("p-billSub").textContent = state.billSub;
    $("p-invoiceNumber").textContent = "#" + state.invoiceNumber;
    $("p-genNumber").textContent = state.genNumber;
    $("p-dateIssue").textContent = fmtDate(state.dateIssue);
    $("p-dueDate").textContent = fmtDate(state.dueDate);
    $("p-dueDateFooter").textContent = "Due " + fmtDate(state.dueDate);
    $("p-terms").textContent = state.terms;
    $("p-remittance").textContent = state.remittance;
    $("p-totalDueSub").textContent = `Payable upon receipt · ${currencyCode()}`;

    itemsBody.innerHTML = "";
    state.items.forEach((item) => {
      const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div>
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-desc">${escapeHtml(item.desc)}</div>
        </div>
        <div class="item-qty">${escapeHtml(item.qty)}</div>
        <div class="item-rate">${fmtMoney(item.rate)}</div>
        <div class="item-amount">${fmtMoney(amount)}</div>
      `;
      itemsBody.appendChild(row);
    });

    const { subtotal, tax, total, taxRate } = computeTotals();
    $("p-subtotal").textContent = fmtMoney(subtotal);
    $("p-tax").textContent = fmtMoney(tax);
    $("p-total").textContent = fmtMoney(internal ? subtotal : total);
    $("p-taxLabel").textContent = `${state.taxLabel || "Tax"} · ${taxRate}%`;
  }

  function render() {
    renderItemsEditor();
    renderPreview();
  }

  // ---------- Event wiring ----------
  function bindSimpleFields() {
    const map = [
      ["fromName", "fromName"],
      ["fromSub", "fromSub"],
      ["pan", "pan"],
      ["billName", "billName"],
      ["billSub", "billSub"],
      ["invoiceNumber", "invoiceNumber"],
      ["genNumber", "genNumber"],
      ["dateIssue", "dateIssue"],
      ["dueDate", "dueDate"],
      ["taxLabel", "taxLabel"],
      ["taxRate", "taxRate"],
      ["terms", "terms"],
      ["remittance", "remittance"],
    ];
    map.forEach(([fieldKey, stateKey]) => {
      fields[fieldKey].addEventListener("input", () => {
        state[stateKey] = fields[fieldKey].value;
        if (fieldKey === "dateIssue" && state.mode === "internal") {
          state.dueDate = nextWednesdayISO(state.dateIssue);
          fields.dueDate.value = state.dueDate;
        }
        saveStore();
        renderPreview();
      });
    });
  }

  itemsEditor.addEventListener("input", (e) => {
    const target = e.target;
    const id = target.getAttribute("data-id");
    const field = target.getAttribute("data-field");
    if (!id || !field) return;
    const item = state.items.find((it) => it.id === id);
    if (!item) return;
    if (field === "qty" || field === "rate") {
      item[field] = target.value === "" ? 0 : Number(target.value);
    } else {
      item[field] = target.value;
    }
    saveStore();
    renderPreview();
  });

  itemsEditor.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove");
    state.items = state.items.filter((it) => it.id !== id);
    saveStore();
    render();
  });

  $("btn-add-item").addEventListener("click", () => {
    state.items.push({ id: uid(), name: "New Service", desc: "", qty: 1, rate: 0 });
    saveStore();
    render();
  });

  $("btn-regen").addEventListener("click", () => {
    state.genNumber = randomGenNumber();
    fields.genNumber.value = state.genNumber;
    saveStore();
    renderPreview();
  });

  function monthNameFromISO(isoStr) {
    if (!isoStr) return "";
    const [y, m, d] = isoStr.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  }

  function exportPdf() {
    const btn = $("btn-export");
    const pageEl = $("invoice-page");
    const originalLabel = btn.textContent;
    btn.textContent = "Rendering...";
    btn.disabled = true;

    const width = pageEl.offsetWidth;
    const height = pageEl.offsetHeight;
    const month = monthNameFromISO(state.dateIssue) || monthNameFromISO(todayISO());

    return html2pdf()
      .set({
        margin: 0,
        filename: `Invoice for ${month} - fromSilicon.pdf`,
        image: { type: "jpeg", quality: 1 },
        html2canvas: { scale: 3, useCORS: true, backgroundColor: "#f2f0ec" },
        jsPDF: { unit: "px", format: [width, height], orientation: "portrait" },
      })
      .from(pageEl)
      .save()
      .finally(() => {
        btn.textContent = originalLabel;
        btn.disabled = false;
      });
  }

  $("btn-export").addEventListener("click", exportPdf);

  $("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset all fields to the sample invoice? This clears your current data.")) return;
    state = defaultState(state.mode);
    saveStore();
    syncFormFromState();
    render();
  });

  // ---------- Mode select ----------
  function enterMode(mode) {
    state = store[mode] && Array.isArray(store[mode].items) ? store[mode] : defaultState(mode);
    state.mode = mode;
    saveStore();
    syncFormFromState();
    render();
    modeOverlay.classList.add("hidden");
  }

  modeOverlay.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    enterMode(btn.getAttribute("data-mode"));
  });

  $("btn-switch-mode").addEventListener("click", () => {
    modeOverlay.classList.remove("hidden");
  });

  // ---------- Init ----------
  bindSimpleFields();
})();
