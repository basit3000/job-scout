import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DotaIcon from './DotaIcon';
import dotaTips from '../data/dotaTips';

const TIP_COOLDOWN_MS = 45000;
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
  const lastShownRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const [tip, setTip] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const isFirstLoad = isFirstLoadRef.current;
    isFirstLoadRef.current = false;

    if (!isFirstLoad && now - lastShownRef.current < TIP_COOLDOWN_MS) {
      return undefined;
    }

    const index = pickTip(previousIndexRef.current);
    previousIndexRef.current = index;
    lastShownRef.current = now;
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
        <div className="dota-tip-brand">
          <DotaIcon className="dota-tip-icon" title="Dota 2" />
          <span className="dota-tip-label">Dota 2 Tip</span>
        </div>
        <p className="dota-tip-text">{tip}</p>
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
