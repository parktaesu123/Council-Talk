const EMOJI_HUB_ALL_URL = "https://emojihub.yurace.pro/api/all";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const decodeUnicodeCodepoints = (unicodeList = []) =>
  unicodeList
    .map((entry) => Number.parseInt(String(entry || "").replace(/^U\+/, ""), 16))
    .filter(Number.isFinite);

const toEmojiRecord = (item) => ({
  category: item.category || "",
  emoji: String.fromCodePoint(...decodeUnicodeCodepoints(item.unicode)),
  group: item.group || "",
  name: item.name || "",
  unicode: Array.isArray(item.unicode) ? item.unicode : [],
});

export const createEmojiHubClient = ({ fetchImpl = fetch, now = () => Date.now() } = {}) => {
  let cache = {
    expiresAt: 0,
    items: [],
  };

  const loadAll = async () => {
    if (cache.expiresAt > now() && cache.items.length > 0) {
      return cache.items;
    }

    const response = await fetchImpl(EMOJI_HUB_ALL_URL, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`EmojiHub request failed: ${response.status}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload.map(toEmojiRecord).filter((item) => item.emoji) : [];

    cache = {
      expiresAt: now() + CACHE_TTL_MS,
      items,
    };

    return items;
  };

  return {
    async search({ limit = 120, query = "" } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number(limit) || 120, 300));
      const normalizedQuery = String(query || "").trim().toLowerCase();
      const items = await loadAll();

      const filtered = normalizedQuery
        ? items.filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.group.toLowerCase().includes(normalizedQuery) ||
              item.category.toLowerCase().includes(normalizedQuery),
          )
        : items.filter((item) => item.category === "smileys and people").slice(0, 180);

      return filtered.slice(0, normalizedLimit);
    },
  };
};
