// 改进的API请求处理函数
async function handleApiRequest(url) {
  const customApi = url.searchParams.get("customApi") || "";
  const source = url.searchParams.get("source") || "heimuer";

  try {
    // 添加聚合搜索API路径
    if (url.pathname === "/api/aggregateSearch") {
      const searchQuery = url.searchParams.get("wd");
      if (!searchQuery) {
        throw new Error("缺少搜索参数");
      }

      // 执行聚合搜索
      const results = await aggregateSearch(searchQuery);
      return JSON.stringify(results);
    }

    if (url.pathname === "/api/search") {
      const searchQuery = url.searchParams.get("wd");
      if (!searchQuery) {
        throw new Error("缺少搜索参数");
      }

      // 验证API和source的有效性
      if (source === "custom" && !customApi) {
        throw new Error("使用自定义API时必须提供API地址");
      }

      if (!API_SITES[source] && source !== "custom") {
        throw new Error("无效的API来源");
      }

      const apiUrl = customApi
        ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
        : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;

      // 添加超时处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl), {
          headers: API_CONFIG.search.headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();

        // 检查JSON格式的有效性
        if (!data || !Array.isArray(data.list)) {
          throw new Error("API返回的数据格式无效");
        }

        return JSON.stringify({
          code: 200,
          list: data.list || [],
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    if (url.pathname === "/api/detail") {
      const id = url.searchParams.get("id");
      if (!id) {
        throw new Error("缺少视频ID参数");
      }

      // 验证ID格式 - 只允许数字和有限的特殊字符
      if (!/^[\w-]+$/.test(id)) {
        throw new Error("无效的视频ID格式");
      }

      // 验证API和source的有效性
      if (source === "custom" && !customApi) {
        throw new Error("使用自定义API时必须提供API地址");
      }

      if (!API_SITES[source] && source !== "custom") {
        throw new Error("无效的API来源");
      }

      const detailUrl = customApi
        ? `${customApi}${API_CONFIG.detail.path}${id}`
        : `${API_SITES[source].api}${API_CONFIG.detail.path}${id}`;

      // 添加超时处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(PROXY_URL + encodeURIComponent(detailUrl), {
          headers: API_CONFIG.detail.headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`详情请求失败: ${response.status}`);
        }

        // 由于现在返回的是JSON而不是HTML，我们需要解析JSON
        const data = await response.json();

        // 检查返回的数据是否有效
        if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
          throw new Error("获取到的详情内容无效");
        }

        // 获取第一个匹配的视频详情
        const videoDetail = data.list[0];

        // 提取播放地址
        let episodes = [];

        if (videoDetail.vod_play_url) {
          // 分割不同播放源
          const playSources = videoDetail.vod_play_url.split("$$$");

          // 提取第一个播放源的集数（通常为主要源）
          if (playSources.length > 0) {
            const mainSource = playSources[0];
            const episodeList = mainSource.split("#");

            // 从每个集数中提取URL
            episodes = episodeList
              .map(ep => {
                const parts = ep.split("$");
                // 返回URL部分(通常是第二部分，如果有的话)
                return parts.length > 1 ? parts[1] : "";
              })
              .filter(url => url && (url.startsWith("http://") || url.startsWith("https://")));
          }
        }

        // 如果没有找到播放地址，尝试使用正则表达式查找m3u8链接
        if (episodes.length === 0 && videoDetail.vod_content) {
          const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
          episodes = matches.map(link => link.replace(/^\$/, ""));
        }

        return JSON.stringify({
          code: 200,
          episodes: episodes,
          detailUrl: detailUrl,
          // 添加更多视频详情，以便前端展示
          videoInfo: {
            title: videoDetail.vod_name,
            cover: videoDetail.vod_pic,
            desc: videoDetail.vod_content,
            type: videoDetail.type_name,
            year: videoDetail.vod_year,
            area: videoDetail.vod_area,
            director: videoDetail.vod_director,
            actor: videoDetail.vod_actor,
            remarks: videoDetail.vod_remarks,
          },
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    throw new Error("未知的API路径");
  } catch (error) {
    console.error("API处理错误:", error);
    return JSON.stringify({
      code: 400,
      msg: error.message || "请求处理失败",
      list: [],
      episodes: [],
    });
  }
}

// 添加聚合搜索功能
async function aggregateSearch(searchQuery) {
  // 创建结果容器
  const results = {
    code: 200,
    data: {}, // 按源分组的结果
    totalCount: 0,
    successSources: 0,
    failedSources: [],
  };

  // 获取所有API源
  const sources = Object.keys(API_SITES);
  const customApiUrl = localStorage.getItem("customApiUrl");

  // 判断是否添加自定义源
  if (customApiUrl) {
    sources.push("custom");
  }

  // 创建进度追踪
  const progress = {
    total: sources.length,
    completed: 0,
  };

  // 进度更新函数
  const updateProgress = () => {
    progress.completed++;
    const percent = (progress.completed / progress.total) * 100;

    // 更新进度条
    const progressBar = document.getElementById("searchProgressBar");
    const progressStatus = document.getElementById("searchProgressStatus");

    if (progressBar && progressStatus) {
      progressBar.style.width = `${percent}%`;
      progressStatus.textContent = `${progress.completed}/${progress.total} 源`;
    }
  };

  // 显示进度条
  const progressContainer = document.getElementById("searchProgressContainer");
  if (progressContainer) {
    progressContainer.classList.remove("hidden");
  }

  // 并发执行所有搜索
  const searchPromises = sources.map(async source => {
    try {
      // 构建API参数
      const apiParams =
        source === "custom" ? "&source=custom&customApi=" + encodeURIComponent(customApiUrl) : "&source=" + source;

      // 发送搜索请求
      const response = await fetch("/api/search?wd=" + encodeURIComponent(searchQuery) + apiParams, {
        signal: AbortSignal.timeout(8000), // 8秒超时
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`API响应错误: ${response.status}`);
      }

      const data = await response.json();

      // 检查返回数据有效性
      if (data.code === 200 && Array.isArray(data.list)) {
        // 将结果添加到按源分类的结果中
        const sourceName = source === "custom" ? "自定义源" : API_SITES[source].name;

        // 为每个结果添加数据源标记
        const resultsWithSource = data.list.map(item => ({
          ...item,
          _sourceId: source,
          _sourceName: sourceName,
        }));

        // 按源名称分组保存结果
        results.data[sourceName] = {
          items: resultsWithSource,
          count: resultsWithSource.length,
          sourceId: source,
        };

        // 更新总计数
        results.totalCount += resultsWithSource.length;
        results.successSources++;
      } else {
        // 记录失败的源
        results.failedSources.push(source);
      }
    } catch (error) {
      console.error(`源 ${source} 搜索失败:`, error);
      // 记录失败的源
      results.failedSources.push(source);
    } finally {
      // 更新进度
      updateProgress();
    }
  });

  // 等待所有搜索完成
  await Promise.allSettled(searchPromises);

  return results;
}

// 拦截API请求
(function () {
  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    const requestUrl = typeof input === "string" ? new URL(input, window.location.origin) : input.url;

    if (requestUrl.pathname.startsWith("/api/")) {
      try {
        const data = await handleApiRequest(requestUrl);
        return new Response(data, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            code: 500,
            msg: "服务器内部错误",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // 非API请求使用原始fetch
    return originalFetch.apply(this, arguments);
  };
})();

async function testSiteAvailability(source) {
  try {
    // 避免传递空的自定义URL
    const apiParams =
      source === "custom" && customApiUrl
        ? "&customApi=" + encodeURIComponent(customApiUrl)
        : source === "custom"
        ? "" // 如果是custom但没有URL，返回空字符串
        : "&source=" + source;

    // 如果是custom但没有URL，直接返回false
    if (source === "custom" && !customApiUrl) {
      return false;
    }

    // 使用更简单的测试查询
    const response = await fetch("/api/search?wd=test" + apiParams, {
      // 添加超时
      signal: AbortSignal.timeout(5000),
    });

    // 检查响应状态
    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    // 检查API响应的有效性
    return data && data.code !== 400 && Array.isArray(data.list);
  } catch (error) {
    console.error("站点可用性测试失败:", error);
    return false;
  }
}
