// js/api.js - Handles API interactions for searching and fetching details.

// Constants and globals assumed from config.js like API_SITES, API_CONFIG, PROXY_URL, etc.

const REQUEST_TIMEOUT = 10000; // 10s

/** Handles requests for /api/search and /api/detail */
async function handleApiRequest(url) {
  const customApiUrl = url.searchParams.get('customApi') || '';
  const sourceCode = url.searchParams.get('source') || 'heimuer';

  try {
    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('wd')?.trim();
      if (!query) throw new Error('Search query parameter (wd) is empty.');

      if (sourceCode === 'custom' && !isValidHttpUrl(customApiUrl)) {
        throw new Error('Valid custom API URL required for source "custom".');
      }
      if (sourceCode !== 'custom' && !API_SITES[sourceCode]) {
        throw new Error(`Invalid API source code: ${sourceCode}`);
      }
      const apiBase = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
      const apiUrl = `${apiBase}${API_CONFIG.search.path}${encodeURIComponent(query)}`;
      const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name;

      const data = await fetchWithTimeout(apiUrl, API_CONFIG.search.headers);
      if (!data || (data.list !== undefined && !Array.isArray(data.list))) {
        console.warn(`Invalid response format from ${sourceName}.`);
        throw new Error(`Invalid API response from ${sourceName}.`);
      }
      data.list = data.list || [];

      data.list.forEach(item => {
        item.source_name = sourceName;
        item.source_code = sourceCode;
        if (sourceCode === 'custom') item.api_url = customApiUrl;
        item.vod_name = sanitizeString(item.vod_name);
        item.vod_remarks = sanitizeString(item.vod_remarks);
        item.type_name = sanitizeString(item.type_name);
      });

      return JSON.stringify({ code: 200, list: data.list });
    }

    if (url.pathname === '/api/detail') {
      const id = url.searchParams.get('id');
      if (!id || !/^[\w-]+$/.test(id)) throw new Error('Invalid or missing video ID.');

      if (sourceCode === 'custom' && !isValidHttpUrl(customApiUrl)) {
        throw new Error('Valid custom API URL required for source "custom".');
      }
      if (sourceCode !== 'custom' && !API_SITES[sourceCode]) {
        throw new Error(`Invalid API source code: ${sourceCode}`);
      }

      const isSpecialSource = API_SITES[sourceCode]?.detail || (sourceCode === 'custom' && url.searchParams.get('useDetail') === 'true');
      if (isSpecialSource) {
        const detailPageBaseUrl = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].detail;
        if (!isValidHttpUrl(detailPageBaseUrl)) {
          throw new Error(`Invalid detail page URL for source ${sourceCode}.`);
        }
        return await handleSpecialSourceDetail(id, sourceCode, detailPageBaseUrl);
      }

      const apiBase = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
      const detailUrl = `${apiBase}${API_CONFIG.detail.path}${id}`;
      const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name;

      const data = await fetchWithTimeout(detailUrl, API_CONFIG.detail.headers);

      if (!data || !Array.isArray(data.list) || data.list.length === 0) {
        return JSON.stringify({
          code: 404,
          msg: 'Video details not found.',
          episodes: [],
          videoInfo: { source_name: sourceName, source_code: sourceCode },
        });
      }

      const videoDetail = data.list[0];
      const episodes = parseEpisodes(videoDetail);

      return JSON.stringify({
        code: 200,
        episodes,
        videoInfo: {
          title: sanitizeString(videoDetail.vod_name),
          cover: sanitizeUrl(videoDetail.vod_pic),
          desc: sanitizeString(videoDetail.vod_content),
          type: sanitizeString(videoDetail.type_name),
          year: sanitizeString(videoDetail.vod_year),
          area: sanitizeString(videoDetail.vod_area),
          director: sanitizeString(videoDetail.vod_director),
          actor: sanitizeString(videoDetail.vod_actor),
          remarks: sanitizeString(videoDetail.vod_remarks),
          source_name: sourceName,
          source_code: sourceCode,
        }
      });
    }

    throw new Error(`Unknown API path: ${url.pathname}`);
  } catch (error) {
    console.error(`API Error at ${url.pathname} (source: ${sourceCode}):`, error);
    return JSON.stringify({
      code: error.message.includes('timeout') ? 408 : 500,
      msg: error.message || 'API request failed.',
      list: [],
      episodes: [],
    });
  }
}

