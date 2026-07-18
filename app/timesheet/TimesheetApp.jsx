"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import SignatureCanvas from "react-signature-canvas";
import { fmtDate, todayISO, addDaysISO, uid, pacificWallTimeToInstant, formatPacificDateTime, formatDurationMs } from "@/lib/format";
import { renderPdfBase64 } from "@/lib/pdf";

const DEFAULT_FILMMAKER = "Subash Thokar";

const SHOOT_TYPES = [
  "Interview",
  "Podcast",
  "Launch Video",
  "Product Demo",
  "Event Coverage",
  "Behind the Scenes",
  "Testimonial",
  "Documentary",
  "Music Video",
  "Corporate",
  "Other",
];

function computeBillable(date, startTime, endTime, breaks) {
  const startMs = pacificWallTimeToInstant(date, startTime);
  let endMs = pacificWallTimeToInstant(date, endTime);
  if (startMs == null || endMs == null) return { shiftMs: 0, breakMs: 0, billableMs: 0, breakDurations: [] };
  if (endMs <= startMs) endMs = pacificWallTimeToInstant(addDaysISO(date, 1), endTime);

  const shiftMs = Math.max(0, endMs - startMs);

  let breakMs = 0;
  const breakDurations = breaks
    .map((b) => {
      if (!b.start || !b.end) return null;
      const bStart = pacificWallTimeToInstant(date, b.start);
      let bEnd = pacificWallTimeToInstant(date, b.end);
      if (bStart == null || bEnd == null) return null;
      if (bEnd <= bStart) bEnd = pacificWallTimeToInstant(addDaysISO(date, 1), b.end);
      const ms = Math.max(0, bEnd - bStart);
      breakMs += ms;
      return { id: b.id, start: b.start, end: b.end, ms };
    })
    .filter(Boolean);

  return { shiftMs, breakMs, billableMs: Math.max(0, shiftMs - breakMs), breakDurations };
}

function recordFilename(clientName, date) {
  return `Timesheet - ${clientName || "Client"} - ${date} - fromSilicon.pdf`;
}

