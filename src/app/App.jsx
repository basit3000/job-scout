import React, { useState, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import './App.css';
import About from '../pages/About';
import Home from '../pages/Home';
import Certifications from '../pages/Certifications';
import Gaming from '../pages/Gaming';
import NotFound from '../pages/NotFound';
import Books from '../pages/Books';
import Projects from '../pages/Projects';
import '@fortawesome/fontawesome-free/css/all.min.css';

function AppContent() {
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();

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

  const isActive = (path) => location.pathname === path;

  return (
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
                <Link className={`nav-link${isActive('/about') ? ' nav-link-active' : ''}`} to="/about" onClick={handleNavLinkClick}>About</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/projects') ? ' nav-link-active' : ''}`} to="/projects" onClick={handleNavLinkClick}>Projects</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/certifications') ? ' nav-link-active' : ''}`} to="/certifications" onClick={handleNavLinkClick}>Certifications</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/gaming') ? ' nav-link-active' : ''}`} to="/gaming" onClick={handleNavLinkClick}>Gaming</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/books') ? ' nav-link-active' : ''}`} to="/books" onClick={handleNavLinkClick}>Books</Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <div className="main-content">
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/certifications" element={<Certifications />} />
          <Route path="/gaming" element={<Gaming />} />
          <Route path="/books" element={<Books />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="mailto:basitzaheer02@gmail.com" aria-label="Email"><i className="fas fa-envelope"></i></a>
            <a href="https://www.linkedin.com/in/muhammad-basit-zaheer/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i className="fab fa-linkedin"></i></a>
            <a href="https://github.com/basit3000" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><i className="fab fa-github"></i></a>
            <a href="https://leetcode.com/u/basit3000/" target="_blank" rel="noopener noreferrer" aria-label="LeetCode"><i className="fas fa-code"></i></a>
          </div>
          <p className="footer-text">
            &copy; {new Date().getFullYear()} Muhammad Basit Zaheer. Built with React &amp; Vite.
          </p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
