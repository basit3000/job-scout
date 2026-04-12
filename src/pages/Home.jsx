import React from 'react';
import basitImage from '../app/basit.jpg';

function Home() {
  return (
    <div className="page-enter">
      <img src={basitImage} alt="Profile" className="profile-image" />
      <div className="page-header">
        <h1>Muhammad Basit Zaheer</h1>
        <p className="page-subtitle">Master's student at Technische Universität Ilmenau</p>
      </div>
      <div className="section-title">Connect</div>
      <a className="link-card" href="mailto:basitzaheer02@gmail.com"><i className="fas fa-envelope"></i>basitzaheer02@gmail.com</a>
      <a className="link-card" href="https://www.linkedin.com/in/muhammad-basit-zaheer/" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin"></i>LinkedIn</a>
      <a className="link-card" href="https://github.com/basit3000" target="_blank" rel="noopener noreferrer"><i className="fab fa-github"></i>GitHub</a>
      <a className="link-card" href="https://leetcode.com/u/basit3000/" target="_blank" rel="noopener noreferrer"><i className="fas fa-code"></i>Leetcode</a>
      <a className="link-card" href="https://www.coursera.org/learner/muhammad-basit" target="_blank" rel="noopener noreferrer"><i className="fas fa-graduation-cap"></i>Coursera</a>
    </div>
  );
}

export default Home;