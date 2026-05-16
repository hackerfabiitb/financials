const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory store (resets on redeploy — see note below)
let projects = [];
let bills = [];

// File uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Projects
app.get('/projects', (req, res) => res.json(projects));
app.post('/projects', (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const p = { id: uuidv4(), name, description: description || '', color: color || '#6366f1', createdAt: new Date().toISOString() };
  projects.push(p);
  res.status(201).json(p);
});
app.put('/projects/:id', (req, res) => {
  const p = projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  Object.assign(p, req.body);
  res.json(p);
});
app.delete('/projects/:id', (req, res) => {
  if (bills.some(b => b.projectId === req.params.id))
    return res.status(400).json({ error: 'Project has bills — delete them first' });
  projects = projects.filter(x => x.id !== req.params.id);
  res.json({ ok: true });
});

// Bills
app.get('/bills', (req, res) => res.json(bills));
app.post('/bills', upload.fields([{ name: 'bill', maxCount: 1 }, { name: 'proof', maxCount: 1 }]), (req, res) => {
  const { projectId, submittedBy, description, amount, currency, date, category, notes } = req.body;
  if (!projectId || !submittedBy || !description || !amount || !date)
    return res.status(400).json({ error: 'Missing required fields' });
  const attachments = {};
  if (req.files?.bill)  attachments.bill  = { path: req.files.bill[0].filename,  filename: req.files.bill[0].originalname };
  if (req.files?.proof) attachments.proof = { path: req.files.proof[0].filename, filename: req.files.proof[0].originalname };
  const b = { id: uuidv4(), projectId, submittedBy, description, amount: parseFloat(amount), currency: currency || 'INR', date, category: category || 'Other', notes: notes || '', status: 'pending', attachments, createdAt: new Date().toISOString() };
  bills.push(b);
  res.status(201).json(b);
});
app.put('/bills/:id/status', (req, res) => {
  const b = bills.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  b.status = req.body.status;
  res.json(b);
});
app.delete('/bills/:id', (req, res) => {
  const b = bills.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  bills = bills.filter(x => x.id !== req.params.id);
  res.json({ ok: true });
});

// Serve uploaded files
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log('Server running on port', PORT));
