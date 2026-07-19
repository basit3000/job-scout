import React from 'react';

const techStack = [
  "Python",
  "FastAPI",
  "React",
  "Vite",
  "JavaScript",
  "Kotlin",
  "PostgreSQL",
  "Discord.py",
  "Docker",
  "Vercel",
  "Spotify API",
  "Steam API",
  "Notion API",
  "Upstash Redis",
];

const projects = [
  {
    title: "PD-League",
    description:
      "A custom Dota 2 league platform: register, queue, ready-check, captain snake draft, match rooms, ratings, and Discord bot — one FastAPI backend for web, API, and bot.",
    tags: ["Python", "FastAPI", "PostgreSQL", "Discord.py", "Docker", "Steam"],
    icon: "fas fa-trophy",
  },
  {
    title: "Personal Portfolio",
    description:
      "This site — Radiant/Dire themed atlas with live Spotify and Steam status, a now-playing SVG widget, Dota tips, minimap nav, blog, and a serverless view counter.",
    tags: ["React", "Vite", "Vercel", "Upstash Redis", "Spotify API", "Steam"],
    icon: "fas fa-globe",
    link: "https://basitzaheer.de",
  },
  {
    title: "Spotify True Random",
    description:
      "Fisher–Yates shuffle for Spotify playlists when built-in shuffle repeats too much. Python CLI, local web UI, and an Android app.",
    tags: ["Python", "Kotlin", "Spotify API", "Android", "Web"],
    icon: "fas fa-shuffle",
    link: "https://github.com/basit3000/Spotify-True-Random",
  },
  {
    title: "FIFA Cup",
    description:
      "Tournament tracker for casual FIFA cups — multi-tournament state, brackets/results UI, and a small Express API for persistence.",
    tags: ["HTML", "CSS", "JavaScript", "Node", "Express"],
    icon: "fas fa-futbol",
  },
  {
    title: "Work Hours",
    description:
      "A tiny work-hours calculator: start time, planned hours, and breaks → end time and time left, with light/dark theme.",
    tags: ["HTML", "CSS", "JavaScript"],
    icon: "fas fa-clock",
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
    tags: ["Python", "Notion API", "Automation"],
    icon: "fas fa-film",
    link: "https://github.com/basit3000/imdb-to-notion",
  },
  {
    title: "MAL to Notion",
    description: "Import your 'Plan to Watch' anime list from MyAnimeList into Notion with community ratings, powered by the Jikan API.",
    tags: ["Python", "Jikan API", "Notion", "Automation"],
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
    tags: ["Python", "Google Sheets", "Automation"],
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
