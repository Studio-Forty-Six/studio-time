const nodemailer = require('nodemailer');

function getTransport(smtp) {
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
    throw new Error('Email is not set up yet. Add your SMTP details in Settings first.');
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
}

async function sendDocumentEmail({ smtp, fromName, to, cc, subject, body, attachmentName, attachmentBuffer }) {
  const transporter = getTransport(smtp);
  const from = fromName ? `"${fromName}" <${smtp.user}>` : smtp.user;
  const mail = {
    from,
    to,
    subject,
    text: body,
    attachments: [{ filename: attachmentName, content: attachmentBuffer }]
  };
  if (cc && cc.trim()) mail.cc = cc.trim();
  await transporter.sendMail(mail);
}

module.exports = { sendDocumentEmail };
