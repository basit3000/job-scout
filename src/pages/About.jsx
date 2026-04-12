import React from 'react';
import basitImage from '../app/basit.jpg';

function About() {
  return (
    <div className="page-enter">
      <img src={basitImage} alt="Basit" className="profile-image" />
      <div className="about-section">
        <h2>About me</h2>
        <p>My name is Muhammad Basit Zaheer. I am currently a student at Technische Universität Ilmenau. I like a lot of things and I am curious about a lot of different topics. I like to travel, read books, watch anime, watch TV shows, play video games casually and competitively both, code random stuff, and try new food recipes.</p>
      </div>
    </div>
  );
}

export default About;
