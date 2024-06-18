import React from 'react';
import styled from 'styled-components';

const AboutContainer = styled.div`
  padding: 20px;
  text-align: center;
  background-color: #f9f9f9;
  width: 900px;
  whiteSpace: normal; /* Allow text to wrap */
  wordWrap: break-word; /* Break long words */
  height: 'auto';

  @media (max-width: 1200px) {
    padding: 15px;
  }

  @media (max-width: 768px) {
    padding: 10px;
    max-width: 90%;
  }

  @media (max-width: 480px) {
    padding: 5px;
    max-width: 95%;
  }
`;

const AboutTitle = styled.h2`
  font-size: 24px;
  font-weight: bold;
  color: #333;
`;

const AboutDescription = styled.p`
  font-size: 16px;
  color: #333;
`;

function About() {
  return (
    <header className="Home-header">
    <AboutContainer>
      <AboutTitle>About me</AboutTitle>
      <AboutDescription>
        Welcome to about me page. This is where you can learn more about me.
        <p>My name is Muhammad Basit Zaheer. I am currently a student in Technische Universität Ilmenau. I like a lot of things and 
          would like to do a lot. I like to travel, read books, watch anime, watch TV shows, play video games, code random stuff,
          and try new food recipes. 
        </p>
      </AboutDescription>
    </AboutContainer>
    </header>
  );
}

export default About;
