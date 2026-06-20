import React, { useEffect, useState } from 'react';

const REFRESH_MS = 5 * 60 * 1000;
const EQ_BAR_COUNT = 70;

function SpotifyEqualizer({ active }) {
  if (!active) return null;

  return (
    <div className="live-status-eq" aria-hidden="true">
      {Array.from({ length: EQ_BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="live-status-eq-bar"
          style={{
            animationDuration: `${350 + (i * 13) % 150}ms`,
            animationDelay: `${(i * 41) % 280}ms`,
          }}
        />
      ))}
    </div>
  );
}

function SpotifyNowPlaying() {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadTrack = async () => {
      try {
        const response = await fetch('/api/spotify-status');
        if (!response.ok) throw new Error('Spotify status unavailable');
        const data = await response.json();
        if (active) setTrack(data);
      } catch {
        if (active) setTrack(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTrack();
    const timer = setInterval(loadTrack, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="live-status-item live-status-spotify">
        <div className="live-status-spotify-body">
          <div className="live-status-spotify-copy">
            <i className="fab fa-spotify live-status-spotify-icon" aria-hidden="true"></i>
            <div className="live-status-spotify-text">
              <span className="live-status-spotify-artist">Spotify</span>
              <span className="live-status-spotify-song">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="live-status-item live-status-spotify">
        <div className="live-status-spotify-body">
          <div className="live-status-spotify-copy">
            <i className="fab fa-spotify live-status-spotify-icon" aria-hidden="true"></i>
            <div className="live-status-spotify-text">
              <span className="live-status-spotify-artist">Spotify</span>
              <span className="live-status-spotify-song">Status unavailable</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-status-item live-status-spotify">
      <div className="live-status-spotify-body">
        <div className="live-status-spotify-copy">
          <i className="fab fa-spotify live-status-spotify-icon" aria-hidden="true"></i>
          <div className="live-status-spotify-text">
            <span className="live-status-spotify-artist">{track.artist}</span>
            <span className="live-status-spotify-song">{track.song}</span>
          </div>
        </div>
        <SpotifyEqualizer active={track.isPlaying} />
      </div>
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
      <div className="section-title">ACTIVITY</div>
      <div className="live-status-grid">
        <SpotifyNowPlaying />
        <SteamNowPlaying />
      </div>
    </section>
  );
}

export default LiveStatus;
