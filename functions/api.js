// functions/api.js

// 移植自原始 config.js 的 API_SITES 配置
const API_SITES = {
    heimuer: {
        api: 'https://json.heimuer.xyz',
        name: '黑木耳',
        detail: 'https://heimuer.tv'
    },
    ffzy: {
        api: 'http://ffzy5.tv',
        name: '非凡影视',
        detail: 'http://ffzy5.tv'
    },
    tyyszy: {
        api: 'https://tyyszy.com',
        name: '天涯资源',
    },
    ckzy: {
        api: 'https://www.ckzy1.com',
        name: 'CK资源',
    },
    zy360: {
        api: 'https://360zy.com',
        name: '360资源',
    },
    wolong: {
        api: 'https://wolongzyw.com',
        name: '卧龙资源',
    },
    cjhw: {
        api: 'https://cjhwba.com',
        name: '新华为',
    },
    jisu: {
        api: 'https://jszyapi.com',
        name: '极速资源',
        detail: 'https://jszyapi.com'
    },
    dbzy: {
        api: 'https://dbzy.com',
        name: '豆瓣资源',
    }
};

// 辅助函数：根据源和类型构建 API URL
function getApiUrl(source, type, param) {
    const site = API_SITES[source];
    if (!site) {
        throw new Error('无效的API来源');
    }
    const baseUrl = site.api;
    if (type === 'search') {
        return `${baseUrl}/api.php/provide/vod/?ac=videolist&wd=${encodeURIComponent(param)}`;
    } else if (type === 'detail') {
        return `${baseUrl}/api.php/provide/vod/?ac=videolist&ids=${encodeURIComponent(param)}`;
    }
    throw new Error('未知的API类型');
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;  // e.g., /api/search or /api/detail
        const searchParams = url.searchParams;
        
        try {
            if (path === '/api/search') {
                const query = searchParams.get('wd');
                const source = searchParams.get('source') || 'heimuer';  // 默认源
                if (!query) {
                    return new Response(JSON.stringify({ code: 400, msg: '缺少搜索参数' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }
                
                const apiUrl = getApiUrl(source, 'search', query);
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
                if (!data || !Array.isArray(data.list)) {
                    throw new Error('API返回的数据格式无效');
                }
                
                // 添加源信息
                data.list = data.list.map(item => ({
                    ...item,
                    source_name: API_SITES[source]?.name || '未知源',
                    source_code: source
                }));
                
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
                if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
                    throw new Error('获取到的详情内容无效');
                }
                
                const videoDetail = data.list[0];  // 假设取第一个
                // 提取 episodes 和其他信息（简化版，基于原始逻辑）
                let episodes = [];
                if (videoDetail.vod_play_url) {
                    const playSources = videoDetail.vod_play_url.split('$$$');
                    if (playSources.length > 0) {
                        const episodeList = playSources[0].split('#');
                        episodes = episodeList.map(ep => {
                            const parts = ep.split('$');
                            return parts.length > 1 ? parts[1] : '';
                        }).filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
                    }
                }
                
                return new Response(JSON.stringify({
                    code: 200,
                    episodes: episodes,
                    videoInfo: {
                        title: videoDetail.vod_name,
                        cover: videoDetail.vod_pic,
                        desc: videoDetail.vod_content,
                        source_name: API_SITES[source]?.name || '未知源',
                        source_code: source
                    }
                }), { headers: { 'Content-Type': 'application/json' } });
            } else {
                return new Response(JSON.stringify({ code: 404, msg: '未知的API路径' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
        } catch (error) {
            return new Response(JSON.stringify({ code: 500, msg: error.message || '内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
};
