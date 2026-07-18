import { Resend } from "resend";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { pdfBase64, filename, meta } = body || {};

  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return Response.json({ error: "Missing signed timesheet PDF." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service is not configured." }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const to = process.env.SEND_TO || "losh@fromsilicon.com";
  const from = process.env.SEND_FROM || "fromSilicon Timesheets <onboarding@resend.dev>";

  const filmmakerName = escapeHtml(meta?.filmmakerName || "Unknown");
  const filmmakerEmail = meta?.filmmakerEmail || undefined;
  const clientName = escapeHtml(meta?.clientName || "Unknown");
  const date = escapeHtml(meta?.date || "");
  const hours = escapeHtml(meta?.hours || "");
  const signedAt = escapeHtml(meta?.signedAt || "");

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: filmmakerEmail,
      subject: `Timesheet from ${filmmakerName}`,
      html: `
        <p>A client-signed timesheet has been submitted.</p>
        <p>
          <strong>Filmmaker:</strong> ${filmmakerName}<br>
          <strong>Client / Project:</strong> ${clientName}<br>
          <strong>Date:</strong> ${date}<br>
          <strong>Billable Hours:</strong> ${hours}<br>
          <strong>Signed At:</strong> ${signedAt}
        </p>
      `,
      attachments: [
        {
          filename: filename || "timesheet.pdf",
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
