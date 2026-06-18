import pg from 'pg';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { STARTING_ELO } from './types.js';
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});
function hashPassword(pw) {
    return createHash('sha256').update(pw).digest('hex');
}
function rowToProfile(row) {
    return {
        id: row.id,
        name: row.name,
        passwordHash: row.password_hash,
        elo: row.elo,
        wins: row.wins,
        losses: row.losses,
        matchesPlayed: row.matches_played,
    };
}
export async function initDb() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT ${STARTING_ELO},
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0
    )
  `);
    console.log('[db] players table ready');
}
export async function authenticate(name, password) {
    const normalized = name.trim().slice(0, 20);
    const hash = hashPassword(password);
    const { rows } = await pool.query('SELECT * FROM players WHERE LOWER(name) = LOWER($1)', [normalized]);
    if (rows.length > 0) {
        const profile = rowToProfile(rows[0]);
        if (profile.passwordHash !== hash) {
            return { ok: false, error: 'wrong_password' };
        }
        return { ok: true, profile };
    }
    // New player — register
    const id = uuidv4();
    await pool.query('INSERT INTO players (id, name, password_hash, elo, wins, losses, matches_played) VALUES ($1, $2, $3, $4, 0, 0, 0)', [id, normalized, hash, STARTING_ELO]);
    const profile = {
        id,
        name: normalized,
        passwordHash: hash,
        elo: STARTING_ELO,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
    };
    return { ok: true, profile };
}
export async function updatePlayer(profile) {
    await pool.query('UPDATE players SET elo=$1, wins=$2, losses=$3, matches_played=$4 WHERE id=$5', [profile.elo, profile.wins, profile.losses, profile.matchesPlayed, profile.id]);
}
export async function getLeaderboard(limit = 10) {
    const { rows } = await pool.query('SELECT * FROM players ORDER BY elo DESC LIMIT $1', [limit]);
    return rows.map(rowToProfile).map(({ passwordHash: _ph, ...rest }) => rest);
}
export async function getPlayerRank(profileId) {
    const { rows } = await pool.query(`SELECT COUNT(*) AS ahead FROM players
     WHERE elo > (SELECT elo FROM players WHERE id = $1)`, [profileId]);
    if (rows.length === 0)
        return 0;
    return parseInt(rows[0].ahead, 10) + 1;
}
export async function getPlayerById(id) {
    const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    if (rows.length === 0)
        return undefined;
    return rowToProfile(rows[0]);
}
