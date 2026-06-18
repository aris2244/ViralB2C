export interface RankTier {
  id: string;
  name: string;
  minElo: number;
  color: string;
  icon: string;
}

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

export interface PlayerProfile {
  id: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  rank: RankTier;
}

export type PlayerPlayState = 'idle' | 'running' | 'done';

export interface MatchState {
  id: string;
  isPlayer1: boolean;
  isFriendMatch: boolean;
  round: number;
  maxRounds: number;
  phase: string;
  targetMs: number | null;
  targetFormatted: string | null;
  roundStartedAt: number;
  afkDeadlineAt: number;
  me: { id: string; name: string; elo: number };
  opponent: { id: string; name: string; elo: number };
  myState: PlayerPlayState;
  opponentState: PlayerPlayState;
  player1Wins: number;
  player2Wins: number;
  myTimeMs: number | null;
  opponentTimeMs: number | null;
  roundResults: RoundResult[];
  readyCount: number;
}

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

export interface MatchResult {
  winnerId: string | null;
  isDraw: boolean;
  isFriendMatch: boolean;
  player1: { id: string; name: string; elo: number; eloChange: number; rank: RankTier };
  player2: { id: string; name: string; elo: number; eloChange: number; rank: RankTier };
  roundResults: RoundResult[];
  player1Wins: number;
  player2Wins: number;
}

export function formatMs(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

export function eloChangeStr(n: number): string {
  return (n >= 0 ? '+' : '') + n;
}
