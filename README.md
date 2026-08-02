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

## Getting Started

```bash
npm install
npm run dev
```

## Portable tool: Job Scout

`job-scout/` is a **standalone, profession-agnostic, multi-country** job finder you can hand to a friend. Default market is UAE; switch via `search-profile.json` → `"market"` (or `--market`). It is not tied to this portfolio's owner or to software roles.

```bash
cd job-scout
cp profile.example.json profile.json
cp cv/resume.example.md cv/resume.md
# set "market" in search-profile.json (AE, GB, US, …), replace YOUR_* placeholders, then:
pip install -U -r requirements.txt
node scripts/build-evidence.mjs
node scripts/fetch-jobs.mjs
```

See [`job-scout/README.md`](job-scout/README.md). Symlinked for agents as `.agents/skills/job-scout` and `.claude/skills/job-scout`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm start` | Alias for `npm run dev` |
| `npm run build` | Production build to `build/` |
| `npm run preview` | Preview production build locally |

## Environment Variables

Required in Vercel dashboard (Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST auth token |

## Deployment

Deployed on **Vercel** with automatic Git-based deploys.
