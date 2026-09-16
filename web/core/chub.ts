// Importing a character from a Chub link.
//
// Chub's API is blocked in some countries, but its image CDN is not, and it
// serves every character as a V2 PNG card that browsers are allowed to fetch.

const HOSTS = new Set(['chub.ai', 'www.chub.ai', 'characterhub.org', 'www.characterhub.org']);

/**
 * "creator/name" from a character page link, or null if the link is not one.
 * Accepts https://chub.ai/characters/creator/name and the characterhub.org
 * equivalent, with or without the scheme, query or trailing path.
 */
export function chubPath(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'characters') return null;
  const segments = parts.slice(1, 3).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return '';
    }
  });
  if (segments.some((s) => !s || s === '.' || s === '..')) return null;
  return segments.map(encodeURIComponent).join('/');
}

export const chubCardUrl = (path: string) => `https://avatars.charhub.io/avatars/${path}/chara_card_v2.png`;
