(() => {
  "use strict";

  const STORAGE_KEY = "invoiceMakerState.v1";

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

  function fmtMoney(n) {
    const v = Number(n);
    return currency.format(Number.isFinite(v) ? v : 0);
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

  function randomGenNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 900000) + 100000;
    return `INV-${year}-${rand}`;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function defaultState() {
    return {
      fromName: "Loshan Parajuli",
      fromSub: "on behalf of fromSilicon",
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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return defaultState();
      return parsed;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);

  const fields = {
    fromName: $("f-fromName"),
    fromSub: $("f-fromSub"),
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

  function syncFormFromState() {
    fields.fromName.value = state.fromName;
    fields.fromSub.value = state.fromSub;
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
  }

  function renderItemsEditor() {
    itemsEditor.innerHTML = "";
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
            <label>Rate (USD)</label>
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
    const taxRate = Number(state.taxRate) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total, taxRate };
  }

  function renderPreview() {
    $("p-fromName").textContent = state.fromName;
    $("p-fromSub").textContent = state.fromSub;
    $("p-billName").textContent = state.billName;
    $("p-billSub").textContent = state.billSub;
    $("p-invoiceNumber").textContent = "#" + state.invoiceNumber;
    $("p-genNumber").textContent = state.genNumber;
    $("p-dateIssue").textContent = fmtDate(state.dateIssue);
    $("p-dueDate").textContent = fmtDate(state.dueDate);
    $("p-dueDateFooter").textContent = "Due " + fmtDate(state.dueDate);
    $("p-terms").textContent = state.terms;
    $("p-remittance").textContent = state.remittance;

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
    $("p-total").textContent = fmtMoney(total);
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
        saveState();
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
    saveState();
    renderPreview();
  });

  itemsEditor.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove");
    state.items = state.items.filter((it) => it.id !== id);
    saveState();
    render();
  });

  $("btn-add-item").addEventListener("click", () => {
    state.items.push({ id: uid(), name: "New Service", desc: "", qty: 1, rate: 0 });
    saveState();
    render();
  });

  $("btn-regen").addEventListener("click", () => {
    state.genNumber = randomGenNumber();
    fields.genNumber.value = state.genNumber;
    saveState();
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
    state = defaultState();
    saveState();
    syncFormFromState();
    render();
  });

  // ---------- Init ----------
  bindSimpleFields();
  syncFormFromState();
  render();
})();
