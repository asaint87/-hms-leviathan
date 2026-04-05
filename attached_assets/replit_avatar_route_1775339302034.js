/**
 * HMS LEVIATHAN — Avatar Generation API Route
 * =============================================
 * Paste this into your existing Replit game server (the file that
 * handles /api/ws). It adds a single POST endpoint:
 *
 *   POST /api/generate-avatar
 *
 * The frontend sends the photo as base64 + crew name + role.
 * This route calls Claude vision, returns character JSON.
 *
 * SETUP IN REPLIT:
 *   1. Add secret: ANTHROPIC_API_KEY = sk-ant-...
 *   2. Paste the handler function below into your server
 *   3. Add the route registration (shown at bottom) into your
 *      existing request router / express app
 *
 * No new npm packages needed — uses built-in https module.
 */

// ─────────────────────────────────────────────────────────────
// If your server uses Express, add this near your other routes:
//
//   app.post('/api/generate-avatar', handleAvatarGenerate);
//
// If your server uses raw http.createServer, add this inside
// your request handler:
//
//   if (req.method === 'POST' && req.url === '/api/generate-avatar') {
//     return handleAvatarGenerate(req, res);
//   }
// ─────────────────────────────────────────────────────────────

const https = require('https');

async function callAnthropicAPI(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Replit Secrets');

  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON from Anthropic API'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // 10MB limit — photos can be large
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleAvatarGenerate(req, res) {
  // CORS — allow your Expo app to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { photoBase64, mediaType = 'image/jpeg', crewName, role } = await readBody(req);

    if (!photoBase64) throw new Error('photoBase64 is required');
    if (!crewName)    throw new Error('crewName is required');
    if (!role)        throw new Error('role is required');

    const prompt = `You are a character designer for a family submarine game called HMS Leviathan.

Analyze this photo of a crew member and create their cartoon character profile.

Name: ${crewName}
Role: ${role}

Respond ONLY with valid JSON (no markdown, no explanation, no code fences):
{
  "hairColor": "dark brown",
  "skinTone": "warm medium",
  "eyeColor": "brown",
  "ageGroup": "child",
  "distinctiveFeature": "bright smile",
  "crewDescription": "A determined young officer with sharp eyes and a commanding presence.",
  "traits": ["Brave", "Focused", "Reliable"],
  "catchphrase": "All stations — stand by."
}

Rules:
- ageGroup must be one of: young child, older child, teenager, adult
- traits must have exactly 3 short items (1-2 words each)
- crewDescription must be 1-2 sentences, submarine/adventure themed
- catchphrase must fit the ${role} role tactically`;

    const apiResponse = await callAnthropicAPI({
      model: 'claude-opus-4-5-20251001',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: photoBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    if (apiResponse.error) {
      throw new Error(apiResponse.error.message || 'Anthropic API error');
    }

    const rawText = apiResponse.content?.[0]?.text || '';

    // Parse JSON — strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    let avatarData;
    try {
      avatarData = JSON.parse(cleaned);
    } catch {
      throw new Error('Claude returned invalid JSON. Raw: ' + rawText.slice(0, 200));
    }

    // Validate required fields
    const required = ['hairColor', 'skinTone', 'eyeColor', 'ageGroup', 'crewDescription', 'traits', 'catchphrase'];
    for (const field of required) {
      if (!avatarData[field]) throw new Error(`Missing field: ${field}`);
    }
    if (!Array.isArray(avatarData.traits) || avatarData.traits.length !== 3) {
      avatarData.traits = (avatarData.traits || []).slice(0, 3);
      while (avatarData.traits.length < 3) avatarData.traits.push('Capable');
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, avatar: avatarData }));

  } catch (err) {
    console.error('[avatar-route] Error:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

module.exports = { handleAvatarGenerate };
