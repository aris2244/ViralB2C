export interface PlayerProfile {
  id: string;
  name: string;
  passwordHash: string;
  elo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

export interface PlayerSession {
  socketId: string;
  profileId: string;
  name: string;
  elo: number;
}

export type PlayerPlayState = 'idle' | 'running' | 'done';

export type MatchPhase = 'playing' | 'round_result' | 'match_result';

export const AFK_TIMEOUT_MS = 10_000;
export const STARTING_ELO = 1000;

export interface RoundResult {
  round: number;
  targetMs: number;
  player1TimeMs: number | null;
  player2TimeMs: number | null;
  player1DiffMs: number | null;
  player2DiffMs: number | null;
  winnerId: string | null;
  isDraw: boolean;
}

export interface Match {
  id: string;
  player1: PlayerSession;
  player2: PlayerSession;
  round: number;
  maxRounds: number;
  player1Wins: number;
  player2Wins: number;
  phase: MatchPhase;
  targetMs: number;
  roundStartedAt: number;
  roundResults: RoundResult[];
  player1State: PlayerPlayState;
  player2State: PlayerPlayState;
  player1CurrentTimeMs: number | null;
  player2CurrentTimeMs: number | null;
  readyPlayers: Set<string>;
  isFriendMatch: boolean;
}

export interface RankTier {
  id: string;
  name: string;
  minElo: number;
  color: string;
  icon: string;
}

// Starting ELO is 1000 → Gold. Gaps of ~100-150 so ~6-10 wins per rank.
export const RANKS: RankTier[] = [
  { id: 'bronze',      name: 'Bronze',      minElo: 0,    color: '#cd7f32', icon: '🥉' },
  { id: 'silver',      name: 'Silver',      minElo: 800,  color: '#c0c0c0', icon: '🥈' },
  { id: 'gold',        name: 'Gold',        minElo: 1000, color: '#ffd700', icon: '🥇' },
  { id: 'platinum',    name: 'Platinum',    minElo: 1100, color: '#00d4aa', icon: '💎' },
  { id: 'diamond',     name: 'Diamond',     minElo: 1200, color: '#7b68ee', icon: '💠' },
  { id: 'master',      name: 'Master',      minElo: 1350, color: '#ff4466', icon: '👑' },
  { id: 'grandmaster', name: 'Grandmaster', minElo: 1500, color: '#ff00ff', icon: '⚡' },
];

export function getRank(elo: number): RankTier {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (elo >= r.minElo) rank = r;
  }
  return rank;
}
