import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import './App.css';
import About from '../pages/About';
import Home from '../pages/Home';
import Certifications from '../pages/Certifications';
import Gaming from '../pages/Gaming';
import NotFound from '../pages/NotFound';
import Books from '../pages/Books';

function App() {
  return (
    <Router>
      <nav className="navbar navbar-expand-md navbar-dark bg-dark fixed-top">
        <div className="container-xxl">
          <Link className="navbar-brand" to="/">
            <span className="text-ligh fw-bold">Home</span>
          </Link>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-nav" aria-controls="main-nav" aria-expanded="false" aria-label="Toggle navigation">
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse justify-content-end align-center" id="main-nav">
            <ul className="navbar-nav">
              <li className="nav-item">
                <Link className="nav-link" to="/about">About</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/certifications">Certifications</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/gaming">Gaming</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/books">Books</Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <div className="main-content" style={{ paddingTop: '0px' }}> 
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/certifications" element={<Certifications />} />
          <Route path="/gaming" element={<Gaming />} />
          <Route path="/books" element={<Books />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
