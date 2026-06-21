import React from 'react';
import DotaIcon from '../components/DotaIcon';
import MinimapWidget from '../components/MinimapWidget';

function Gaming() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Gaming</h2>
        <p className="page-subtitle">Dota 2 main — click the minimap to warp around the site.</p>
      </div>
      <MinimapWidget />
      <div className="section-title">Dota 2</div>
      <a className="link-card" href="https://www.dotabuff.com/players/395370670" target="_blank" rel="noopener noreferrer">
        <DotaIcon className="link-card-icon" />
        Dotabuff: MeyraMax
      </a>
      <a className="link-card" href="https://steamcommunity.com/id/sasadkasokcasokmpo/" target="_blank" rel="noopener noreferrer">
        <i className="fab fa-steam"></i>
        Steam: MeyraMax
      </a>
      <div className="section-title">Other Games</div>
      <a className="link-card" href="https://discord.com/users/297442450623037441" target="_blank" rel="noopener noreferrer"><i className="fab fa-discord"></i>Discord: meyramax</a>
      <a className="link-card" href="https://tracker.gg/valorant/profile/riot/MeyraMax%23xdxd/overview" target="_blank" rel="noopener noreferrer"><i className="fas fa-crosshairs"></i>Valorant: MeyraMax #xDxD</a>
      <a className="link-card" href="https://www.twitch.tv/meyramax" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitch"></i>Twitch: MeyraMax</a>
      <div className="section-title">Other</div>
      <a className="link-card" href="https://myanimelist.net/animelist/MeyraMax" target="_blank" rel="noopener noreferrer"><i className="fas fa-tv"></i>MyAnimeList: MeyraMax</a>
    </div>
  );
}

export default Gaming;
