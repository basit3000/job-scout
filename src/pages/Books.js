import React from 'react';
import './Books.css';

function Books() {
  return (
    <div className="Home">
      <header className="Home-header">
      <h2>These are the books that I have read and would recommend:</h2>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/-/en/Anders-Ericsson-ebook/dp/B011H56MKS"
                target="_blank"
                rel="noopener noreferrer"
                >
                Peak: Secrets from the New Science of Expertise 
                </a>
      </header>
    </div>
  );
}

export default Books;