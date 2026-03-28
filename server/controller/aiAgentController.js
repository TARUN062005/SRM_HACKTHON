/**
 * FEATURE 18: Simulated Human Protocol (Protocol v20.3)
 * AI Intent Detection -> Coordinate Extraction -> Frontend Action Trigger
 * NO BACKEND ROUTING: Passes control to the high-fidelity Manual Map Engine.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const runAIWithFallback = async (genAI, prompt) => {
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA';
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { timeout: 7000 });
    try {
        const result = await model.generateContent(prompt);
        return { success: true, text: result.response.text() };
    } catch (e) { console.warn(`[AI] Failure:`, e.message); }
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 7000 });
        const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { success: true, text };
    } catch (e) { console.error(`[AI] HTTP Offline:`, e.message); }
    return { success: false };
};

const findCoordinates = async (query, PORT) => {
    if (!query) return null;
    try {
        const res = await axios.get(`http://localhost:${PORT}/api/ai/search?q=${encodeURIComponent(query)}&limit=1`);
        const data = res.data.results?.[0] || res.data?.[0];
        const lat = parseFloat(data?.lat || data?.latitude);
        const lon = parseFloat(data?.lon || data?.longitude || data?.lng);
        if (!isNaN(lat) && !isNaN(lon) && lat !== 0) return { lat, lon, display_name: data.display_name || query };

        const gRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, { headers: { 'User-Agent': 'RouteGuardianAgent' } });
        if (gRes.data && gRes.data[0]) return { lat: parseFloat(gRes.data[0].lat), lon: parseFloat(gRes.data[0].lon), display_name: gRes.data[0].display_name };
    } catch (e) { console.error(`[GEO] Error:`, e.message); }
    return null;
};

const ACRONYMS = { 'hyd': 'Hyderabad', 'vij': 'Vijayawada', 'blr': 'Bangalore', 'del': 'Delhi', 'bom': 'Mumbai', 'maa': 'Chennai' };

exports.processAIIntent = async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "No mission command" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA');
    const PORT = process.env.PORT || 5000;

    try {
        // --- PHASE 1: TARGET EXTRACTION ---
        let intent = { origin: null, destination: null, vehicle: 'car' };
        const aiRes = await runAIWithFallback(genAI, `Extract JSON: {"origin": "string", "destination": "string", "vehicle": "car|truck"} from "${command}". Return ONLY JSON.`);
        if (aiRes.success) {
            const match = aiRes.text.match(/\{.*\}/s);
            if (match) intent = JSON.parse(match[0]);
        }
        if (!intent.origin || !intent.destination) {
            const r = command.match(/(.+?)\s+(?:to|till|2|between|and)\s+(.+)/i);
            if (r) { intent.origin = r[1].trim(); intent.destination = r[2].trim(); }
        }
        intent.origin = ACRONYMS[intent.origin?.toLowerCase()] || intent.origin;
        intent.destination = ACRONYMS[intent.destination?.toLowerCase()] || intent.destination;

        if (!intent.origin || !intent.destination) {
            return res.json({ success: true, analysis: { summary: "Mission targets unclear.", voice_text: "Target coordinates unclear. Please specify origin and destination." } });
        }

        // --- PHASE 2: COORDINATE RESOLUTION ---
        console.log(`[AI AGENT] Synchronizing Mission: ${intent.origin} -> ${intent.destination}`);
        const [start, end] = await Promise.all([ findCoordinates(intent.origin, PORT), findCoordinates(intent.destination, PORT) ]);
        if (!start || !end) throw new Error(`Geography Unreachable: [${!start ? intent.origin : intent.destination}] not found.`);

        // --- PHASE 3: PROXY RESPONSE (Manual Parity) ---
        // Instead of calculating the route here, we return the targets to the frontend.
        // The frontend will set selectedSource/Dest, triggering the manual fetchRoutes.
        res.json({ 
            success: true, 
            mission: intent, 
            source: start,
            destination: end,
            analysis: {
                recommended_route: "Neural Proxy Path",
                risk_level: "PROCESSING",
                summary: `Mission locked. Synchronizing with manual engine...`,
                voice_text: `I have identified the targets: ${intent.origin} to ${intent.destination}. Executing manual calculation bridge...`
            }
        });

    } catch (error) {
        console.error("[AGENT ERROR]:", error.message);
        res.json({ success: true, analysis: { status: "DEGRADED", summary: "Interference: " + error.message, voice_text: "Mission sync failed. Verify targets manually." } });
    }
};
