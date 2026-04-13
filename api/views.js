import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Deduplicate by hashed IP — same visitor won't count twice within 24h
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                 req.headers['x-real-ip'] ||
                 'unknown';
      const hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
      const visitorKey = `portfolio:visitor:${hash}`;

      const alreadyVisited = await redis.get(visitorKey);

      if (!alreadyVisited) {
        await redis.set(visitorKey, 1, { ex: 86400 }); // expires in 24h
        await redis.incr('portfolio:views');

        // Track country (private — only visible in Upstash dashboard)
        const country = req.headers['x-vercel-ip-country'] || 'Unknown';
        await redis.hincrby('portfolio:countries', country, 1);
      }

      const count = (await redis.get('portfolio:views')) || 0;
      return res.status(200).json({ views: count });
    }

    // GET — just return current count
    const count = (await redis.get('portfolio:views')) || 0;
    return res.status(200).json({ views: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch view count' });
  }
}
