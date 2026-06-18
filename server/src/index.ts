import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  authenticate,
  updatePlayer,
  getLeaderboard,
  getPlayerRank,
  getPlayerById,
} from './store.js';
import {
  createMatch,
  startRound,
  bothReady,
  startPlayerTimer,
  submitTime,
  bothFinished,
  resolveRound,
  isMatchOver,
  getMatchWinnerId,
  nextRound,
  serializeMatch,
  getIdlePlayersPastAfk,
} from './game.js';
import { calculateEloChange } from './elo.js';
import type { Match, PlayerSession } from './types.js';
import { getRank } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

interface QueueEntry {
  session: PlayerSession;
  joinedAt: number;
}

// code → creator profileId
interface PartyEntry {
  creatorProfileId: string;
  createdAt: number;
}

// After a friend match ends, track who wants to rematch / go lobby
interface PendingFriendRematch {
  player1Id: string;
  player2Id: string;
  player1Wants: boolean; // true = rematch, false = undecided
  player2Wants: boolean;
}

const queue: QueueEntry[] = [];
const socketToProfile = new Map<string, string>();
const profileToSocket = new Map<string, string>();
const activeMatches = new Map<string, Match>();
const profileToMatch = new Map<string, string>();
const partyCodes = new Map<string, PartyEntry>(); // code → party
// key: `${smallerId}-${largerId}` for the two friends
const pendingFriendRematches = new Map<string, PendingFriendRematch>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePartyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getSession(socketId: string): PlayerSession | null {
  const profileId = socketToProfile.get(socketId);
  if (!profileId) return null;
  const profile = getPlayerById(profileId);
  if (!profile) return null;
  return { socketId, profileId: profile.id, name: profile.name, elo: profile.elo };
}

function emitMatchState(match: Match): void {
  for (const session of [match.player1, match.player2]) {
    const socketId = profileToSocket.get(session.profileId);
    if (socketId) {
      io.to(socketId).emit('match:state', serializeMatch(match, session.profileId));
    }
  }
}

function removeFromQueue(profileId: string): void {
  const idx = queue.findIndex((e) => e.session.profileId === profileId);
  if (idx !== -1) queue.splice(idx, 1);
}

function friendKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function launchMatch(p1: PlayerSession, p2: PlayerSession, isFriendMatch = false): void {
  const match = createMatch(p1, p2, isFriendMatch);
  activeMatches.set(match.id, match);
  profileToMatch.set(p1.profileId, match.id);
  profileToMatch.set(p2.profileId, match.id);
  startRound(match);
  emitMatchState(match);
}

/** ELO search range expands by 100 every 5 seconds, capped at 600. */
function eloRange(joinedAt: number): number {
  return Math.min(100 + Math.floor((Date.now() - joinedAt) / 5_000) * 100, 600);
}

function tryMatchmake(): void {
  const matched = new Set<string>();

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (matched.has(entry.session.profileId)) continue;
    const myRange = eloRange(entry.joinedAt);
    let best: QueueEntry | null = null;
    let bestDiff = Infinity;

    for (let j = i + 1; j < queue.length; j++) {
      const cand = queue[j];
      if (matched.has(cand.session.profileId)) continue;
      const diff = Math.abs(entry.session.elo - cand.session.elo);
      const range = Math.max(myRange, eloRange(cand.joinedAt));
      if (diff <= range && diff < bestDiff) { bestDiff = diff; best = cand; }
    }

    if (best) {
      matched.add(entry.session.profileId);
      matched.add(best.session.profileId);
      launchMatch(entry.session, best.session);
    }
  }

  queue.splice(0, queue.length, ...queue.filter((e) => !matched.has(e.session.profileId)));
}

setInterval(tryMatchmake, 2_000);

// Expire stale party codes after 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of partyCodes.entries()) {
    if (now - entry.createdAt > 5 * 60_000) partyCodes.delete(code);
  }
}, 30_000);

// ── ELO helpers ───────────────────────────────────────────────────────────────