/** Fetch with timeout, using proxy */
async function fetchWithTimeout(apiUrl, headers) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const proxyUrl = PROXY_URL + encodeURIComponent(apiUrl);
    const resp = await fetch(proxyUrl, { headers, signal: controller.signal, mode: 'cors' });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`API failed: ${resp.status} ${resp.statusText}, body: ${text.substring(0, 200)}`);
    }
    return await resp.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timeout');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Parse episodes URLs from video detail */
function parseEpisodes(videoDetail) {
  let episodes = [];
  if (videoDetail?.vod_play_url) {
    try {
      const sources = videoDetail.vod_play_url.split('$$$')[0].split('#');
      episodes = sources.map(ep => {
        const parts = ep.split('$');
        return (parts.length > 1 && isValidHttpUrl(parts[1])) ? parts[1] : null;
      }).filter(Boolean);
    } catch (_) { episodes = []; }
  }
  if (episodes.length === 0 && videoDetail?.vod_content) {
    try {
      const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
      episodes = matches.map(m => sanitizeUrl(m.replace(/^\$/, ''))).filter(isValidHttpUrl);
    } catch (_) { episodes = []; }
  }
  return [...new Set(episodes)];
}

/** Handle special sources requiring HTML scraping for details */
async function handleSpecialSourceDetail(id, sourceCode, detailBaseUrl) {
  const detailHtmlUrl = `${detailBaseUrl}/index.php/vod/detail/id/${id}.html`;
  const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode]?.name || '未知特殊源';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let html = '';
  try {
    const resp = await fetch(PROXY_URL + encodeURIComponent(detailHtmlUrl), {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html'
      },
      signal: controller.signal,
      mode: 'cors'
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Detail page HTTP ${resp.status} ${resp.statusText}`);
    html = await resp.text();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Detail page request timeout');
    throw e;
  }

  let episodes = [];
  let title = '';
  let desc = '';

  try {
    const regex = /\$(https?:\/\/[^$'"]+?\.m3u8)/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const url = sanitizeUrl(m[1]);
      if (url) episodes.push(url);
    }
    episodes = [...new Set(episodes)];

    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    title = titleMatch ? sanitizeString(titleMatch[1].trim()) : '未知标题';

    const descMatch = html.match(/<div[^>]*class=["'](?:content|sketch|vod_content|info)['"][^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch && descMatch[1]) {
      desc = sanitizeString(descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    } else {
      desc = '暂无简介';
    }
  } catch (e) { /* ignore parsing errors */ }

  return JSON.stringify({
    code: 200,
    episodes,
    videoInfo: {
      title,
      desc,
      source_name: sourceName,
      source_code: sourceCode,
      cover: '',
      type: '',
      year: '',
      area: '',
      director: '',
      actor: '',
      remarks: ''
    }
  });
}

/** Sanitize string for safety */
function sanitizeString(str) {
  if (!str) return '';
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Sanitize URL, ensure valid HTTP(s) */
function sanitizeUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  return isValidHttpUrl(url) ? url : '';
}

/** Validate URL is http or https */
function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Intercept window.fetch for /api/* (client-side override)
(function() {
  if (window.originalFetch) return;
  window.originalFetch = window.fetch;

  window.fetch = async function(input, init) {
    try {
      const urlStr = typeof input === 'string' ? input : input.url;
      const requestUrl = new URL(urlStr, window.location.origin);

      if (requestUrl.pathname.startsWith('/api/')) {
        if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
          typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
          if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
          return new Promise(() => {}); // Block request indefinitely
        }
        const responseData = await handleApiRequest(requestUrl);
        return new Response(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    } catch (e) {
      console.error("Enhanced fetch interception error:", e);
      // Fallback: proceed with original fetch for errors
    }
    return window.originalFetch.apply(this, arguments);
  };
})();

/** Test API site availability */
async function testSiteAvailability(apiUrl) {
  if (!isValidHttpUrl(apiUrl)) return false;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);

    const resp = await window.fetch(`/api/search?wd=test&customApi=${encodeURIComponent(apiUrl)}&source=custom`, { signal: ctrl.signal });
    clearTimeout(tid);

    if (!resp.ok) return false;

    const data = await resp.json();
    return data?.code === 200 && Array.isArray(data.list);
  } catch {
    return false;
  }
}
