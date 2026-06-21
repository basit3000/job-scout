import React, { useEffect } from 'react';

function VictoryOverlay({ message, subtext, onDone }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="victory-overlay" role="status" aria-live="polite">
      <div className="victory-overlay-inner">
        <i className="fas fa-trophy victory-overlay-icon" aria-hidden="true"></i>
        <p className="victory-overlay-title">{message}</p>
        {subtext && <p className="victory-overlay-subtext">{subtext}</p>}
      </div>
    </div>
  );
}

export default VictoryOverlay;
