import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load env from project root first, then manual ~/.hermes/.env fallback
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Find and load LTA Key
let ltaKey = process.env.LTA_DATAMALL_KEY;
if (!ltaKey) {
  const hermesEnvPath = path.join(process.env.HOME || '', '.hermes', '.env');
  if (fs.existsSync(hermesEnvPath)) {
    const content = fs.readFileSync(hermesEnvPath, 'utf-8');
    const match = content.match(/^LTA_DATAMALL_KEY=(.+)$/m);
    if (match) {
      ltaKey = match[1].trim();
    }
  }
}

interface CacheEntry {
  timestamp: number;
  payload: {
    source: string;
    stopCode: string;
    data: any;
  };
}

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 15000; // 15-second cache TTL

// Endpoint to fetch bus arrival timings
app.get('/api/bus-arrival', async (req: Request, res: Response): Promise<void> => {
  const stopCode = req.query.stopCode as string;
  if (!stopCode) {
    res.status(400).json({ error: 'stopCode parameter is required' });
    return;
  }

  const now = Date.now();
  if (cache[stopCode] && now - cache[stopCode].timestamp < CACHE_TTL_MS) {
    res.json({
      ...cache[stopCode].payload,
      cached: true
    });
    return;
  }

  let useLta = false;
  let data: any = null;

  // Try official LTA API first
  if (ltaKey) {
    try {
      const url = `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${stopCode}`;
      const response = await fetch(url, {
        headers: {
          'AccountKey': ltaKey,
          'accept': 'application/json'
        }
      });
      if (response.ok) {
        data = await response.json();
        useLta = true;
      }
    } catch (e) {
      console.error(`LTA API failed for stop ${stopCode}, falling back...`, e);
    }
  }

  // Fallback to ArriveLah API
  if (!useLta) {
    try {
      const url = `https://arrivelah2.busrouter.sg/?id=${stopCode}`;
      const response = await fetch(url);
      if (response.ok) {
        data = await response.json();
      }
    } catch (e) {
      console.error(`ArriveLah API failed for stop ${stopCode}`, e);
      res.status(500).json({ error: 'Failed to fetch bus arrival timings' });
      return;
    }
  }

  const payload = {
    source: useLta ? 'LTA' : 'ArriveLah',
    stopCode,
    data
  };

  cache[stopCode] = {
    timestamp: now,
    payload
  };

  res.json(payload);
});

// Serve frontend in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, '../dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`LTA Key detected: ${ltaKey ? 'YES' : 'NO'}`);
});
