import React from 'react';
import MinimapArt from './MinimapArt';

function MinimapWidget() {
  return (
    <div className="minimap-widget">
      <MinimapArt variant="widget" />
      <div className="minimap-widget-caption">
        <span className="minimap-label-radiant">
          <i className="fas fa-shield-halved" aria-hidden="true"></i> Radiant
        </span>
        <span className="minimap-label-gold">
          <i className="fas fa-map" aria-hidden="true"></i> The Map
        </span>
        <span className="minimap-label-dire">
          Dire <i className="fas fa-skull" aria-hidden="true"></i>
        </span>
      </div>
    </div>
  );
}

export default MinimapWidget;
