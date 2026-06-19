import React, { useEffect, useState } from 'react';

const SPOTIFY_UID = import.meta.env.VITE_SPOTIFY_UID || 'ic9zxmbzknyeuiza6yh988k8n';
const REFRESH_MS = 5 * 60 * 1000;

const spotifyParams = new URLSearchParams({
  uid: SPOTIFY_UID,
  cover_image: 'true',
  theme: 'default',
  show_offline: 'false',
  background_color: '121212',
  interchange: 'false',
  profanity: 'false',
  hide_remaster: 'false',
});

function SpotifyNowPlaying() {
  const [cacheKey, setCacheKey] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCacheKey(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const src = `https://spotify-github-profile.kittinanx.com/api/view?${spotifyParams.toString()}&_=${cacheKey}`;

  return (
    <div className="live-status-item live-status-spotify">
      <img src={src} alt="Spotify now playing" className="live-status-spotify-img" loading="lazy" />
    </div>
  );
}

function SteamNowPlaying() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const response = await fetch('/api/steam-status');
        if (!response.ok) throw new Error('Steam status unavailable');
        const data = await response.json();
        if (active) setStatus(data);
      } catch {
        if (active) setStatus(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadStatus();
    const timer = setInterval(loadStatus, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="live-status-item live-status-steam live-status-steam--loading">
        <i className="fab fa-steam live-status-steam-icon" aria-hidden="true"></i>
        <div className="live-status-steam-copy">
          <span className="live-status-label">Steam</span>
          <span className="live-status-value">Loading...</span>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="live-status-item live-status-steam live-status-steam--error">
        <i className="fab fa-steam live-status-steam-icon" aria-hidden="true"></i>
        <div className="live-status-steam-copy">
          <span className="live-status-label">Steam</span>
          <span className="live-status-value">Status unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="live-status-item live-status-steam">
      <i className="fab fa-steam live-status-steam-icon" aria-hidden="true"></i>
      <div className="live-status-steam-copy">
        <span className="live-status-label">{status.title}</span>
        <span className="live-status-value" style={{ color: status.accent }}>
          {status.detail}
        </span>
        <span className="live-status-footnote">Now playing on Steam</span>
      </div>
    </div>
  );
}

function LiveStatus() {
  return (
    <section className="live-status-section" aria-label="Current listening and gaming status">
      <div className="section-title">Right now</div>
      <p className="live-status-intro">What I&apos;m listening to and playing — no profile links, just the vibe.</p>
      <div className="live-status-grid">
        <SpotifyNowPlaying />
        <SteamNowPlaying />
      </div>
    </section>
  );
}

export default LiveStatus;
