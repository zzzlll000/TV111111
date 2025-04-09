// 全局变量
let currentApiSource = localStorage.getItem("currentApiSource") || "heimuer";
let customApiUrl = localStorage.getItem("customApiUrl") || "";
// 添加当前播放的集数索引
let currentEpisodeIndex = 0;
// 添加当前视频的所有集数
let currentEpisodes = [];
// 添加当前视频的标题
let currentVideoTitle = "";
// 新增全局变量用于倒序状态
let episodesReversed = false;
// 添加聚合搜索标识
let useAggregateSearch = localStorage.getItem("useAggregateSearch") === "true";

// 页面初始化
document.addEventListener("DOMContentLoaded", function () {
  // 初始化时检查是否使用自定义接口
  if (currentApiSource === "custom") {
    document.getElementById("customApiInput").classList.remove("hidden");
    document.getElementById("customApiUrl").value = customApiUrl;
  }

  // 设置 select 的默认选中值
  document.getElementById("apiSource").value = currentApiSource;

  // 初始化显示当前站点代码
  document.getElementById("currentCode").textContent = currentApiSource;

  // 初始化显示当前站点状态（使用优化后的测试函数）
  updateSiteStatusWithTest(currentApiSource);

  // 渲染搜索历史
  renderSearchHistory();

  // 设置聚合搜索开关状态
  const aggregateToggle = document.getElementById("aggregateSearchToggle");
  if (aggregateToggle) {
    aggregateToggle.checked = useAggregateSearch;
    // 更新样式
    updateToggleStyle(aggregateToggle);
  }

  // 设置事件监听器
  setupEventListeners();
});

// 带有超时和缓存的站点可用性测试
async function updateSiteStatusWithTest(source) {
  // 显示加载状态
  document.getElementById("siteStatus").innerHTML = '<span class="text-gray-500">●</span> 测试中...';

  // 检查缓存中是否有有效的测试结果
  const cacheKey = `siteStatus_${source}_${customApiUrl || ""}`;
  const cachedResult = localStorage.getItem(cacheKey);

  if (cachedResult) {
    try {
      const { isAvailable, timestamp } = JSON.parse(cachedResult);
      // 缓存有效期为2个月
      if (Date.now() - timestamp < 5184000000) {
        updateSiteStatus(isAvailable);
        return;
      }
    } catch (e) {
      // 忽略解析错误，继续测试
      console.error("缓存数据解析错误:", e);
    }
  }

  // 使用 Promise.race 添加超时处理
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("测试超时")), 8000));

    const testPromise = testSiteAvailability(source);
    const isAvailable = await Promise.race([testPromise, timeoutPromise]);

    // 更新UI状态
    updateSiteStatus(isAvailable);

    // 缓存测试结果
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        isAvailable,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error("站点测试错误:", error);
    updateSiteStatus(false);
  }
}

// 设置事件监听器
function setupEventListeners() {
  // API源选择变更事件
  document.getElementById("apiSource").addEventListener("change", async function (e) {
    currentApiSource = e.target.value;
    const customApiInput = document.getElementById("customApiInput");

    if (currentApiSource === "custom") {
      customApiInput.classList.remove("hidden");
      customApiUrl = document.getElementById("customApiUrl").value;
      localStorage.setItem("customApiUrl", customApiUrl);
      // 自定义接口不立即测试可用性
      document.getElementById("siteStatus").innerHTML = '<span class="text-gray-500">●</span> 待测试';
    } else {
      customApiInput.classList.add("hidden");
      // 非自定义接口立即测试可用性
      showToast("正在测试站点可用性...", "info");
      updateSiteStatusWithTest(currentApiSource);
    }

    localStorage.setItem("currentApiSource", currentApiSource);
    document.getElementById("currentCode").textContent = currentApiSource;

    // 清理搜索结果并重置搜索区域
    resetSearchArea();
  });

  // 自定义接口输入框事件
  document.getElementById("customApiUrl").addEventListener("blur", async function (e) {
    customApiUrl = e.target.value;
    localStorage.setItem("customApiUrl", customApiUrl);

    if (currentApiSource === "custom" && customApiUrl) {
      showToast("正在测试接口可用性...", "info");
      const isAvailable = await testSiteAvailability("custom");
      updateSiteStatus(isAvailable);

      if (!isAvailable) {
        showToast("接口不可用，请检查地址是否正确", "error");
      } else {
        showToast("接口可用", "success");
      }
    }
  });

  // 回车搜索
  document.getElementById("searchInput").addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      search();
    }
  });

  // 点击外部关闭设置面板
  document.addEventListener("click", function (e) {
    const panel = document.getElementById("settingsPanel");
    const settingsButton = document.querySelector('button[onclick="toggleSettings(event)"]');

    if (!panel.contains(e.target) && !settingsButton.contains(e.target) && panel.classList.contains("show")) {
      panel.classList.remove("show");
    }
  });

  // 聚合搜索切换事件
  const aggregateToggle = document.getElementById("aggregateSearchToggle");
  if (aggregateToggle) {
    aggregateToggle.addEventListener("change", function () {
      useAggregateSearch = this.checked;
      localStorage.setItem("useAggregateSearch", useAggregateSearch);

      // 更新样式
      updateToggleStyle(this);

      // 如果有搜索内容，自动重新搜索
      const query = document.getElementById("searchInput").value.trim();
      if (query) {
        search();
      }
    });
  }
}

