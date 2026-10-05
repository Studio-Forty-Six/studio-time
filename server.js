const express = require('express');
const path = require('path');
const { getData, save, uid } = require('./lib/db');
const { streamInvoicePdf, streamEstimatePdf, bufferInvoicePdf, bufferEstimatePdf } = require('./lib/pdf');
const { sendDocumentEmail } = require('./lib/mail');

const app = express();
const PORT = process.env.PORT || 4173;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function pad(n, len) { return String(n).padStart(len, '0'); }

function computeTotals(lineItems, settings) {
  const subtotal = round2(lineItems.reduce((s, li) => s + Number(li.amount || 0), 0));
  const tax = settings.taxEnabled ? round2(subtotal * (Number(settings.taxRate) || 0) / 100) : 0;
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}

// ---------- Bootstrap ----------
app.get('/api/bootstrap', (req, res) => {
  const d = getData();
  res.json({
    clients: d.clients,
    projects: d.projects,
    taskTypes: d.taskTypes,
    settings: d.settings,
    activeTimer: d.activeTimer,
    counts: {
      invoices: d.invoices.length,
      estimates: d.estimates.length,
      timeEntries: d.timeEntries.length
    }
  });
});

// ---------- Settings ----------
app.get('/api/settings', (req, res) => res.json(getData().settings));
app.put('/api/settings', (req, res) => {
  const d = getData();
  d.settings = { ...d.settings, ...req.body, smtp: { ...d.settings.smtp, ...(req.body.smtp || {}) } };
  save();
  res.json(d.settings);
});

// ---------- Clients ----------
app.get('/api/clients', (req, res) => res.json(getData().clients));
app.post('/api/clients', (req, res) => {
  const d = getData();
  const client = { id: uid(), name: '', contactName: '', email: '', phone: '', address: '', notes: '', createdAt: todayISO(), ...req.body };
  d.clients.push(client);
  save();
  res.status(201).json(client);
});
app.put('/api/clients/:id', (req, res) => {
  const d = getData();
  const c = d.clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  Object.assign(c, req.body, { id: c.id });
  save();
  res.json(c);
});
app.delete('/api/clients/:id', (req, res) => {
  const d = getData();
  const hasProjects = d.projects.some(p => p.clientId === req.params.id);
  if (hasProjects) return res.status(400).json({ error: 'This client still has projects. Delete or reassign those first.' });
  d.clients = d.clients.filter(c => c.id !== req.params.id);
  save();
  res.status(204).end();
});

// ---------- Task Types ----------
app.get('/api/taskTypes', (req, res) => res.json(getData().taskTypes));
app.post('/api/taskTypes', (req, res) => {
  const d = getData();
  const tt = { id: uid(), name: '', rate: 0, ...req.body };
  d.taskTypes.push(tt);
  save();
  res.status(201).json(tt);
});
app.put('/api/taskTypes/:id', (req, res) => {
  const d = getData();
  const tt = d.taskTypes.find(x => x.id === req.params.id);
  if (!tt) return res.status(404).json({ error: 'Task type not found' });
  Object.assign(tt, req.body, { id: tt.id });
  save();
  res.json(tt);
});
app.delete('/api/taskTypes/:id', (req, res) => {
  const d = getData();
  const inUse = d.timeEntries.some(t => t.taskTypeId === req.params.id);
  if (inUse) return res.status(400).json({ error: 'This task type is used on existing time entries.' });
  d.taskTypes = d.taskTypes.filter(t => t.id !== req.params.id);
  save();
  res.status(204).end();
});

