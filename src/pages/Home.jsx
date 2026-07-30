import React, { useState, useEffect } from 'react';
import basitImage from '../app/basit.jpg';
import LiveStatus from '../components/LiveStatus';
import { profile, roles, connectLinks } from '../data/profile';

function useTypingEffect(strings, typingSpeed = 80, deletingSpeed = 40, pauseTime = 1500) {
  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = strings[index];
    let timeout;

    if (!isDeleting && text === current) {
      timeout = setTimeout(() => setIsDeleting(true), pauseTime);
    } else if (isDeleting && text === '') {
      setIsDeleting(false);
      setIndex((prev) => (prev + 1) % strings.length);
    } else {
      timeout = setTimeout(() => {
        setText(current.substring(0, text.length + (isDeleting ? -1 : 1)));
      }, isDeleting ? deletingSpeed : typingSpeed);
    }

    return () => clearTimeout(timeout);
  }, [text, index, isDeleting, strings, typingSpeed, deletingSpeed, pauseTime]);

  return text;
}

function Home() {
  const typedText = useTypingEffect(roles);
  const [views, setViews] = useState(null);

  useEffect(() => {
    fetch('/api/views', { method: 'POST' })
      .then(res => res.json())
      .then(data => setViews(data.views))
      .catch(() => setViews(null));
  }, []);

  return (
    <div className="page-enter">
      <section className="home-hero" aria-label="Introduction">
        <div className="profile-image-wrap">
          <img src={basitImage} alt={profile.name} className="profile-image" />
        </div>
        <div className="page-header">
          <h1>{profile.name}</h1>
          <p className="page-subtitle">
            {profile.status} at{' '}
            <a
              className="text-link"
              href={profile.universityUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {profile.university}
            </a>
          </p>
          <p className="typing-text">
            <span className="typing-prefix">I'm a</span>
            <span className="typing-role">{typedText}</span>
            <span className="typing-cursor">|</span>
          </p>
        </div>
      </section>

      <LiveStatus />

      <div className="section-title">Connect</div>
      <div className="connect-rail">
        {connectLinks.map((link) => (
          <a
            key={link.label}
            className="connect-chip"
            href={link.href}
            {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            <i className={link.icon} aria-hidden="true"></i>
            {link.label}
          </a>
        ))}
      </div>

      {views !== null && (
        <p className="view-counter">
          <i className="fas fa-chess-rook" aria-hidden="true"></i>
          {views.toLocaleString()} {views === 1 ? 'visit' : 'visits'}
        </p>
      )}
    </div>
  );
}

export default Home;
