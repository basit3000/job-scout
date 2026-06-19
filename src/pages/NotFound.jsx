import React from 'react';
import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="not-found page-enter">
      <h1>404</h1>
      <p>Denied. The page you are looking for does not exist.</p>
      <Link to="/" className="back-link"><i className="fas fa-shield-halved"></i> Back to Base</Link>
    </div>
  );
}

export default NotFound;
