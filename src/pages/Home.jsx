import React from 'react';
import basitImage from '../app/basit.jpg';

function Home() {
  return (
    <div className="container text-center">
      <img src={basitImage} alt="Profile" />
      <h1>Welcome to my portfolio!</h1>
      <p>My name is Muhammad Basit Zaheer and I am currently a student at Technische Universität Ilmenau doing my masters.</p>
      <p>Here are some links to some of my socials:</p>
      <a className="btn" href="mailto:basitzaheer02@gmail.com"><i className="fas fa-envelope"></i>Email: basitzaheer02@gmail.com</a>
      <a className="btn" href="https://www.linkedin.com/in/muhammad-basit-zaheer/" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin"></i>LinkedIn</a>
      <a className="btn" href="https://github.com/basit3000" target="_blank" rel="noopener noreferrer"><i className="fab fa-github"></i>GitHub</a>
      <a className="btn" href="https://leetcode.com/u/basit3000/" target="_blank" rel="noopener noreferrer"><i className="fas fa-code"></i>Leetcode</a>
      <a className="btn" href="https://discord.com/users/297442450623037441" target="_blank" rel="noopener noreferrer"><i className="fab fa-discord"></i>Discord</a>
      <a className="btn" href="https://www.coursera.org/learner/muhammad-basit" target="_blank" rel="noopener noreferrer"><i className="fas fa-graduation-cap"></i>Coursera</a>
    </div>
    
  );
}

export default Home;