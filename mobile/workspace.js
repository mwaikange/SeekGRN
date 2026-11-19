const supportedPages = new Set(['/', '/mobile', '/request-account-removal']);

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
