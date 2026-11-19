const supportedPages = new Set(['/', '/mobile', '/request-account-removal']);
const authorizeUrl = 'https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/authorize';
export const oauthRedirectUrl = 'com.mwaikange.seekgrnjobs://auth/callback';

function queryAt(url, base) {
  if (typeof url !== 'string' || url.length > 8192 || !url.startsWith(base + '?') || url.includes('#')) return null;
  try { return new URLSearchParams(url.slice(base.length + 1)); } catch { return null; }
}

export function isOAuthLaunch(url) {
  const query = queryAt(url, authorizeUrl);
  if (!query || ['provider', 'redirect_to', 'code_challenge', 'code_challenge_method'].some(key => query.getAll(key).length !== 1)) return false;
  return ['google', 'apple'].includes(query.get('provider')) && query.get('redirect_to') === oauthRedirectUrl &&
    query.get('code_challenge_method')?.toLowerCase() === 's256' && /^[A-Za-z0-9_-]{43}$/.test(query.get('code_challenge') ?? '');
}

export function readOAuthCallback(url) {
  const query = queryAt(url, oauthRedirectUrl);
  if (!query) return null;
  if (query.has('error') || query.has('error_code')) return { error: 'The sign-in provider could not authorize this request.' };
  const code = query.get('code');
  if (query.getAll('code').length !== 1 || !/^[A-Za-z0-9_-]{1,512}$/.test(code ?? '')) return null;
  return { code };
}

export function isWorkspace(origin, url) {
  if (url === origin) return true;
  if (typeof url !== 'string' || !url.startsWith(origin + '/')) return false;
  return supportedPages.has(url.slice(origin.length).split(/[?#]/, 1)[0]);
}

export function startsDocument(previousUrl, { url, loading }) {
  if (!loading) return false;
  // Android also sends onLoadStart for fragment navigation within the same page.
  return url === previousUrl || url.split('#', 1)[0] !== previousUrl.split('#', 1)[0];
}
