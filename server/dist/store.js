import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { STARTING_ELO } from './types.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const PLAYERS_FILE = join(DATA_DIR, 'players.json');
function hashPassword(pw) {
    return createHash('sha256').update(pw).digest('hex');
}
function ensureDataDir() {
    if (!existsSync(DATA_DIR))
        mkdirSync(DATA_DIR, { recursive: true });
}
function loadStore() {
    ensureDataDir();
    if (!existsSync(PLAYERS_FILE))
        return { players: {} };
    try {
        return JSON.parse(readFileSync(PLAYERS_FILE, 'utf-8'));
    }
    catch {
        return { players: {} };
    }
}
function saveStore(data) {
    ensureDataDir();
    writeFileSync(PLAYERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
let cache = loadStore();
/** Register a new account or login to an existing one. */
export function authenticate(name, password) {
    const normalized = name.trim().slice(0, 20);
    const hash = hashPassword(password);
    const existing = Object.values(cache.players).find((p) => p.name.toLowerCase() === normalized.toLowerCase());
    if (existing) {
        if (existing.passwordHash !== hash) {
            return { ok: false, error: 'wrong_password' };
        }
        return { ok: true, profile: existing };
    }
    // New player — register
    const profile = {
        id: uuidv4(),
        name: normalized,
        passwordHash: hash,
        elo: STARTING_ELO,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
    };
    cache.players[profile.id] = profile;
    saveStore(cache);
    return { ok: true, profile };
}
export function updatePlayer(profile) {
    cache.players[profile.id] = profile;
    saveStore(cache);
}
export function getLeaderboard(limit = 10) {
    return Object.values(cache.players)
        .sort((a, b) => b.elo - a.elo)
        .slice(0, limit)
        .map(({ passwordHash: _ph, ...rest }) => rest);
}
export function getPlayerRank(profileId) {
    const target = cache.players[profileId];
    if (!target)
        return 0;
    // Count players with strictly higher ELO, then add 1
    let ahead = 0;
    for (const p of Object.values(cache.players)) {
        if (p.id !== profileId && p.elo > target.elo)
            ahead++;
    }
    return ahead + 1;
}
export function getPlayerById(id) {
    return cache.players[id];
}
