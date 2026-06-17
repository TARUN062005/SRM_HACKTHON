const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

const DEFAULT_URL = 'https://ourairports.com/data/airports.csv';
const MAX_AGE_DAYS = 14;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function normalize(value) {
  return (value || '').toString().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isAirportType(type) {
  const t = (type || '').toLowerCase();
  return t.includes('airport') || t === 'seaplane_base';
}

class AirportResolver {
  constructor(options = {}) {
    this.datasetDir = options.datasetDir || path.join(__dirname, '..', 'datasets', 'airports');
    this.datasetPath = options.datasetPath || path.join(this.datasetDir, 'airports.csv');
    this.downloadUrl = options.downloadUrl || DEFAULT_URL;
    this.airports = [];
    this.loadingPromise = null;
  }

  async ensureDataset() {
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = (async () => {
      fs.mkdirSync(this.datasetDir, { recursive: true });
      let shouldDownload = true;

      if (fs.existsSync(this.datasetPath)) {
        const stats = fs.statSync(this.datasetPath);
        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        shouldDownload = ageDays > MAX_AGE_DAYS;
      }

      if (shouldDownload) {
        try {
          const response = await axios.get(this.downloadUrl, { responseType: 'arraybuffer', timeout: 20000 });
          fs.writeFileSync(this.datasetPath, response.data);
        } catch (downloadErr) {
          console.warn(`[AirportResolver] Failed to download fresh airports.csv, falling back to existing data:`, downloadErr.message);
          if (!fs.existsSync(this.datasetPath)) {
            throw downloadErr;
          }
        }
      }

      const csv = fs.readFileSync(this.datasetPath, 'utf8');
      const records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      this.airports = records.map(row => {
        const type = row.type || '';
        if (!isAirportType(type)) return null;
        if ((row.scheduled_service || '').toLowerCase() === 'no' && type === 'small_airport') return null;

        const name = row.name || '';
        const iata = row.iata_code || '';
        const icao = row.ident || row.gps_code || '';
        const city = row.municipality || '';
        const countryCode = (row.iso_country || '').toUpperCase();
        let country = '';
        if (countryCode) {
          try {
            country = regionNames.of(countryCode);
            if (country === 'Unknown Region') {
              country = countryCode;
            }
          } catch (e) {
            country = countryCode;
          }
        }
        const lat = parseFloat(row.latitude_deg);
        const lon = parseFloat(row.longitude_deg);
        if (!name || Number.isNaN(lat) || Number.isNaN(lon)) return null;

        const searchCountry = normalize(country);

        return {
          name,
          iata,
          icao,
          city,
          country,
          lat,
          lon,
          searchName: normalize(name),
          searchCity: normalize(city),
          searchIata: normalize(iata),
          searchIcao: normalize(icao),
          searchCountry,
        };
      }).filter(Boolean);

      this.prefixIndex = new Map();
      this.airports.forEach(airport => {
        const strippedName = airport.searchName.replace(/\s+/g, '');
        const strippedCity = airport.searchCity.replace(/\s+/g, '');
        const strippedCountry = airport.searchCountry.replace(/\s+/g, '');
        const terms = [
          ...airport.searchName.split(' '),
          ...airport.searchCity.split(' '),
          ...(airport.searchCountry ? airport.searchCountry.split(' ') : []),
          airport.searchIata,
          airport.searchIcao,
          strippedName,
          strippedCity,
          strippedCountry
        ].filter(Boolean);
        for (const term of terms) {
          for (let len = 1; len <= term.length; len++) {
            const prefix = term.substring(0, len);
            if (!this.prefixIndex.has(prefix)) {
              this.prefixIndex.set(prefix, new Set());
            }
            this.prefixIndex.get(prefix).add(airport);
          }
        }
      });
    })();

    return this.loadingPromise;
  }

  async searchByName(query, limit = 5) {
    const startTime = Date.now();
    await this.ensureDataset();
    const q = normalize(query);
    if (!q) return [];

    const firstWord = q.split(' ')[0];
    const qStripped = q.replace(/\s+/g, '');
    const candidates = new Set([
      ...(this.prefixIndex.get(firstWord) || []),
      ...(this.prefixIndex.get(qStripped) || [])
    ]);

    const scored = [];
    for (const airport of candidates) {
      let score = 0;
      const nameStripped = airport.searchName.replace(/\s+/g, '');
      const cityStripped = airport.searchCity.replace(/\s+/g, '');
      const countryStripped = (airport.searchCountry || '').replace(/\s+/g, '');

      if (airport.searchIata && airport.searchIata === q) score += 50;
      if (airport.searchIcao && airport.searchIcao === q) score += 45;
      if (airport.searchName === q || nameStripped === qStripped) score += 35;
      if (airport.searchCity === q || cityStripped === qStripped) score += 25;
      if (airport.searchCountry && (airport.searchCountry === q || countryStripped === qStripped)) score += 30;
      if (airport.searchName.startsWith(q) || nameStripped.startsWith(qStripped)) score += 20;
      if (airport.searchCity.startsWith(q) || cityStripped.startsWith(qStripped)) score += 12;
      if (airport.searchCountry && (airport.searchCountry.startsWith(q) || countryStripped.startsWith(qStripped))) score += 15;
      if (airport.searchName.includes(q) || nameStripped.includes(qStripped)) score += 10;
      if (airport.searchCity.includes(q) || cityStripped.includes(qStripped)) score += 6;
      if (airport.searchCountry && (airport.searchCountry.includes(q) || countryStripped.includes(qStripped))) score += 8;
      if (score > 0) scored.push({ airport, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, limit).map(item => item.airport);
    console.log(`[AIRPORT SEARCH TIME] query="${query}" time=${Date.now() - startTime}ms candidates=${candidates.size} results=${result.length}`);
    return result;
  }

  async findNearest(lat, lon) {
    await this.ensureDataset();
    let best = null;
    let bestDist = Infinity;
    for (const airport of this.airports) {
      const dist = haversineKm(lon, lat, airport.lon, airport.lat);
      if (dist < bestDist) {
        best = airport;
        bestDist = dist;
      }
    }
    return { airport: best, distanceKm: bestDist };
  }

  async resolve({ lat, lon, name }) {
    const { airport, distanceKm } = await this.findNearest(lat, lon);
    const matches = name ? await this.searchByName(name, 5) : [];
    return {
      isAirport: distanceKm <= 80,
      distanceKm,
      nearestAirport: airport,
      matches,
    };
  }
}

module.exports = AirportResolver;