function buildMatchResult(match: Match, winnerId: string | null) {
  const p1 = getPlayerById(match.player1.profileId)!;
  const p2 = getPlayerById(match.player2.profileId)!;

  let p1c = 0, p2c = 0;
  if (winnerId === p1.id) {
    p1c = calculateEloChange(p1.elo, p2.elo, 1);
    p2c = calculateEloChange(p2.elo, p1.elo, 0);
    p1.wins++; p2.losses++;
  } else if (winnerId === p2.id) {
    p1c = calculateEloChange(p1.elo, p2.elo, 0);
    p2c = calculateEloChange(p2.elo, p1.elo, 1);
    p2.wins++; p1.losses++;
  } else {
    p1c = calculateEloChange(p1.elo, p2.elo, 0.5);
    p2c = calculateEloChange(p2.elo, p1.elo, 0.5);
  }

  p1.elo = Math.max(0, p1.elo + p1c);
  p2.elo = Math.max(0, p2.elo + p2c);
  p1.matchesPlayed++; p2.matchesPlayed++;
  updatePlayer(p1); updatePlayer(p2);

  return {
    winnerId, isDraw: winnerId === null,
    player1: { id: p1.id, name: p1.name, elo: p1.elo, eloChange: p1c, rank: getRank(p1.elo) },
    player2: { id: p2.id, name: p2.name, elo: p2.elo, eloChange: p2c, rank: getRank(p2.elo) },
    roundResults: match.roundResults,
    player1Wins: match.player1Wins,
    player2Wins: match.player2Wins,
  };
}

function finalizeMatch(match: Match): void {
  match.phase = 'match_result';
  const winnerId = getMatchWinnerId(match);
  const result = buildMatchResult(match, winnerId);

  const payload = { ...result, isFriendMatch: match.isFriendMatch };
  for (const s of [match.player1, match.player2]) {
    const sid = profileToSocket.get(s.profileId);
    if (sid) io.to(sid).emit('match:result', payload);
  }

  // Register a pending rematch slot so friends can instantly play again
  if (match.isFriendMatch) {
    const key = friendKey(match.player1.profileId, match.player2.profileId);
    pendingFriendRematches.set(key, {
      player1Id: match.player1.profileId,
      player2Id: match.player2.profileId,
      player1Wants: false,
      player2Wants: false,
    });
    // Auto-expire after 2 minutes
    setTimeout(() => pendingFriendRematches.delete(key), 2 * 60_000);
  }
}

function forfeitMatchAfk(match: Match, afkId: string): void {
  const winner = match.player1.profileId === afkId ? match.player2 : match.player1;
  const result = buildMatchResult(match, winner.profileId);
  const afkSid = profileToSocket.get(afkId);
  const winSid = profileToSocket.get(winner.profileId);
  if (afkSid) io.to(afkSid).emit('match:afk_kicked');
  if (winSid) io.to(winSid).emit('match:opponent_afk', result);
  cleanupMatch(match);
}

function cleanupMatch(match: Match): void {
  activeMatches.delete(match.id);
  profileToMatch.delete(match.player1.profileId);
  profileToMatch.delete(match.player2.profileId);
}

// AFK check
setInterval(() => {
  for (const match of activeMatches.values()) {
    const idle = getIdlePlayersPastAfk(match);
    if (idle.length > 0) forfeitMatchAfk(match, idle[0]);
  }
}, 500);

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/api/leaderboard', (_req, res) => res.json(getLeaderboard(10)));

app.get('/api/rank/:profileId', (req, res) => {
  const profile = getPlayerById(req.params.profileId);
  if (!profile) { res.status(404).json({ error: 'not found' }); return; }
  const rank = getPlayerRank(req.params.profileId);
  res.json({ rank, elo: profile.elo, name: profile.name });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, queue: queue.length, matches: activeMatches.size })
);

// Serve the Vite-built frontend.
// At runtime: server/dist/index.js → __dirname = <root>/server/dist
// So two levels up + client/dist = <root>/client/dist
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
const indexHtml = join(clientDist, 'index.html');

