import React from 'react';

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
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/-/en/Robert-Greene/dp/0140280197"
                target="_blank"
                rel="noopener noreferrer"
                >
                48 Laws of Power by Robert Greene  
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/Atomic-Habits-Proven-Build-Break/dp/1847941834"
                target="_blank"
                rel="noopener noreferrer"
                >
                Atomic Habits by James Clear 
                </a>
                
                <h2>These ones I have started but not yet completed but I recommend as well:</h2>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/-/en/John-Lees/dp/1292463309"
                target="_blank"
                rel="noopener noreferrer"
                >
                How to get a job you love (Find a job worth getting up for) by John Lees
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/-/en/Daniel-Keyes/dp/0156030306"
                target="_blank"
                rel="noopener noreferrer"
                >
                Flowers for Algernon by Daniel Keyes
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/-/en/Michiko-Aoyama/dp/0857529129"
                target="_blank"
                rel="noopener noreferrer"
                >
                What you are looking for is in the library by Michiko Aoyama
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/Art-War-Sun-Tzu/dp/1721195092"
                target="_blank"
                rel="noopener noreferrer"
                >
                The Art of War by Sun Tzu
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.amazon.de/Your-Pocket-Therapist-ver%C3%A4ndere-Gesundheit/dp/349206485X"
                target="_blank"
                rel="noopener noreferrer"
                >
                Your pocket therapist by Dr Annie Zimmerman
                </a>

      </header>
    </div>
  );
}

export default Books;