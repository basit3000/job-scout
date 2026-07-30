import React from 'react';
import { certifications } from '../data/certifications';

function Certifications() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Certifications</h2>
        <p className="page-subtitle">Courses and certificates that shaped how I build.</p>
      </div>
      {certifications.map((cert) => (
        <a
          className="link-card"
          key={cert.title}
          href={cert.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className={cert.icon}></i>
          {cert.title} — {cert.issuer}
        </a>
      ))}
    </div>
  );
}

export default Certifications;
