# Portfolio — Muhammad Basit Zaheer

A modern personal portfolio website built with React and Vite, featuring dark mode, animated typing hero, project showcase, and smooth page transitions.

## Features

- **Animated Typing Hero** — Cycles through roles (Software Developer, Master's Student, etc.) with a typewriter effect
- **Projects Showcase** — Card grid of GitHub projects with tags, descriptions, and links
- **View Counter** — Live visit counter powered by Upstash Redis via Vercel serverless functions
- **Active Nav Indicator** — Highlights the current page in the navbar with an accent underline
- **Animated Gradient Background** — Subtle shifting gradient for visual depth
- **Dark Mode** — Full light/dark theme toggle with CSS custom properties
- **Glassmorphism Navbar** — Blurred, translucent fixed navbar
- **Site Footer** — Social icon links + copyright on every page
- **Responsive Design** — Mobile-first layout with collapsible navigation

## Tech Stack

- **React 18** with React Router v6
- **Vite 6** (build tool)
- **Bootstrap 5.3** (CDN — CSS + JS bundle)
- **Font Awesome 6** (icons)
- **CSS Custom Properties** for theming
- **Upstash Redis** (view counter persistence)
- **Vercel Serverless Functions** (API backend)

## Project Structure

```
index.html              # Vite entry point (root)
vercel.json             # Vercel config (rewrites, build settings)
vite.config.js          # Vite configuration
api/
  views.js              # Serverless function — view counter (Upstash Redis)
public/                 # Static assets (favicon, manifest, robots.txt)
src/
  index.jsx             # React entry point
  index.css             # Global styles
  app/
    App.jsx             # Main layout, navbar, footer, routing, active link logic
    App.css             # Design tokens, components, animations
  pages/
    Home.jsx            # Landing page with typing hero, social links, view counter
    About.jsx           # About page
    Projects.jsx        # Project cards grid (from GitHub repos)
    Certifications.jsx  # Certifications list
    Gaming.jsx          # Gaming profiles
    Books.jsx           # Book recommendations
    NotFound.jsx        # 404 page
  services/             # Service layer (currently empty)
```

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm start` | Alias for `npm run dev` |
| `npm run build` | Production build to `build/` |
| `npm run preview` | Preview production build locally |

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Profile image, typing hero, social/contact links |
| `/about` | About | Personal bio and interests |
| `/projects` | Projects | GitHub project cards with tags and links |
| `/certifications` | Certifications | Professional certificates list |
| `/gaming` | Gaming | Gaming profiles and accounts |
| `/books` | Books | Reading list (completed + currently reading) |

## Environment Variables

Required in Vercel dashboard (Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST auth token |

## Deployment

Deployed on **Vercel** with automatic Git-based deploys.

- `npm run build` outputs to `build/`
- `api/` directory contains serverless functions auto-deployed by Vercel
- `vercel.json` handles SPA rewrites and build configuration
