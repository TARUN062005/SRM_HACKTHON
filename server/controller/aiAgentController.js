/**
 * Routy Agentic Controller v2
 * Multi-turn conversation with structured state management.
 * Fields collected: origin, destination, mode, date, cargo, priority
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

if (!process.env.GEMINI_API_KEY) {
    console.warn('[SECURITY] GEMINI_API_KEY not set — Routy AI features will be degraded');
}
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

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
    const { message, state = {}, history = [], confirmedSource, confirmedDest } = req.body;

    if (!message && !confirmedSource) return res.status(400).json({ success: false, error: 'Missing message' });

    const PORT = process.env.PORT || 8000;

    const currentState = {
        origin:          state.origin          || null,
        destination:     state.destination     || null,
        mode:            state.mode            || null,
        date:            state.date            || null,
        time:            state.time            || null,
        cargo:           state.cargo           || null,
        priority:        state.priority        || null,
        confirmedSource: state.confirmedSource || null,
        confirmedDest:   state.confirmedDest   || null,
    };

    // Required field set — route only generates when ALL five are known
    const REQUIRED = ['origin', 'destination', 'mode', 'date', 'time'];
    const FIELD_QUESTIONS = {
        date: "What date would you like to ship? (e.g. June 15, next Monday, or ASAP)",
        time: "What's the preferred departure time? (e.g. 09:00, morning, any time)",
    };

    // ── SHORT-CIRCUIT: port/airport already confirmed — continue collecting remaining fields ──
    if (confirmedSource && confirmedDest && state.mode) {
        const updatedState = { ...currentState, confirmedSource, confirmedDest };
        const missing = REQUIRED.filter(f => !updatedState[f]);
        if (missing.length === 0) {
            const modeLabel = { sea: 'maritime', air: 'air freight', rail: 'rail', truck: 'road' }[state.mode] || state.mode;
            return res.json({
                success: true,
                type: 'COMPLETE',
                message: `All set! Calculating ${modeLabel} route from ${confirmedSource.display_name} to ${confirmedDest.display_name} with live risk and weather intelligence.`,
                state: updatedState,
                source: confirmedSource,
                destination: confirmedDest,
            });
        }
        return res.json({
            success: true,
            type: 'ASK',
            message: FIELD_QUESTIONS[missing[0]] || `What is the ${missing[0]}?`,
            state: updatedState,
        });
    }

    // Build the conversation context summary (exclude internal coord objects)
    const stateDesc = Object.entries(currentState)
        .filter(([k, v]) => v && !['confirmedSource', 'confirmedDest'].includes(k))
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
- Extract specific port names, cities, transport modes, dates, times, cargo types, priorities
- If a location is a country or continent (India, America, Europe, China, etc.) → type "CLARIFY", suggest 4 real ports
- Dates: accept natural language ("next Monday", "June 15", "asap" = today's date)
- Times: accept natural language ("morning", "09:00", "afternoon", "any time")
- Extract cargo type if mentioned (e.g. electronics, machinery, pharmaceuticals, textiles)
- Extract priority if mentioned (express, standard, economy)

REQUIRED FIELDS (ALL must be collected before route generation): origin, destination, mode, date, time
OPTIONAL FIELDS: cargo, priority

COLLECTION ORDER (ask one at a time in this order if missing):
1. origin → 2. destination → 3. mode → 4. date → 5. time → 6. cargo (optional) → 7. priority (optional)

RESPONSE RULES:
1. If user mentions COUNTRY or REGION for origin/destination → type "CLARIFY", suggest 4 real major ports/airports (appropriate for the mode)
2. NEVER use type "COMPLETE" — route generation is handled automatically by the system when all required fields are filled
3. Ask for the NEXT missing required field → type "ASK"
4. For general questions → type "CHAT"
5. Ask ONLY ONE question per response. Keep messages short, friendly, and concise.
6. After collecting date and time, optionally ask for cargo type then priority.

REQUIRED JSON RESPONSE (no markdown, no extra text):
{
  "type": "ASK" | "CLARIFY" | "CHAT",
  "message": "<Routy's response — short, friendly, conversational>",
  "extracted": {
    "origin": "<specific port/city name or null>",
    "destination": "<specific port/city name or null>",
    "mode": "<sea|air|rail|truck|null>",
    "date": "<date string or null>",
    "time": "<time string or null>",
    "cargo": "<cargo type or null>",
    "priority": "<express|standard|economy|null>"
  },
  "clarifyField": "<'origin'|'destination'|null>",
  "options": ["Port Name, Country", "Port Name, Country", "Port Name, Country", "Port Name, Country"]
}`;

    console.log('[AGENT] STATE IN:', JSON.stringify(currentState));

    let parsed = null;
    const aiRes = await runGemini(prompt);

    if (aiRes.success) {
        parsed = extractJSON(aiRes.text);
    }

    // ── Fallback parser (runs when Gemini is unavailable or returns invalid JSON) ──
    if (!parsed) {
        const msg = message.toLowerCase().trim();

        // Mode keyword map
        const MODE_KEYWORDS = {
            sea: 'sea', ship: 'sea', maritime: 'sea', ocean: 'sea', shipping: 'sea',
            air: 'air', flight: 'air', plane: 'air', fly: 'air',
            rail: 'rail', train: 'rail', railway: 'rail',
            truck: 'truck', road: 'truck', ground: 'truck', land: 'truck',
        };
        const modeWord = Object.keys(MODE_KEYWORDS).find(k =>
            msg === k || msg.startsWith(k + ' ') || msg.endsWith(' ' + k)
        );
        const detectedMode = modeWord ? MODE_KEYWORDS[modeWord] : null;

        // Route pattern "X to Y" (optionally "by mode")
        const routeMatch = message.match(/^(.+?)\s+(?:to|till|→|->)\s+(.+)$/i);

        // Date/time patterns
        const datePattern = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[\/\-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|asap|today|tomorrow|next\s+\w+)/i;
        const timePattern = /(?:\d{1,2}:\d{2}|morning|afternoon|evening|night|\d{1,2}\s*am|\d{1,2}\s*pm|any\s*time)/i;

        const COUNTRY_PORT_HINTS = {
            india: ['Mumbai Port, India', 'Chennai Port, India', 'Visakhapatnam Port, India', 'Kandla Port, India'],
            usa: ['Port of New York and New Jersey, USA', 'Port of Los Angeles, USA', 'Port of Long Beach, USA', 'Port of Savannah, USA'],
            america: ['Port of New York and New Jersey, USA', 'Port of Los Angeles, USA', 'Port of Long Beach, USA', 'Port of Savannah, USA'],
            china: ['Shanghai Port, China', 'Shenzhen Port, China', 'Ningbo-Zhoushan Port, China', 'Qingdao Port, China'],
            dubai: ['Jebel Ali Port, UAE', 'Port Rashid, UAE', 'Dubai Creek, UAE'],
            uae: ['Jebel Ali Port, UAE', 'Port Rashid, UAE', 'Dubai Creek, UAE'],
        };

        const normalize = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const normalizedMsg = normalize(msg);
        const countryMatch = Object.keys(COUNTRY_PORT_HINTS).find(k => normalizedMsg === k || normalizedMsg.includes(` ${k} `) || normalizedMsg.startsWith(`${k} `) || normalizedMsg.endsWith(` ${k}`));
        const matchedPort = Object.values(COUNTRY_PORT_HINTS).flat().find(p => normalize(p) === normalizedMsg);
        const matchedCountryPort = Object.entries(COUNTRY_PORT_HINTS).find(([, ports]) =>
            ports.some(p => normalize(p) === normalizedMsg)
        );
        const portCountry = matchedCountryPort?.[0] || null;

        if (matchedPort && !currentState.origin) {
            parsed = {
                type: 'ASK',
                message: `Great — ${matchedPort}. And where is it going?`,
                extracted: { origin: matchedPort, destination: null, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        } else if (countryMatch && !currentState.origin) {
            parsed = {
                type: 'CLARIFY',
                message: `I found "${countryMatch}" as a country. Please choose a specific port to continue.`,
                extracted: { origin: null, destination: null, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: 'origin',
                options: COUNTRY_PORT_HINTS[countryMatch],
            };
        } else if (matchedPort && currentState.origin && !currentState.destination) {
            parsed = {
                type: 'ASK',
                message: `Great — ${matchedPort}. Which transport mode would you like to use? Sea, Air, Rail, or Road?`,
                extracted: { origin: null, destination: matchedPort, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        } else if (matchedCountryPort && !currentState.origin) {
            parsed = {
                type: 'ASK',
                message: `Great — ${matchedPort}. And where is it going?`,
                extracted: { origin: matchedPort, destination: null, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        } else if (matchedCountryPort && currentState.origin && !currentState.destination) {
            parsed = {
                type: 'ASK',
                message: `Great — ${matchedPort}. Which transport mode would you like to use? Sea, Air, Rail, or Road?`,
                extracted: { origin: null, destination: matchedPort, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: null,
                options: [],
            };
        } else if (detectedMode && !currentState.mode) {
            // User answered a "which mode?" question
            const modeLabels = { sea: 'Maritime', air: 'Air freight', rail: 'Rail', truck: 'Road' };
            const nextQ = !currentState.date
                ? `${modeLabels[detectedMode]} it is! What date would you like to ship? (e.g. June 15, next Monday, or ASAP)`
                : !currentState.time
                ? `Great! What's the preferred departure time? (e.g. 09:00, morning, any time)`
                : `All set — let me put your route together.`;
            parsed = {
                type: 'ASK',
                message: nextQ,
                extracted: { origin: null, destination: null, mode: detectedMode, date: null, time: null, cargo: null, priority: null },
                clarifyField: null, options: [],
            };
        } else if (routeMatch) {
            const originText = routeMatch[1].trim();
            const rawDest    = routeMatch[2].trim();
            // Detect trailing "by <mode>" / "via <mode>"
            const byMatch   = rawDest.match(/^(.+?)\s+(?:by|via|using|through)\s+(\w+)$/i);
            const cleanDest  = byMatch ? byMatch[1].trim() : rawDest;
            const inlineMode = byMatch ? (MODE_KEYWORDS[byMatch[2].toLowerCase()] || null) : null;
            parsed = {
                type: 'ASK',
                message: inlineMode
                    ? `Got it — ${originText} to ${cleanDest} by ${inlineMode}. What date would you like to ship?`
                    : `Got it — ${originText} to ${cleanDest}. What transport mode? Sea, Air, Rail, or Road?`,
                extracted: { origin: originText, destination: cleanDest, mode: inlineMode, date: null, time: null, cargo: null, priority: null },
                clarifyField: null, options: [],
            };
        } else if (datePattern.test(msg) && !currentState.date) {
            parsed = {
                type: 'ASK',
                message: `Got it! What's the preferred departure time? (e.g. 09:00, morning, any time)`,
                extracted: { origin: null, destination: null, mode: null, date: message.trim(), time: null, cargo: null, priority: null },
                clarifyField: null, options: [],
            };
        } else if (currentState.date && !currentState.time && (timePattern.test(msg) || /\d/.test(msg))) {
            const timeText = message.trim();
            const parsedTime = timeText
                .replace(/\s+/g, ' ')
                .replace(/\b([ap])\.?m\.?\b/gi, (_, a) => `${a.toUpperCase()}M`)
                .replace(/\b([ap])\b/gi, (_, a) => `${a.toUpperCase()}M`);
            parsed = {
                type: 'ASK',
                message: `Perfect! What type of cargo are you shipping? (optional — just press enter to skip)`,
                extracted: { origin: null, destination: null, mode: null, date: null, time: parsedTime, cargo: null, priority: null },
                clarifyField: null, options: [],
            };
        } else {
            // Context-aware fallback — never show the generic welcome when state has data
            const nextPrompt = !currentState.origin
                ? `Where would you like to ship from?`
                : !currentState.destination
                ? `And where is it going?`
                : !currentState.mode
                ? `Which transport mode — Sea, Air, Rail, or Road?`
                : !currentState.date
                ? `What date would you like to ship?`
                : !currentState.time
                ? `What's the preferred departure time?`
                : `Got it! What type of cargo are you shipping? (optional)`;
            parsed = {
                type: currentState.origin ? 'ASK' : 'CHAT',
                message: nextPrompt,
                extracted: { origin: null, destination: null, mode: null, date: null, time: null, cargo: null, priority: null },
                clarifyField: null, options: [],
            };
        }
    }

    // Merge extracted fields into state (only update non-null values — never clobber existing state)
    const extracted = parsed.extracted || {};
    const newState = { ...currentState };
    if (extracted.origin)      newState.origin      = extracted.origin;
    if (extracted.destination) newState.destination = extracted.destination;
    if (extracted.mode)        newState.mode        = extracted.mode;
    if (extracted.date)        newState.date        = extracted.date;
    if (extracted.time)        newState.time        = extracted.time;
    if (extracted.cargo)       newState.cargo       = extracted.cargo;
    if (extracted.priority)    newState.priority    = extracted.priority;

    console.log('[AGENT] STATE OUT:', JSON.stringify(newState));

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

    // ── HANDLE COMPLETE — only when ALL 5 required fields are present ────────
    const allRequiredFilled = REQUIRED.every(f => newState[f]);
    if (allRequiredFilled) {
        // Geocode both locations
        const [startGeo, endGeo] = await Promise.all([
            geocode(newState.origin, PORT),
            geocode(newState.destination, PORT),
        ]);

        if (!startGeo || !endGeo) {
            const missing = !startGeo ? newState.origin : newState.destination;
            return res.json({
                success: true,
                type: 'CLARIFY',
                message: `I couldn't find "${missing}" on the map. Please choose a more specific port or city.`,
                state: { ...newState, [!startGeo ? 'origin' : 'destination']: null },
                clarifyField: !startGeo ? 'origin' : 'destination',
                options: !startGeo ? (COUNTRY_PORT_HINTS[missing.toLowerCase()] || []) : [],
            });
        }

        const mode      = newState.mode;
        const modeLabel = { sea: 'maritime', air: 'air freight', rail: 'rail', truck: 'road' }[mode] || mode;

        // ── SEA / AIR: resolve to port/airport options first (RESOLVE step) ──
        // Never route directly from raw city coordinates for sea/air modes.
        if (mode === 'sea' || mode === 'air') {
            const endpoint = mode === 'sea' ? 'resolve-port' : 'resolve-airport';
            const optKey   = mode === 'sea' ? 'nearestPorts' : 'nearestAirports';
            try {
                const [originRes, destRes] = await Promise.all([
                    axios.get(`http://localhost:${PORT}/api/ai/${endpoint}`, {
                        params: { lat: startGeo.lat, lon: startGeo.lon, name: newState.origin },
                        timeout: 5000,
                    }),
                    axios.get(`http://localhost:${PORT}/api/ai/${endpoint}`, {
                        params: { lat: endGeo.lat, lon: endGeo.lon, name: newState.destination },
                        timeout: 5000,
                    }),
                ]);
                const originOptions = originRes.data[optKey] || [];
                const destOptions   = destRes.data[optKey]   || [];
                if (originOptions.length > 0 && destOptions.length > 0) {
                    const noun = mode === 'sea' ? 'seaport' : 'airport';
                    return res.json({
                        success: true,
                        type: 'RESOLVE',
                        message: `Almost there! Please confirm the exact ${noun} for each location.`,
                        state: newState,
                        mode,
                        originName:    newState.origin,
                        destName:      newState.destination,
                        originOptions,
                        destOptions,
                    });
                }
            } catch (err) {
                console.warn('[AGENT] Resolver call failed, falling back to raw geocode:', err.message);
            }
        }

        // ── TRUCK / RAIL (or sea/air resolver fallback): direct COMPLETE ──────
        return res.json({
            success: true,
            type: 'COMPLETE',
            message: `All set! Calculating ${modeLabel} route from ${newState.origin} to ${newState.destination} with live risk and weather intelligence.`,
            state: newState,
            source: startGeo,
            destination: endGeo,
        });
    }

    // ── DETERMINISTIC FLOW: always ask for the NEXT missing required field ────
    const REQUIRED_ORDER = ['origin', 'destination', 'mode', 'date', 'time'];
    const missingField   = REQUIRED_ORDER.find(f => !newState[f]);

    console.log('[AGENT] MISSING FIELD:', missingField || 'none (all filled)');

    const ASK_MESSAGES = {
        origin:      'Where would you like to ship from?',
        destination: 'And where is it going to?',
        mode:        'Which transport mode — Sea, Air, Rail, or Road?',
        date:        'What date would you like to ship? (e.g. June 15, next Monday, or ASAP)',
        time:        "What's the preferred departure time? (e.g. 09:00, morning, any time)",
    };

    // Prefer the LLM's message when it returned ASK (friendly phrasing), but never
    // use a generic CHAT response when there are still required fields to collect.
    const responseMsg = (parsed.type === 'ASK' && parsed.message)
        ? parsed.message
        : missingField
        ? ASK_MESSAGES[missingField]
        : parsed.message || 'Almost done! Let me calculate your route.';

    return res.json({
        success: true,
        type: missingField ? 'ASK' : (parsed.type || 'CHAT'),
        message: responseMsg,
        state: newState,
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
