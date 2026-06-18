export function expectedScore(playerElo, opponentElo) {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}
export function kFactor(elo) {
    if (elo < 1200)
        return 40;
    if (elo < 1600)
        return 32;
    return 24;
}
export function calculateEloChange(playerElo, opponentElo, score) {
    const expected = expectedScore(playerElo, opponentElo);
    const k = kFactor(playerElo);
    return Math.round(k * (score - expected));
}
export function randomTargetMs() {
    const min = 1500;
    const max = 8000;
    const ms = min + Math.random() * (max - min);
    return Math.round(ms);
}
export function formatMs(ms) {
    return (ms / 1000).toFixed(2);
}
