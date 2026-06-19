import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const stopCode = req.query.stopCode as string;
  if (!stopCode) {
    res.status(400).json({ error: 'stopCode parameter is required' });
    return;
  }

  const ltaKey = process.env.LTA_DATAMALL_KEY;
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

  // Add CORS headers manually just in case Vercel doesn't do it automatically
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.status(200).json({
    source: useLta ? 'LTA' : 'ArriveLah',
    stopCode,
    data
  });
}