// 更新开关样式
function updateToggleStyle(toggleElement) {
  if (!toggleElement) return;

  const dotElement = toggleElement.parentElement.querySelector(".dot");
  if (dotElement) {
    if (toggleElement.checked) {
      dotElement.style.transform = "translateX(100%)";
      dotElement.style.backgroundColor = "white";
      toggleElement.nextElementSibling.style.backgroundColor = "#4263EB";
    } else {
      dotElement.style.transform = "translateX(0)";
      dotElement.style.backgroundColor = "#9CA3AF";
      toggleElement.nextElementSibling.style.backgroundColor = "#222";
    }
  }
}

// 重置搜索区域
function resetSearchArea() {
  // 清理搜索结果
  document.getElementById("results").innerHTML = "";
  document.getElementById("groupedResults").innerHTML = "";
  document.getElementById("searchInput").value = "";

  // 隐藏进度条和统计信息
  document.getElementById("searchProgressContainer").classList.add("hidden");
  document.getElementById("searchStats").classList.add("hidden");

  // 恢复搜索区域的样式
  document.getElementById("searchArea").classList.add("flex-1");
  document.getElementById("searchArea").classList.remove("mb-8");
  document.getElementById("resultsArea").classList.add("hidden");

  // 确保页脚正确显示，移除相对定位
  const footer = document.querySelector(".footer");
  if (footer) {
    footer.style.position = "";
  }
}

// 搜索功能
async function search() {
  const query = document.getElementById("searchInput").value.trim();

  if (!query) {
    showToast("请输入搜索内容", "info");
    return;
  }

  // 保存搜索历史
  saveSearchHistory(query);

  // 显示结果区域，调整搜索区域
  document.getElementById("searchArea").classList.remove("flex-1");
  document.getElementById("searchArea").classList.add("mb-8");
  document.getElementById("resultsArea").classList.remove("hidden");

  showLoading();

  try {
    // 检查是否使用聚合搜索
    if (useAggregateSearch) {
      await performAggregateSearch(query);
    } else {
      await performSingleSourceSearch(query);
    }
  } catch (error) {
    console.error("搜索错误:", error);
    if (error.name === "AbortError") {
      showToast("搜索请求超时，请检查网络连接", "error");
    } else {
      showToast("搜索请求失败，请稍后重试", "error");
    }
  } finally {
    hideLoading();
  }
}

