// functions/proxy/[[path]].js

// --- Configuration read from environment variables ---
// See comments in original code for env var instructions
// --- Constants ---
const MEDIA_FILE_EXTENSIONS = [
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.f4v', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.alac', '.aiff', '.opus',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.avif', '.heic',
    '.vtt', '.srt', '.ass' // subtitles extensions
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/', 'text/vtt', 'application/x-subrip', 'text/plain'];
const M3U8_CONTENT_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl'];
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_CACHE_TTL = 86400; // 24 hours
const DEFAULT_MAX_RECURSION = 5;

// --- Global state ---
let DEBUG_ENABLED = false;
let CACHE_TTL = DEFAULT_CACHE_TTL;
let MAX_RECURSION = DEFAULT_MAX_RECURSION;
let USER_AGENTS = [DEFAULT_USER_AGENT];
let KV_NAMESPACE = null;

/** Log debug messages if enabled */
function logDebug(msg) {
  if (DEBUG_ENABLED) console.log(`[Proxy Func DEBUG] ${msg}`);
}

/** Log error messages */
function logError(msg, err) {
  console.error(`[Proxy Func ERROR] ${msg}`, err || '');
}

/** Initialize config from env vars */
function initializeConfig(env) {
  DEBUG_ENABLED = env.DEBUG === 'true';
  const ttl = parseInt(env.CACHE_TTL, 10);
  CACHE_TTL = !isNaN(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL;
  if (ttl !== CACHE_TTL) logDebug(`Invalid CACHE_TTL, using default ${CACHE_TTL}s`);

  const maxRec = parseInt(env.MAX_RECURSION, 10);
  MAX_RECURSION = !isNaN(maxRec) && maxRec > 0 ? maxRec : DEFAULT_MAX_RECURSION;
  if (maxRec !== MAX_RECURSION) logDebug(`Invalid MAX_RECURSION, using default ${MAX_RECURSION}`);

  try {
    const uaJson = env.USER_AGENTS_JSON;
    if (uaJson) {
      const parsed = JSON.parse(uaJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        USER_AGENTS = parsed;
        logDebug(`Loaded ${USER_AGENTS.length} user agents from env.`);
      } else {
        USER_AGENTS = [DEFAULT_USER_AGENT];
        logDebug("Empty or invalid USER_AGENTS_JSON, using default UA.");
      }
    } else {
      USER_AGENTS = [DEFAULT_USER_AGENT];
      logDebug("USER_AGENTS_JSON not set, using default UA.");
    }
  } catch (e) {
    USER_AGENTS = [DEFAULT_USER_AGENT];
    logError(`Failed to parse USER_AGENTS_JSON: ${e.message}`, e);
  }

  KV_NAMESPACE = env.LIBRETV_PROXY_KV || null;
  if (!KV_NAMESPACE) logDebug("KV Namespace 'LIBRETV_PROXY_KV' not bound.");
  else logDebug("KV Namespace bound.");
}

/** Extract target URL from request pathname */
function getTargetUrlFromPath(pathname) {
  const prefix = '/proxy/';
  if (!pathname || !pathname.startsWith(prefix)) {
    logDebug(`Path does not start with ${prefix}: ${pathname}`);
    return null;
  }
  const encoded = pathname.substring(prefix.length);
  if (!encoded) {
    logDebug("Encoded URL empty.");
    return null;
  }
  try {
    const decoded = decodeURIComponent(encoded);
    if (/^https?:\/\//i.test(decoded)) return decoded;
    // Fallback: check if original encoded looks like URL but was not encoded
    if (/^https?:\/\//i.test(encoded)) {
      logDebug("Unencoded URL detected, using as-is.");
      return encoded;
    }
    return null;
  } catch (e) {
    logError(`Error decoding URL: ${encoded}`, e);
    return null;
  }
}

/** Creates a Response object with CORS and cache headers */
function createResponse(body, status = 200, headers = {}) {
  const h = new Headers(headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  h.set("Access-Control-Expose-Headers", "Content-Length, Content-Type");
  if (!h.has("Cache-Control") && status === 200 && body) {
    h.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  }
  return new Response(body, { status, headers: h });
}

/** Creates a response specifically for M3U8 content */
function createM3u8Response(content) {
  return createResponse(content, 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": `public, max-age=${CACHE_TTL}`
  });
}

/** Get a random User-Agent */
function getRandomUserAgent() {
  if (USER_AGENTS.length === 0) return DEFAULT_USER_AGENT;
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Get base URL with trailing slash from full URL */
function getBaseUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    url.pathname = url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
    return url.toString();
  } catch (e) {
    logError(`Error parsing base URL from: ${urlStr}`, e);
    const lastSlash = urlStr.lastIndexOf('/');
    if (lastSlash > urlStr.indexOf('://') + 2) {
      return urlStr.substring(0, lastSlash + 1);
    }
    return urlStr.endsWith('/') ? urlStr : urlStr + '/';
  }
}

/** Resolve relative URL against base URL */
function resolveUrl(baseUrl, relativeUrl) {
  if (!relativeUrl) return baseUrl;
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch (e) {
    logError(`Failed to resolve URL: base='${baseUrl}', relative='${relativeUrl}'`, e);
    if (relativeUrl.startsWith('/')) {
      try {
        const origin = new URL(baseUrl).origin;
        return origin + relativeUrl;
      } catch { return relativeUrl; }
    } else return baseUrl + relativeUrl;
  }
}

/** Rewrite a URL to proxy format */
function rewriteUrlToProxy(targetUrl) {
  return `/proxy/${encodeURIComponent(targetUrl)}`;
}

/** Fetch content from target URL with headers */
async function fetchContentWithType(targetUrl, requestHeaders) {
  const headers = new Headers({
    'User-Agent': getRandomUserAgent(),
    'Accept': requestHeaders.get('Accept') || '*/*',
    'Accept-Language': requestHeaders.get('Accept-Language') || 'en-US,en;q=0.9',
    'Referer': requestHeaders.get('Referer') || (new URL(targetUrl)).origin,
  });

  logDebug(`Fetching ${targetUrl} with UA: ${headers.get('User-Agent')}`);

  const resp = await fetch(targetUrl, { headers, redirect: 'follow' });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '(No body)');
    logError(`Fetch failed: ${resp.status} ${resp.statusText}, Body: ${errBody.slice(0, 200)}`);
    throw new Error(`HTTP error ${resp.status}: ${resp.statusText}`);
  }
  const contentType = (resp.headers.get('Content-Type') || 'application/octet-stream').toLowerCase();
  const content = await resp.text(); // M3U8 treated as text always
  logDebug(`Fetched ${targetUrl}, content-type: ${contentType}, length: ${content.length}`);
  return { content, contentType, responseHeaders: resp.headers };
}

