import { v4 as uuidv4 } from 'uuid';
import type { Match, PlayerSession, PlayerPlayState } from './types.js';
import { AFK_TIMEOUT_MS } from './types.js';
import { randomTargetMs } from './elo.js';

export function createMatch(
  player1: PlayerSession,
  player2: PlayerSession,
  isFriendMatch = false
): Match {
  return {
    id: uuidv4(),
    player1,
    player2,
    round: 1,
    maxRounds: 3,
    player1Wins: 0,
    player2Wins: 0,
    phase: 'playing',
    targetMs: 0,
    roundStartedAt: 0,
    roundResults: [],
    player1State: 'idle',
    player2State: 'idle',
    player1CurrentTimeMs: null,
    player2CurrentTimeMs: null,
    readyPlayers: new Set(),
    isFriendMatch,
  };
}

export function startRound(match: Match): void {
  match.targetMs = randomTargetMs();
  match.phase = 'playing';
  match.roundStartedAt = Date.now();
  match.player1State = 'idle';
  match.player2State = 'idle';
  match.player1CurrentTimeMs = null;
  match.player2CurrentTimeMs = null;
  match.readyPlayers.clear();
}

function getPlayerState(match: Match, playerId: string): PlayerPlayState {
  return match.player1.profileId === playerId ? match.player1State : match.player2State;
}

function setPlayerState(match: Match, playerId: string, state: PlayerPlayState): void {
  if (match.player1.profileId === playerId) match.player1State = state;
  else match.player2State = state;
}

export function isAfkDeadlinePassed(match: Match): boolean {
  return Date.now() >= match.roundStartedAt + AFK_TIMEOUT_MS;
}

export function startPlayerTimer(match: Match, playerId: string): boolean {
  if (match.phase !== 'playing') return false;
  if (isAfkDeadlinePassed(match)) return false;
  if (getPlayerState(match, playerId) !== 'idle') return false;
  setPlayerState(match, playerId, 'running');
  return true;
}

export function submitTime(match: Match, playerId: string, timeMs: number): boolean {
  if (match.phase !== 'playing') return false;
  if (getPlayerState(match, playerId) !== 'running') return false;

  const clamped = Math.max(0, Math.min(timeMs, 30_000));
  if (match.player1.profileId === playerId) {
    match.player1CurrentTimeMs = clamped;
    match.player1State = 'done';
  } else {
    match.player2CurrentTimeMs = clamped;
    match.player2State = 'done';
  }
  return true;
}

export function bothFinished(match: Match): boolean {
  return match.player1State === 'done' && match.player2State === 'done';
}

export function getIdlePlayersPastAfk(match: Match): string[] {
  if (match.phase !== 'playing' || !isAfkDeadlinePassed(match)) return [];
  const idle: string[] = [];
  if (match.player1State === 'idle') idle.push(match.player1.profileId);
  if (match.player2State === 'idle') idle.push(match.player2.profileId);
  return idle;
}

export function resolveRound(match: Match) {
  const p1Time = match.player1CurrentTimeMs!;
  const p2Time = match.player2CurrentTimeMs!;
  const target = match.targetMs;

  const p1Diff = Math.abs(p1Time - target);
  const p2Diff = Math.abs(p2Time - target);

  let winnerId: string | null = null;
  let isDraw = false;

  if (p1Diff < p2Diff) {
    winnerId = match.player1.profileId;
    match.player1Wins++;
  } else if (p2Diff < p1Diff) {
    winnerId = match.player2.profileId;
    match.player2Wins++;
  } else {
    isDraw = true;
  }

  const result = {
    round: match.round,
    targetMs: target,
    player1TimeMs: p1Time,
    player2TimeMs: p2Time,
    player1DiffMs: p1Diff,
    player2DiffMs: p2Diff,
    winnerId,
    isDraw,
  };

  match.roundResults.push(result);
  match.phase = 'round_result';
  return result;
}

export function isMatchOver(match: Match): boolean {
  const needed = Math.ceil(match.maxRounds / 2);
  return match.player1Wins >= needed || match.player2Wins >= needed;
}

export function getMatchWinnerId(match: Match): string | null {
  if (match.player1Wins > match.player2Wins) return match.player1.profileId;
  if (match.player2Wins > match.player1Wins) return match.player2.profileId;
  return null;
}

export function bothReady(match: Match): boolean {
  return (
    match.readyPlayers.has(match.player1.profileId) &&
    match.readyPlayers.has(match.player2.profileId)
  );
}

export function nextRound(match: Match): void {
  match.round++;
  startRound(match);
}

export function serializeMatch(match: Match, forPlayerId: string) {
  const isPlayer1 = match.player1.profileId === forPlayerId;
  const opponent = isPlayer1 ? match.player2 : match.player1;
  const me = isPlayer1 ? match.player1 : match.player2;
  const myState = isPlayer1 ? match.player1State : match.player2State;
  const opponentState = isPlayer1 ? match.player2State : match.player1State;

  return {
    id: match.id,
    isPlayer1,
    isFriendMatch: match.isFriendMatch,
    round: match.round,
    maxRounds: match.maxRounds,
    phase: match.phase,
    targetMs: match.targetMs,
    targetFormatted: (match.targetMs / 1000).toFixed(2),
    roundStartedAt: match.roundStartedAt,
    afkDeadlineAt: match.roundStartedAt + AFK_TIMEOUT_MS,
    me: { id: me.profileId, name: me.name, elo: me.elo },
    opponent: { id: opponent.profileId, name: opponent.name, elo: opponent.elo },
    myState,
    opponentState,
    player1Wins: match.player1Wins,
    player2Wins: match.player2Wins,
    myTimeMs: isPlayer1 ? match.player1CurrentTimeMs : match.player2CurrentTimeMs,
    opponentTimeMs: isPlayer1 ? match.player2CurrentTimeMs : match.player1CurrentTimeMs,
    roundResults: match.roundResults,
    readyCount: match.readyPlayers.size,
  };
}
