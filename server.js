const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── DATA DIRECTORY ─────────────────────────────────────────────────────────────
const dataDir   = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
[dataDir, uploadDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

const PROJECTS_FILE = path.join(dataDir, 'projects.json');
const BILLS_FILE    = path.join(dataDir, 'bills.json');

// ── HELPERS ────────────────────────────────────────────────────────────────────
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── FILE UPLOADS ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── HEALTH ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── PROJECTS ───────────────────────────────────────────────────────────────────
app.get('/projects', (req, res) => {
  res.json(readJSON(PROJECTS_FILE));
});

app.post('/projects', (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const projects = readJSON(PROJECTS_FILE);
  const p = {
    id: uuidv4(),
    name,
    description: description || '',
    color: color || '#6366f1',
    createdAt: new Date().toISOString(),
  };
  projects.push(p);
  writeJSON(PROJECTS_FILE, projects);
  res.status(201).json(p);
});

app.put('/projects/:id', (req, res) => {
  const projects = readJSON(PROJECTS_FILE);
  const idx = projects.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  projects[idx] = { ...projects[idx], ...req.body, id: projects[idx].id };
  writeJSON(PROJECTS_FILE, projects);
  res.json(projects[idx]);
});

app.delete('/projects/:id', (req, res) => {
  const bills = readJSON(BILLS_FILE);
  if (bills.some(b => b.projectId === req.params.id))
    return res.status(400).json({ error: 'Project has bills — delete them first' });
  const projects = readJSON(PROJECTS_FILE);
  writeJSON(PROJECTS_FILE, projects.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── BILLS ──────────────────────────────────────────────────────────────────────
app.get('/bills', (req, res) => {
  res.json(readJSON(BILLS_FILE));
});

app.post('/bills', upload.fields([{ name: 'bill', maxCount: 1 }, { name: 'proof', maxCount: 1 }]), (req, res) => {
  const { projectId, submittedBy, description, amount, currency, date, category, notes } = req.body;
  if (!projectId || !submittedBy || !description || !amount || !date)
    return res.status(400).json({ error: 'Missing required fields' });

  const attachments = {};
  if (req.files?.bill)
    attachments.bill  = { path: req.files.bill[0].filename,  filename: req.files.bill[0].originalname };
  if (req.files?.proof)
    attachments.proof = { path: req.files.proof[0].filename, filename: req.files.proof[0].originalname };

  const bills = readJSON(BILLS_FILE);
  const b = {
    id: uuidv4(),
    projectId, submittedBy, description,
    amount: parseFloat(amount),
    currency: currency || 'INR',
    date, category: category || 'Other',
    notes: notes || '',
    status: 'pending',
    attachments,
    createdAt: new Date().toISOString(),
  };
  bills.push(b);
  writeJSON(BILLS_FILE, bills);
  res.status(201).json(b);
});

app.put('/bills/:id/status', (req, res) => {
  const bills = readJSON(BILLS_FILE);
  const idx = bills.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  bills[idx].status = req.body.status;
  writeJSON(BILLS_FILE, bills);
  res.json(bills[idx]);
});

app.delete('/bills/:id', (req, res) => {
  const bills = readJSON(BILLS_FILE);
  const b = bills.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });

  // Delete attached files from disk too
  ['bill', 'proof'].forEach(type => {
    if (b.attachments?.[type]?.path) {
      const filePath = path.join(uploadDir, b.attachments[type].path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  writeJSON(BILLS_FILE, bills.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── SERVE UPLOADED FILES ───────────────────────────────────────────────────────
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log('BillTrack server running on port', PORT));
