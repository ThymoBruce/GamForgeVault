import { api } from "@/lib/api";
import { devStore } from "@/lib/devStore";

// Adapter: uses backend if devMode is OFF, localStorage otherwise.
export function makeService(devMode) {
  if (devMode) {
    return {
      listGames: async (params = {}) => devStore.listGames(params),
      getGame: async (id) => devStore.getGame(id),
      createGame: async (g) => devStore.createGame(g),
      updateGame: async (id, p) => devStore.updateGame(id, p),
      deleteGame: async (id) => devStore.deleteGame(id),
      addSession: async (gid, p) => devStore.addSession(gid, p),
      listSessions: async (gid) => devStore.listSessions(gid),
      listAllSessions: async () => devStore.listAllSessions(),
      deleteSession: async (id) => devStore.deleteSession(id),
      stats: async () => devStore.stats(),
      uploadFile: async (file) => {
        // Convert to base64 data URL for local dev
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => resolve({ url: reader.result, path: file.name });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      },
      lookupBarcode: async (barcode) => {
        const { data } = await api.post("/games/lookup-barcode", { barcode }, { withCredentials: false, headers: {} }).catch(() => ({ data: { barcode, eandata: null, title_guess: "", rawg_candidates: [] }}));
        return data;
      },
      rawgSearch: async (q) => {
        const { data } = await api.get(`/games/rawg-search?q=${encodeURIComponent(q)}`).catch(() => ({ data: { results: [] }}));
        return data.results || [];
      },
      searchUsers: async () => [],
      sendFriendRequest: async () => ({ ok: true }),
      listFriends: async () => [],
      listPending: async () => ({ incoming: [], outgoing: [] }),
      acceptRequest: async () => ({ ok: true }),
      declineRequest: async () => ({ ok: true }),
      friendGames: async () => ({ user: null, games: [] }),
    };
  }
  return {
    listGames: async (params = {}) => (await api.get("/games", { params })).data,
    getGame: async (id) => (await api.get(`/games/${id}`)).data,
    createGame: async (g) => (await api.post("/games", g)).data,
    updateGame: async (id, p) => (await api.put(`/games/${id}`, p)).data,
    deleteGame: async (id) => (await api.delete(`/games/${id}`)).data,
    addSession: async (gid, p) => (await api.post(`/games/${gid}/sessions`, p)).data,
    listSessions: async (gid) => (await api.get(`/games/${gid}/sessions`)).data,
    listAllSessions: async () => (await api.get("/sessions/all")).data,
    deleteSession: async (id) => (await api.delete(`/sessions/${id}`)).data,
    stats: async () => (await api.get("/stats")).data,
    uploadFile: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const backend = process.env.REACT_APP_BACKEND_URL;
      return { url: backend + data.url, path: data.path };
    },
    lookupBarcode: async (barcode) => (await api.post("/games/lookup-barcode", { barcode })).data,
    rawgSearch: async (q) => (await api.get(`/games/rawg-search?q=${encodeURIComponent(q)}`)).data.results || [],
    searchUsers: async (q) => (await api.get(`/users/search?q=${encodeURIComponent(q)}`)).data,
    sendFriendRequest: async (to_user_id) => (await api.post("/friends/request", { to_user_id })).data,
    listFriends: async () => (await api.get("/friends")).data,
    listPending: async () => (await api.get("/friends/pending")).data,
    acceptRequest: async (id) => (await api.post(`/friends/accept/${id}`)).data,
    declineRequest: async (id) => (await api.post(`/friends/decline/${id}`)).data,
    friendGames: async (uid) => (await api.get(`/users/${uid}/games`)).data,
  };
}
