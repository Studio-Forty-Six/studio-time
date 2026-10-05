const PDFDocument = require('pdfkit');

function money(n, symbol) {
  const v = Number(n || 0);
  return `${symbol}${v.toFixed(2)}`;
}
function formatPdfDate(dateStr) {
  if (!dateStr) return '';
  // dateStr may be a single date, an ISO datetime, or an already-built "5 Aug – 9 Aug 2026" range — pass ranges through as-is
  if (dateStr.includes('–')) return dateStr;
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const path = require('path');
const LOGO_PATH = path.join(__dirname, 'assets', 'logo-header.png');
const LOGO_ASPECT = 224 / 711; // source logo pixel dimensions (height / width)

function drawHeader(doc, settings, docTitle, docNumber, dateLabel, dateValue, extraLine) {
  const logoWidth = 150;
  const logoHeight = logoWidth * LOGO_ASPECT;
  const logoTop = 42;
  try {
    doc.image(LOGO_PATH, 50, logoTop, { width: logoWidth });
  } catch (e) {
    doc.fontSize(20).fillColor('#222860').text(settings.businessName || 'Studio46', 50, 50);
  }

  let cy = logoTop + logoHeight + 12;
  doc.fontSize(9).fillColor('#646890');
  if (settings.contactName) { doc.text(settings.contactName, 50, cy, { width: 260 }); cy += 12; }
  if (settings.businessEmail) { doc.text(settings.businessEmail, 50, cy, { width: 260 }); cy += 12; }
  if (settings.businessAddress) { doc.text(settings.businessAddress, 50, cy, { width: 260 }); }

  doc.fontSize(22).fillColor('#222860').text(docTitle, 350, 56, { width: 195, align: 'right' });
  doc.fontSize(10).fillColor('#646890').text(docNumber, 350, 84, { width: 195, align: 'right' });
  doc.text(`${dateLabel}: ${dateValue}`, 350, 99, { width: 195, align: 'right' });
  if (extraLine) doc.text(extraLine, 350, 114, { width: 195, align: 'right' });

  doc.moveTo(50, 162).lineTo(545, 162).strokeColor('#E4E5EE').lineWidth(1).stroke();
  doc.moveTo(50, 163).lineTo(110, 163).strokeColor('#F18A77').lineWidth(2).stroke();
}

function drawClientBlock(doc, y, label, client) {
  doc.fontSize(9).fillColor('#9497B8').text(label, 50, y);
  doc.fontSize(11).fillColor('#222860').text(client?.name || 'Client', 50, y + 14);
  doc.fontSize(9).fillColor('#646890');
  let cy = y + 30;
  if (client?.contactName) { doc.text(client.contactName, 50, cy); cy += 13; }
  if (client?.email) { doc.text(client.email, 50, cy); cy += 13; }
  if (client?.address) { doc.text(client.address, 50, cy, { width: 250 }); cy += 13; }
  return cy;
}

function drawLineItemsTable(doc, y, lineItems, symbol, showDate) {
  const cols = showDate
    ? { date: 50, desc: 125, qty: 345, rate: 400, amt: 460 }
    : { desc: 50, qty: 340, rate: 410, amt: 480 };
  const descWidth = showDate ? 213 : 275;
  const dateWidth = 70;

  doc.fontSize(9).fillColor('#9497B8');
  if (showDate) doc.text('DATE', cols.date, y, { width: dateWidth });
  doc.text('DESCRIPTION', cols.desc, y);
  doc.text('HOURS', cols.qty, y, { width: 50, align: 'right' });
  doc.text('RATE', cols.rate, y, { width: 55, align: 'right' });
  doc.text('AMOUNT', cols.amt, y, { width: 85, align: 'right' });
  y += 16;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E4E5EE').stroke();
  y += 10;

  doc.fontSize(10).fillColor('#222860');
  for (const item of lineItems) {
    const dateText = showDate ? formatPdfDate(item.date) : '';
    const descHeight = doc.heightOfString(item.description, { width: descWidth });
    const dateHeight = showDate ? doc.heightOfString(dateText, { width: dateWidth }) : 0;
    const rowHeight = Math.max(descHeight, dateHeight);
    if (showDate) doc.text(dateText, cols.date, y, { width: dateWidth });
    doc.text(item.description, cols.desc, y, { width: descWidth });
    doc.text(item.quantity != null ? Number(item.quantity).toFixed(2) : '', cols.qty, y, { width: 50, align: 'right' });
    doc.text(item.rate != null ? money(item.rate, symbol) : '', cols.rate, y, { width: 55, align: 'right' });
    doc.text(money(item.amount, symbol), cols.amt, y, { width: 85, align: 'right' });
    y += Math.max(rowHeight, 14) + 10;
    if (y > 680) { doc.addPage(); y = 60; }
  }
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E4E5EE').stroke();
  return y + 10;
}

function drawTotals(doc, y, subtotal, tax, taxLabel, total, symbol) {
  const labelX = 380, valX = 480;
  doc.fontSize(10).fillColor('#646890');
  doc.text('Subtotal', labelX, y, { width: 90, align: 'right' });
  doc.fillColor('#222860').text(money(subtotal, symbol), valX, y, { width: 65, align: 'right' });
  y += 16;
  if (tax) {
    doc.fillColor('#646890').text(taxLabel, labelX, y, { width: 90, align: 'right' });
    doc.fillColor('#222860').text(money(tax, symbol), valX, y, { width: 65, align: 'right' });
    y += 16;
  }
  doc.moveTo(380, y).lineTo(545, y).strokeColor('#222860').stroke();
  y += 8;
  doc.fontSize(13).fillColor('#222860').text('Total', labelX, y, { width: 90, align: 'right' });
  doc.text(money(total, symbol), valX, y, { width: 65, align: 'right' });
  return y + 24;
}

function drawInvoiceContent(doc, invoice, client, settings) {
  drawHeader(doc, settings, 'INVOICE', invoice.number, 'Issue date', invoice.issueDate, invoice.dueDate ? `Due: ${invoice.dueDate}` : null);
  let y = drawClientBlock(doc, 178, 'BILL TO', client);
  y = Math.max(y, 235);
  y = drawLineItemsTable(doc, y + 10, invoice.lineItems, settings.currencySymbol, true);
  y = drawTotals(doc, y, invoice.subtotal, invoice.tax, settings.taxLabel, invoice.total, settings.currencySymbol);

  if (settings.bankDetails) {
    doc.fontSize(9).fillColor('#9497B8').text('PAYMENT DETAILS', 50, y + 10);
    doc.fontSize(9).fillColor('#646890').text(settings.bankDetails, 50, y + 24, { width: 300 });
  }
  if (invoice.notes) {
    doc.fontSize(9).fillColor('#9497B8').text('NOTES', 50, y + 90);
    doc.fontSize(9).fillColor('#646890').text(invoice.notes, 50, y + 104, { width: 495 });
  }
}

function drawEstimateContent(doc, estimate, client, settings) {
  drawHeader(doc, settings, 'ESTIMATE', estimate.number, 'Date', estimate.date, estimate.projectName ? `Project: ${estimate.projectName}` : null);
  let y = drawClientBlock(doc, 178, 'PREPARED FOR', client);
  y = Math.max(y, 235);
  y = drawLineItemsTable(doc, y + 10, estimate.lineItems, settings.currencySymbol);
  y = drawTotals(doc, y, estimate.subtotal, estimate.tax, settings.taxLabel, estimate.total, settings.currencySymbol);

  if (estimate.notes) {
    doc.fontSize(9).fillColor('#9497B8').text('NOTES', 50, y + 10);
    doc.fontSize(9).fillColor('#646890').text(estimate.notes, 50, y + 24, { width: 495 });
    y += 60;
  }

  doc.fontSize(9).fillColor('#9497B8').text('STATUS', 50, y + 20);
  const statusLabel = estimate.status === 'approved' ? 'APPROVED'
    : estimate.status === 'declined' ? 'DECLINED'
    : estimate.status === 'sent' ? 'AWAITING APPROVAL' : 'DRAFT';
  doc.fontSize(11).fillColor('#222860').text(statusLabel, 50, y + 34);
  if (estimate.approvedAt) {
    doc.fontSize(9).fillColor('#646890').text(`Approved ${estimate.approvedAt}`, 50, y + 50);
  }
}

function streamInvoicePdf(res, invoice, client, settings) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.number}.pdf"`);
  doc.pipe(res);
  drawInvoiceContent(doc, invoice, client, settings);
  doc.end();
}

function streamEstimatePdf(res, estimate, client, settings) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${estimate.number}.pdf"`);
  doc.pipe(res);
  drawEstimateContent(doc, estimate, client, settings);
  doc.end();
}

function bufferFromDraw(drawFn, ...args) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawFn(doc, ...args);
    doc.end();
  });
}

function bufferInvoicePdf(invoice, client, settings) {
  return bufferFromDraw(drawInvoiceContent, invoice, client, settings);
}

function bufferEstimatePdf(estimate, client, settings) {
  return bufferFromDraw(drawEstimateContent, estimate, client, settings);
}

module.exports = { streamInvoicePdf, streamEstimatePdf, bufferInvoicePdf, bufferEstimatePdf };
