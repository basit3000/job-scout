import React from 'react';
import './Home.css';

function Home() {
  return (
    <div className="Home">
      <header className="Home-header">
        <h2>Welcome to my portfolio!</h2>
        <p>
          My name is Muhammad Basit Zaheer and I am currently a student at Technische Universität Ilmenau doing my masters.
        </p>
        <p>Here are some links to some of my socials:</p>
        <a
          className="no-underline-app-header"
          href="https://www.linkedin.com/in/muhammad-basit-zaheer/"
          target="_blank"
          rel="noopener noreferrer"
        >
          LinkedIn
        </a>
        <a
          className="no-underline-app-header"
          href="https://github.com/basit3000"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a
          className="no-underline-app-header"
          href="https://leetcode.com/u/basit3000/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Leetcode
        </a>
        <a
          className="no-underline-app-header"
          href="
      https://discord.com/users/297442450623037441"
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord: meyramax
        </a>
        <a
          className="no-underline-app-header"
          href="
        https://www.coursera.org/learner/muhammad-basit"
          target="_blank"
          rel="noopener noreferrer"
        >
          Coursera
        </a>
      </header>
    </div>
  );
}

export default Home;