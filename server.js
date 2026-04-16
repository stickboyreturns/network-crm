const express = require('express');
const https = require('https');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port', PORT));
