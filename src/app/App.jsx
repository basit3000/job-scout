import React, { useState, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import './App.css';
import About from '../pages/About';
import Home from '../pages/Home';
import Certifications from '../pages/Certifications';
import Gaming from '../pages/Gaming';
import NotFound from '../pages/NotFound';
import Books from '../pages/Books';
import '@fortawesome/fontawesome-free/css/all.min.css';

function App() {
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const navRef = useRef(null);

  const handleNavCollapse = () => setIsNavCollapsed(!isNavCollapsed);

  const handleNavLinkClick = () => {
    if (navRef.current && window.bootstrap?.Collapse) {
      const bsCollapse = new window.bootstrap.Collapse(navRef.current, {
        toggle: false,
      });
      bsCollapse.hide();
    }
    setIsNavCollapsed(true);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.body.classList.toggle('dark-mode', !darkMode);
  };

  return (
    <Router>
      <div>
        <nav className="navbar navbar-expand-md fixed-top">
          <div className="container-xxl">
            <Link className="navbar-brand" to="/" onClick={handleNavLinkClick}>
              <span className="fw-bold">Home</span>
            </Link>
            <div className="switch-container">
            <div className="switch">
              <span className="switch-text">Dark Mode</span>
              <input type="checkbox" id="darkModeToggle" checked={darkMode} onChange={toggleDarkMode} />
              <label className="slider" htmlFor="darkModeToggle"></label>
            </div>
          </div>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#main-nav"
              aria-controls="main-nav"
              aria-expanded={!isNavCollapsed}
              aria-label="Toggle navigation"
              onClick={handleNavCollapse}
            >
              <span className="navbar-toggler-icon"></span>
            </button>
            
            <div className={`${isNavCollapsed ? 'collapse' : 'collapse show'} navbar-collapse`} id="main-nav" ref={navRef}>
              <ul className="navbar-nav ml-auto">
                <li className="nav-item">
                  <Link className="nav-link" to="/about" onClick={handleNavLinkClick}>About</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/certifications" onClick={handleNavLinkClick}>Certifications</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/gaming" onClick={handleNavLinkClick}>Gaming</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/books" onClick={handleNavLinkClick}>Books</Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>
        <div className="main-content">
          
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/certifications" element={<Certifications />} />
            <Route path="/gaming" element={<Gaming />} />
            <Route path="/books" element={<Books />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
