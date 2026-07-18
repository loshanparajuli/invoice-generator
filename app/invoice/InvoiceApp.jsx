"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TEAM, matchTeamMember } from "@/lib/team";
import { fmtMoney, fmtNumber, fmtDate, todayISO, nextWednesdayISO, randomGenNumber, uid } from "@/lib/format";
import { downloadPdf, renderPdfBase64 } from "@/lib/pdf";

const STORAGE_KEY = "invoiceMakerState.v2";
const OWNERSHIP_RATE = 0.1;

function defaultState(mode) {
  if (mode === "internal") {
    const issue = todayISO();
    return {
      mode: "internal",
      fromName: "",
      fromSub: "",
      fromEmail: "",
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
    fromEmail: "",
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

function currencyCode(mode) {
  return mode === "internal" ? "NPR" : "USD";
}

function computeTotals(state, mode) {
  const subtotal = state.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const taxRate = mode === "internal" ? 0 : Number(state.taxRate) || 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const ownership = subtotal * OWNERSHIP_RATE;
  const service = subtotal - ownership;
  return { subtotal, tax, total, taxRate, service, ownership };
}

function monthNameFromISO(isoStr) {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

function invoiceFilename(state) {
  const month = monthNameFromISO(state.dateIssue) || monthNameFromISO(todayISO());
  return `Invoice for ${month} - fromSilicon.pdf`;
}

function loadStoredMode(mode) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const stored = parsed && typeof parsed === "object" ? parsed[mode] : null;
    return stored && Array.isArray(stored.items) ? { ...stored, mode } : defaultState(mode);
  } catch {
    return defaultState(mode);
  }
}

function persistState(mode, state) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const store = parsed && typeof parsed === "object" ? parsed : {};
    store[mode] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable (private browsing, etc.) — non-fatal.
  }
}

