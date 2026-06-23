import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DotaIcon from './DotaIcon';
import dotaTips from '../data/dotaTips';

const DOTA_2_URL = 'https://www.dota2.com/';
const AUTO_DISMISS_MS = 9000;

function pickTip(previousIndex) {
  if (dotaTips.length <= 1) return 0;
  let index = Math.floor(Math.random() * dotaTips.length);
  while (index === previousIndex) {
    index = Math.floor(Math.random() * dotaTips.length);
  }
  return index;
}

function DotaTip() {
  const location = useLocation();
  const previousIndexRef = useRef(-1);
  const [tip, setTip] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const index = pickTip(previousIndexRef.current);
    previousIndexRef.current = index;
    setTip(dotaTips[index]);
    setVisible(true);

    const hideTimer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(hideTimer);
  }, [location.pathname]);

  if (!tip) return null;

  return (
    <div
      className={`dota-tip${visible ? ' dota-tip-visible' : ''}`}
      role="note"
      aria-label="Dota 2 loading tip"
    >
      <div className="dota-tip-inner">
        <a
          href={DOTA_2_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="dota-tip-link"
        >
          <div className="dota-tip-brand">
            <DotaIcon className="dota-tip-icon" title="Dota 2" />
            <span className="dota-tip-label">Dota 2 Tip</span>
          </div>
          <p className="dota-tip-text">{tip}</p>
        </a>
        <button
          type="button"
          className="dota-tip-dismiss"
          aria-label="Dismiss tip"
          onClick={() => setVisible(false)}
        >
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

export default DotaTip;
