import { Resend } from "resend";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// ---------- Password: today's day name in Nepal time ----------
// The "password" is just today's weekday name (e.g. "Wednesday"), computed here,
// server-side, in Asia/Kathmandu (Nepal Standard Time, no DST) — it rolls over
// automatically every day at NPT midnight. The client never has access to the
// expected value; it only ever submits a guess and gets back yes/no. Rate limiting
// below is what actually keeps this safe against a low-entropy (7-value) guess
// space — see the rate-limit comment for its real guarantees and limits.
function todaysNepaliPassword() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", weekday: "long" }).format(new Date());
}

// ---------- Rate limiting: 5 wrong attempts per IP per day ----------
// This state lives only in server memory — the client has no visibility into it
// and nothing to tamper with via devtools/inspect-element (there's no client-side
// counter or flag to flip). The one honest caveat: it's per warm serverless
// instance, not a shared/distributed store, so a determined attacker forcing cold
// starts across regions could get more than 5 tries. Fixing that fully needs a
// persistent store (e.g. Vercel KV/Upstash) — worth adding if this ever becomes a
// real target; for an internal tool, this already blocks casual brute-forcing and
// anything client-side.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const attempts = new Map();

function getClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd && fwd.split(",")[0].trim()) || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const rec = attempts.get(ip);
  if (rec) rec.count += 1;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { password, pdfBase64, filename, meta } = body || {};

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many attempts. Try again tomorrow." }, { status: 429 });
  }

  const expected = todaysNepaliPassword();
  if (!password || password.trim().toLowerCase() !== expected.toLowerCase()) {
    recordFailure(ip);
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }
  attempts.delete(ip);

  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return Response.json({ error: "Missing invoice PDF." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service is not configured." }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const to = process.env.SEND_TO || "losh@fromsilicon.com";
  const from = process.env.SEND_FROM || "fromSilicon Invoices <onboarding@resend.dev>";

  const fromName = escapeHtml(meta?.fromName || "Unknown");
  const fromEmail = meta?.fromEmail || undefined;
  const invoiceNumber = escapeHtml(meta?.invoiceNumber || "");
  const total = escapeHtml(meta?.total || "");
  const dueDate = escapeHtml(meta?.dueDate || "");

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: fromEmail,
      subject: `Invoice from ${fromName}`,
      html: `
        <p>${fromName} submitted an internal invoice via the Invoice Maker.</p>
        <p>
          <strong>Invoice Number:</strong> ${invoiceNumber}<br>
          <strong>Total:</strong> ${total}<br>
          <strong>Nearest Payday (approximate):</strong> ${dueDate}
        </p>
        <p>By sending this invoice, ${fromName} confirmed that the delivery matches what is
        documented in Notion, that the payment date above is approximate, and that ownership
        of the delivered work transfers to fromSilicon upon sending.</p>
      `,
      attachments: [
        {
          filename: filename || "invoice.pdf",
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      return Response.json({ error: error.message || "Failed to send email." }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
