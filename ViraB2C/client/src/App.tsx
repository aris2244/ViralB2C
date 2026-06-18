import { useState, useEffect, useCallback, useRef } from 'react';
import { gameSocket, fetchLeaderboard, fetchPlayerRank } from './socket';
import { audioEngine, music, sfx } from './audio';
import type { MatchResult, MatchState, PlayerPlayState, PlayerProfile } from './types';
import { eloChangeStr, formatMs, getRank, RANKS } from './types';
import './App.css';

type Screen = 'auth' | 'lobby' | 'queue' | 'match' | 'result' | 'afk_kicked' | 'opponent_afk' | 'friend_result';
type LobbyPanel = 'home' | 'friend';

function App() {
  const [screen, setScreen] = useState<Screen>('auth');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authError, setAuthError] = useState('');
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<PlayerProfile[]>([]);
  const [queuePos, setQueuePos] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [friendRematchState, setFriendRematchState] = useState<'idle' | 'waiting' | 'opponent_wants'>('idle');
  const startTimeRef = useRef<number>(0);
  const roundKeyRef = useRef<string>('');
  const roundSfxRef = useRef<string>(''); // tracks which round-result sfx already played

  const loadLeaderboard = useCallback(async (profileId?: string) => {
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data.map((p) => ({ ...p, rank: getRank(p.elo) })));
      if (profileId) {
        const rankData = await fetchPlayerRank(profileId);
        setMyRank(rankData.rank);
      }
    } catch { /* server offline */ }
  }, []);

  const resetLocalTimer = useCallback((clearSfxRef = false) => {
    setTimerRunning(false);
    startTimeRef.current = 0;
    if (clearSfxRef) roundSfxRef.current = '';
  }, []);

  // Keep a ref to profile so socket callbacks always see the current value
  // without needing to re-register listeners every time profile changes.
  const profileRef = useRef<PlayerProfile | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    loadLeaderboard();

    gameSocket.onAuthOk((p) => {
      setProfile(p);
      setAuthError('');
      setScreen('lobby');
      loadLeaderboard(p.id);
      music.play('lobby');
    });
    gameSocket.onAuthError(({ message }) => setAuthError(message));

    gameSocket.onQueueStatus(({ inQueue, position }) => {
      setQueuePos(position);
      if (inQueue) {
        setScreen('queue');
        music.play('queue');
      }
    });

    gameSocket.onMatchState((state) => {
      const key = `${state.id}-${state.round}`;
      if (roundKeyRef.current !== key) {
        roundKeyRef.current = key;
        resetLocalTimer();
        music.stop();
      }

      // Play win/lose sfx once per round-result phase
      if (state.phase === 'round_result' && state.roundResults.length > 0) {
        const sfxKey = `${state.id}-r${state.round}`;
        if (roundSfxRef.current !== sfxKey) {
          roundSfxRef.current = sfxKey;
          const last = state.roundResults[state.roundResults.length - 1];
          if (!last.isDraw) {
            if (last.winnerId === state.me.id) sfx.playWin();
            else sfx.playLose();
          }
        }
      }

      setMatchState(state);
      setMatchResult(null);
      setScreen('match');
    });

    gameSocket.onMatchResult((result) => {
      music.stop(400);
      setMatchResult(result);
      setFriendRematchState('idle');
      setScreen(result.isFriendMatch ? 'friend_result' : 'result');
      resetLocalTimer(true); // also clear sfx ref for fresh next match
      const p = profileRef.current;
      if (p) {
        const me = result.player1.id === p.id ? result.player1 : result.player2;
        setProfile((prev) => prev ? { ...prev, elo: me.elo, rank: me.rank } : prev);
        if (result.winnerId === me.id) audioEngine.playWin();
        else if (!result.isDraw) audioEngine.playLose();
        loadLeaderboard(p.id);
      } else {
        loadLeaderboard();
      }
    });

    gameSocket.onFriendWaitingForRematch(() => setFriendRematchState('waiting'));
    gameSocket.onFriendOpponentWantsRematch(() => setFriendRematchState('opponent_wants'));
    gameSocket.onFriendOpponentWentLobby(() => {
      setMatchResult(null);
      setFriendRematchState('idle');
      setScreen('lobby');
      music.play('lobby');
    });

    gameSocket.onOpponentLeft(() => {
      setMatchState(null);
      resetLocalTimer();
      setScreen('lobby');
      music.play('lobby');
    });

    gameSocket.onAfkKicked(() => {
      setMatchState(null);
      resetLocalTimer();
      music.stop();
      setScreen('afk_kicked');
    });

    gameSocket.onOpponentAfk((result) => {
      setMatchResult(result);
      setMatchState(null);
      resetLocalTimer();
      setScreen('opponent_afk');
      audioEngine.playWin();
      const p2 = profileRef.current;
      if (p2) {
        const me = result.player1.id === p2.id ? result.player1 : result.player2;
        setProfile((prev) => prev ? { ...prev, elo: me.elo, rank: me.rank } : prev);
        loadLeaderboard(p2.id);
      } else {
        loadLeaderboard();
      }
    });

    return () => gameSocket.offAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (screen !== 'match' || !matchState) return;
    e.preventDefault();

    if (matchState.phase === 'playing') {
        if (!timerRunning && matchState.myState !== 'done') {
          gameSocket.startTimer();
          startTimeRef.current = performance.now();
          setTimerRunning(true);
          music.play('match'); // match music starts when player starts their timer
        } else if (timerRunning) {
          const elapsed = performance.now() - startTimeRef.current;
          setTimerRunning(false);
          gameSocket.submitTime(Math.round(elapsed));
          music.stop(600);    // fade out when timer stops
        }
      }

    if (matchState.phase === 'round_result') gameSocket.continueRound();
  }, [screen, matchState, timerRunning]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const rank = profile ? getRank(profile.elo) : null;

  return (
    <div className="app">
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <header className="header">
        <div className="logo">
          <span className="logo-icon">⏱</span>
          <h1>Chrono Duel</h1>
        </div>
        {profile && rank && (
          <div className="player-badge">
            <span className="rank-icon">{rank.icon}</span>
            <div>
              <div className="player-name">{profile.name}</div>
              <div className="player-elo" style={{ color: rank.color }}>
                {profile.elo} ELO · {rank.name}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="main">
        {screen === 'auth' && (
          <AuthScreen error={authError} setError={setAuthError} />
        )}
        {screen === 'lobby' && profile && (
          <Lobby
            profile={profile}
            leaderboard={leaderboard}
            myRank={myRank}
            onPlayRanked={() => { gameSocket.joinQueue(); setScreen('queue'); }}
          />
        )}
        {screen === 'queue' && (
          <div className="panel queue-panel">
            <div className="pulse-ring" />
            <h2>Finding opponent...</h2>
            <p className="subtitle">Queue position: #{queuePos}</p>
            <button className="btn btn-ghost" onClick={() => {
              gameSocket.leaveQueue();
              setScreen('lobby');
              music.play('lobby');
            }}>Cancel</button>
          </div>
        )}
        {screen === 'match' && matchState && (
          <MatchView state={matchState} timerRunning={timerRunning} />
        )}
        {screen === 'result' && matchResult && profile && (
          <ResultView
            result={matchResult}
            myId={profile.id}
            onNewGame={() => { setMatchResult(null); gameSocket.newGame(); setScreen('queue'); }}
            onHome={() => { setMatchResult(null); setMatchState(null); setScreen('lobby'); music.play('lobby'); }}
          />
        )}

        {screen === 'friend_result' && matchResult && profile && (
          <FriendResultView
            result={matchResult}
            myId={profile.id}
            rematchState={friendRematchState}
            onRematch={() => {
              setFriendRematchState('waiting');
              gameSocket.friendRematch();
            }}
            onLobby={() => {
              gameSocket.friendGoLobby();
              setMatchResult(null);
              setFriendRematchState('idle');
              setScreen('lobby');
              music.play('lobby');
            }}
          />
        )}
        {screen === 'afk_kicked' && (
          <div className="panel afk-panel">
            <div className="afk-icon">💤</div>
            <h2>Kicked for AFK</h2>
            <p className="subtitle">You did not press SPACE within 10 seconds.</p>
            <button className="btn btn-primary" onClick={() => { setScreen('lobby'); music.play('lobby'); }}>Back to Lobby</button>
          </div>
        )}
        {screen === 'opponent_afk' && matchResult && profile && (
          <div className="panel afk-panel">
            <div className="afk-icon">🏆</div>
            <h2>Opponent was AFK</h2>
            <p className="subtitle">Your opponent did not start in time — you win!</p>
            <p className="elo-bump">
              {eloChangeStr(
                matchResult.player1.id === profile.id
                  ? matchResult.player1.eloChange
                  : matchResult.player2.eloChange
              )} ELO
            </p>
            <div className="result-actions">
              <button className="btn btn-primary btn-glow" onClick={() => {
                setMatchResult(null); gameSocket.newGame(); setScreen('queue');
              }}>New Game</button>
              <button className="btn btn-ghost" onClick={() => { setMatchResult(null); setScreen('lobby'); music.play('lobby'); }}>Lobby</button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="rank-ladder">
          {RANKS.map((r) => (
            <span key={r.id} className="rank-chip" style={{ borderColor: r.color }}>
              {r.icon} {r.name}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────────

function AuthScreen({ error, setError }: { error: string; setError: (e: string) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    if (password.length !== 5) { setError('Code must be exactly 5 characters'); return; }
    setLoading(true);
    setError('');
    const stop = () => setLoading(false);
    gameSocket.onAuthOk(stop);
    gameSocket.onAuthError(stop);
    await audioEngine.resume();
    await music.resume();
    gameSocket.login(name.trim(), password);
  };

  return (
    <div className="auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-logo">⏱</div>
        <h2 className="auth-title">Chrono Duel</h2>
        <p className="auth-desc">Count the time. Beat your opponent. Climb the ranks.</p>

        <div className="auth-form">
          <label className="auth-label">Username</label>
          <input
            className="auth-input"
            type="text"
            placeholder="Your name..."
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <label className="auth-label">
            5-Character Code
          </label>
          <input
            className="auth-input"
            type="password"
            placeholder="e.g. ab1cd"
            value={password}
            maxLength={5}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {error && <p className="auth-error">{error}</p>}
          <button
            className="btn btn-primary btn-glow auth-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

function Lobby({
  profile,
  leaderboard,
  myRank,
  onPlayRanked,
}: {
  profile: PlayerProfile;
  leaderboard: PlayerProfile[];
  myRank: number | null;
  onPlayRanked: () => void;
}) {
  const [panel, setPanel] = useState<LobbyPanel>('home');
  const rank = getRank(profile.elo);
  const isInTop10 = leaderboard.some((p) => p.id === profile.id);

  return (
    <div className="lobby">
      {panel === 'home' && (
        <>
          <div className="panel hero">
            <div className="lobby-profile">
              <span className="rank-icon-lg">{rank.icon}</span>
              <div className="lobby-profile-info">
                <span className="lobby-username">{profile.name}</span>
                <span className="lobby-rank-label" style={{ color: rank.color }}>
                  {rank.name} · {profile.elo} ELO
                </span>
              </div>
              <div className="lobby-stats">
                <div className="stat-pill"><span>W</span><strong>{profile.wins}</strong></div>
                <div className="stat-pill"><span>L</span><strong>{profile.losses}</strong></div>
              </div>
            </div>

            <p className="hero-desc">
              A target time appears — e.g. <span className="timer-num">3.43s</span>.
              Start your hidden timer, count in your head, stop when you think the time
              is up. Closest to the target wins. Best of 3.
            </p>

            <div className="play-buttons">
              <button className="btn-play btn-play-ranked" onClick={onPlayRanked}>
                <span className="play-btn-icon">🏆</span>
                <span className="play-btn-label">Play Ranked</span>
                <span className="play-btn-sub">Compete for ELO</span>
              </button>
              <button className="btn-play btn-play-friend" onClick={() => setPanel('friend')}>
                <span className="play-btn-icon">👥</span>
                <span className="play-btn-label">Play with Friend</span>
                <span className="play-btn-sub">Private match</span>
              </button>
            </div>
          </div>

          <div className="panel leaderboard">
            <h3>🏆 Top 10</h3>
            {leaderboard.length === 0 ? (
              <p className="empty">Be the first ranked player!</p>
            ) : (
              <>
                <ol>
                  {leaderboard.map((p, i) => {
                    const r = getRank(p.elo);
                    return (
                      <li key={p.id} className={p.id === profile.id ? 'lb-me' : ''}>
                        <span className="lb-pos">#{i + 1}</span>
                        <span className="lb-name">{p.name}</span>
                        <span className="lb-rank" style={{ color: r.color }}>{r.icon} {r.name}</span>
                        <span className="lb-elo">{p.elo}</span>
                      </li>
                    );
                  })}
                </ol>

                {!isInTop10 && myRank !== null && (
                  <>
                    <div className="lb-separator">· · ·</div>
                    <ol className="lb-myrow-list">
                      <li className="lb-me lb-my-rank">
                        <span className="lb-pos">#{myRank}</span>
                        <span className="lb-name">
                          {profile.name}
                          <span className="lb-you-tag">YOU</span>
                        </span>
                        <span className="lb-rank" style={{ color: rank.color }}>{rank.icon} {rank.name}</span>
                        <span className="lb-elo">{profile.elo}</span>
                      </li>
                    </ol>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {panel === 'friend' && (
        <FriendPanel onBack={() => setPanel('home')} />
      )}
    </div>
  );
}

// ── Friend Panel ──────────────────────────────────────────────────────────────

type FriendView = 'choose' | 'creating' | 'joining' | 'friend_joined';

function FriendPanel({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<FriendView>('choose');
  const [partyCode, setPartyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    gameSocket.onPartyCreated(({ code }) => {
      setPartyCode(code);
      setView('creating');
    });
    gameSocket.onPartyCancelled(() => {
      setPartyCode('');
      setView('choose');
    });
    gameSocket.onPartyError(({ message }) => {
      setJoinError(message);
    });
    // Host gets this when the joiner enters the code — show brief feedback before match loads
    gameSocket.onPartyFriendJoined(() => {
      setView('friend_joined');
    });

    // Only remove party listeners — never touch match:state or other App listeners
    return () => gameSocket.offPartyListeners();
  }, []);

  const handleCreate = () => {
    gameSocket.createParty();
  };

  const handleCancel = () => {
    gameSocket.cancelParty();
  };

  const handleJoin = () => {
    if (joinCode.trim().length < 4) { setJoinError('Enter the code'); return; }
    setJoinError('');
    gameSocket.joinParty(joinCode.trim());
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(partyCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="panel friend-panel">
      <button className="btn-back" onClick={() => { handleCancel(); onBack(); }}>
        ← Back
      </button>

      {view === 'choose' && (
        <>
          <h2 className="friend-title">Play with a Friend</h2>
          <p className="friend-desc">Create a private match or join one with a code.</p>
          <div className="friend-options">
            <button className="btn-play btn-play-ranked" onClick={handleCreate}>
              <span className="play-btn-icon">🎲</span>
              <span className="play-btn-label">Create Party</span>
              <span className="play-btn-sub">Get a code to share</span>
            </button>
            <button className="btn-play btn-play-friend" onClick={() => setView('joining')}>
              <span className="play-btn-icon">🔑</span>
              <span className="play-btn-label">Join with Code</span>
              <span className="play-btn-sub">Enter a friend's code</span>
            </button>
          </div>
        </>
      )}

      {view === 'creating' && (
        <div className="party-create-view">
          <h2 className="friend-title">Waiting for Friend</h2>
          <p className="friend-desc">Share this code with your friend:</p>
          <div className="party-code-box" onClick={handleCopy} title="Click to copy">
            <span className="party-code-text">{partyCode}</span>
            <span className="party-copy-hint">{copied ? '✓ Copied!' : 'Click to copy'}</span>
          </div>
          <div className="pulse-ring" style={{ marginTop: '1.5rem' }} />
          <button className="btn btn-ghost" style={{ marginTop: '1.5rem' }} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}

      {view === 'friend_joined' && (
        <div className="party-create-view">
          <div className="afk-icon">🎮</div>
          <h2 className="friend-title">Friend joined!</h2>
          <p className="friend-desc">Starting match...</p>
          <div className="pulse-ring" style={{ marginTop: '1rem' }} />
        </div>
      )}

      {view === 'joining' && (
        <div className="party-join-view">
          <h2 className="friend-title">Join a Party</h2>
          <p className="friend-desc">Enter the code your friend shared:</p>
          <input
            className="auth-input code-input"
            type="text"
            placeholder="ABC123"
            value={joinCode}
            maxLength={6}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            autoFocus
          />
          {joinError && <p className="auth-error">{joinError}</p>}
          <button className="btn btn-primary btn-glow" style={{ width: '100%' }} onClick={handleJoin}>
            Join Match
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setJoinError(''); setView('choose'); }}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

// ── AFK Countdown hook ────────────────────────────────────────────────────────

function useAfkCountdown(deadline: number, active: boolean): number {
  const [remaining, setRemaining] = useState(10);
  useEffect(() => {
    if (!active) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadline, active]);
  return remaining;
}

// ── Player Slot ───────────────────────────────────────────────────────────────

function PlayerSlot({
  side, name, state, timeMs, targetMs, afkCountdown, isMe, timerRunning,
}: {
  side: 'left' | 'right';
  name: string;
  state: PlayerPlayState;
  timeMs: number | null;
  targetMs: number | null;
  afkCountdown?: number;
  isMe?: boolean;
  timerRunning?: boolean;
}) {
  return (
    <div className={`player-slot ${side} ${isMe ? 'is-me' : 'is-opp'}`}>
      <span className="slot-label">{isMe ? 'YOU' : name.toUpperCase()}</span>

      {state === 'idle' && (
        <div className="slot-idle">
          {isMe ? (
            <p className="slot-action">
              Press <kbd>SPACE</kbd> to start
              {afkCountdown !== undefined && afkCountdown > 0 && (
                <span className="afk-countdown"> {afkCountdown}</span>
              )}
            </p>
          ) : (
            <p className="slot-waiting">Waiting to start...</p>
          )}
        </div>
      )}

      {state === 'running' && (
        <div className={`slot-running ${timerRunning || !isMe ? 'active' : ''}`}>
          <div className="hidden-timer-icon">⏳</div>
          <p>{isMe ? 'Counting...' : 'Timing...'}</p>
          {isMe && <p className="slot-hint">Press <kbd>SPACE</kbd> to stop</p>}
        </div>
      )}

      {state === 'done' && timeMs !== null && (
        <div className="slot-done">
          <strong className="timer-num">{formatMs(timeMs)}</strong>
          {targetMs !== null && (
            <span className="diff">off by {formatMs(Math.abs(timeMs - targetMs))}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Match View ────────────────────────────────────────────────────────────────

function MatchView({ state, timerRunning }: { state: MatchState; timerRunning: boolean }) {
  const myWins = state.isPlayer1 ? state.player1Wins : state.player2Wins;
  const oppWins = state.isPlayer1 ? state.player2Wins : state.player1Wins;
  const afkActive = state.phase === 'playing' && state.myState === 'idle' && !timerRunning;
  const afkCountdown = useAfkCountdown(state.afkDeadlineAt, afkActive);
  const myDisplayState: PlayerPlayState =
    timerRunning && state.myState !== 'done' ? 'running' : state.myState;
  const lastRound = state.roundResults[state.roundResults.length - 1];

  return (
    <div className="match">
      <div className="match-header panel">
        <div className="score-bar">
          <span className="score-name">{state.me.name}</span>
          <span className="score">{myWins} — {oppWins}</span>
          <span className="score-name">{state.opponent.name}</span>
        </div>
        <div className="round-indicator">Round {state.round} / {state.maxRounds}</div>
      </div>

      {state.phase === 'playing' && (
        <div className="game-area panel">
          <p className="phase-label">TARGET TIME</p>
          <div className="target-display timer-num">{state.targetFormatted}s</div>
          <div className="dual-slots">
            <PlayerSlot side="left" name={state.me.name} state={myDisplayState}
              timeMs={state.myTimeMs} targetMs={state.targetMs}
              afkCountdown={afkCountdown} isMe timerRunning={timerRunning} />
            <div className="slots-divider" />
            <PlayerSlot side="right" name={state.opponent.name} state={state.opponentState}
              timeMs={state.opponentTimeMs} targetMs={state.targetMs} />
          </div>
        </div>
      )}

      {state.phase === 'round_result' && lastRound && (() => {
        const myTime = state.isPlayer1 ? lastRound.player1TimeMs : lastRound.player2TimeMs;
        const oppTime = state.isPlayer1 ? lastRound.player2TimeMs : lastRound.player1TimeMs;
        const won = lastRound.winnerId === state.me.id;
        return (
          <div className="game-area panel">
            <p className="phase-label">ROUND {state.round} RESULT</p>
            <div className={`round-verdict ${won ? 'win' : lastRound.isDraw ? 'draw' : 'lose'}`}>
              {lastRound.isDraw ? 'DRAW' : won ? 'ROUND WON!' : 'ROUND LOST'}
            </div>
            <p className="target-ref">
              Target: <span className="timer-num">{formatMs(lastRound.targetMs)}</span>
            </p>
            <div className="dual-slots">
              <PlayerSlot side="left" name={state.me.name} state="done" timeMs={myTime} targetMs={lastRound.targetMs} isMe />
              <div className="slots-divider" />
              <PlayerSlot side="right" name={state.opponent.name} state="done" timeMs={oppTime} targetMs={lastRound.targetMs} />
            </div>
            <p className="hint">
              Press <kbd>SPACE</kbd> for next round
              {state.readyCount < 2 && ` (${state.readyCount}/2 ready)`}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Result View ───────────────────────────────────────────────────────────────

function ResultView({
  result, myId, onNewGame, onHome,
}: {
  result: MatchResult;
  myId: string;
  onNewGame: () => void;
  onHome: () => void;
}) {
  const me = result.player1.id === myId ? result.player1 : result.player2;
  const opp = result.player1.id === myId ? result.player2 : result.player1;
  const won = result.winnerId === myId;
  const draw = result.isDraw;
  const myWins = result.player1.id === myId ? result.player1Wins : result.player2Wins;
  const oppWins = result.player1.id === myId ? result.player2Wins : result.player1Wins;

  return (
    <div className="panel result-panel">
      <div className={`result-banner ${draw ? 'draw' : won ? 'win' : 'lose'}`}>
        {draw ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT'}
      </div>

      <div className="elo-row">
        <div className="elo-card">
          <span className="elo-name">{me.name}</span>
          <span className="elo-new" style={{ color: me.rank.color }}>{me.elo} ELO</span>
          <span className={`elo-delta ${me.eloChange >= 0 ? 'pos' : 'neg'}`}>
            {eloChangeStr(me.eloChange)}
          </span>
          <span className="elo-rank">{me.rank.icon} {me.rank.name}</span>
        </div>
        <div className="final-score">
          <span>{myWins}</span>
          <span className="score-sep">—</span>
          <span>{oppWins}</span>
        </div>
        <div className="elo-card">
          <span className="elo-name">{opp.name}</span>
          <span className="elo-new" style={{ color: opp.rank.color }}>{opp.elo} ELO</span>
          <span className={`elo-delta ${opp.eloChange >= 0 ? 'pos' : 'neg'}`}>
            {eloChangeStr(opp.eloChange)}
          </span>
          <span className="elo-rank">{opp.rank.icon} {opp.rank.name}</span>
        </div>
      </div>

      <div className="round-history">
        <h4>Round History</h4>
        {result.roundResults.map((r) => {
          const myTime = result.player1.id === myId ? r.player1TimeMs : r.player2TimeMs;
          const oppTime = result.player1.id === myId ? r.player2TimeMs : r.player1TimeMs;
          const myDiff = myTime !== null ? Math.abs(myTime - r.targetMs) : null;
          const oppDiff = oppTime !== null ? Math.abs(oppTime - r.targetMs) : null;
          const iWon = r.winnerId === myId;
          return (
            <div key={r.round} className={`history-row ${r.isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
              <span className="hr-round">R{r.round}</span>
              <span className="hr-target">🎯 <span className="timer-num">{formatMs(r.targetMs)}</span></span>
              <span className="hr-me">
                You: <span className="timer-num">{myTime !== null ? formatMs(myTime) : '—'}</span>
                {myDiff !== null && <span className="hr-diff"> ({formatMs(myDiff)} off)</span>}
              </span>
              <span className="hr-opp">
                {opp.name}: <span className="timer-num">{oppTime !== null ? formatMs(oppTime) : '—'}</span>
                {oppDiff !== null && <span className="hr-diff"> ({formatMs(oppDiff)} off)</span>}
              </span>
              <span className={`hr-badge ${r.isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
                {r.isDraw ? 'Draw' : iWon ? 'W' : 'L'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="result-actions">
        <button className="btn btn-primary btn-glow" onClick={onNewGame}>New Game</button>
        <button className="btn btn-ghost" onClick={onHome}>Lobby</button>
      </div>
    </div>
  );
}

// ── Friend Result View ────────────────────────────────────────────────────────

function FriendResultView({
  result,
  myId,
  rematchState,
  onRematch,
  onLobby,
}: {
  result: MatchResult;
  myId: string;
  rematchState: 'idle' | 'waiting' | 'opponent_wants';
  onRematch: () => void;
  onLobby: () => void;
}) {
  const me = result.player1.id === myId ? result.player1 : result.player2;
  const opp = result.player1.id === myId ? result.player2 : result.player1;
  const won = result.winnerId === myId;
  const draw = result.isDraw;
  const myWins = result.player1.id === myId ? result.player1Wins : result.player2Wins;
  const oppWins = result.player1.id === myId ? result.player2Wins : result.player1Wins;

  return (
    <div className="panel result-panel">
      <div className={`result-banner ${draw ? 'draw' : won ? 'win' : 'lose'}`}>
        {draw ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT'}
      </div>

      <div className="elo-row">
        <div className="elo-card">
          <span className="elo-name">{me.name}</span>
          <span className="elo-new" style={{ color: me.rank.color }}>{me.elo} ELO</span>
          <span className={`elo-delta ${me.eloChange >= 0 ? 'pos' : 'neg'}`}>
            {eloChangeStr(me.eloChange)}
          </span>
          <span className="elo-rank">{me.rank.icon} {me.rank.name}</span>
        </div>
        <div className="final-score">
          <span>{myWins}</span>
          <span className="score-sep">—</span>
          <span>{oppWins}</span>
        </div>
        <div className="elo-card">
          <span className="elo-name">{opp.name}</span>
          <span className="elo-new" style={{ color: opp.rank.color }}>{opp.elo} ELO</span>
          <span className={`elo-delta ${opp.eloChange >= 0 ? 'pos' : 'neg'}`}>
            {eloChangeStr(opp.eloChange)}
          </span>
          <span className="elo-rank">{opp.rank.icon} {opp.rank.name}</span>
        </div>
      </div>

      <div className="round-history">
        <h4>Round History</h4>
        {result.roundResults.map((r) => {
          const myTime = result.player1.id === myId ? r.player1TimeMs : r.player2TimeMs;
          const oppTime = result.player1.id === myId ? r.player2TimeMs : r.player1TimeMs;
          const myDiff = myTime !== null ? Math.abs(myTime - r.targetMs) : null;
          const oppDiff = oppTime !== null ? Math.abs(oppTime - r.targetMs) : null;
          const iWon = r.winnerId === myId;
          return (
            <div key={r.round} className={`history-row ${r.isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
              <span className="hr-round">R{r.round}</span>
              <span className="hr-target">🎯 <span className="timer-num">{formatMs(r.targetMs)}</span></span>
              <span className="hr-me">
                You: <span className="timer-num">{myTime !== null ? formatMs(myTime) : '—'}</span>
                {myDiff !== null && <span className="hr-diff"> ({formatMs(myDiff)} off)</span>}
              </span>
              <span className="hr-opp">
                {opp.name}: <span className="timer-num">{oppTime !== null ? formatMs(oppTime) : '—'}</span>
                {oppDiff !== null && <span className="hr-diff"> ({formatMs(oppDiff)} off)</span>}
              </span>
              <span className={`hr-badge ${r.isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
                {r.isDraw ? 'Draw' : iWon ? 'W' : 'L'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Friend rematch controls */}
      <div className="friend-rematch-area">
        {rematchState === 'idle' && (
          <div className="result-actions">
            <button className="btn btn-primary btn-glow" onClick={onRematch}>
              🔁 Rematch
            </button>
            <button className="btn btn-ghost" onClick={onLobby}>
              Lobby
            </button>
          </div>
        )}

        {rematchState === 'waiting' && (
          <div className="friend-rematch-waiting">
            <div className="pulse-ring small" />
            <p>Waiting for <strong>{opp.name}</strong> to accept rematch...</p>
            <button className="btn btn-ghost" onClick={onLobby}>
              Cancel — Go to Lobby
            </button>
          </div>
        )}

        {rematchState === 'opponent_wants' && (
          <div className="friend-rematch-notify">
            <p><strong>{opp.name}</strong> wants a rematch!</p>
            <div className="result-actions">
              <button className="btn btn-primary btn-glow" onClick={onRematch}>
                🔁 Accept Rematch
              </button>
              <button className="btn btn-ghost" onClick={onLobby}>
                Decline — Lobby
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