// ---------- Projects ----------
app.get('/api/projects', (req, res) => {
  const d = getData();
  let list = d.projects;
  if (req.query.clientId) list = list.filter(p => p.clientId === req.query.clientId);
  res.json(list);
});
app.post('/api/projects', (req, res) => {
  const d = getData();
  const p = { id: uid(), clientId: '', name: '', code: '', description: '', budgetType: 'none', budgetAmount: 0, status: 'active', createdAt: todayISO(), ...req.body };
  d.projects.push(p);
  save();
  res.status(201).json(p);
});
app.put('/api/projects/:id', (req, res) => {
  const d = getData();
  const p = d.projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  Object.assign(p, req.body, { id: p.id });
  save();
  res.json(p);
});
app.delete('/api/projects/:id', (req, res) => {
  const d = getData();
  const hasEntries = d.timeEntries.some(t => t.projectId === req.params.id);
  if (hasEntries) return res.status(400).json({ error: 'This project has time entries. Delete those first.' });
  d.projects = d.projects.filter(p => p.id !== req.params.id);
  save();
  res.status(204).end();
});

// ---------- Time Entries ----------
app.get('/api/timeEntries', (req, res) => {
  const d = getData();
  let list = d.timeEntries;
  if (req.query.clientId) {
    const projIds = new Set(d.projects.filter(p => p.clientId === req.query.clientId).map(p => p.id));
    list = list.filter(t => projIds.has(t.projectId));
  }
  if (req.query.projectId) list = list.filter(t => t.projectId === req.query.projectId);
  if (req.query.invoiced === 'false') list = list.filter(t => !t.invoiced);
  if (req.query.invoiced === 'true') list = list.filter(t => t.invoiced);
  res.json(list.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || '')));
});

app.post('/api/timeEntries', (req, res) => {
  const d = getData();
  const body = req.body;
  let durationSeconds = body.durationSeconds;
  if (!durationSeconds && body.startTime && body.endTime) {
    durationSeconds = Math.max(0, Math.round((new Date(body.endTime) - new Date(body.startTime)) / 1000));
  }
  const entry = {
    id: uid(),
    projectId: body.projectId,
    taskTypeId: body.taskTypeId,
    description: body.description || '',
    startTime: body.startTime || new Date().toISOString(),
    endTime: body.endTime || null,
    durationSeconds: durationSeconds || 0,
    rate: body.rate != null ? Number(body.rate) : 0,
    billable: body.billable != null ? !!body.billable : true,
    invoiced: false,
    invoiceId: null,
    createdAt: new Date().toISOString()
  };
  d.timeEntries.push(entry);
  save();
  res.status(201).json(entry);
});

app.put('/api/timeEntries/:id', (req, res) => {
  const d = getData();
  const t = d.timeEntries.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Time entry not found' });
  if (t.invoiced) return res.status(400).json({ error: 'This entry is already on an invoice. Remove it from the invoice first.' });
  Object.assign(t, req.body, { id: t.id });
  if (req.body.startTime && req.body.endTime) {
    t.durationSeconds = Math.max(0, Math.round((new Date(req.body.endTime) - new Date(req.body.startTime)) / 1000));
  }
  save();
  res.json(t);
});

app.delete('/api/timeEntries/:id', (req, res) => {
  const d = getData();
  const t = d.timeEntries.find(x => x.id === req.params.id);
  if (t && t.invoiced) return res.status(400).json({ error: 'This entry is on an invoice and cannot be deleted.' });
  d.timeEntries = d.timeEntries.filter(x => x.id !== req.params.id);
  save();
  res.status(204).end();
});

// Mark time as billed outside the normal invoice flow (e.g. covered by a fixed fee
// charged some other way). Only touches entries that aren't already invoiced/billed.
app.post('/api/timeEntries/mark-billed', (req, res) => {
  const d = getData();
  const ids = new Set(req.body.entryIds || []);
  const note = (req.body.note || '').trim();
  let updated = 0;
  for (const t of d.timeEntries) {
    if (ids.has(t.id) && !t.invoiced) {
      t.invoiced = true;
      t.invoiceId = null;
      t.billedNote = note;
      updated++;
    }
  }
  save();
  res.json({ updated });
});