// 执行单源搜索
async function performSingleSourceSearch(query) {
  const apiParams =
    currentApiSource === "custom" ? "&customApi=" + encodeURIComponent(customApiUrl) : "&source=" + currentApiSource;

  // 隐藏分组结果容器，显示普通结果容器
  document.getElementById("groupedResults").classList.add("hidden");
  document.getElementById("results").classList.remove("hidden");

  // 隐藏进度条和统计信息
  document.getElementById("searchProgressContainer").classList.add("hidden");
  document.getElementById("searchStats").classList.add("hidden");

  // 添加超时处理
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch("/api/search?wd=" + encodeURIComponent(query) + apiParams, {
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  const data = await response.json();

  if (data.code === 400) {
    showToast(data.msg || "搜索失败，请检查网络连接或更换数据源", "error");
    return;
  }

  const resultsDiv = document.getElementById("results");

  if (!data.list || data.list.length === 0) {
    resultsDiv.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">没有找到相关内容</div>';
    return;
  }

  // 添加XSS保护，使用textContent和属性转义
  resultsDiv.innerHTML = data.list
    .map(item => {
      const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, "") : "";
      const safeName = (item.vod_name || "")
        .toString()
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      return `
            <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer p-6 h-fit" 
                 onclick="showDetails('${safeId}','${safeName}', '${currentApiSource}')">
                <h3 class="text-xl font-semibold mb-3">${safeName}</h3>
                <p class="text-gray-400 text-sm mb-2">${(item.type_name || "").toString().replace(/</g, "&lt;")}</p>
                <p class="text-gray-400 text-sm">${(item.vod_remarks || "").toString().replace(/</g, "&lt;")}</p>
            </div>
        `;
    })
    .join("");
}

// 执行聚合搜索
async function performAggregateSearch(query) {
  // 显示分组结果容器，隐藏普通结果容器
  document.getElementById("groupedResults").classList.remove("hidden");
  document.getElementById("results").classList.add("hidden");

  // 显示搜索进度条
  const progressContainer = document.getElementById("searchProgressContainer");
  progressContainer.classList.remove("hidden");

  // 重置进度条
  const progressBar = document.getElementById("searchProgressBar");
  const progressStatus = document.getElementById("searchProgressStatus");
  progressBar.style.width = "0%";
  progressStatus.textContent = "0/0 源";

  // 发起聚合搜索请求
  try {
    const response = await fetch("/api/aggregateSearch?wd=" + encodeURIComponent(query), {
      signal: AbortSignal.timeout(30000), // 30秒超时
    });

    const results = await response.json();

    // 显示统计信息
    const statsContainer = document.getElementById("searchStats");
    const statsCount = document.getElementById("searchStatsCount");
    statsContainer.classList.remove("hidden");
    statsCount.textContent = `共 ${results.totalCount} 个结果，来自 ${results.successSources} 个数据源`;

    // 渲染分组结果
    renderGroupedResults(results.data);
  } catch (error) {
    console.error("聚合搜索错误:", error);
    document.getElementById("groupedResults").innerHTML =
      '<div class="text-center text-red-400 py-8">聚合搜索失败，请稍后重试</div>';
  }
}

// 渲染分组结果
function renderGroupedResults(groupedData) {
  const groupedResultsDiv = document.getElementById("groupedResults");

  // 如果没有结果
  if (Object.keys(groupedData).length === 0) {
    groupedResultsDiv.innerHTML = '<div class="text-center text-gray-400 py-8">没有找到相关内容</div>';
    return;
  }

  // 构建结果HTML
  let resultsHtml = "";

  // 遍历每个数据源
  Object.entries(groupedData).forEach(([sourceName, sourceData]) => {
    // 源名称和计数
    resultsHtml += `
            <div class="source-group mb-8">
                <div class="source-header">
                    <h3 class="source-title">${sourceName}</h3>
                    <span class="source-count">${sourceData.count} 个结果</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        `;

    // 源中的所有结果
    sourceData.items.forEach(item => {
      const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, "") : "";
      const safeName = (item.vod_name || "")
        .toString()
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const sourceId = item._sourceId || sourceData.sourceId;

      resultsHtml += `
                <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer p-6 h-fit" 
                     onclick="showDetails('${safeId}','${safeName}', '${sourceId}')">
                    <h3 class="text-xl font-semibold mb-3">${safeName}</h3>
                    <p class="text-gray-400 text-sm mb-2">${(item.type_name || "").toString().replace(/</g, "&lt;")}</p>
                    <p class="text-gray-400 text-sm">${(item.vod_remarks || "").toString().replace(/</g, "&lt;")}</p>
                </div>
            `;
    });

    resultsHtml += `
                </div>
            </div>
        `;
  });

  groupedResultsDiv.innerHTML = resultsHtml;
}

