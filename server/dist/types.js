export const AFK_TIMEOUT_MS = 10_000;
export const STARTING_ELO = 1000;
// Starting ELO is 1000 → Gold. Gaps of ~100-150 so ~6-10 wins per rank.
export const RANKS = [
    { id: 'bronze', name: 'Bronze', minElo: 0, color: '#cd7f32', icon: '🥉' },
    { id: 'silver', name: 'Silver', minElo: 800, color: '#c0c0c0', icon: '🥈' },
    { id: 'gold', name: 'Gold', minElo: 1000, color: '#ffd700', icon: '🥇' },
    { id: 'platinum', name: 'Platinum', minElo: 1100, color: '#00d4aa', icon: '💎' },
    { id: 'diamond', name: 'Diamond', minElo: 1200, color: '#7b68ee', icon: '💠' },
    { id: 'master', name: 'Master', minElo: 1350, color: '#ff4466', icon: '👑' },
    { id: 'grandmaster', name: 'Grandmaster', minElo: 1500, color: '#ff00ff', icon: '⚡' },
];
export function getRank(elo) {
    let rank = RANKS[0];
    for (const r of RANKS) {
        if (elo >= r.minElo)
            rank = r;
    }
    return rank;
}
