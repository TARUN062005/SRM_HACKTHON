/**
 * Routy Agentic Controller v2
 * Multi-turn conversation with structured state management.
 * Fields collected: origin, destination, mode, date, cargo, priority
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA';

const runGemini = async (prompt) => {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    try {
        const result = await model.generateContent(prompt);
        return { success: true, text: result.response.text() };
    } catch (e) {
        try {
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
                { contents: [{ parts: [{ text: prompt }] }] },
                { timeout: 10000 }
            );
            const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return { success: true, text };
        } catch {}
    }
    return { success: false, text: '' };
};

const geocode = async (query, PORT) => {
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
    } catch {}
    try {
        const gr = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'User-Agent': 'RouteGuardian/2.0' }, timeout: 6000 }
        );
        if (gr.data?.[0]) {
            return { lat: parseFloat(gr.data[0].lat), lon: parseFloat(gr.data[0].lon), display_name: gr.data[0].display_name };
        }
    } catch {}
    return null;
};

const COUNTRY_TERMS = [
    'india','america','usa','united states','china','europe','africa','australia',
    'japan','uk','england','britain','germany','france','brazil','canada','russia',
    'singapore','malaysia','indonesia','korea','south korea','saudi arabia','uae',
    'middle east','southeast asia','latin america','south america','east asia','west africa',
    'europe','asia','oceania',
];

const isCountry = (loc) => {
    if (!loc) return false;
    return COUNTRY_TERMS.includes(loc.toLowerCase().trim().replace(/^the\s+/, ''));
};

const extractJSON = (text) => {
    try {
        const match = text?.match(/\{[\s\S]*?\}/);
        if (match) return JSON.parse(match[0]);
    } catch {}
    return null;
};

// ── MULTI-TURN AGENT ──────────────────────────────────────────────────────────
exports.agentChat = async (req, res) => {
    const { message, state = {}, history = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Missing message' });

    const PORT = process.env.PORT || 8000;

    const currentState = {
        origin:      state.origin      || null,
        destination: state.destination || null,
        mode:        state.mode        || null,
        date:        state.date        || null,
        cargo:       state.cargo       || null,
        priority:    state.priority    || null,
    };

    // Build the conversation context summary
    const stateDesc = Object.entries(currentState)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || 'none yet';

    const prompt = `You are Routy, an intelligent AI logistics assistant for RouteGuardian — a maritime supply chain routing platform.

CURRENT CONVERSATION STATE (already collected):
${stateDesc}

CONVERSATION HISTORY (last 4 turns):
${history.slice(-4).map(h => `${h.role === 'user' ? 'User' : 'Routy'}: ${h.text}`).join('\n') || 'None'}

USER MESSAGE: "${message}"

TASK: Extract any logistics information from the user message, update the state, and determine what to do next.

MODES: "sea" = maritime shipping, "air" = air freight, "rail" = rail freight, "truck" = road/truck

EXTRACTION RULES:
- Extract specific port names, cities, transport modes, dates, cargo types, priorities
- If a location is a country or continent (India, America, Europe, China, etc.) — set it as country-level and ask user to pick a specific port
- Dates: accept natural language ("next Monday", "June 15", "asap" = today)

REQUIRED FIELDS (must collect before generating route): origin, destination, mode
OPTIONAL FIELDS: date, cargo, priority

RESPONSE RULES:
1. If user mentions COUNTRY or REGION for origin or destination → type "CLARIFY", suggest 4 real major ports/airports for that country (appropriate for the mode)
2. If all required fields are now known (origin, destination, mode) → type "COMPLETE"  
3. Otherwise ask for the NEXT missing required field → type "ASK"
4. For general questions → type "CHAT"
5. Ask ONLY ONE question per response. Keep messages short and friendly.

REQUIRED JSON RESPONSE (no markdown, no extra text):
{
  "type": "ASK" | "CLARIFY" | "COMPLETE" | "CHAT",
  "message": "<Routy's response — short, friendly, conversational>",
  "extracted": {
    "origin": "<specific port/city name or null>",
    "destination": "<specific port/city name or null>",
    "mode": "<sea|air|rail|truck|null>",
    "date": "<date string or null>",
    "cargo": "<cargo type or null>",
    "priority": "<express|standard|null>"
  },
  "clarifyField": "<'origin'|'destination'|null — which field needs clarification>",
  "options": ["Port Name, Country", "Port Name, Country", "Port Name, Country", "Port Name, Country"]
}`;

    let parsed = null;
    const aiRes = await runGemini(prompt);

    if (aiRes.success) {
        parsed = extractJSON(aiRes.text);
    }

    // Fallback: simple regex parse
    if (!parsed) {
        const routeMatch = message.match(/(.+?)\s+(?:to|till|2|→|->)\s+(.+)/i);
        if (routeMatch) {
            parsed = {
                type: 'ASK',
                message: `I see you want to route from ${routeMatch[1].trim()} to ${routeMatch[2].trim()}. What transport mode? Sea, Air, Rail, or Road?`,
                extracted: { origin: routeMatch[1].trim(), destination: routeMatch[2].trim(), mode: null, date: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        } else {
            parsed = {
                type: 'CHAT',
                message: "I'm Routy, your logistics AI. Tell me where you want to ship — e.g. \"Shanghai to Rotterdam by sea\".",
                extracted: { origin: null, destination: null, mode: null, date: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        }
    }

    // Merge extracted fields into state (only update non-null values)
    const extracted = parsed.extracted || {};
    const newState = { ...currentState };
    if (extracted.origin)      newState.origin      = extracted.origin;
    if (extracted.destination) newState.destination = extracted.destination;
    if (extracted.mode)        newState.mode        = extracted.mode;
    if (extracted.date)        newState.date        = extracted.date;
    if (extracted.cargo)       newState.cargo       = extracted.cargo;
    if (extracted.priority)    newState.priority    = extracted.priority;

    // ── HANDLE CLARIFY ────────────────────────────────────────────
    if (parsed.type === 'CLARIFY') {
        return res.json({
            success: true,
            type: 'CLARIFY',
            message: parsed.message,
            state: newState,
            clarifyField: parsed.clarifyField || 'origin',
            options: parsed.options || [],
        });
    }

    // ── HANDLE COMPLETE ───────────────────────────────────────────
    if (parsed.type === 'COMPLETE' || (newState.origin && newState.destination && newState.mode)) {
        // Geocode both locations
        const [startGeo, endGeo] = await Promise.all([
            geocode(newState.origin, PORT),
            geocode(newState.destination, PORT),
        ]);

        if (!startGeo || !endGeo) {
            const missing = !startGeo ? newState.origin : newState.destination;
            return res.json({
                success: true,
                type: 'ASK',
                message: `I couldn't find "${missing}" on the map. Could you give me a more specific port or city name?`,
                state: { ...newState, [!startGeo ? 'origin' : 'destination']: null },
            });
        }

        const modeLabel = { sea: 'maritime', air: 'air freight', rail: 'rail', truck: 'road' }[newState.mode] || newState.mode;
        return res.json({
            success: true,
            type: 'COMPLETE',
            message: parsed.type === 'COMPLETE'
                ? parsed.message
                : `All set! Calculating ${modeLabel} route from ${newState.origin} to ${newState.destination} with live risk and weather intelligence.`,
            state: newState,
            source: startGeo,
            destination: endGeo,
        });
    }

    // ── HANDLE ASK / CHAT ─────────────────────────────────────────
    return res.json({
        success: true,
        type: parsed.type || 'ASK',
        message: parsed.message,
        state: newState,
        clarifyField: parsed.clarifyField || null,
        options: parsed.options || [],
    });
};

// ── LEGACY SINGLE-TURN INTENT (kept for backward compat) ─────────────────────
exports.processAIIntent = async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Missing command' });

    const PORT = process.env.PORT || 8000;

    const prompt = `You are Routy, an AI assistant for RouteGuardian — a maritime supply chain routing platform.

User message: "${command}"

RULES — respond with ONLY valid JSON:
1. Specific ports/cities ("Mumbai to Rotterdam"): {"type":"MISSION","origin":"<port, country>","destination":"<port, country>"}
2. Countries/regions ("India to America"): {"type":"CLARIFY","message":"<friendly question>","originOptions":["<Port, Country>","<Port, Country>","<Port, Country>","<Port, Country>"],"destOptions":["<Port, Country>","<Port, Country>","<Port, Country>","<Port, Country>"]}
3. General logistics question: {"type":"CHAT","reply":"<1-2 sentence answer>"}
4. Off-topic: {"type":"CHAT","reply":"I only assist with maritime supply chain routing and logistics."}

JSON only:`;

    try {
        const aiRes = await runGemini(prompt);
        let intent = { type: 'CHAT', reply: "I'm Routy, your maritime AI. Try: \"Mumbai to Rotterdam\"." };
        if (aiRes.success) {
            const p = extractJSON(aiRes.text);
            if (p) intent = p;
        }

        if (intent.type === 'CLARIFY') {
            return res.json({ success: true, type: 'CLARIFY', message: intent.message, originOptions: intent.originOptions || [], destOptions: intent.destOptions || [] });
        }

        if (intent.type === 'MISSION') {
            const COUNTRY_TERMS = ['india','america','usa','china','europe','africa','australia','japan','uk','england','germany','france','brazil','canada'];
            const isAmb = (l) => COUNTRY_TERMS.includes((l || '').toLowerCase().trim());

            if (isAmb(intent.origin) || isAmb(intent.destination)) {
                const [r1, r2] = await Promise.all([
                    runGemini(`List 4 major seaports in "${intent.origin}" as JSON array: ["Port, Country",...]. Array only.`),
                    runGemini(`List 4 major seaports in "${intent.destination}" as JSON array: ["Port, Country",...]. Array only.`),
                ]);
                let o1 = [], o2 = [];
                try { const m1 = r1.text?.match(/\[[\s\S]*?\]/); if (m1) o1 = JSON.parse(m1[0]); } catch {}
                try { const m2 = r2.text?.match(/\[[\s\S]*?\]/); if (m2) o2 = JSON.parse(m2[0]); } catch {}
                return res.json({ success: true, type: 'CLARIFY', message: `Which port in ${intent.origin} and which in ${intent.destination}?`, originOptions: o1, destOptions: o2 });
            }

            const [start, end] = await Promise.all([geocode(intent.origin, PORT), geocode(intent.destination, PORT)]);
            if (!start || !end) {
                return res.json({ success: true, type: 'CHAT', reply: `Couldn't locate "${!start ? intent.origin : intent.destination}". Try a specific port name.` });
            }
            return res.json({ success: true, type: 'MISSION', source: start, destination: end, analysis: { voice_text: `Calculating route from ${intent.origin} to ${intent.destination}.` } });
        }

        res.json({ success: true, type: 'CHAT', reply: intent.reply });
    } catch (err) {
        console.error('[ROUTY ERROR]:', err.message);
        res.json({ success: true, type: 'CHAT', reply: 'Try: "Route from Mumbai to Rotterdam".' });
    }
};
