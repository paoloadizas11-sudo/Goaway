# 🎬 MovieNova

Netflix-style movie streaming site — movies, anime, cartoons, TV shows. No ads.

## Features
- 🔍 Search by title, actor, genre
- 🔥 Trending / Top Rated / Recently Added rows
- 🎌 Anime, 🎨 Cartoons, 📺 TV Shows, 🎬 Movies
- ▶️ Multi-source streaming (VidSrc, 2Embed, SuperEmbed, MoviesAPI)
- 🎞️ Trailer playback (YouTube embed)
- ⭐ Ratings, cast, genre, runtime, director info
- ❤️ Watchlist (localStorage)
- 📌 Watch history
- ▶️ Continue watching with progress bar
- 🔎 Genre / Year / Language / Sort filters
- 🎲 Random movie picker
- 🔗 Share button (native share API)
- 🌙 Dark / Light mode
- 🔔 Notifications panel
- ⌨️ Keyboard shortcuts (Space, F, M, ←, →, Esc)
- 📱 Mobile responsive

## Deploy on Vercel

### Option 1 — Vercel CLI (fastest)
```bash
npm i -g vercel
cd movienova
vercel --prod
```

### Option 2 — Vercel Dashboard (drag & drop)
1. Go to https://vercel.com/new
2. Drag the `movienova/` folder onto the dashboard
3. Click Deploy
4. Done — you get a `*.vercel.app` URL

### Option 3 — GitHub
1. Push this folder to a GitHub repo
2. Import at https://vercel.com/import
3. Framework: **Other** (static)
4. Root directory: `movienova`
5. Deploy

## API
Uses TMDB (The Movie Database) public API v3.
Key is bundled — works out of the box.

## Keyboard Shortcuts (in player)
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| → | Skip +10s |
| ← | Skip -10s |
| F | Fullscreen |
| M | Mute |
| Esc | Close |
