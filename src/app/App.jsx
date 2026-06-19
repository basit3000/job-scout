import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import './App.css';
import About from '../pages/About';
import Home from '../pages/Home';
import Certifications from '../pages/Certifications';
import Gaming from '../pages/Gaming';
import NotFound from '../pages/NotFound';
import Books from '../pages/Books';
import Projects from '../pages/Projects';
import Blog from '../pages/Blog';
import BlogPost from '../pages/BlogPost';
import '@fortawesome/fontawesome-free/css/all.min.css';

const moreLinks = [
  { path: '/certifications', label: 'Certifications' },
  { path: '/gaming', label: 'Gaming' },
  { path: '/books', label: 'Books' },
];

function AppContent() {
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const navRef = useRef(null);
  const dropdownRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const titles = {
      '/': 'Muhammad Basit Zaheer',
      '/about': 'About · Basit Zaheer',
      '/projects': 'Projects · Basit Zaheer',
      '/blogs': 'Blogs · Basit Zaheer',
      '/certifications': 'Certifications · Basit Zaheer',
      '/gaming': 'Gaming · Basit Zaheer',
      '/books': 'Books · Basit Zaheer',
    };
    document.title = titles[location.pathname] || 'Basit Zaheer';
  }, [location.pathname]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [dropdownOpen]);

  const handleNavCollapse = () => setIsNavCollapsed(!isNavCollapsed);

  const handleNavLinkClick = () => {
    if (navRef.current && window.bootstrap?.Collapse) {
      const bsCollapse = new window.bootstrap.Collapse(navRef.current, {
        toggle: false,
      });
      bsCollapse.hide();
    }
    setIsNavCollapsed(true);
    setDropdownOpen(false);
  };

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const isActive = (path) => location.pathname === path;
  const isMoreActive = moreLinks.some((link) => isActive(link.path));

  return (
    <div>
      <nav className="navbar navbar-expand-md fixed-top">
        <div className="container-xxl">
          <Link className="navbar-brand" to="/" onClick={handleNavLinkClick}>
            <span className="fw-bold">Home</span>
          </Link>

          <div className={`${isNavCollapsed ? 'collapse' : 'collapse show'} navbar-collapse`} id="main-nav" ref={navRef}>
            <ul className="navbar-nav ml-auto">
              <li className="nav-item">
                <Link className={`nav-link${isActive('/about') ? ' nav-link-active' : ''}`} to="/about" onClick={handleNavLinkClick}>About</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/projects') ? ' nav-link-active' : ''}`} to="/projects" onClick={handleNavLinkClick}>Projects</Link>
              </li>
              <li className="nav-item">
                <Link className={`nav-link${isActive('/blogs') ? ' nav-link-active' : ''}`} to="/blogs" onClick={handleNavLinkClick}>Blogs</Link>
              </li>
              <li className="nav-item nav-dropdown" ref={dropdownRef}>
                <button
                  type="button"
                  className={`nav-link nav-dropdown-toggle${isMoreActive ? ' nav-link-active' : ''}`}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                >
                  More <i className={`fas fa-chevron-down nav-caret${dropdownOpen ? ' open' : ''}`}></i>
                </button>
                {dropdownOpen && (
                  <ul className="nav-dropdown-menu">
                    {moreLinks.map((link) => (
                      <li key={link.path}>
                        <Link
                          className={`nav-dropdown-item${isActive(link.path) ? ' active' : ''}`}
                          to={link.path}
                          onClick={handleNavLinkClick}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </div>

          <div className="navbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <i className={darkMode ? 'fas fa-sun' : 'fas fa-moon'}></i>
            </button>
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
          <Route path="/blogs" element={<Blog />} />
          <Route path="/blogs/:slug" element={<BlogPost />} />
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
