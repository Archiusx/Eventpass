// Emails the PDF ticket via Gmail SMTP (free, ~500 mails/day).
// File name starts with "_" so Vercel does NOT expose it as an endpoint.
// Needs 2 env vars on Vercel: GMAIL_USER and GMAIL_APP_PASSWORD (16-char App Password).

const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function buildPdf(t) {
  const qr = await QRCode.toBuffer(t.ticketId, { margin: 1, width: 300, color: { dark: '#0a0e27', light: '#ffffff' } });
  const doc = new PDFDocument({ size: [360, 560], margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.rect(0, 0, 360, 130).fill('#0a0e27');
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(20).text('EventPass', 28, 30, { lineBreak: false });
  doc.fontSize(22).text(t.event, 28, 62, { lineBreak: false });
  doc.font('Helvetica').fontSize(11).text('Plug in. Squad up. Level up.', 28, 92, { lineBreak: false });

  doc.fill('#141632').font('Helvetica-Bold').fontSize(12).text('Attendee Details', 28, 144, { lineBreak: false });
  doc.font('Helvetica').fontSize(11);
  [`Name: ${t.name}`, `Email: ${t.email}`, `Phone: ${t.phone}`, `College/School: ${t.college}`,
   `Course/Class: ${t.course}`, '', `Date: ${t.date}`, `Venue: ${t.venue}`]
    .forEach((line, i) => doc.text(line, 28, 166 + i * 18, { width: 304, lineBreak: false, ellipsis: true }));

  doc.roundedRect(210, 340, 122, 150, 8).lineWidth(1).stroke('#e6e6f0');
  doc.image(qr, 224, 352, { width: 94, height: 94 });
  doc.fill('#141632').font('Helvetica-Bold').fontSize(9).text(t.ticketId, 210, 464, { width: 122, align: 'center', lineBreak: false });
  doc.end();
  return done;
}

// Never throws. Returns true if the mail was handed to Gmail.
async function sendTicketEmail(t) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) { console.error('Email skipped: set GMAIL_USER and GMAIL_APP_PASSWORD'); return false; }
  try {
    const pdf = await buildPdf(t);
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await transport.sendMail({
      from: `"EventPass" <${user}>`,
      to: t.email,
      subject: `Your ticket for ${t.event} — ${t.ticketId}`,
      html: `<p>Hi ${esc(t.name)},</p><p>You're registered for <b>${esc(t.event)}</b>. Your ticket ID is <b>${esc(t.ticketId)}</b>.</p>` +
            `<p>Your PDF ticket is attached — show its QR code at the gate.</p><p>— EventPass</p>`,
      attachments: [{ filename: `EventPass-${t.ticketId}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    return true;
  } catch (err) {
    console.error('Ticket email failed:', err);
    return false;
  }
}

module.exports = { sendTicketEmail, buildPdf };
