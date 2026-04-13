import { Redis } from '@upstash/redis';

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
      const count = await redis.incr('portfolio:views');
      return res.status(200).json({ views: count });
    }

    // GET — just return current count
    const count = (await redis.get('portfolio:views')) || 0;
    return res.status(200).json({ views: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch view count' });
  }
}
