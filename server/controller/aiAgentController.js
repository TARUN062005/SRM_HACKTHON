/**
 * Routy — Maritime Supply Chain AI Agent
 * Intent types: MISSION (specific route), CLARIFY (country/region → suggest ports), CHAT (FAQ)
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const runAI = async (genAI, prompt) => {
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA';
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    try {
        const result = await model.generateContent(prompt);
        return { success: true, text: result.response.text() };
    } catch (e) {
        try {
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                { contents: [{ parts: [{ text: prompt }] }] },
                { timeout: 8000 }
            );
            const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return { success: true, text };
        } catch (e2) {}
    }
    return { success: false };
};

const findCoordinates = async (query, PORT) => {
    if (!query) return null;
    try {
        const res = await axios.get(
            `http://localhost:${PORT}/api/ai/search?q=${encodeURIComponent(query)}&limit=1`,
            { timeout: 5000 }
        );
        const data = res.data.results?.[0] || res.data?.[0];
        if (data) {
            const lat = parseFloat(data.lat || data.latitude);
            const lon = parseFloat(data.lon || data.longitude || data.lng);
            if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, display_name: data.display_name || query };
        }
    } catch (e) {}
    try {
        const gRes = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'User-Agent': 'RouteGuardianMaritime/1.0' }, timeout: 6000 }
        );
        if (gRes.data?.[0]) {
            return {
                lat: parseFloat(gRes.data[0].lat),
                lon: parseFloat(gRes.data[0].lon),
                display_name: gRes.data[0].display_name,
            };
        }
    } catch (e) {}
    return null;
};

// Terms that refer to countries/regions, not specific ports
const COUNTRY_TERMS = [
    'india','america','usa','united states','china','europe','africa',
    'australia','japan','uk','england','britain','germany','france',
    'brazil','canada','russia','singapore','malaysia','indonesia',
    'korea','south korea','saudi arabia','uae','middle east','southeast asia',
    'latin america','south america','north america','east asia','west africa',
];

const isAmbiguous = (loc) => {
    if (!loc) return false;
    const l = loc.toLowerCase().trim().replace(/^the\s+/, '');
    return COUNTRY_TERMS.includes(l);
};

exports.processAIIntent = async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Missing command' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA');
    const PORT = process.env.PORT || 8000;

    try {
        const prompt = `You are Routy, an AI assistant for RouteGuardian — a predictive maritime supply chain routing platform.

User message: "${command}"

RULES — respond with ONLY a valid JSON object, no markdown, no extra text:

1. If user specifies two SPECIFIC ports/cities (e.g. "Mumbai to Los Angeles", "Shanghai to Rotterdam"):
{"type":"MISSION","origin":"<port name, country>","destination":"<port name, country>"}

2. If user mentions COUNTRIES or VAGUE REGIONS without a specific port (e.g. "India to America", "China to Europe", "ship from Asia to US"):
{"type":"CLARIFY","message":"<friendly one-sentence question like: Which port in [origin] and which port in [destination]?>","originOptions":["<Port, Country>","<Port, Country>","<Port, Country>","<Port, Country>"],"destOptions":["<Port, Country>","<Port, Country>","<Port, Country>","<Port, Country>"]}
Use real major commercial seaports. Max 4 per side.

3. If user asks a logistics/routing question:
{"type":"CHAT","reply":"<helpful 1-2 sentence answer about maritime supply chain>"}

4. Off-topic:
{"type":"CHAT","reply":"I only assist with maritime supply chain routing and logistics."}

JSON only:`;

        const aiRes = await runAI(genAI, prompt);

        let intent = {
            type: 'CHAT',
            reply: "I'm Routy, your maritime AI. Try: \"Mumbai to Rotterdam\" or \"Shanghai to Los Angeles\".",
        };

        if (aiRes.success) {
            const match = aiRes.text.match(/\{[\s\S]*?\}/);
            if (match) {
                try { intent = JSON.parse(match[0]); } catch (e) {}
            }
        } else {
            const r = command.match(/(.+?)\s+(?:to|till|2|→|->)\s+(.+)/i);
            if (r) {
                const orig = r[1].trim(), dest = r[2].trim();
                if (isAmbiguous(orig) || isAmbiguous(dest)) {
                    intent = { type: 'CLARIFY', message: 'Which specific ports would you like to route between?', originOptions: [], destOptions: [] };
                } else {
                    intent = { type: 'MISSION', origin: orig, destination: dest };
                }
            }
        }

        // ── CLARIFY ─────────────────────────────────────────────
        if (intent.type === 'CLARIFY') {
            return res.json({
                success: true,
                type: 'CLARIFY',
                message: intent.message || 'Which specific ports would you like to route between?',
                originOptions: Array.isArray(intent.originOptions) ? intent.originOptions : [],
                destOptions: Array.isArray(intent.destOptions) ? intent.destOptions : [],
            });
        }

        // ── MISSION ──────────────────────────────────────────────
        if (intent.type === 'MISSION') {
            // Detected as MISSION but origin/dest are still countries
            if (isAmbiguous(intent.origin) || isAmbiguous(intent.destination)) {
                const [r1, r2] = await Promise.all([
                    runAI(genAI, `List 4 major seaports in "${intent.origin}" as a JSON array: ["Port Name, Country", ...]. Array only.`),
                    runAI(genAI, `List 4 major seaports in "${intent.destination}" as a JSON array: ["Port Name, Country", ...]. Array only.`),
                ]);
                let o1 = [], o2 = [];
                try { const m1 = r1.text?.match(/\[[\s\S]*?\]/); if (m1) o1 = JSON.parse(m1[0]); } catch {}
                try { const m2 = r2.text?.match(/\[[\s\S]*?\]/); if (m2) o2 = JSON.parse(m2[0]); } catch {}
                return res.json({
                    success: true, type: 'CLARIFY',
                    message: `Which port in ${intent.origin} and which port in ${intent.destination}?`,
                    originOptions: o1, destOptions: o2,
                });
            }

            console.log(`[ROUTY] Resolving: ${intent.origin} → ${intent.destination}`);
            const [start, end] = await Promise.all([
                findCoordinates(intent.origin, PORT),
                findCoordinates(intent.destination, PORT),
            ]);

            if (!start || !end) {
                return res.json({
                    success: true, type: 'CHAT',
                    reply: `Couldn't locate "${!start ? intent.origin : intent.destination}". Try a specific port — e.g. "Port of Mumbai, India".`,
                });
            }

            return res.json({
                success: true, type: 'MISSION',
                source: start, destination: end,
                analysis: {
                    summary: `Route: ${intent.origin} → ${intent.destination}`,
                    voice_text: `Calculating maritime route from ${intent.origin} to ${intent.destination} with weather and geopolitical risk analysis.`,
                },
            });
        }

        // ── CHAT ─────────────────────────────────────────────────
        res.json({ success: true, type: 'CHAT', reply: intent.reply });

    } catch (error) {
        console.error('[ROUTY ERROR]:', error.message);
        res.json({ success: true, type: 'CHAT', reply: 'Something went wrong. Try: "Route from Mumbai to Rotterdam".' });
    }
};
