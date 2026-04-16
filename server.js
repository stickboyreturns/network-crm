const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/scan', async (req, res) => {
  try {
    const { imageBase64, imageType } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
              text: `You are helping extract contact information from an image for a networking CRM.

Look at this image carefully. It could be a business card, Instagram profile screenshot, LinkedIn profile, or any image with contact info.

Extract whatever you can find and return ONLY a valid JSON object with these exact keys:
{
  "name": "full name or best guess",
  "contact": "email, phone, instagram handle (@username format), or URL",
  "location": "city in UPPERCASE e.g. TORONTO or NYC, empty string if not visible",
  "notes": "job title, company, bio text, or any useful context",
  "value": "",
  "next": "",
  "reached": "N"
}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- For contact prefer: email > phone > instagram handle (@username) > website URL
- If you see an instagram.com URL, convert it to @username format
- If a field is not visible, use empty string`
            }
          ]
        }]
      })
    });
    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);
    res.json({ ok: true, contact: extracted });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port', PORT));
