import { io, Socket } from 'socket.io-client';
import type { MatchResult, MatchState, PlayerProfile } from './types';

const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

class GameSocket {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    }
    return this.socket;
  }

  // Auth
  login(name: string, password: string): void {
    this.connect().emit('auth:login', { name, password });
  }

  // Ranked queue
  joinQueue(): void {
    this.connect().emit('queue:join');
  }
  leaveQueue(): void {
    this.connect().emit('queue:leave');
  }

  // Party
  createParty(): void {
    this.connect().emit('party:create');
  }
  cancelParty(): void {
    this.connect().emit('party:cancel');
  }
  joinParty(code: string): void {
    this.connect().emit('party:join', code);
  }

  // Match actions
  startTimer(): void {
    this.connect().emit('round:start_timer');
  }
  submitTime(timeMs: number): void {
    this.connect().emit('round:submit', timeMs);
  }
  continueRound(): void {
    this.connect().emit('round:continue');
  }
  newGame(): void {
    this.connect().emit('match:new_game');
  }
  friendRematch(): void {
    this.connect().emit('friend:rematch');
  }
  friendGoLobby(): void {
    this.connect().emit('friend:go_lobby');
  }

  // Listeners
  onAuthOk(cb: (profile: PlayerProfile) => void): void {
    this.connect().on('auth:ok', cb);
  }
  onAuthError(cb: (data: { error: string; message: string }) => void): void {
    this.connect().on('auth:error', cb);
  }
  onQueueStatus(cb: (data: { inQueue: boolean; position: number }) => void): void {
    this.connect().on('queue:status', cb);
  }
  onMatchState(cb: (state: MatchState) => void): void {
    this.connect().on('match:state', cb);
  }
  onMatchResult(cb: (result: MatchResult) => void): void {
    this.connect().on('match:result', cb);
  }
  onOpponentLeft(cb: () => void): void {
    this.connect().on('match:opponent_left', cb);
  }
  onAfkKicked(cb: () => void): void {
    this.connect().on('match:afk_kicked', cb);
  }
  onOpponentAfk(cb: (result: MatchResult) => void): void {
    this.connect().on('match:opponent_afk', cb);
  }
  onPartyCreated(cb: (data: { code: string }) => void): void {
    this.connect().on('party:created', cb);
  }
  onPartyCancelled(cb: () => void): void {
    this.connect().on('party:cancelled', cb);
  }
  onPartyError(cb: (data: { message: string }) => void): void {
    this.connect().on('party:error', cb);
  }
  onPartyFriendJoined(cb: (data: { name: string }) => void): void {
    this.connect().on('party:friend_joined', cb);
  }
  onFriendWaitingForRematch(cb: () => void): void {
    this.connect().on('friend:waiting_for_rematch', cb);
  }
  onFriendOpponentWantsRematch(cb: () => void): void {
    this.connect().on('friend:opponent_wants_rematch', cb);
  }
  onFriendOpponentWentLobby(cb: () => void): void {
    this.connect().on('friend:opponent_went_lobby', cb);
  }

  offAll(): void {
    if (!this.socket) return;
    [
      'auth:ok', 'auth:error', 'queue:status',
      'match:state', 'match:result', 'match:opponent_left',
      'match:afk_kicked', 'match:opponent_afk',
      'party:created', 'party:cancelled', 'party:error', 'party:friend_joined',
      'friend:waiting_for_rematch', 'friend:opponent_wants_rematch', 'friend:opponent_went_lobby',
    ].forEach((ev) => this.socket!.off(ev));
  }

  /** Remove only party-specific listeners — does NOT touch match/game listeners. */
  offPartyListeners(): void {
    if (!this.socket) return;
    ['party:created', 'party:cancelled', 'party:error', 'party:friend_joined'].forEach(
      (ev) => this.socket!.off(ev)
    );
  }
}

export const gameSocket = new GameSocket();

export async function fetchLeaderboard(): Promise<PlayerProfile[]> {
  const res = await fetch(`${SERVER_URL}/api/leaderboard`);
  return res.json();
}

export async function fetchPlayerRank(profileId: string): Promise<{ rank: number; elo: number }> {
  const res = await fetch(`${SERVER_URL}/api/rank/${profileId}`);
  if (!res.ok) return { rank: 0, elo: 0 };
  return res.json();
}