/** Check if content is M3U8 */
function isM3u8Content(content, contentType) {
  if (contentType && M3U8_CONTENT_TYPES.some(t => contentType.includes(t))) return true;
  return typeof content === 'string' && content.trimStart().startsWith('#EXTM3U');
}

/** Process a line with URI attribute - rewrite URLs */
function processUriLine(line, baseUrl, uriAttr = null) {
  if (uriAttr) {
    const regex = new RegExp(`${uriAttr}="([^"]+)"`);
    return line.replace(regex, (_, uri) => {
      const absUri = resolveUrl(baseUrl, uri);
      logDebug(`Rewriting ${uriAttr}: '${uri}' -> proxy`);
      return `${uriAttr}="${rewriteUrlToProxy(absUri)}"`;
    });
  } else {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const absUrl = resolveUrl(baseUrl, trimmed);
      logDebug(`Rewriting segment: '${trimmed}' -> proxy`);
      return rewriteUrlToProxy(absUrl);
    }
  }
  return line;
}

/** Process media playlist, rewrite segment and key/map URIs */
function processMediaPlaylist(url, content) {
  const baseUrl = getBaseUrl(url);
  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#EXT-X-KEY')) return processUriLine(line, baseUrl, 'URI');
    if (trimmed.startsWith('#EXT-X-MAP')) return processUriLine(line, baseUrl, 'URI');
    if (!trimmed.startsWith('#')) return processUriLine(line, baseUrl, null);
    return line;
  }).join('\n');
}

/** Process master playlist variants rewriting URLs */
function processMasterPlaylistVariants(url, content) {
  const baseUrl = getBaseUrl(url);
  const lines = content.split('\n');
  const output = [];
  let expectVariantUri = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
      expectVariantUri = true;
      output.push(line);
    } else if (expectVariantUri && trimmed && !trimmed.startsWith('#')) {
      const absUri = resolveUrl(baseUrl, trimmed);
      logDebug(`Rewriting master variant '${trimmed}' -> proxy`);
      output.push(rewriteUrlToProxy(absUri));
      expectVariantUri = false;
    } else if (trimmed.startsWith('#EXT-X-MEDIA') && line.includes('URI="')) {
      output.push(processUriLine(line, baseUrl, 'URI'));
      expectVariantUri = false;
    } else {
      output.push(line);
      expectVariantUri = false;
    }
  }
  return output.join('\n');
}

