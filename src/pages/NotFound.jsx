import React from 'react';
import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="not-found page-enter">
      <h1>404</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <Link to="/" className="back-link"><i className="fas fa-arrow-left"></i> Back to Home</Link>
    </div>
  );
}

export default NotFound;
