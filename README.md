# Chrono Duel ⏱

**Viral 1v1 timing battle** — Feel the time, beat your opponent, climb the ranks.

## How to play

1. Enter your name and click **Find Match 1v1**
2. A random target time appears (e.g. **3.43 seconds**)
3. Both players press **SPACE** whenever they're ready to start their hidden timer
4. Count the seconds in your head — no visible timer!
5. Press **SPACE** again when you think the target time has passed
6. Left panel = you, right panel = opponent (live status)
7. Whoever is closest to the target wins the round
8. Best of 3 rounds — winner gains **ELO**

**AFK rule:** You must press SPACE to start within **10 seconds** or you forfeit the match.

## Ranks

| Rank | ELO |
|------|-----|
| 🥉 Bronze | 0+ |
| 🥈 Silver | 1000+ |
| 🥇 Gold | 1200+ |
| 💎 Platinum | 1400+ |
| 💠 Diamond | 1600+ |
| 👑 Master | 1800+ |
| ⚡ Grandmaster | 2000+ |

## Run locally

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
npm run dev
```

- **Client:** http://localhost:5173
- **Server:** http://localhost:3001

Open two browser tabs to test 1v1 matchmaking!

## Production (local)

```bash
npm run build   # builds client (Vite) + server (tsc)
npm start       # runs node server/dist/index.js
```

## Deploy to Railway

1. Push the repo to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Railway auto-detects `nixpacks.toml` and runs the build
4. Set no environment variables (PORT is injected automatically)
5. Done — your app is live

> **Data persistence**: Player accounts are stored in `server/data/players.json`.
> This file is lost on every redeploy with Railway's default ephemeral filesystem.
> To persist data, add a **Railway Volume** mounted at `/app/server/data`.
