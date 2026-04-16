const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/scan', async (req, res) => {
  try {
    const { imageBase64, imageType } = req.body;
    if (!imageBase64) return res.json({ ok: false, error: 'No image data received' });
    if (!process.env.ANTHROPIC_API_KEY) return res.json({ ok: false, error: 'API key not set' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Extract contact info from this image and return ONLY a JSON object with these keys: name, contact (email/phone/@instagram), location (city UPPERCASE), notes (job/company/bio), value (""), next (""), reached ("N"). No markdown, no explanation, just the JSON.`
            }
          ]
        }]
      })
    });

    const raw = await response.text();
    console.log('API response:', raw);
    const data = JSON.parse(raw);
    if (data.error) return res.json({ ok: false, error: data.error.message });
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);
    res.json({ ok: true, contact: extracted });
  } catch (err) {
    console.error('Scan error:', err);
