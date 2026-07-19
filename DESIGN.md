# Design System — Battlefield Atlas

## Theme
Dual-faction personal site. **Light mode = Radiant** (cool mist green-gray, green-led accents). **Dark mode = Dire** (deep charcoal with crimson undertone, red-led accents). Ancient gold is secondary (HUD chrome), never the body wash. Minimap motif stays atmospheric, not decorative clutter.

## Color strategy
Full palette — Radiant green, Dire crimson, Ancient gold, River blue — each with a job.

### Light (Radiant)
| Token | Role | Value |
|-------|------|-------|
| `--bg-primary` | Page | `#e8efe8` cool mist |
| `--bg-secondary` | Surfaces | `#f2f6f2` |
| `--bg-card` | Panels | `#f7faf7` |
| `--text-primary` | Ink | `#121814` |
| `--text-secondary` | Body | `#3d4a40` |
| `--accent` | Radiant lead | `#4f8f3a` |
| `--dire` | Dire mark | `#b43d2e` |
| `--ancient` | Gold chrome | `#b8922a` |
| `--river` | Cool accent | `#4a7a8c` |

### Dark (Dire)
| Token | Role | Value |
|-------|------|-------|
| `--bg-primary` | Page | `#0e0b0b` |
| `--bg-secondary` | Surfaces | `#171312` |
| `--bg-card` | Panels | `#1e1816` |
| `--text-primary` | Ink | `#efe6e0` |
| `--text-secondary` | Body | `#b8a79a` |
| `--accent` | Dire lead | `#d45a48` |
| `--radiant` | Radiant mark | `#8fbf6a` |
| `--ancient` | Gold chrome | `#ddb852` |

Accent in light follows Radiant; accent in dark follows Dire. Theme toggle is the faction switcher.

## Typography
- **Display:** Rajdhani (600–700) — HUD / titles / nav (identity kept)
- **Body:** Work Sans (400–600) — readable, not Inter
- Fluid headings via `clamp()`, body ≥1rem, measure ~65ch for prose
- No gradient text; solid accent or ink

## Layout
- Content column: 720px default; projects/blog up to 920px
- Home hero: asymmetric portrait + copy (not centered Linktree stack)
- Connect: compact icon rail, not five stacked cards
- Roster rows (links/projects): hairline full borders, surface tint, no side-stripes, no gold-bar card tops
- Navbar: faction gradient bar only on chrome, not every card

## Motion
- Ease: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-ish out)
- Page enter: short fade + 8px rise
- No bounce/elastic
- `@media (prefers-reduced-motion: reduce)` disables non-essential motion

## Components
- Navbar + Radiant/Dire toggle
- Roster link rows
- Project panels
- Live status (Spotify/Steam)
- Minimap widget + backdrop
- Dota tip strip, victory overlay
- Footer social circles
