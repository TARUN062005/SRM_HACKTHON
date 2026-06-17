const fs = require('fs');
const path = require('path');
const PortResolver = require('./services/PortResolver');

const resolver = new PortResolver();

async function run() {
    await resolver.ensureDataset();
    console.log("Ports count loaded:", resolver.ports.length);
    console.log("Prefix index keys sample:", Array.from(resolver.prefixIndex.keys()).slice(0, 30));

    const queries = ['durban', 'mumbai', 'singapore', 'africa', 'capetown', 'cape'];
    for (const q of queries) {
        const results = await resolver.searchByName(q, 5);
        console.log(`\nSearch for "${q}":`);
        console.log("Results found:", results.length);
        results.forEach(p => {
            console.log(` - ${p.name} (Code: ${p.countryCode}, Lat: ${p.lat}, Lon: ${p.lon})`);
        });
    }
}

run().catch(console.error);
