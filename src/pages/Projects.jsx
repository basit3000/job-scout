import React from 'react';
import { techStack, projects } from '../data/projects';

function Projects() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Projects</h1>
        <p className="page-subtitle">
          A roster of tools and experiments — leagues, shuffle fixes, sync scripts, and this site.
        </p>
      </div>

      <div className="tech-stack" aria-label="Tech stack">
        <div className="section-title">Tech stack</div>
        <div className="tech-stack-list">
          {techStack.map((tech) => (
            <span className="tech-stack-chip" key={tech}>{tech}</span>
          ))}
        </div>
      </div>

      <div className="projects-grid">
        {projects.map((project, i) => (
          <div className="project-card" key={i}>
            <div className="project-card-header">
              <i className={project.icon}></i>
              <h3>{project.title}</h3>
            </div>
            <p className="project-card-desc">{project.description}</p>
            <div className="project-card-tags">
              {project.tags.map((tag, j) => (
                <span className="project-tag" key={j}>{tag}</span>
              ))}
            </div>
            {project.link && (
              <a className="project-card-link" href={project.link} target="_blank" rel="noopener noreferrer">
                View Project <i className="fas fa-arrow-right"></i>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Projects;
