import React from 'react';

const projects = [
  {
    title: "Spotify True Random",
    description:
      "A small tool for when Spotify shuffle isn't random enough.",
    tags: ["Python", "Kotlin", "Spotify API", "Android"],
    icon: "fas fa-shuffle",
    link: "https://github.com/basit3000/Spotify-True-Random",
  },
  {
    title: "Job Tracker",
    description: "A job application tracking tool to organize and monitor your job search progress.",
    tags: ["HTML", "CSS", "JavaScript"],
    icon: "fas fa-briefcase",
    link: "https://github.com/basit3000/Job-tracker",
  },
  {
    title: "Diet Analysis",
    description: "Diet tracker and analysis tool using Google Sheets to monitor and visualize nutritional intake.",
    tags: ["Python", "Google Sheets"],
    icon: "fas fa-utensils",
    link: "https://github.com/basit3000/Diet-Analysis",
  },
  {
    title: "Mood Tracker",
    description: "A Java application to track and analyze your daily mood patterns over time.",
    tags: ["Java"],
    icon: "fas fa-face-smile",
    link: "https://github.com/basit3000/Mood-tracker",
  },
  {
    title: "IMDB to Notion",
    description: "Sync your IMDB watchlist and ratings into a Notion database for easy tracking.",
    tags: ["Python", "Notion API"],
    icon: "fas fa-film",
    link: "https://github.com/basit3000/imdb-to-notion",
  },
  {
    title: "MAL to Notion",
    description: "Import your 'Plan to Watch' anime list from MyAnimeList into Notion with community ratings, powered by the Jikan API.",
    tags: ["Python", "Jikan API", "Notion"],
    icon: "fas fa-dragon",
    link: "https://github.com/basit3000/mal-to-notion",
  },
  {
    title: "Train Application",
    description: "A Django web application for browsing train routes and purchasing tickets.",
    tags: ["Python", "Django"],
    icon: "fas fa-train",
    link: "https://github.com/basit3000/trainapplication",
  },
  {
    title: "FastAPI Project",
    description: "A backend API built with FastAPI, demonstrating modern Python web development practices.",
    tags: ["Python", "FastAPI"],
    icon: "fas fa-bolt",
    link: "https://github.com/basit3000/fastapi",
  },
  {
    title: "ChatGPT Service",
    description: "A Python service that integrates with ChatGPT for automated conversational interactions.",
    tags: ["Python", "OpenAI"],
    icon: "fas fa-robot",
    link: "https://github.com/basit3000/ChatGPT-service",
  },
  {
    title: "Django Setup Script",
    description: "Automated script to set up a Django server with a virtual environment, upgrade pip, and start the server.",
    tags: ["Python", "Django", "Automation"],
    icon: "fas fa-terminal",
    link: "https://github.com/basit3000/Django-Setup-Script",
  },
  {
    title: "Dynamic IP Updater",
    description: "An automated IP address updater for dynamic IPs that syncs your current address to Google Sheets.",
    tags: ["Python", "Google Sheets"],
    icon: "fas fa-network-wired",
    link: "https://github.com/basit3000/IP-address-updater-for-dynamic-IP",
  },
  {
    title: "E-Store Website",
    description: "A full e-commerce website to buy and sell products, built with PHP.",
    tags: ["PHP", "MySQL", "HTML"],
    icon: "fas fa-shopping-cart",
    link: "https://github.com/basit3000/estore-website",
  },
  {
    title: "Coding Challenge",
    description: "A Django-based website focused on search functionality.",
    tags: ["Python", "Django"],
    icon: "fas fa-magnifying-glass",
    link: "https://github.com/basit3000/codingchallenge",
  },
];

function Projects() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Projects</h1>
        <p className="page-subtitle">Things I've built and worked on</p>
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