// Reverse a manual "mark as billed" (only for entries not tied to a real invoice —
// entries on an actual invoice must be edited/removed from that invoice instead).
app.post('/api/timeEntries/mark-unbilled', (req, res) => {
  const d = getData();
  const ids = new Set(req.body.entryIds || []);
  let updated = 0;
  for (const t of d.timeEntries) {
    if (ids.has(t.id) && t.invoiced && !t.invoiceId) {
      t.invoiced = false;
      t.billedNote = '';
      updated++;
    }
  }
  save();
  res.json({ updated });
});

// ---------- Timer ----------
app.get('/api/timer', (req, res) => res.json(getData().activeTimer));

app.post('/api/timer/start', (req, res) => {
  const d = getData();
  if (d.activeTimer) return res.status(400).json({ error: 'A timer is already running. Stop it first.' });
  const now = new Date().toISOString();
  d.activeTimer = {
    id: uid(),
    projectId: req.body.projectId,
    taskTypeId: req.body.taskTypeId,
    description: req.body.description || '',
    rate: req.body.rate != null ? Number(req.body.rate) : 0,
    status: 'running',
    originalStartTime: now,
    segmentStartTime: now,
    accumulatedSeconds: 0
  };
  save();
  res.status(201).json(d.activeTimer);
});

app.post('/api/timer/pause', (req, res) => {
  const d = getData();
  const t = d.activeTimer;
  if (!t) return res.status(400).json({ error: 'No timer is running.' });
  if (t.status !== 'running') return res.status(400).json({ error: 'Timer is already paused.' });
  const elapsed = Math.max(0, (Date.now() - new Date(t.segmentStartTime).getTime()) / 1000);
  t.accumulatedSeconds = (t.accumulatedSeconds || 0) + elapsed;
  t.segmentStartTime = null;
  t.status = 'paused';
  save();
  res.json(t);
});

app.post('/api/timer/resume', (req, res) => {
  const d = getData();
  const t = d.activeTimer;
  if (!t) return res.status(400).json({ error: 'No timer to resume.' });
  if (t.status !== 'paused') return res.status(400).json({ error: 'Timer is not paused.' });
  t.segmentStartTime = new Date().toISOString();
  t.status = 'running';
  save();
  res.json(t);
});

app.post('/api/timer/stop', (req, res) => {
  const d = getData();
  const t = d.activeTimer;
  if (!t) return res.status(400).json({ error: 'No timer is running.' });
  const endTime = new Date().toISOString();
  let totalSeconds = t.accumulatedSeconds || 0;
  if (t.status === 'running' && t.segmentStartTime) {
    totalSeconds += Math.max(0, (new Date(endTime) - new Date(t.segmentStartTime)) / 1000);
  }
  const entry = {
    id: uid(),
    projectId: t.projectId,
    taskTypeId: t.taskTypeId,
    description: t.description,
    startTime: t.originalStartTime,
    endTime,
    durationSeconds: Math.round(totalSeconds),
    rate: t.rate,
    billable: true,
    invoiced: false,
    invoiceId: null,
    createdAt: new Date().toISOString()
  };
  d.timeEntries.push(entry);
  d.activeTimer = null;
  save();
  res.json(entry);
});

app.post('/api/timer/discard', (req, res) => {
  const d = getData();
  d.activeTimer = null;
  save();
  res.status(204).end();
});

// ---------- Invoices ----------
app.get('/api/invoices', (req, res) => {
  const d = getData();
  let list = d.invoices;
  if (req.query.clientId) list = list.filter(i => i.clientId === req.query.clientId);
  res.json(list.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '')));
});