export default function InvoiceApp() {
  // Defaults straight into Internal mode — no upfront Internal/External picker —
  // since almost every use is a team member filing their own invoice. "Switch mode"
  // toggles directly between the two; the current mode is shown as a badge.
  const [mode, setMode] = useState(null);
  const [state, setState] = useState(null);
  const pageRef = useRef(null);

  const [downloading, setDownloading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPassword, setSendPassword] = useState("");
  const [sendAgree, setSendAgree] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("mode-internal", mode === "internal");
    document.body.classList.toggle("mode-external", mode === "external");
  }, [mode]);

  useEffect(() => {
    if (!mode || !state) return;
    persistState(mode, state);
  }, [mode, state]);

  useEffect(() => {
    pickMode("internal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickMode(m) {
    setMode(m);
    setState(loadStoredMode(m));
  }

  function toggleMode() {
    pickMode(mode === "internal" ? "external" : "internal");
  }

  function update(key, value) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleDateIssueChange(value) {
    setState((prev) => {
      const next = { ...prev, dateIssue: value };
      if (mode === "internal") next.dueDate = nextWednesdayISO(value);
      return next;
    });
  }

  // Typing a few characters of a roster member's name (any case) auto-fills their
  // PAN and email — no dropdown needed. Only one unique prefix match triggers it.
  function handleFromNameChange(value) {
    setState((prev) => {
      const next = { ...prev, fromName: value };
      const match = mode === "internal" ? matchTeamMember(value) : null;
      if (match) {
        next.fromSub = match.sub || prev.fromSub || "on behalf of fromSilicon";
        if (match.pan) next.pan = match.pan;
        if (match.email) next.fromEmail = match.email;
      }
      return next;
    });
  }

  function updateItem(id, field, value) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.id === id
          ? { ...it, [field]: field === "qty" || field === "rate" ? (value === "" ? 0 : Number(value)) : value }
          : it
      ),
    }));
  }

  function addItem() {
    setState((prev) => ({ ...prev, items: [...prev.items, { id: uid(), name: "New Service", desc: "", qty: 1, rate: 0 }] }));
  }

  function removeItem(id) {
    setState((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  }

  function resetToSample() {
    if (!window.confirm("Reset all fields to the sample invoice? This clears your current data.")) return;
    setState(defaultState(mode));
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadPdf(pageRef.current, invoiceFilename(state));
    } finally {
      setDownloading(false);
    }
  }

  function openSendModal() {
    setSendPassword("");
    setSendAgree(false);
    setSendError("");
    setSendOpen(true);
  }

  async function submitSend() {
    if (!sendPassword) {
      setSendError("Enter the team password.");
      return;
    }
    if (!sendAgree) {
      setSendError("You must agree to the terms above before sending.");
      return;
    }
    setSendError("");
    setSending(true);
    try {
      const { total } = computeTotals(state, mode);
      const filename = invoiceFilename(state);
      const pdfBase64 = await renderPdfBase64(pageRef.current, filename);
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: sendPassword,
          pdfBase64,
          filename,
          meta: {
            fromName: state.fromName,
            fromEmail: state.fromEmail,
            invoiceNumber: state.invoiceNumber,
            total: fmtMoney(total, currencyCode(mode)),
            dueDate: fmtDate(state.dueDate),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || "Failed to send invoice. Try again.");
        return;
      }
      setSendOpen(false);
      alert("Invoice sent to fromSilicon.");
    } catch {
      setSendError("Network error — could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  const internal = mode === "internal";
  const code = currencyCode(mode || "external");
  const totals = state ? computeTotals(state, mode) : null;

  return (
    <>
      {state && totals && (
        <>
          <div className={`send-overlay ${sendOpen ? "" : "hidden"}`}>
            <div className="send-modal">
              <div className="send-modal-title">Send Invoice by Email</div>
              <div className="send-modal-sub">Emails a PDF copy of this invoice to fromSilicon.</div>

              <div className="field">
                <label>Team Password</label>
                <input
                  type="password"
                  placeholder="Shared team password"
                  value={sendPassword}
                  onChange={(e) => setSendPassword(e.target.value)}
                />
              </div>

              <div className="send-confirm-text">
                By sending, you confirm:
                <ul>
                  <li>The delivery matches what&rsquo;s documented in Notion.</li>
                  <li>The payment date is approximate (nearest payday).</li>
                  <li>You&rsquo;re authorized to send this invoice, and ownership of the delivered work transfers to fromSilicon upon sending.</li>
                </ul>
              </div>

              <label className="send-checkbox-row">
                <input type="checkbox" checked={sendAgree} onChange={(e) => setSendAgree(e.target.checked)} />
                <span>I agree to the above and authorize sending this invoice.</span>
              </label>

              <div className="send-error">{sendError}</div>

              <div className="send-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setSendOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-send" type="button" disabled={sending} onClick={submitSend}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>

          <div className="app">
            {/* ===================== CONTROL Section ===================== */}
            <aside className="panel">
              <Link href="/" className="back-link">&larr; All tools</Link>
              <h1>Invoice Maker</h1>
              <div className="sub-row">
                <div className="sub">
                  fromSilicon &middot; generator
                  <span className={`mode-pill ${internal ? "mode-pill-internal" : "mode-pill-external"}`}>
                    {internal ? "Internal" : "External"}
                  </span>
                </div>
                <button className="mode-switch" type="button" onClick={toggleMode}>
                  Switch to {internal ? "External" : "Internal"}
                </button>
              </div>

              <div className="section">
                <div className="section-title">From</div>
                <div className="field">
                  <label>Your Name</label>
                  <input
                    type="text"
                    list={internal ? "team-roster" : undefined}
                    placeholder="Loshan Parajuli"
                    value={state.fromName}
                    onChange={(e) => handleFromNameChange(e.target.value)}
                  />
                  {internal && (
                    <>
                      <datalist id="team-roster">
                        {TEAM.map((m) => (
                          <option key={m.name} value={m.name} />
                        ))}
                      </datalist>
                      <div className="hint">Start typing your name. PAN and email fill in automatically.</div>
                    </>
                  )}
                </div>
                <div className="field">
                  <label>Subtitle</label>
                  <input
                    type="text"
                    placeholder="on behalf of fromSilicon"
                    value={state.fromSub}
                    onChange={(e) => update("fromSub", e.target.value)}
                  />
                </div>
                {internal && (
                  <div className="field">
                    <label>PAN Number</label>
                    <input
                      type="text"
                      placeholder="601234567"
                      value={state.pan}
                      onChange={(e) => update("pan", e.target.value)}
                    />
                  </div>
                )}
                {internal && (
                  <div className="field">
                    <label>Official Email</label>
                    <input
                      type="email"
                      placeholder="you@fromsilicon.com"
                      value={state.fromEmail}
                      onChange={(e) => update("fromEmail", e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="section">
                <div className="section-title">Billed To</div>
                <div className="field">
                  <label>Client Name</label>
                  <input
                    type="text"
                    placeholder="Losh Prashad"
                    value={state.billName}
                    disabled={internal}
                    onChange={(e) => update("billName", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Client Role / Company</label>
                  <input
                    type="text"
                    placeholder="Founder &amp; MP at fromSilicon LLC"
                    value={state.billSub}
                    disabled={internal}
                    onChange={(e) => update("billSub", e.target.value)}
                  />
                </div>
                {internal && <div className="hint">Fixed for internal invoices.</div>}
              </div>

              <div className="section">
                <div className="section-title">Invoice Details</div>
                <div className="field">
                  <label>Invoice Number</label>
                  <input type="text" placeholder="007612" value={state.invoiceNumber} onChange={(e) => update("invoiceNumber", e.target.value)} />
                </div>
                <div className="field">
                  <label>Generation Number</label>
                  <div className="gen-row">
                    <input type="text" placeholder="INV-2026-077840" value={state.genNumber} onChange={(e) => update("genNumber", e.target.value)} />
                    <button className="btn btn-small" type="button" onClick={() => update("genNumber", randomGenNumber())}>
                      New
                    </button>
                  </div>
                </div>
                <div className="row-2">
                  <div className="field">
                    <label>Date of Issue</label>
                    <input type="date" value={state.dateIssue} onChange={(e) => handleDateIssueChange(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Due Date</label>
                    <input type="date" value={state.dueDate} disabled={internal} onChange={(e) => update("dueDate", e.target.value)} />
                    {internal && <div className="hint">Auto-set to the nearest Wednesday (payday).</div>}
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="section-title">
                  <span>Line Items</span>
                </div>
                <div>
                  {state.items.map((item, idx) => (
                    <div className="line-item-card" key={item.id}>
                      <div className="line-item-head">
                        <span>Item {idx + 1}</span>
                        <button className="remove-btn" type="button" onClick={() => removeItem(item.id)}>
                          Remove
                        </button>
                      </div>
                      <div className="field">
                        <label>Description</label>
                        <input type="text" value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Details</label>
                        <textarea value={item.desc} onChange={(e) => updateItem(item.id, "desc", e.target.value)} />
                      </div>
                      <div className="row-2">
                        <div className="field">
                          <label>Qty</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.qty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateItem(item.id, "qty", e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Rate ({code})</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.rate}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateItem(item.id, "rate", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn add-item-btn" type="button" onClick={addItem}>
                  + Add Project / Line Item
                </button>
              </div>

              {!internal && (
                <div className="section">
                  <div className="section-title">Tax</div>
                  <div className="row-2">
                    <div className="field">
                      <label>Tax Label</label>
                      <input type="text" placeholder="Contractor Tax" value={state.taxLabel} onChange={(e) => update("taxLabel", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Tax Rate (%)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="5"
                        value={state.taxRate}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => update("taxRate", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="section">
                <div className="section-title">Notes &amp; Terms</div>
                <div className="field">
                  <label>Terms</label>
                  <textarea value={state.terms} onChange={(e) => update("terms", e.target.value)} />
                </div>
                {!internal && (
                  <div className="field">
                    <label>Remarks</label>
                    <textarea value={state.remittance} onChange={(e) => update("remittance", e.target.value)} />
                  </div>
                )}
                {internal && <div className="hint">Tax is not fromSilicon&rsquo;s responsibility. Noted automatically on the invoice.</div>}
              </div>

              <div className="export-bar">
                <button className="btn btn-primary" type="button" disabled={downloading} onClick={handleDownload}>
                  {downloading ? "Rendering..." : "Download PDF"}
                </button>
                {internal && (
                  <button className="btn btn-send" type="button" style={{ marginTop: 8 }} onClick={openSendModal}>
                    Send Email to fromSilicon
                  </button>
                )}
                <button className="btn btn-ghost" type="button" style={{ marginTop: 8 }} onClick={resetToSample}>
                  Reset to sample data
                </button>
                <div className="hint">Downloads a high-resolution PDF directly &mdash; no print dialog. Your data auto-saves in this browser.</div>
              </div>
            </aside>

            {/* ===================== PREVIEW STAGE ===================== */}
            <main className="stage">
              <div className="page-wrap">
                <div className="page" id="invoice-page" ref={pageRef}>
                  <div className="letterhead">
                    <div className="brand">
                      <div className="brand-mark">
                        <img src="/logo.png" alt="fromSilicon" width="64" height="64" />
                      </div>
                      <div>
                        <div className="brand-name"><span className="light">from</span><span className="bold">Silicon</span></div>
                        <div className="brand-tag">TECH &middot; MEDIA &middot; DISTRIBUTION</div>
                      </div>
                    </div>
                    <div className="doc-id">
                      <div className="doc-title">Invoice</div>
                      <div className="doc-gen">{state.genNumber}</div>
                    </div>
                  </div>

                  <div className="meta-grid">
                    <div>
                      <div className="meta-label">Invoice Number</div>
                      <div className="meta-value">#{state.invoiceNumber}</div>
                    </div>
                    <div>
                      <div className="meta-label">Date of Issue</div>
                      <div className="meta-value">{fmtDate(state.dateIssue)}</div>
                    </div>
                    <div>
                      <div className="meta-label">Due Date</div>
                      <div className="meta-value">{fmtDate(state.dueDate)}</div>
                    </div>
                    <div>
                      <div className="meta-label">Billed To</div>
                      <div className="meta-person">
                        {state.billName}<br />
                        <span className="role">{state.billSub}</span>
                      </div>
                    </div>
                    <div></div>
                    <div>
                      <div className="meta-label">From</div>
                      <div className="meta-person">
                        {state.fromName}<br />
                        <span className="role">{state.fromSub}</span>
                        {internal && state.pan && <div className="role">PAN: {state.pan}</div>}
                      </div>
                    </div>
                  </div>

                  <div className="section-head">
                    <span className="section-num">01</span>
                    <h2>Services Delivered</h2>
                    <span className="rule"></span>
                  </div>

                  <div className="table-head">
                    <div>Description</div>
                    <div className="num">Qty</div>
                    <div className="amt">Rate</div>
                    <div className="amt">Amount</div>
                  </div>

                  <div className="items-body">
                    {state.items.map((item) => {
                      const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                      return (
                        <div className="row" key={item.id}>
                          <div>
                            <div className="item-name">{item.name}</div>
                            <div className="item-desc">{item.desc}</div>
                          </div>
                          <div className="item-qty">{item.qty}</div>
                          <div className="item-rate">{internal ? fmtNumber(item.rate) : fmtMoney(item.rate, code)}</div>
                          <div className="item-amount">{internal ? fmtNumber(amount) : fmtMoney(amount, code)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {!internal && (
                    <div className="totals-wrap">
                      <div className="totals">
                        <div className="totals-row">
                          <span className="totals-label">Subtotal</span>
                          <span className="totals-value">{fmtMoney(totals.subtotal, code)}</span>
                        </div>
                        <div className="totals-row tax">
                          <span className="totals-label">{state.taxLabel || "Tax"} &middot; {totals.taxRate}%</span>
                          <span className="totals-value">{fmtMoney(totals.tax, code)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="total-due">
                    <div className="ht-dots dots-fade"></div>
                    <div className="total-due-main">
                      <div className="total-due-left">
                        <div className="total-due-label">Total Due</div>
                        <div className="total-due-sub">Payable upon receipt &middot; {code}</div>
                      </div>
                      <div className="total-due-right">
                        <div className="total-due-amount">{fmtMoney(internal ? totals.subtotal : totals.total, code)}</div>
                        <div className="total-due-date"><span>Due {fmtDate(state.dueDate)}</span></div>
                      </div>
                    </div>
                    {internal && (
                      <div className="total-due-split">
                        <div className="split-row">
                          <span>Service Charge &middot; 90%</span>
                          <span>{fmtMoney(totals.service, code)}</span>
                        </div>
                        <div className="split-row">
                          <span>Ownership Transfer &middot; 10%</span>
                          <span>{fmtMoney(totals.ownership, code)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="section-head notes">
                    <span className="section-num">02</span>
                    <h2>Notes &amp; Terms</h2>
                    <span className="rule"></span>
                  </div>

                  <div className="notes-grid">
                    <div>
                      <div className="notes-label">Terms</div>
                      <div className="notes-text">{state.terms}</div>
                    </div>
                    {!internal && (
                      <div>
                        <div className="notes-label">Remarks</div>
                        <div className="notes-text">{state.remittance}</div>
                      </div>
                    )}
                    {internal && (
                      <div>
                        <div className="notes-label">Remarks</div>
                        <div className="notes-text">
                          fromSilicon does not withhold, remit, or otherwise facilitate any tax on this
                          payment. Any applicable tax burden is the sole responsibility of the contractor.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="footer">
                    <span>Invoice &middot; Confidential</span>
                    <span>FROMSILICON.COM &middot; KATHMANDU, KTM</span>
                  </div>
                </div>
                <div className="powered-by">
                  <a href="https://fromsilicon.com/?utm_source=invoice_maker&utm_medium=app&utm_campaign=powered_by" target="_blank" rel="noopener noreferrer">
                    Powered by fromSilicon
                  </a>
                </div>
              </div>
            </main>
          </div>
        </>
      )}
    </>
  );
}
