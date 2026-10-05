const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function defaultData() {
  return {
    clients: [],
    taskTypes: [
      { id: uid(), name: 'Web Design', rate: 85 },
      { id: uid(), name: 'Packaging Design', rate: 95 },
      { id: uid(), name: 'Advertising', rate: 90 },
      { id: uid(), name: 'Social Media', rate: 65 },
      { id: uid(), name: 'Branding / Identity', rate: 95 },
      { id: uid(), name: 'Consulting', rate: 110 }
    ],
    projects: [],
    timeEntries: [],
    invoices: [],
    estimates: [],
    activeTimer: null,
    settings: {
      businessName: 'Studio46',
      contactName: '',
      businessEmail: '',
      businessAddress: '',
      bankDetails: 'Bank: \nAccount name: \nAccount number / IBAN: \nSort code / SWIFT: ',
      currency: 'USD',
      currencySymbol: '$',
      taxEnabled: false,
      taxLabel: 'Tax',
      taxRate: 0,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1,
      estimatePrefix: 'EST-',
      nextEstimateNumber: 1,
      invoiceNotes: 'Thank you for your business. Payment is due via bank transfer using the details above.',
      smtp: { host: '', port: 587, secure: false, user: '', pass: '', fromName: '', defaultCC: '' }
    }
  };
}

function uid() {
  return crypto.randomBytes(9).toString('base64url');
}

let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    cache = defaultData();
    persist();
  } else {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cache = raw.trim() ? JSON.parse(raw) : defaultData();
    // fill in any keys added in later versions of the app
    const defaults = defaultData();
    for (const key of Object.keys(defaults)) {
      if (!(key in cache)) cache[key] = defaults[key];
    }
    for (const key of Object.keys(defaults.settings)) {
      if (!(key in cache.settings)) cache.settings[key] = defaults.settings[key];
    }
    for (const key of Object.keys(defaults.settings.smtp)) {
      if (!cache.settings.smtp) cache.settings.smtp = {};
      if (!(key in cache.settings.smtp)) cache.settings.smtp[key] = defaults.settings.smtp[key];
    }
  }
  return cache;
}

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function getData() {
  return ensureLoaded();
}

function save() {
  persist();
}

module.exports = { getData, save, uid };
