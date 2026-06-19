// Add a new post by prepending an object to this array (newest first).
// `slug` is the URL segment (/blog/<slug>) and must be unique.
// `content` is an array of plain-text paragraph strings (no HTML, rendered as <p> text).
// Optional `link` is an external URL rendered as a button below the post (e.g. GitHub repo).
export const posts = [
    {
    slug: "spotify-true-random",
    title: "Building Spotify True Random (when shuffle is not random)",
    date: "2026-06-19",
    category: "Built",
    icon: "fas fa-shuffle",
    excerpt:
      "I built a Spotify shuffle tool in a day and kept improving it with Cursor. Python CLI, Android app, and a fix for when shuffle repeats the same songs.",
    link: "https://github.com/basit3000/Spotify-True-Random",
    content: [
      "I noticed Spotify shuffle on my phone would repeat the same songs on big playlists, even when I skipped ahead. I wanted something that plays every track once before anything comes back.",
      "I had a working version in a day. A Python script that pulls a playlist from the Spotify API, shuffles it, turns Spotify's shuffle off, and plays it in that order. Cursor helped a lot with the boilerplate and iterating quickly.",
      "From there I kept adding to it. An Android app so I could start a shuffle from my phone, skip controls, and a timer for tracks where I only really want the first minute or so. Spotify's dev API had its own quirks in early 2026, so some of the later work was just making things reliable on large playlists.",
      "It is a small personal tool for my own library. The repo is open if you want to try it.",
    ],
  },
  {
    slug: "how-i-built-this-website",
    title: "How I built this website (and kept rebuilding it)",
    date: "2026-06-19",
    category: "Built",
    icon: "fas fa-laptop-code",
    excerpt:
      "This site started simple two years ago. It grew page by page, and Cursor made it much easier to keep improving it.",
    content: [
      "I put this site up about two years ago. First version was basic on purpose: my name, a few links, some projects. Nothing fancy, but it worked.",
      "It grew from there. One page turned into About, Projects, Certifications, Gaming, Books, and now this blog. Whenever I picked up something new, I usually ended up adding it here too.",
      "The recent rebuilds went a lot faster once I started using Cursor. Layout changes, new components, dark mode, the typing effect on the home page, view counters. Less time stuck on boilerplate, more time actually building.",
      "Stack-wise it is React and Vite, Bootstrap for layout, CSS variables for theming, Font Awesome for icons. View counts run through a small Vercel serverless function and Upstash Redis. I deploy by pushing to main and Vercel handles the rest.",
      "Two years in, it is still changing. That is kind of the point.",
    ],
  },
  {
    slug: "view-counter-serverless",
    title: "I built a view counter with serverless functions",
    date: "2026-06-19",
    category: "Built",
    icon: "fas fa-hammer",
    excerpt:
      "A simple view counter for this site, without full analytics.",
    content: [
      "I wanted to see roughly how many people visit the site without setting up a full analytics tool.",
      "So I added a small Vercel serverless function that bumps a number in Upstash Redis and sends it back. The home page and blog posts call it once when they load. If it fails, the page still works fine.",
      "No database to maintain, and the free tiers are enough for a portfolio. Small problem, small solution.",
    ],
  },
  {
    slug: "rebuilding-portfolio-vite",
    title: "What rebuilding my portfolio in Vite taught me",
    date: "2026-06-10",
    category: "Learned",
    icon: "fas fa-lightbulb",
    excerpt:
      "I moved this site from Create React App to Vite. Dev feels much snappier now.",
    content: [
      "I moved this site off Create React App and onto Vite. The dev server starts quickly and hot reload feels instant compared to what I had before.",
      "While I was at it I dropped jQuery, kept Bootstrap on a CDN, and used CSS custom properties for light and dark mode. The toggle just adds a class on the body and the colors swap.",
      "Fewer dependencies made the site feel lighter. I should have done it sooner.",
    ],
  },
  {
    slug: "public-reading-list",
    title: "Why I keep a public list of what I read",
    date: "2026-05-28",
    category: "Thoughts",
    icon: "fas fa-pen-nib",
    excerpt:
      "I track what I read on the Books page, mostly for myself.",
    content: [
      "I added a Books page to keep track of what I have read, what I am reading, and what is next. It helps me actually finish things instead of starting five books at once.",
      "Having it public is a small nudge to stay honest with the list. Once in a while someone messages me about a book we both liked, which is a nice bonus.",
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
