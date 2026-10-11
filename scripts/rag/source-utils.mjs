// Public source reads: bounded requests/retries and complete pagination.
export async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers = { accept: 'application/json', 'user-agent': 'ssai-rag-refresh' };
      if (new URL(url).hostname === 'api.github.com' && process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        const error = new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return { data: await response.json(), next: response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null };
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function fetchJsonPages(url) {
  const items = [], seen = new Set(), origin = new URL(url).origin;
  for (let page = 0; url && page < 30; page++) {
    if (seen.has(url) || new URL(url).origin !== origin) throw new Error('Invalid source pagination link.');
    seen.add(url);
    const { data, next } = await fetchJson(url);
    if (!Array.isArray(data)) throw new Error('Public source returned an unexpected shape.');
    items.push(...data);
    url = next;
  }
  if (url) throw new Error('Public source exceeded pagination bound; refusing a partial catalog.');
  return items;
}