export default function TimesheetApp() {
  const [phase, setPhase] = useState("fill"); // "fill" | "review" | "done"

  const [filmmaker, setFilmmaker] = useState(DEFAULT_FILMMAKER);
  const [filmmakerEmail, setFilmmakerEmail] = useState("");
  const [shootTitle, setShootTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [shootType, setShootType] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breaks, setBreaks] = useState([]);

  const [hasSignature, setHasSignature] = useState(false);
  const [signedAtMs, setSignedAtMs] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const sigPadRef = useRef(null);
  const recordRef = useRef(null);

  const filmmakerName = filmmaker.trim();

  const hoursInfo = useMemo(
    () => computeBillable(date, startTime, endTime, breaks),
    [date, startTime, endTime, breaks]
  );

  const canProceed = Boolean(filmmakerName && clientName && date && startTime && endTime && hoursInfo.billableMs > 0);

  function addBreak() {
    setBreaks((prev) => [...prev, { id: uid(), start: "", end: "" }]);
  }

  function updateBreak(id, field, value) {
    setBreaks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }

  function removeBreak(id) {
    setBreaks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleClearSignature() {
    sigPadRef.current?.clear();
    setHasSignature(false);
  }

  async function handleApproveSign() {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return;
    setSubmitError("");
    setSubmitting(true);
    const signedAt = Date.now();
    try {
      flushSync(() => {
        setSignedAtMs(signedAt);
        setCapturing(true);
      });

      const filename = recordFilename(clientName, date);
      const pdfBase64 = await renderPdfBase64(recordRef.current, filename);

      const res = await fetch("/api/send-timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          filename,
          meta: {
            filmmakerName,
            filmmakerEmail,
            shootTitle,
            clientName,
            shootType,
            date: fmtDate(date),
            hours: formatDurationMs(hoursInfo.billableMs),
            signedAt: formatPacificDateTime(signedAt),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || "Failed to send. Try again.");
        setSignedAtMs(null);
        return;
      }
      setPhase("done");
    } catch {
      setSubmitError("Network error — could not reach the server.");
      setSignedAtMs(null);
    } finally {
      setSubmitting(false);
      setCapturing(false);
    }
  }

  if (phase === "done") {
    return (
      <div className="review-done">
        <div>
          <div className="review-done-title">Signed and sent</div>
          <div className="review-done-sub">A copy has been emailed to fromSilicon.</div>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="review-wrap">
        <div className="review-card">
          <button className="back-link-light" type="button" onClick={() => setPhase("fill")}>
            &larr; Edit shift details
          </button>

          <div ref={recordRef}>
            <div className="review-header">
              <div className="brand-mark" style={{ margin: "0 auto 10px" }}>
                <img src="/logo.png" alt="fromSilicon" width="64" height="64" />
              </div>
              <div className="doc-title">Timesheet</div>
              <div className="brand-tag">CLIENT SIGN-OFF</div>
            </div>

            <div className="review-summary">
              {shootTitle && (
                <div className="review-row">
                  <span className="review-row-label">Shoot</span>
                  <span className="review-row-value">{shootTitle}</span>
                </div>
              )}
              <div className="review-row">
                <span className="review-row-label">Filmmaker</span>
                <span className="review-row-value">{filmmakerName}</span>
              </div>
              <div className="review-row">
                <span className="review-row-label">Client / Project</span>
                <span className="review-row-value">{clientName}</span>
              </div>
              {shootType && (
                <div className="review-row">
                  <span className="review-row-label">Nature of Shoot</span>
                  <span className="review-row-value">{shootType}</span>
                </div>
              )}
              <div className="review-row">
                <span className="review-row-label">Date</span>
                <span className="review-row-value">{fmtDate(date)}</span>
              </div>
              <div className="review-row">
                <span className="review-row-label">Shift (Pacific)</span>
                <span className="review-row-value">{startTime} &ndash; {endTime}</span>
              </div>
            </div>

            <div className="review-hours">
              <div className="review-hours-label">Billable Hours</div>
              <div className="review-hours-amount">{formatDurationMs(hoursInfo.billableMs)}</div>
              <div className="total-due-split">
                <div className="split-row">
                  <span>Shift {startTime}&ndash;{endTime}</span>
                  <span>{formatDurationMs(hoursInfo.shiftMs)}</span>
                </div>
                {hoursInfo.breakDurations.map((b, i) => (
                  <div className="split-row" key={b.id}>
                    <span>Break {i + 1} ({b.start}&ndash;{b.end})</span>
                    <span>&minus;{formatDurationMs(b.ms)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="attest-text">I confirm the hours above are accurate and were worked as described.</div>

            <div className="sig-block">
              <div className="sig-label">
                <span>Client Signature</span>
                <button
                  className="sig-clear"
                  type="button"
                  style={{ visibility: capturing ? "hidden" : "visible" }}
                  onClick={handleClearSignature}
                >
                  Clear
                </button>
              </div>
              <div className="sig-canvas-wrap">
                <SignatureCanvas
                  ref={sigPadRef}
                  penColor="#0a0a0a"
                  clearOnResize={false}
                  onEnd={() => setHasSignature(!sigPadRef.current.isEmpty())}
                  canvasProps={{ className: "sig-canvas" }}
                />
              </div>
            </div>

            {signedAtMs && (
              <div className="notes-text" style={{ textAlign: "center", marginBottom: 12 }}>
                Signed {formatPacificDateTime(signedAtMs)}
              </div>
            )}

            <div className="footer">
              <span>Timesheet &middot; Confidential</span>
              <span>Adheres to the Independent Contractor Agreement</span>
            </div>
          </div>

          <div className="review-actions">
            <button className="btn btn-send" type="button" disabled={!hasSignature || submitting} onClick={handleApproveSign}>
              {submitting ? "Sending..." : "Approve & Send for Invoice"}
            </button>
          </div>
          <div className="review-error">{submitError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-wrap">
      <div className="ts-page light-form">
        <Link href="/" className="back-link-light">&larr; All tools</Link>

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
            <div className="doc-title">Timesheet</div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Shoot</div>
          <div className="field">
            <label>Shoot Title</label>
            <input type="text" placeholder="Interview in Salt Lake" value={shootTitle} onChange={(e) => setShootTitle(e.target.value)} />
          </div>
        </div>

        <div className="section">
          <div className="section-title">Filmmaker</div>
          <div className="field">
            <label>Name</label>
            <input type="text" placeholder="Full name" value={filmmaker} onChange={(e) => setFilmmaker(e.target.value)} />
          </div>
          <div className="field">
            <label>Official Email</label>
            <input type="email" placeholder="you@fromsilicon.com" value={filmmakerEmail} onChange={(e) => setFilmmakerEmail(e.target.value)} />
          </div>
        </div>

        <div className="section">
          <div className="section-title">Client / Project</div>
          <div className="row-2">
            <div className="field">
              <label>Client Name</label>
              <input type="text" placeholder="Client or project name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="field">
              <label>Nature of Shoot</label>
              <select value={shootType} onChange={(e) => setShootType(e.target.value)}>
                <option value="">Select&hellip;</option>
                {SHOOT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Shift</div>
          <div className="hint">Times are in Pacific &mdash; PDT/PST, San Francisco. 24-hour format (e.g. 14:30).</div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Start Time (24hr, HH:MM)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="14:30"
                value={startTime}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="field">
              <label>End Time (24hr, HH:MM)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="22:00"
                value={endTime}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title"><span>Breaks</span></div>
          {breaks.map((b, idx) => (
            <div className="break-card" key={b.id}>
              <div className="break-card-head">
                <span>Break {idx + 1}</span>
                <button className="remove-btn" type="button" onClick={() => removeBreak(b.id)}>Remove</button>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Start (24hr)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="12:00"
                    value={b.start}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateBreak(b.id, "start", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>End (24hr)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="12:30"
                    value={b.end}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateBreak(b.id, "end", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          <button className="btn add-item-btn" type="button" onClick={addBreak}>+ Add Break</button>
        </div>

        <div className="review-hours">
          <div className="review-hours-label">Billable Hours</div>
          <div className="review-hours-amount">{formatDurationMs(hoursInfo.billableMs)}</div>
          <div className="total-due-split">
            <div className="split-row">
              <span>Shift {startTime}&ndash;{endTime}</span>
              <span>{formatDurationMs(hoursInfo.shiftMs)}</span>
            </div>
            {hoursInfo.breakDurations.map((b, i) => (
              <div className="split-row" key={b.id}>
                <span>Break {i + 1} ({b.start}&ndash;{b.end})</span>
                <span>&minus;{formatDurationMs(b.ms)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="export-bar">
          <button className="btn btn-primary" type="button" disabled={!canProceed} onClick={() => setPhase("review")}>
            Validate with Signature &rarr;
          </button>
          {!canProceed && (
            <div className="hint">Fill in filmmaker, client, and shift times (with at least some billable hours) to continue.</div>
          )}
        </div>
      </div>
    </div>
  );
}
