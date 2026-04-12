# Portfolio — Muhammad Basit Zaheer

A personal portfolio website built with React and Vite.

## Tech Stack

- **React 18** with React Router v6
- **Vite 6** (build tool)
- **Bootstrap 5.3** (CDN — CSS + JS bundle)
- **Font Awesome 6** (icons)
- **styled-components** (CSS-in-JS)

## Project Structure

```
index.html              # Vite entry point (root)
vite.config.js          # Vite configuration
public/                 # Static assets (favicon, manifest, robots.txt)
src/
  index.jsx             # React entry point
  index.css             # Global styles
  app/
    App.jsx             # Main layout, navbar, routing
    App.css             # App-level styles
  pages/
    Home.jsx            # Landing page with social links
    About.jsx           # About page
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

## Deployment

Run `npm run build` — output goes to the `build/` directory, ready for static hosting (Netlify, Vercel, GitHub Pages, etc.).
