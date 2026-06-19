// Add a new post by prepending an object to this array (newest first).
// `slug` is the URL segment (/blog/<slug>) and must be unique.
// `content` is an array of paragraph strings so everything stays plain JSX.
export const posts = [
  {
    slug: "how-i-built-this-website",
    title: "How I built this website (and kept rebuilding it)",
    date: "2026-06-19",
    category: "Built",
    icon: "fas fa-laptop-code",
    excerpt: "The two-year story of this portfolio: from a simple first version to an AI-assisted rebuild on a modern stack deployed with Vercel.",
    content: [
      "I started this website about two years ago. The first version was deliberately simple, just enough to put my name, links, and a few projects on the internet. It did the job, but it was static and a little rough around the edges.",
      "Over time it kept growing. What began as a single page slowly turned into a proper multi-page site with an About page, Projects, Certifications, Gaming, Books, and now this blog. Every time I learned something new, I found an excuse to fold it back into the site.",
      "The biggest shift came when I started using AI to help me upscale it. Instead of being stuck on layout tweaks or boilerplate, I could move fast: redesigning the UI, refactoring components, adding features like dark mode, a typing hero effect, and view counters. AI turned the site into a place I actively enjoy iterating on rather than something I avoided touching.",
      "The tech stack ended up being a deliberate mix. The front end is React with React Router for client-side routing, bundled by Vite for near-instant dev reloads. Styling is a blend: Bootstrap 5 for layout utilities, styled-components and CSS custom properties for theming (which is what makes the light and dark modes flip cleanly), and Font Awesome for icons. I dropped jQuery entirely along the way to keep things lean and secure.",
      "For the dynamic parts, I lean on serverless functions. The view counters you see on the home page and on each blog post are powered by a small Vercel serverless function backed by Upstash Redis, so there is no server to babysit and the free tiers cover everything.",
      "Deployment is the easy part now: the whole thing lives on Vercel with automatic Git deploys. I push to the main branch and the new version is live within seconds, serverless functions and all.",
      "If there is a lesson here, it is that a personal site is never really finished. It grows with you. Two years in, this one is faster, cleaner, and more fun to build on than I ever expected when I wrote that first plain HTML page.",
    ],
  },
  {
    slug: "view-counter-serverless",
    title: "I built a view counter with serverless functions",
    date: "2026-06-19",
    category: "Built",
    icon: "fas fa-hammer",
    excerpt: "How I added a persistent visit counter to this site using a Vercel serverless function and Upstash Redis.",
    content: [
      "I wanted a small, honest signal of how many people land on my portfolio without pulling in a heavy analytics platform.",
      "The solution turned out to be tiny: a single Vercel serverless function that increments a counter in Upstash Redis and returns the new value. The Home page calls it once on mount and fails silently if the API is unavailable.",
      "The nicest part is that there is no database to manage and the free tiers cover everything. Sometimes the simplest tool is the right one.",
    ],
  },
  {
    slug: "rebuilding-portfolio-vite",
    title: "What rebuilding my portfolio in Vite taught me",
    date: "2026-06-10",
    category: "Learned",
    icon: "fas fa-lightbulb",
    excerpt: "Moving off Create React App and onto Vite was faster and simpler than I expected.",
    content: [
      "I migrated this site from Create React App to Vite. The dev server starts almost instantly and hot reloads feel immediate compared to what I was used to.",
      "Along the way I dropped jQuery entirely, loaded Bootstrap via CDN with integrity hashes, and leaned on CSS custom properties for theming. The dark mode toggle is just a class on the body that flips a set of design tokens.",
      "The takeaway: trimming dependencies and being deliberate about what runs in the browser makes a site feel noticeably lighter.",
    ],
  },
  {
    slug: "public-reading-list",
    title: "Why I keep a public list of what I read",
    date: "2026-05-28",
    category: "Thoughts",
    icon: "fas fa-pen-nib",
    excerpt: "A short note on accountability, curiosity, and sharing the things that shape how I think.",
    content: [
      "I added a Books page to this site partly for myself. Writing down what I have read, am reading, and plan to read makes me more intentional about finishing things.",
      "Sharing it publicly adds a little accountability, and occasionally someone reaches out about a book we both loved. That small connection is worth it.",
    ],
  },
];

export function getPost(slug) {
  return posts.find((post) => post.slug === slug);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