if (existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  // Catch-all: let React Router (or any SPA) handle unknown paths
  app.get('*', (_req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  console.warn(`[warn] Client build not found at ${clientDist} — frontend will not be served.`);
}

// ── Sockets ───────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // Auth
  socket.on('auth:login', ({ name, password }: { name: string; password: string }) => {
    const result = authenticate(name, password);
    if (!result.ok) {
      socket.emit('auth:error', {
        error: result.error,
        message: result.error === 'name_taken' ? 'Name not available' : 'Wrong password',
      });
      return;
    }
    const p = result.profile;
    socketToProfile.set(socket.id, p.id);
    profileToSocket.set(p.id, socket.id);
    socket.emit('auth:ok', {
      id: p.id, name: p.name, elo: p.elo,
      wins: p.wins, losses: p.losses, matchesPlayed: p.matchesPlayed,
      rank: getRank(p.elo),
    });
  });

  // Ranked queue
  socket.on('queue:join', () => {
    const session = getSession(socket.id);
    if (!session || profileToMatch.has(session.profileId)) return;
    removeFromQueue(session.profileId);
    queue.push({ session, joinedAt: Date.now() });
    socket.emit('queue:status', { inQueue: true, position: queue.length });
    tryMatchmake();
  });

  socket.on('queue:leave', () => {
    const session = getSession(socket.id);
    if (!session) return;
    removeFromQueue(session.profileId);
    socket.emit('queue:status', { inQueue: false, position: 0 });
  });

  // Party / Play with Friend
  socket.on('party:create', () => {
    const session = getSession(socket.id);
    if (!session) return;
    if (profileToMatch.has(session.profileId)) return;

    // Remove any existing code this player created
    for (const [code, entry] of partyCodes.entries()) {
      if (entry.creatorProfileId === session.profileId) partyCodes.delete(code);
    }

    let code: string;
    do { code = generatePartyCode(); } while (partyCodes.has(code));

    partyCodes.set(code, { creatorProfileId: session.profileId, createdAt: Date.now() });
    socket.emit('party:created', { code });
  });

  socket.on('party:cancel', () => {
    const session = getSession(socket.id);
    if (!session) return;
    for (const [code, entry] of partyCodes.entries()) {
      if (entry.creatorProfileId === session.profileId) {
        partyCodes.delete(code);
        break;
      }
    }
    socket.emit('party:cancelled');
  });

  socket.on('party:join', (code: string) => {
    const joiner = getSession(socket.id);
    if (!joiner) return;
    if (profileToMatch.has(joiner.profileId)) return;

    const normalized = code.trim().toUpperCase();
    const entry = partyCodes.get(normalized);

    if (!entry) {
      socket.emit('party:error', { message: 'Invalid or expired code' });
      return;
    }
    if (entry.creatorProfileId === joiner.profileId) {
      socket.emit('party:error', { message: 'You cannot join your own party' });
      return;
    }

    const creatorProfile = getPlayerById(entry.creatorProfileId);
    if (!creatorProfile) {
      partyCodes.delete(normalized);
      socket.emit('party:error', { message: 'Party host is no longer online' });
      return;
    }

    const creatorSocketId = profileToSocket.get(entry.creatorProfileId);
    if (!creatorSocketId) {
      partyCodes.delete(normalized);
      socket.emit('party:error', { message: 'Party host is no longer online' });
      return;
    }

    partyCodes.delete(normalized);

    const host: PlayerSession = {
      socketId: creatorSocketId,
      profileId: creatorProfile.id,
      name: creatorProfile.name,
      elo: creatorProfile.elo,
    };

    // Remove both from ranked queue just in case
    removeFromQueue(host.profileId);
    removeFromQueue(joiner.profileId);

    // Notify host that a friend joined so their UI can transition
    io.to(creatorSocketId).emit('party:friend_joined', { name: joiner.name });

    launchMatch(host, joiner, true);
  });

  // Match actions
  socket.on('round:start_timer', () => {
    const session = getSession(socket.id);
    if (!session) return;
    const match = activeMatches.get(profileToMatch.get(session.profileId) ?? '');
    if (!match) return;
    if (startPlayerTimer(match, session.profileId)) emitMatchState(match);
  });

  socket.on('round:submit', (timeMs: number) => {
    const session = getSession(socket.id);
    if (!session) return;
    const match = activeMatches.get(profileToMatch.get(session.profileId) ?? '');
    if (!match) return;
    if (!submitTime(match, session.profileId, timeMs)) return;
    if (bothFinished(match)) {
      resolveRound(match);
      // If this was the deciding round, go straight to match result — no extra SPACE needed
      if (isMatchOver(match)) {
        finalizeMatch(match);
        cleanupMatch(match);
        return;
      }
    }
    emitMatchState(match);
  });

  socket.on('round:continue', () => {
    const session = getSession(socket.id);
    if (!session) return;
    const match = activeMatches.get(profileToMatch.get(session.profileId) ?? '');
    if (!match || match.phase !== 'round_result') return;
    match.readyPlayers.add(session.profileId);
    if (!bothReady(match)) { emitMatchState(match); return; }
    if (isMatchOver(match)) { finalizeMatch(match); cleanupMatch(match); return; }
    nextRound(match);
    emitMatchState(match);
  });

  socket.on('match:new_game', () => {
    const session = getSession(socket.id);
    if (!session) return;
    removeFromQueue(session.profileId);
    queue.push({ session, joinedAt: Date.now() });
    socket.emit('queue:status', { inQueue: true, position: queue.length });
    tryMatchmake();
  });

  socket.on('friend:rematch', () => {
    const session = getSession(socket.id);
    if (!session) return;

    // Find this player's pending friend rematch entry
    let key: string | null = null;
    let pending: PendingFriendRematch | null = null;
    for (const [k, v] of pendingFriendRematches.entries()) {
      if (v.player1Id === session.profileId || v.player2Id === session.profileId) {
        key = k; pending = v; break;
      }
    }
    if (!key || !pending) return;

    const isP1 = pending.player1Id === session.profileId;
    if (isP1) pending.player1Wants = true;
    else pending.player2Wants = true;

    const opponentId = isP1 ? pending.player2Id : pending.player1Id;
    const opponentSid = profileToSocket.get(opponentId);

    if (pending.player1Wants && pending.player2Wants) {
      // Both want rematch — launch a new friend match
      pendingFriendRematches.delete(key);
      const p1Profile = getPlayerById(pending.player1Id);
      const p2Profile = getPlayerById(pending.player2Id);
      if (!p1Profile || !p2Profile) return;
      const p1Sid = profileToSocket.get(pending.player1Id);
      const p2Sid = profileToSocket.get(pending.player2Id);
      if (!p1Sid || !p2Sid) return;

      const p1: PlayerSession = { socketId: p1Sid, profileId: p1Profile.id, name: p1Profile.name, elo: p1Profile.elo };
      const p2: PlayerSession = { socketId: p2Sid, profileId: p2Profile.id, name: p2Profile.name, elo: p2Profile.elo };
      launchMatch(p1, p2, true);
    } else {
      // Tell opponent you want a rematch
      if (opponentSid) io.to(opponentSid).emit('friend:opponent_wants_rematch');
      socket.emit('friend:waiting_for_rematch');
    }
  });

  socket.on('friend:go_lobby', () => {
    const session = getSession(socket.id);
    if (!session) return;

    let key: string | null = null;
    let pending: PendingFriendRematch | null = null;
    for (const [k, v] of pendingFriendRematches.entries()) {
      if (v.player1Id === session.profileId || v.player2Id === session.profileId) {
        key = k; pending = v; break;
      }
    }

    if (key) pendingFriendRematches.delete(key);

    if (pending) {
      const opponentId = pending.player1Id === session.profileId ? pending.player2Id : pending.player1Id;
      const opponentSid = profileToSocket.get(opponentId);
      if (opponentSid) io.to(opponentSid).emit('friend:opponent_went_lobby');
    }
  });

  socket.on('disconnect', () => {
    const profileId = socketToProfile.get(socket.id);
    if (!profileId) return;

    removeFromQueue(profileId);
    // Clean up any party codes this player created
    for (const [code, entry] of partyCodes.entries()) {
      if (entry.creatorProfileId === profileId) partyCodes.delete(code);
    }
    // Clean up pending friend rematches and notify opponent
    for (const [key, pending] of pendingFriendRematches.entries()) {
      if (pending.player1Id === profileId || pending.player2Id === profileId) {
        pendingFriendRematches.delete(key);
        const opponentId = pending.player1Id === profileId ? pending.player2Id : pending.player1Id;
        const opponentSid = profileToSocket.get(opponentId);
        if (opponentSid) io.to(opponentSid).emit('friend:opponent_went_lobby');
        break;
      }
    }
    profileToSocket.delete(profileId);
    socketToProfile.delete(socket.id);

    const matchId = profileToMatch.get(profileId);
    if (matchId) {
      const match = activeMatches.get(matchId);
      if (match) {
        const opp = match.player1.profileId === profileId ? match.player2 : match.player1;
        const oppSid = profileToSocket.get(opp.profileId);
        if (oppSid) io.to(oppSid).emit('match:opponent_left');
        cleanupMatch(match);
      }
    }
  });
});

// Listen on 0.0.0.0 so Railway (and any reverse-proxy host) can reach the process.
// Binding to 'localhost' only accepts loopback connections and breaks hosted deployments.
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Chrono Duel server listening on 0.0.0.0:${PORT}`);
  console.log(`Client dist path: ${clientDist}`);
  console.log(`Client dist exists: ${existsSync(indexHtml)}`);
});
