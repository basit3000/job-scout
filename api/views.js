import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Resolve Redis keys for either the site-wide counter or a specific blog post.
// Slugs are validated to keep keys safe and predictable.
function resolveKeys(rawSlug, visitorHash) {
  const slug = typeof rawSlug === 'string' && /^[a-z0-9-]{1,80}$/.test(rawSlug)
    ? rawSlug
    : null;

  if (slug) {
    return {
      viewsKey: `portfolio:blog:${slug}:views`,
      visitorKey: `portfolio:blog:${slug}:visitor:${visitorHash}`,
      isPost: true,
    };
  }

  return {
    viewsKey: 'portfolio:views',
    visitorKey: `portfolio:visitor:${visitorHash}`,
    isPost: false,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Batch read: ?slugs=a,b,c -> { views: { a: n, b: n, ... } }. Never increments.
    if (req.query.slugs) {
      const slugs = String(req.query.slugs)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[a-z0-9-]{1,80}$/.test(s));

      if (slugs.length === 0) {
        return res.status(200).json({ views: {} });
      }

      const counts = await redis.mget(...slugs.map((s) => `portfolio:blog:${s}:views`));
      const views = {};
      slugs.forEach((s, i) => { views[s] = counts[i] || 0; });
      return res.status(200).json({ views });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               'unknown';
    const hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
    const { viewsKey, visitorKey, isPost } = resolveKeys(req.query.slug, hash);

    if (req.method === 'POST') {
      // Deduplicate by hashed IP — same visitor won't count twice within 24h
      const alreadyVisited = await redis.get(visitorKey);

      if (!alreadyVisited) {
        await redis.set(visitorKey, 1, { ex: 86400 }); // expires in 24h
        await redis.incr(viewsKey);

        // Track country for site-wide visits (private — only in Upstash dashboard)
        if (!isPost) {
          const country = req.headers['x-vercel-ip-country'] || 'Unknown';
          await redis.hincrby('portfolio:countries', country, 1);
        }
      }

      const count = (await redis.get(viewsKey)) || 0;
      return res.status(200).json({ views: count });
    }

    // GET — just return current count
    const count = (await redis.get(viewsKey)) || 0;
    return res.status(200).json({ views: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch view count' });
  }
}
