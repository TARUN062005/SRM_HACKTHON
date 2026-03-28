/**
 * FEATURE 18: Routy Intelligence Protocol (Protocol v21.0)
 * Dual-Mode Intent: MISSION (Route Targeting) vs CHAT (App/Route FAQ)
 * Persona: Routy - The Tactical Logistics Optimizer
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const runAIWithFallback = async (genAI, prompt) => {
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA';
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { timeout: 7000 });
    try {
        const result = await model.generateContent(prompt);
        return { success: true, text: result.response.text() };
    } catch (e) {
        try {
            const res = await axios.post(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 7000 });
            const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return { success: true, text };
        } catch (e2) { }
    }
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
    } catch (e) { }
    return null;
};

const ACRONYMS = { 'hyd': 'Hyderabad', 'vij': 'Vijayawada', 'blr': 'Bangalore', 'del': 'Delhi', 'bom': 'Mumbai', 'maa': 'Chennai' };

exports.processAIIntent = async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "Missing command" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCF-jKDV0TrY4sMQA3BueNZWAE04QgdoYA');
    const PORT = process.env.PORT || 5000;

    try {
        // --- PHASE 1: ROUTY DUAL-MODE INTENT ---
        const exPrompt = `I am Routy, a Tactical Logistics Optimizer for the RouteGuardian app.
        Task: Analyze "${command}".
        Rules: 
        1. If user wants a route from A to B, return {"type": "MISSION", "origin": "string", "destination": "string"}.
        2. If user asks a question about the app or routes, return {"type": "CHAT", "reply": "string"}. 
        3. Routy ONLY assists with logistics/app. For off-topic, say you can't help with that.
        4. Return ONLY JSON.`;
        
        const aiRes = await runAIWithFallback(genAI, exPrompt);
        
        let intent = { type: 'CHAT', reply: "I am Routy. I help you find optimized paths for your mission. Targets unclear." };
        if (aiRes.success) {
            const match = aiRes.text.match(/\{.*\}/s);
            if (match) intent = JSON.parse(match[0]);
        } else {
            // Surgical Regex Fallback
            const r = command.match(/(.+?)\s+(?:to|till|2|and|between)\s+(.+)/i);
            if (r) intent = { type: 'MISSION', origin: r[1].trim(), destination: r[2].trim() };
        }

        // --- PHASE 2: SELECTIVE FULFILLMENT ---
        if (intent.type === 'MISSION') {
            intent.origin = ACRONYMS[intent.origin?.toLowerCase()] || intent.origin;
            intent.destination = ACRONYMS[intent.destination?.toLowerCase()] || intent.destination;

            console.log(`[ROUTY] Target Identification: ${intent.origin} -> ${intent.destination}`);
            const [start, end] = await Promise.all([ findCoordinates(intent.origin, PORT), findCoordinates(intent.destination, PORT) ]);
            
            if (!start || !end) {
                return res.json({ 
                    success: true, type: 'CHAT', 
                    reply: `Mission Intercepted: I could not locate [${!start ? intent.origin : intent.destination}] on the tactical grid. Please clarify the target name.`
                });
            }

            return res.json({
                success: true, type: 'MISSION', source: start, destination: end,
                analysis: {
                    summary: `Mission locked: ${intent.origin} to ${intent.destination}.`,
                    voice_text: `I have identified the optimization targets: ${intent.origin} to ${intent.destination}. Initiating mission bridge...`
                }
            });
        }

        // Default: CHAT mode
        res.json({ success: true, type: 'CHAT', reply: intent.reply });

    } catch (error) {
        console.error("[ROUTY ERROR]:", error.message);
        res.json({ success: true, type: 'CHAT', reply: "Mission desync. I am currently experiencing neural interference. Please try again." });
    }
};
