const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

const DEFAULT_URL = 'https://msi.nga.mil/api/publications/download?type=view&key=16920959/SFH00000/UpdatedPub150.csv';
const MAX_AGE_DAYS = 30;

function normalize(value) {
  return (value || '').toString().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class PortResolver {
  constructor(options = {}) {
    this.datasetDir = options.datasetDir || path.join(__dirname, '..', 'datasets', 'ports');
    this.datasetPath = options.datasetPath || path.join(this.datasetDir, 'UpdatedPub150.csv');
    this.downloadUrl = options.downloadUrl || DEFAULT_URL;
    this.ports = [];
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
          const response = await axios.get(this.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: {
              'User-Agent': 'RouteGuardian/1.1',
              'Accept': 'text/csv,*/*',
            },
          });
          fs.writeFileSync(this.datasetPath, response.data);
        } catch (downloadErr) {
          console.warn(`[PortResolver] Failed to download fresh ports.csv, falling back to existing data:`, downloadErr.message);
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

      this.ports = records.map(row => {
        const name = row['Main Port Name'] || row['PORT_NAME'] || row['Name'];
        const altName = row['Alternate Port Name'] || row['ALT_NAME'] || '';
        const unlocode = row['UN/LOCODE'] || row['UNLOCODE'] || row['UNLocode'] || '';
        const countryCode = row['Country Code'] || row['COUNTRY_CODE'] || row['Country'] || '';
        const lat = parseFloat(row['Latitude']);
        const lon = parseFloat(row['Longitude']);
        if (!name || Number.isNaN(lat) || Number.isNaN(lon)) return null;
        const searchName = normalize(name);
        const searchAlt = normalize(altName);
        return {
          name,
          altName,
          unlocode,
          wpi: unlocode,
          countryCode,
          lat,
          lon,
          searchName,
          searchAlt,
        };
      }).filter(Boolean);

      this.prefixIndex = new Map();
      this.ports.forEach(port => {
        const terms = [...port.searchName.split(' '), ...port.searchAlt.split(' '), port.unlocode].filter(Boolean);
        for (const term of terms) {
          for (let len = 1; len <= term.length; len++) {
            const prefix = term.substring(0, len);
            if (!this.prefixIndex.has(prefix)) {
              this.prefixIndex.set(prefix, new Set());
            }
            this.prefixIndex.get(prefix).add(port);
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
    const candidates = this.prefixIndex.get(firstWord) || new Set();

    const scored = [];
    for (const port of candidates) {
      let score = 0;
      if (port.unlocode && normalize(port.unlocode) === q) score += 50;
      if (port.searchName === q) score += 40;
      if (port.searchAlt === q) score += 35;
      if (port.searchName.startsWith(q)) score += 20;
      if (port.searchAlt.startsWith(q)) score += 15;
      if (port.searchName.includes(q)) score += 10;
      if (port.searchAlt.includes(q)) score += 8;
      if (score > 0) scored.push({ port, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, limit).map(item => item.port);
    console.log(`[PORT SEARCH TIME] query="${query}" time=${Date.now() - startTime}ms candidates=${candidates.size} results=${result.length}`);
    return result;
  }

  async findNearest(lat, lon) {
    await this.ensureDataset();
    let best = null;
    let bestDist = Infinity;
    for (const port of this.ports) {
      const dist = haversineKm(lon, lat, port.lon, port.lat);
      if (dist < bestDist) {
        best = port;
        bestDist = dist;
      }
    }
    return { port: best, distanceKm: bestDist };
  }

  async resolve({ lat, lon, name }) {
    const { port, distanceKm } = await this.findNearest(lat, lon);
    const matches = name ? await this.searchByName(name, 5) : [];
    return {
      isPort: distanceKm <= 80,
      distanceKm,
      nearestPort: port,
      matches,
    };
  }
}

module.exports = PortResolver;
