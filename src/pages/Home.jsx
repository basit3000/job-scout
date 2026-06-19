import React, { useState, useEffect } from 'react';
import basitImage from '../app/basit.jpg';

const roles = [
  "Software Developer",
  "Master's Student",
  "Dota 2 Enthusiast",
  "Problem Solver",
  "Tech Enthusiast",
  "Lifelong Learner",
];

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
      <div className="profile-image-wrap">
        <img src={basitImage} alt="Profile" className="profile-image" />
      </div>
      <div className="page-header">
        <h1>Muhammad Basit Zaheer</h1>
        <p className="page-subtitle">Master's student at Technische Universität Ilmenau</p>
        <p className="typing-text">
          <span className="typing-prefix">I'm a </span>
          <span className="typing-role">{typedText}</span>
          <span className="typing-cursor">|</span>
        </p>
      </div>
      <div className="section-title">Connect</div>
      <a className="link-card" href="mailto:basitzaheer02@gmail.com"><i className="fas fa-envelope"></i>basitzaheer02@gmail.com</a>
      <a className="link-card" href="https://www.linkedin.com/in/muhammad-basit-zaheer/" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin"></i>LinkedIn</a>
      <a className="link-card" href="https://github.com/basit3000" target="_blank" rel="noopener noreferrer"><i className="fab fa-github"></i>GitHub</a>
      <a className="link-card" href="https://leetcode.com/u/basit3000/" target="_blank" rel="noopener noreferrer"><i className="fas fa-code"></i>Leetcode</a>
      <a className="link-card" href="https://www.coursera.org/learner/muhammad-basit" target="_blank" rel="noopener noreferrer"><i className="fas fa-graduation-cap"></i>Coursera</a>
      {views !== null && (
        <p className="view-counter">
          <i className="fas fa-chess-rook"></i> {views.toLocaleString()} {views === 1 ? 'visit' : 'visits'}
        </p>
      )}
    </div>
  );
}

export default Home;