import React from 'react';
import basitImage from '../app/basit.jpg';

function Home() {
  return (
    <div className="container text-center">
      <img src={basitImage} alt="Profile" />
      <h1>Welcome to my portfolio!</h1>
      <p>My name is Muhammad Basit Zaheer and I am currently a student at Technische Universität Ilmenau doing my masters.</p>
      <p>Here are some links to some of my socials:</p>
      <a className="btn" href="mailto:basitzaheer02@gmail.com">Email: basitzaheer02@gmail.com</a>
      <a className="btn" href="https://www.linkedin.com/in/muhammad-basit-zaheer/">LinkedIn</a>
      <a className="btn" href="https://github.com/basit3000">GitHub</a>
      <a className="btn" href="https://leetcode.com/u/basit3000/">Leetcode</a>
      <a className="btn" href="https://discord.com/users/297442450623037441">Discord</a>
      <a className="btn" href="https://www.coursera.org/learner/muhammad-basit">Coursera</a>
    </div>
    
  );
}

export default Home;