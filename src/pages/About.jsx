import React from 'react';
import basitImage from '../app/basit.jpg';
import LiveStatus from '../components/LiveStatus';

function About() {
  return (
    <div className="page-enter">
      <div className="profile-image-wrap">
        <img src={basitImage} alt="Basit" className="profile-image" />
      </div>
      <div className="about-section">
        <h2>About me</h2>
        <p>
          My name is Muhammad Basit Zaheer. I am currently a student at{' '}
          <a
            className="text-link"
            href="https://www.tu-ilmenau.de/en"
            target="_blank"
            rel="noopener noreferrer"
          >
            Technische Universität Ilmenau
          </a>
          . I like a lot of things and I am curious about a lot of different topics. I like to travel, read books, watch anime, watch TV shows, play video games casually and competitively both, code random stuff, and try new food recipes.
        </p>
      </div>
      <LiveStatus />
    </div>
  );
}

export default About;
