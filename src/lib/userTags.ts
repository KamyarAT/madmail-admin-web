/**
 * Admin-only user tags stored in browser localStorage.
 *
 * Never send these values to the Madmail admin API — they exist only on this device
 * so operators can label accounts without storing PII on the server.
 */

export const STORAGE_KEY = 'madmail_user_tags';

/** Max characters per tag (after trim). */
export const MAX_TAG_LENGTH = 64;

/** Max tags per user. */
export const MAX_TAGS_PER_USER = 10;

/** Full store: serverKey → username → tags */
export type UserTagsStore = Record<string, Record<string, string[]>>;

export function serverKeyFromBaseUrl(baseUrl: string): string {
    const raw = (baseUrl || '').trim();
    if (!raw) return 'default';
    try {
        const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
        return u.origin.toLowerCase();
    } catch {
        return raw.toLowerCase();
    }
}

export function normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
}

export function normalizeTag(tag: string): string {
    return tag.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

function readStore(): UserTagsStore {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as UserTagsStore;
    } catch {
        return {};
    }
}

function writeStore(store: UserTagsStore): void {
    if (typeof localStorage === 'undefined') return;
    try {
        if (Object.keys(store).length === 0) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Quota or private mode — ignore
    }
}

export function getTags(serverKey: string, username: string): string[] {
    const sk = serverKey || 'default';
    const u = normalizeUsername(username);
    if (!u) return [];
    const tags = readStore()[sk]?.[u];
    return Array.isArray(tags) ? [...tags] : [];
}

export function setTags(serverKey: string, username: string, tags: string[]): void {
    const sk = serverKey || 'default';
    const u = normalizeUsername(username);
    if (!u) return;

    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const t of tags) {
        const n = normalizeTag(t);
        if (!n) continue;
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(n);
        if (cleaned.length >= MAX_TAGS_PER_USER) break;
    }

    const store = readStore();
    if (!store[sk]) store[sk] = {};
    if (cleaned.length === 0) {
        delete store[sk][u];
        if (Object.keys(store[sk]).length === 0) delete store[sk];
    } else {
        store[sk][u] = cleaned;
    }
    writeStore(store);
}

export function addTag(serverKey: string, username: string, tag: string): string[] {
    const n = normalizeTag(tag);
    if (!n) return getTags(serverKey, username);
    const current = getTags(serverKey, username);
    if (current.some((t) => t.toLowerCase() === n.toLowerCase())) {
        return current;
    }
    if (current.length >= MAX_TAGS_PER_USER) return current;
    const next = [...current, n];
    setTags(serverKey, username, next);
    return next;
}

export function removeTag(serverKey: string, username: string, tag: string): string[] {
    const key = tag.trim().toLowerCase();
    const next = getTags(serverKey, username).filter((t) => t.toLowerCase() !== key);
    setTags(serverKey, username, next);
    return next;
}

export function clearUser(serverKey: string, username: string): void {
    setTags(serverKey, username, []);
}

/** True if any tag for the user contains the query (case-insensitive). */
export function tagsMatchQuery(serverKey: string, username: string, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return getTags(serverKey, username).some((t) => t.toLowerCase().includes(q));
}
