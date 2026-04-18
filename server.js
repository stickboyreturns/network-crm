const express = require('express');
const https = require('https');
const path = require('path');
const { Client } = require('pg');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/tracker', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracker.html')));

async function getDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function initDb() {
  const db = await getDb();
  await db.query(`CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name TEXT, contact TEXT, reached TEXT DEFAULT 'N',
    notes TEXT, value TEXT, next TEXT, location TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_contacted TIMESTAMP
  )`);
  await db.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted TIMESTAMP`);
  await db.end();
  console.log('DB ready');
}

app.get('/api/contacts', async (req, res) => {
  const db = await getDb();
  const result = await db.query('SELECT * FROM contacts ORDER BY created_at DESC');
  await db.end();
  res.json(result.rows);
});

app.post('/api/contacts', async (req, res) => {
  const { name, contact, reached, notes, value, next, location } = req.body;
  const db = await getDb();
  const result = await db.query(
    'INSERT INTO contacts (name,contact,reached,notes,value,next,location) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, contact, reached||'N', notes, value, next, location]
  );
  await db.end();
  res.json({ ok: true, contact: result.rows[0] });
});

app.post('/api/contacts/bulk', async (req, res) => {
  const { contacts } = req.body;
  const db = await getDb();
  for (const c of contacts) {
    await db.query(
      'INSERT INTO contacts (name,contact,reached,notes,value,next,location) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [c.name, c.contact, c.reached||'N', c.notes, c.value, c.next, c.location]
    );
  }
  await db.end();
  res.json({ ok: true, count: contacts.length });
});

app.put('/api/contacts/:id', async (req, res) => {
  const { name, contact, reached, notes, value, next, location } = req.body;
  const db = await getDb();
  await db.query(
    'UPDATE contacts SET name=$1,contact=$2,reached=$3,notes=$4,value=$5,next=$6,location=$7 WHERE id=$8',
    [name, contact, reached, notes, value, next, location, req.params.id]
  );
  await db.end();
  res.json({ ok: true });
});

app.post('/api/contacts/:id/followup', async (req, res) => {
  const db = await getDb();
  await db.query('UPDATE contacts SET last_contacted=NOW(), reached=$1 WHERE id=$2', ['Y', req.params.id]);
  await db.end();
  res.json({ ok: true });
});

app.delete('/api/contacts/:id', async (req, res) => {
  const db = await getDb();
  await db.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
  await db.end();
  res.json({ ok: true });
});

app.post('/scan', async (req, res) => {
  try {
    const { imageBase64, imageType } = req.body;
    if (!imageBase64) return res.json({ ok: false, error: 'No image data' });
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Extract contact info from this image. Return ONLY a JSON object with keys: name, contact (prefer @instagramhandle or email), location (city UPPERCASE), notes (job/company/bio), value (""), next (""), reached ("N"). No markdown, just raw JSON.' }
      ]}]
    });
    const data = await new Promise((resolve, reject) => {
      const r = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } }, (res2) => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => resolve(JSON.parse(d)));
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });
    if (data.error) return res.json({ ok: false, error: data.error.message });
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const extracted = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json({ ok: true, contact: extracted });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

initDb().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Running on port', PORT));
});