// 显示详情 (更新函数参数以接收source)
async function showDetails(id, vod_name, source = "") {
  if (!id) {
    showToast("视频ID无效", "error");
    return;
  }

  // 使用传入的source或当前选择的source
  const detailSource = source || currentApiSource;

  showLoading();
  try {
    const apiParams =
      detailSource === "custom" ? "&customApi=" + encodeURIComponent(customApiUrl) : "&source=" + detailSource;

    // 添加超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("/api/detail?id=" + encodeURIComponent(id) + apiParams, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    const modal = document.getElementById("modal");
    const modalTitle = document.getElementById("modalTitle");
    const modalContent = document.getElementById("modalContent");

    modalTitle.textContent = vod_name || "未知视频";
    currentVideoTitle = vod_name || "未知视频";

    if (data.episodes && data.episodes.length > 0) {
      // 安全处理集数URL
      const safeEpisodes = data.episodes
        .map(url => {
          try {
            // 确保URL是有效的并且是http或https开头
            return url && (url.startsWith("http://") || url.startsWith("https://")) ? url.replace(/"/g, "&quot;") : "";
          } catch (e) {
            return "";
          }
        })
        .filter(url => url); // 过滤掉空URL

      // 保存当前视频的所有集数
      currentEpisodes = safeEpisodes;
      episodesReversed = false; // 默认正序
      modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button onclick="toggleEpisodeOrder()" class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
                        </svg>
                        <span>倒序排列</span>
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(vod_name)}
                </div>
            `;
    } else {
      modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
    }

    modal.classList.remove("hidden");
  } catch (error) {
    console.error("获取详情错误:", error);
    if (error.name === "AbortError") {
      showToast("获取详情超时，请检查网络连接", "error");
    } else {
      showToast("获取详情失败，请稍后重试", "error");
    }
  } finally {
    hideLoading();
  }
}

// 更新播放视频函数，修改为在新标签页中打开播放页面
function playVideo(url, vod_name, episodeIndex = 0) {
  if (!url) {
    showToast("无效的视频链接", "error");
    return;
  }

  // 保存当前状态到localStorage，让播放页面可以获取
  localStorage.setItem("currentVideoTitle", currentVideoTitle);
  localStorage.setItem("currentEpisodeIndex", episodeIndex);
  localStorage.setItem("currentEpisodes", JSON.stringify(currentEpisodes));
  localStorage.setItem("episodesReversed", episodesReversed);

  // 构建播放页面URL，传递必要参数
  const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(
    vod_name
  )}&index=${episodeIndex}`;

  // 在新标签页中打开播放页面
  window.open(playerUrl, "_blank");
}

// 播放上一集
function playPreviousEpisode() {
  if (currentEpisodeIndex > 0) {
    const prevIndex = currentEpisodeIndex - 1;
    const prevUrl = currentEpisodes[prevIndex];
    playVideo(prevUrl, currentVideoTitle, prevIndex);
  }
}

// 播放下一集
function playNextEpisode() {
  if (currentEpisodeIndex < currentEpisodes.length - 1) {
    const nextIndex = currentEpisodeIndex + 1;
    const nextUrl = currentEpisodes[nextIndex];
    playVideo(nextUrl, currentVideoTitle, nextIndex);
  }
}

// 处理播放器加载错误
function handlePlayerError() {
  hideLoading();
  showToast("视频播放加载失败，请尝试其他视频源", "error");
}

// 新增辅助函数用于渲染剧集按钮（使用当前的排序状态）
function renderEpisodes(vodName) {
  const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
  return episodes
    .map((episode, index) => {
      // 根据倒序状态计算真实的剧集索引
      const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
      return `
            <button id="episode-${realIndex}" onclick="playVideo('${episode}','${vodName.replace(
        /"/g,
        "&quot;"
      )}', ${realIndex})" 
                    class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                第${realIndex + 1}集
            </button>
        `;
    })
    .join("");
}

// 新增切换排序状态的函数
function toggleEpisodeOrder() {
  episodesReversed = !episodesReversed;
  // 重新渲染剧集区域，使用 currentVideoTitle 作为视频标题
  const episodesGrid = document.getElementById("episodesGrid");
  if (episodesGrid) {
    episodesGrid.innerHTML = renderEpisodes(currentVideoTitle);
  }

  // 更新按钮文本和箭头方向
  const toggleBtn = document.querySelector('button[onclick="toggleEpisodeOrder()"]');
  if (toggleBtn) {
    toggleBtn.querySelector("span").textContent = episodesReversed ? "正序排列" : "倒序排列";
    const arrowIcon = toggleBtn.querySelector("svg");
    if (arrowIcon) {
      arrowIcon.style.transform = episodesReversed ? "rotate(180deg)" : "rotate(0deg)";
    }
  }
}