app.get('/api/invoices/:id', (req, res) => {
  const inv = getData().invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

app.post('/api/invoices', (req, res) => {
  const d = getData();
  const body = req.body;
  const lineItems = (body.lineItems || []).map(li => ({
    id: uid(),
    description: li.description,
    date: li.date || null,
    quantity: li.quantity != null ? Number(li.quantity) : null,
    rate: li.rate != null ? Number(li.rate) : null,
    amount: round2(li.amount),
    timeEntryIds: li.timeEntryIds || []
  }));
  const { subtotal, tax, total } = computeTotals(lineItems, d.settings);
  const number = body.number || `${d.settings.invoicePrefix}${pad(d.settings.nextInvoiceNumber, 4)}`;
  if (!body.number) d.settings.nextInvoiceNumber += 1;

  const invoice = {
    id: uid(),
    number,
    clientId: body.clientId,
    issueDate: body.issueDate || todayISO(),
    dueDate: body.dueDate || '',
    status: 'draft',
    notes: body.notes || d.settings.invoiceNotes || '',
    lineItems,
    subtotal, tax, total,
    createdAt: new Date().toISOString(),
    sentAt: null,
    paidAt: null
  };
  d.invoices.push(invoice);

  // mark referenced time entries as invoiced
  const entryIds = new Set(lineItems.flatMap(li => li.timeEntryIds));
  for (const t of d.timeEntries) {
    if (entryIds.has(t.id)) { t.invoiced = true; t.invoiceId = invoice.id; }
  }
  save();
  res.status(201).json(invoice);
});

app.put('/api/invoices/:id', (req, res) => {
  const d = getData();
  const inv = d.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const body = { ...req.body };
  if (body.status === 'paid' && inv.status !== 'paid') body.paidAt = todayISO();
  if (body.lineItems) {
    body.lineItems = body.lineItems.map(li => ({ ...li, id: li.id || uid(), amount: round2(li.amount) }));
    const totals = computeTotals(body.lineItems, d.settings);
    Object.assign(body, totals);
  }
  Object.assign(inv, body, { id: inv.id });
  save();
  res.json(inv);
});

app.delete('/api/invoices/:id', (req, res) => {
  const d = getData();
  const inv = d.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be deleted. Void it instead by editing status.' });
  for (const t of d.timeEntries) {
    if (t.invoiceId === inv.id) { t.invoiced = false; t.invoiceId = null; }
  }
  d.invoices = d.invoices.filter(i => i.id !== req.params.id);
  save();
  res.status(204).end();
});

app.get('/api/invoices/:id/pdf', (req, res) => {
  const d = getData();
  const inv = d.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).send('Invoice not found');
  const client = d.clients.find(c => c.id === inv.clientId);
  streamInvoicePdf(res, inv, client, d.settings);
});

app.post('/api/invoices/:id/email', async (req, res) => {
  const d = getData();
  const inv = d.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const client = d.clients.find(c => c.id === inv.clientId);
  const to = req.body.to || client?.email;
  if (!to) return res.status(400).json({ error: 'No recipient email address.' });
  const cc = req.body.cc !== undefined ? req.body.cc : d.settings.smtp.defaultCC;
  try {
    const buffer = await bufferInvoicePdf(inv, client, d.settings);
    const subject = req.body.subject || `Invoice ${inv.number} from ${d.settings.businessName}`;
    const bodyText = req.body.body || `Hi ${client?.contactName || client?.name || ''},\n\nPlease find attached invoice ${inv.number} for ${d.settings.currencySymbol}${inv.total.toFixed(2)}, due ${inv.dueDate || 'on receipt'}.\n\nPayment details are included on the invoice.\n\nThanks,\n${d.settings.contactName || d.settings.businessName}`;
    await sendDocumentEmail({
      smtp: d.settings.smtp,
      fromName: d.settings.smtp.fromName || d.settings.businessName,
      to, cc, subject, body: bodyText,
      attachmentName: `${inv.number}.pdf`,
      attachmentBuffer: buffer
    });
    inv.status = inv.status === 'draft' ? 'sent' : inv.status;
    inv.sentAt = new Date().toISOString();
    save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Estimates ----------
app.get('/api/estimates', (req, res) => {
  const d = getData();
  let list = d.estimates;
  if (req.query.clientId) list = list.filter(e => e.clientId === req.query.clientId);
  res.json(list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
});

app.get('/api/estimates/:id', (req, res) => {
  const est = getData().estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).json({ error: 'Estimate not found' });
  res.json(est);
});

app.post('/api/estimates', (req, res) => {
  const d = getData();
  const body = req.body;
  const lineItems = (body.lineItems || []).map(li => ({
    id: uid(),
    description: li.description,
    taskTypeId: li.taskTypeId || null,
    quantity: li.quantity != null ? Number(li.quantity) : null,
    rate: li.rate != null ? Number(li.rate) : null,
    amount: round2(li.amount)
  }));
  const { subtotal, tax, total } = computeTotals(lineItems, d.settings);
  const number = body.number || `${d.settings.estimatePrefix}${pad(d.settings.nextEstimateNumber, 4)}`;
  if (!body.number) d.settings.nextEstimateNumber += 1;

  const estimate = {
    id: uid(),
    number,
    clientId: body.clientId,
    projectName: body.projectName || '',
    date: body.date || todayISO(),
    status: 'draft',
    notes: body.notes || '',
    lineItems,
    subtotal, tax, total,
    createdAt: new Date().toISOString(),
    sentAt: null,
    approvedAt: null,
    declinedAt: null
  };
  d.estimates.push(estimate);
  save();
  res.status(201).json(estimate);
});

app.put('/api/estimates/:id', (req, res) => {
  const d = getData();
  const est = d.estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).json({ error: 'Estimate not found' });
  const body = { ...req.body };
  if (body.lineItems) {
    body.lineItems = body.lineItems.map(li => ({ ...li, id: li.id || uid(), amount: round2(li.amount) }));
    const totals = computeTotals(body.lineItems, d.settings);
    Object.assign(body, totals);
  }
  Object.assign(est, body, { id: est.id });
  save();
  res.json(est);
});

app.post('/api/estimates/:id/approve', (req, res) => {
  const d = getData();
  const est = d.estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).json({ error: 'Estimate not found' });
  est.status = 'approved';
  est.approvedAt = todayISO();
  save();
  res.json(est);
});

app.post('/api/estimates/:id/decline', (req, res) => {
  const d = getData();
  const est = d.estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).json({ error: 'Estimate not found' });
  est.status = 'declined';
  est.declinedAt = todayISO();
  save();
  res.json(est);
});

app.delete('/api/estimates/:id', (req, res) => {
  const d = getData();
  d.estimates = d.estimates.filter(e => e.id !== req.params.id);
  save();
  res.status(204).end();
});

app.get('/api/estimates/:id/pdf', (req, res) => {
  const d = getData();
  const est = d.estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).send('Estimate not found');
  const client = d.clients.find(c => c.id === est.clientId);
  streamEstimatePdf(res, est, client, d.settings);
});

