// Local-storage backed catalog store for Dev Mode (no backend)
const K_GAMES = "gv_dev_games";
const K_SESSIONS = "gv_dev_sessions";

function readArr(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } }
function writeArr(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 14);
}

export const devStore = {
  listGames({ status, platform, year, sort } = {}) {
    let games = readArr(K_GAMES);
    if (status) games = games.filter((g) => g.status === status);
    if (platform) games = games.filter((g) => (g.platform || "").toLowerCase().includes(platform.toLowerCase()));
    if (year) games = games.filter((g) => g.release_year === Number(year));
    const sorters = {
      created_desc: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      alpha_asc: (a, b) => (a.title || "").localeCompare(b.title || ""),
      alpha_desc: (a, b) => (b.title || "").localeCompare(a.title || ""),
      year_desc: (a, b) => (b.release_year || 0) - (a.release_year || 0),
      year_asc: (a, b) => (a.release_year || 0) - (b.release_year || 0),
    };
    games.sort(sorters[sort] || sorters.created_desc);
    return games;
  },
  getGame(id) { return readArr(K_GAMES).find((g) => g.game_id === id); },
  createGame(g) {
    const games = readArr(K_GAMES);
    const now = new Date().toISOString();
    const game = { game_id: uid("game"), created_at: now, updated_at: now, gallery: [], ...g };
    games.unshift(game);
    writeArr(K_GAMES, games);
    return game;
  },
  updateGame(id, patch) {
    const games = readArr(K_GAMES);
    const idx = games.findIndex((g) => g.game_id === id);
    if (idx === -1) return null;
    games[idx] = { ...games[idx], ...patch, updated_at: new Date().toISOString() };
    writeArr(K_GAMES, games);
    return games[idx];
  },
  deleteGame(id) {
    writeArr(K_GAMES, readArr(K_GAMES).filter((g) => g.game_id !== id));
    writeArr(K_SESSIONS, readArr(K_SESSIONS).filter((s) => s.game_id !== id));
  },
  addSession(gameId, payload) {
    const sessions = readArr(K_SESSIONS);
    const s = { session_id: uid("sess"), game_id: gameId, created_at: new Date().toISOString(), ...payload };
    sessions.unshift(s);
    writeArr(K_SESSIONS, sessions);
    return s;
  },
  listSessions(gameId) {
    return readArr(K_SESSIONS).filter((s) => s.game_id === gameId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
  listAllSessions() {
    const sessions = readArr(K_SESSIONS);
    const games = readArr(K_GAMES);
    const gmap = Object.fromEntries(games.map((g) => [g.game_id, g]));
    return sessions.map((s) => ({ ...s, game: gmap[s.game_id] })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
  deleteSession(id) {
    writeArr(K_SESSIONS, readArr(K_SESSIONS).filter((s) => s.session_id !== id));
  },
  stats() {
    const games = readArr(K_GAMES);
    const sessions = readArr(K_SESSIONS);
    const by_status = {}; const by_platform = {};
    games.forEach((g) => {
      by_status[g.status || "Backlog"] = (by_status[g.status || "Backlog"] || 0) + 1;
      const p = g.platform || "Other";
      by_platform[p] = (by_platform[p] || 0) + 1;
    });
    return {
      total_games: games.length,
      by_status,
      by_platform,
      total_play_minutes: sessions.reduce((a, s) => a + (s.duration_minutes || 0), 0),
      total_sessions: sessions.length,
    };
  },
};
