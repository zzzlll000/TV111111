// functions/api.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;  // e.g., /api/search or /api/detail
    const searchParams = url.searchParams;
  
    try {
      if (path === '/api/search') {
        const query = searchParams.get('wd');
        if (!query) {
          return new Response(JSON.stringify({ code: 400, msg: '缺少搜索参数' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
  
        const source = searchParams.get('source') || 'heimuer';  // 从查询参数获取源
        const apiUrl = getApiUrl(source, 'search', query);  // 自定义函数，参考您的 API_SITES
  
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare Pages Function)',
            'Accept': 'application/json'
          }
        });
  
        if (!response.ok) {
          throw new Error(`API 请求失败: ${response.status}`);
        }
  
        const data = await response.json();
        // 添加源信息，类似您的代码
        data.list = data.list.map(item => ({ ...item, source_name: API_SITES[source]?.name || '未知源' }));
        return new Response(JSON.stringify({ code: 200, list: data.list }), { headers: { 'Content-Type': 'application/json' } });
      } else if (path === '/api/detail') {
        const id = searchParams.get('id');
        const source = searchParams.get('source') || 'heimuer';
        if (!id) {
          return new Response(JSON.stringify({ code: 400, msg: '缺少视频ID参数' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
  
        const apiUrl = getApiUrl(source, 'detail', id);
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare Pages Function)',
            'Accept': 'application/json'
          }
        });
  
        if (!response.ok) {
          throw new Error(`详情请求失败: ${response.status}`);
        }
  
        const data = await response.json();
        // 处理数据，提取 episodes 和其他信息
        return new Response(JSON.stringify({ code: 200, ...data }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response(JSON.stringify({ code: 404, msg: '未知的API路径' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      return new Response(JSON.stringify({ code: 500, msg: error.message || '内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
};

// 辅助函数：根据源和类型构建 API URL
function getApiUrl(source, type, param) {
  const sites = {
    // 基于您的 API_SITES 配置
    heimuer: { api: 'https://json.heimuer.xyz' },
    ffzy: { api: 'http://ffzy5.tv' },
    // ... 其他源
  };
  
  const baseUrl = sites[source]?.api || 'https://json.heimuer.xyz';  // 默认源
  if (type === 'search') {
    return `${baseUrl}/api.php/provide/vod/?ac=videolist&wd=${encodeURIComponent(param)}`;
  } else if (type === 'detail') {
    return `${baseUrl}/api.php/provide/vod/?ac=videolist&ids=${encodeURIComponent(param)}`;
  }
}