app.post('/api/estimates/:id/email', async (req, res) => {
  const d = getData();
  const est = d.estimates.find(e => e.id === req.params.id);
  if (!est) return res.status(404).json({ error: 'Estimate not found' });
  const client = d.clients.find(c => c.id === est.clientId);
  const to = req.body.to || client?.email;
  if (!to) return res.status(400).json({ error: 'No recipient email address.' });
  const cc = req.body.cc !== undefined ? req.body.cc : d.settings.smtp.defaultCC;
  try {
    const buffer = await bufferEstimatePdf(est, client, d.settings);
    const subject = req.body.subject || `Estimate ${est.number} from ${d.settings.businessName}`;
    const bodyText = req.body.body || `Hi ${client?.contactName || client?.name || ''},\n\nPlease find attached estimate ${est.number} for ${d.settings.currencySymbol}${est.total.toFixed(2)}.\n\nLet me know if you'd like to go ahead.\n\nThanks,\n${d.settings.contactName || d.settings.businessName}`;
    await sendDocumentEmail({
      smtp: d.settings.smtp,
      fromName: d.settings.smtp.fromName || d.settings.businessName,
      to, cc, subject, body: bodyText,
      attachmentName: `${est.number}.pdf`,
      attachmentBuffer: buffer
    });
    est.status = est.status === 'draft' ? 'sent' : est.status;
    est.sentAt = new Date().toISOString();
    save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nStudio Time is running.\nOpen http://localhost:${PORT} in your browser.\n(Leave this window open while you use the app. Press Ctrl+C to stop.)\n`);
});
