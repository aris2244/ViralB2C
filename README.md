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
3. Add a **Postgres** database to the project (Railway sets `DATABASE_URL` automatically for services in the same project)
4. Railway auto-detects `nixpacks.toml` and runs the build
5. No other environment variables are required — `PORT` is injected automatically too
6. Done — your app is live

> **Data persistence**: player accounts, ELO, and match history are stored in **Postgres** (`server/src/store.ts`, via `DATABASE_URL`), not in a local file — so a redeploy or restart doesn't lose any data, as long as the Postgres service itself keeps running.

## Security notes

Passwords are hashed with **bcrypt** (salted, adaptive cost) in `server/src/store.ts`. An earlier version hashed passwords with plain unsalted SHA-256 and had a leftover `server/data/players.json` file — a stale, unused local-file fallback from before Postgres was added — committed to the repo with real-looking usernames and those weak password hashes. That file has been deleted and is now git-ignored (`server/data/`); the authentication code was rewritten to use bcrypt instead. If you're resuming this project from an older clone or database snapshot that still has SHA-256 hashes in it, those accounts simply won't be able to log in anymore (`bcrypt.compare` returns false for a non-bcrypt hash) — they'll need to register again with a new password.

No API keys or database credentials were found hardcoded anywhere in this repository's source or its git history — `DATABASE_URL` is read from the environment everywhere it's used.
