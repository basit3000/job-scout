const STEAM_ID = process.env.STEAM_ID || '76561198355636398';

const STATUS_COLORS = {
  online: '#57cbde',
  'in-game': '#90ba3c',
  busy: '#c7a008',
  away: '#f0ad4e',
  snooze: '#f0ad4e',
  offline: '#898989',
  'looking to trade': '#c7a008',
  'looking to play': '#57cbde',
};

function text(element, tag, defaultValue = '') {
  const match = element.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`, 'i'));
  if (!match) return defaultValue;
  return (match[1] ?? match[2] ?? defaultValue).trim();
}

function extractInGameName(stateMessage, onlineState) {
  if (onlineState !== 'in-game') return '';

  const plain = stateMessage
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const parts = plain.split('\n').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (!['in-game', 'in game'].includes(part.toLowerCase())) {
      return part;
    }
  }

  return '';
}

function profileHeader(xml) {
  const profileMatch = xml.match(/<profile>([\s\S]*?)<\/profile>/i);
  const body = profileMatch ? profileMatch[1] : xml;
  const headerEnd = body.search(/<mostPlayedGames|<groups|<favoriteGame/i);
  return headerEnd === -1 ? body : body.slice(0, headerEnd);
}

function buildStatus(xml) {
  const header = profileHeader(xml);
  const onlineState = text(header, 'onlineState', 'offline').toLowerCase();
  const stateMessage = text(header, 'stateMessage', onlineState);

  if (onlineState === 'in-game') {
    const gameName = (
      text(header, 'gameName')
      || text(header, 'gameExtraInfo')
      || text(header, 'inGameInfo')
      || extractInGameName(stateMessage, onlineState)
    );

    return {
      title: 'In-Game',
      detail: gameName || 'Playing now',
      accent: STATUS_COLORS['in-game'],
      inGame: true,
    };
  }

  const plainStatus = stateMessage.replace(/<[^>]+>/g, ' ').trim();

  return {
    title: 'Steam',
    detail: plainStatus || onlineState.replace(/\b\w/g, (c) => c.toUpperCase()),
    accent: STATUS_COLORS[onlineState] || STATUS_COLORS.offline,
    inGame: false,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`, {
      headers: { 'User-Agent': 'basitzaheer-portfolio/1.0' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Steam profile unavailable' });
    }

    const xml = await response.text();
    return res.status(200).json(buildStatus(xml));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch Steam status' });
  }
}
