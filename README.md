# RoboPitch Championship

Real-time Robot Soccer tournament scoreboard, team roster manager, group standings, and seeded sudden-death bracket viewer powered by React, Express, WebSockets (`ws`), and Firebase (Authentication + Firestore).

## Features

- **Low-Latency WebSocket Sync**: Live scores, 4-minute match clocks (`04:00`), Flip Over bonus events, standings, and bracket updates broadcast instantaneously to all connected spectator devices.
- **3-Group Round-Robin + Seeded Sudden-Death Bracket**:
  - 3 groups (`Group A`, `Group B`, `Group C`) with round-robin group play.
  - Scoring: `3` pts Win, `1` pt Draw, `0` pts Loss, plus `+1` bonus point per **Flip Over**.
  - Top 4 overall seeds (`#1`–`#4`) earn Quarterfinal Byes; seeds `#5`–`#12` compete in Round 1 Sudden Death (`#5v#12`, `#6v#11`, `#7v#10`, `#8v#9`).
- **Director Control Center (Admin)**:
  - Restricted via Firebase Google Sign-In (`hermanf@gisboyshigh.net`) and server-side `firebase-admin` ID token verification.
  - Bulk add teams & 2-robot rosters (interactive 12-row grid or CSV/text import), edit team names/profiles/robots, auto-generate group round-robin + sudden-death schedules, control live clocks/scores/Flip Overs, and reset tournament data cleanly.
- **Public Spectator View**: Live broadcast arena, group & overall seeding leaderboards, filterable match schedule, 4-round sudden-death bracket, and searchable team rosters.

## Local Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment & Firebase**:
   - Copy `.env.example` to `.env` if needed.
   - Ensure `firebase-applet-config.json` contains your Firebase Web App config (`projectId`, `apiKey`, `authDomain`, `firestoreDatabaseId`, etc.).
   - Deploy `firestore.rules` to your Firebase project before production use.

3. **Run in development**:
   ```bash
   npm run dev
   ```
   The server listens on `http://localhost:3000`.

4. **Build and run in production**:
   ```bash
   npm run build
   npm start
   ```

## Publishing to GitHub

1. Initialize Git (if not already initialized) and stage the project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: RoboPitch Championship"
   ```
2. Create an empty repository on GitHub, then add the remote and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
   *(Note: `.env*` and `data/` are excluded by `.gitignore` so local secrets and runtime state are not pushed.)*
