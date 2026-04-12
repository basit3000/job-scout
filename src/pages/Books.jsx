import React from 'react';

function Books() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Books</h2>
        <p className="page-subtitle">Books I've read and would recommend</p>
      </div>
      <div className="section-title">Completed</div>
      <a className="link-card" href="https://www.amazon.de/-/en/Anders-Ericsson-ebook/dp/B011H56MKS" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>Peak: Secrets from the New Science of Expertise</a>
      <a className="link-card" href="https://www.amazon.de/-/en/Robert-Greene/dp/0140280197" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>48 Laws of Power by Robert Greene</a>
      <a className="link-card" href="https://www.amazon.de/Atomic-Habits-Proven-Build-Break/dp/1847941834" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>Atomic Habits by James Clear</a>
      <a className="link-card" href="https://www.amazon.de/-/en/Daniel-Keyes/dp/0156030306" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>Flowers for Algernon by Daniel Keyes</a>
      <a className="link-card" href="https://www.amazon.de/Your-Pocket-Therapist-ver%C3%A4ndere-Gesundheit/dp/349206485X" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>Your Pocket Therapist by Dr Annie Zimmerman</a>
      <div className="section-title">Currently Reading</div>
      <a className="link-card" href="https://www.amazon.de/-/en/John-Lees/dp/1292463309" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>How to Get a Job You Love by John Lees</a>
      <a className="link-card" href="https://www.amazon.de/-/en/Michiko-Aoyama/dp/0857529129" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>What You Are Looking for Is in the Library by Michiko Aoyama</a>
      <a className="link-card" href="https://www.amazon.de/Art-War-Sun-Tzu/dp/1721195092" target="_blank" rel="noopener noreferrer"><i className="fas fa-book"></i>The Art of War by Sun Tzu</a>
      </div>
  );
}

export default Books;