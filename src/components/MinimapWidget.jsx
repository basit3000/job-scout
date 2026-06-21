import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MinimapArt from './MinimapArt';

const REGION_ROUTES = {
  radiant: '/about',
  dire: '/gaming',
  river: '/blogs',
  roshan: '/projects',
};

const REGION_LABELS = {
  radiant: 'About',
  dire: 'Gaming',
  river: 'Blogs',
  roshan: 'Projects',
};

function MinimapWidget() {
  const navigate = useNavigate();
  const [activeRegion, setActiveRegion] = useState(null);

  const handleRegionClick = (region) => {
    const path = REGION_ROUTES[region];
    if (path) navigate(path);
  };

  return (
    <div className="minimap-widget minimap-widget-interactive">
      <MinimapArt
        variant="widget"
        interactive
        activeRegion={activeRegion}
        onRegionClick={handleRegionClick}
        onRegionHover={setActiveRegion}
      />
      <div className="minimap-widget-caption">
        <span className="minimap-label-radiant">
          <i className="fas fa-shield-halved" aria-hidden="true"></i> Radiant
        </span>
        <span className="minimap-label-gold">
          <i className="fas fa-hand-pointer" aria-hidden="true"></i> Click map
        </span>
        <span className="minimap-label-dire">
          Dire <i className="fas fa-skull" aria-hidden="true"></i>
        </span>
      </div>
      <p className="minimap-widget-legend">
        {Object.entries(REGION_LABELS).map(([region, label]) => (
          <button
            key={region}
            type="button"
            className={`minimap-legend-btn minimap-legend-${region}${activeRegion === region ? ' active' : ''}`}
            onMouseEnter={() => setActiveRegion(region)}
            onMouseLeave={() => setActiveRegion(null)}
            onFocus={() => setActiveRegion(region)}
            onBlur={() => setActiveRegion(null)}
            onClick={() => handleRegionClick(region)}
          >
            {label}
          </button>
        ))}
      </p>
    </div>
  );
}

export default MinimapWidget;