/** Main recursive M3U8 processor */
async function processM3u8Content(targetUrl, content, context, depth = 0) {
  if (depth > MAX_RECURSION) throw new Error(`Max recursion (${MAX_RECURSION}) exceeded for ${targetUrl}`);

  if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
    logDebug(`[Depth ${depth}] Master playlist detected: ${targetUrl}`);
    return processMasterPlaylistVariants(targetUrl, content);
  } else {
    logDebug(`[Depth ${depth}] Media playlist detected: ${targetUrl}`);
    return processMediaPlaylist(targetUrl, content);
  }
}

/** Handle OPTIONS preflight for CORS */
function handleOptionsRequest() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Get from KV cache */
async function getFromCache(key) {
  if (!KV_NAMESPACE) return null;
  try {
    const dataJson = await KV_NAMESPACE.get(key);
    if (!dataJson) {
      logDebug(`[Cache MISS] key=${key}`);
      return null;
    }
    logDebug(`[Cache HIT] key=${key}`);
    return JSON.parse(dataJson); // { body, headers }
  } catch (e) {
    logError(`KV get error for ${key}`, e);
    return null;
  }
}

/** Put into KV cache async */
async function putToCache(key, data, waitUntil) {
  if (!KV_NAMESPACE || !waitUntil) return;
  try {
    const cacheVal = JSON.stringify(data);
    waitUntil(KV_NAMESPACE.put(key, cacheVal, { expirationTtl: CACHE_TTL }));
    logDebug(`[Cache PUT] key=${key} scheduled.`);
  } catch (e) {
    logError(`KV put error for ${key}`, e);
  }
}

// Main handler
export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  initializeConfig(env);

  if (request.method === "OPTIONS") return handleOptionsRequest();

  const targetUrl = getTargetUrlFromPath(url.pathname);
  if (!targetUrl) return createResponse("Invalid proxy path.", 400);

  logDebug(`Proxying: ${targetUrl}`);

  const cacheKey = `proxy_v2:${targetUrl}`;
  const cachedData = await getFromCache(cacheKey);

  if (cachedData) {
    let cachedHeaders = {};
    try {
      cachedHeaders = JSON.parse(cachedData.headers);
    } catch { /* ignore parse errors */ }
    const cachedContentType = cachedHeaders['content-type'] || '';
    const cachedContent = cachedData.body;

    if (isM3u8Content(cachedContent, cachedContentType)) {
      try {
        const processed = await processM3u8Content(targetUrl, cachedContent, context, 0);
        return createM3u8Response(processed);
      } catch (e) {
        logError(`Error processing cached M3U8, fetching fresh: ${e.message}`, e);
      }
    } else {
      return createResponse(cachedContent, 200, new Headers(cachedHeaders));
    }
  }

  try {
    const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl, request.headers);

    // Prepare headers for caching and responding
    const headersToCache = {};
    const respHeaders = new Headers();
    responseHeaders.forEach((v, k) => {
      headersToCache[k.toLowerCase()] = v;
      respHeaders.set(k, v);
    });

    if (!respHeaders.has('Content-Type')) {
      respHeaders.set('Content-Type', contentType || 'application/octet-stream');
      headersToCache['content-type'] = contentType || 'application/octet-stream';
    }

    const dataToCache = { body: content, headers: JSON.stringify(headersToCache) };
    await putToCache(cacheKey, dataToCache, waitUntil);

    if (isM3u8Content(content, contentType)) {
      const processed = await processM3u8Content(targetUrl, content, context, 0);
      return createM3u8Response(processed);
    } else {
      // Add cache-control and CORS
      respHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
      respHeaders.set("Access-Control-Allow-Origin", "*");
      respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      respHeaders.set("Access-Control-Allow-Headers", "*");
      return createResponse(content, 200, respHeaders);
    }
  } catch (err) {
    logError(`Proxy error for ${targetUrl}`, err);
    return createResponse(`Proxy error: ${err.message}`, 500);
  }
}

// Explicit OPTIONS export for clarity
export async function onOptions(context) {
  return handleOptionsRequest();
}
