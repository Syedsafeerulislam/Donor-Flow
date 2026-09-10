const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') || 'http://localhost:3000';

/**
 * Resolves a banner/logo path returned by the API into a fully-qualified URL.
 * Uploaded files are now stored in Supabase Storage and returned as absolute URLs;
 * this also stays backward-compatible with any pre-existing relative `/uploads/...` paths.
 */
export function resolveMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}
