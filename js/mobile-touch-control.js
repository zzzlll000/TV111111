class MobileTouchControl {
    constructor(player) {
        this.player = player;
        this.touchStartX = 0;
        this.touchStartTime = 0;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.originalPlaybackRate = 1;
        
        this.init();
    }

    init() {
        // 增强容器选择器兼容性（同时匹配player2.html的#playerContainer和默认的.dplayer）
        const container = document.querySelector('#playerContainer, .dplayer, #player') || this.player.container;
        
        // 移除可能存在的旧事件监听
        container.removeEventListener('touchstart', this.handleTouchStart.bind(this));
        container.removeEventListener('touchmove', this.handleTouchMove.bind(this));
        container.removeEventListener('touchend', this.handleTouchEnd.bind(this));
        
        // 添加新事件监听（使用捕获阶段和passive:false提高优先级）
        container.addEventListener('touchstart', this.handleTouchStart.bind(this), {
            capture: true,
            passive: false
        });
        container.addEventListener('touchmove', this.handleTouchMove.bind(this), {
            capture: true,
            passive: false
        });
        container.addEventListener('touchend', this.handleTouchEnd.bind(this), {
            capture: true
        });
    }

    handleTouchStart(e) {
        // 新增：检查是否在进度条上操作（避免与player2.html的进度条点击冲突）
        if (e.target.closest('.dplayer-bar-wrap') || 
            document.querySelector('.dplayer-bar-wrap.dplayer-bar-active')) {
            return;
        }

        if (!this.player.video) return;
        
        this.touchStartX = e.touches[0].clientX;
        this.touchStartTime = Date.now();
        this.isLongPress = false;
        
        this.longPressTimer = setTimeout(() => {
            this.isLongPress = true;
            this.originalPlaybackRate = this.player.video.playbackRate;
            this.player.video.playbackRate = 2.0;
            this.showHint('2.0x 加速播放');
        }, 500);
    }

    handleTouchMove(e) {
        if (!this.player.video || this.isLongPress) return;
        
        const touchX = e.touches[0].clientX;
        const deltaX = touchX - this.touchStartX;
        
        // 滑动距离与跳转时间成正比 (每100像素=5秒)
        const seekTime = deltaX * 0.05; 
        const currentTime = this.player.video.currentTime + seekTime;
        
        // 限制在视频时间范围内
        const newTime = Math.max(0, Math.min(currentTime, this.player.video.duration));
        this.player.seek(newTime);
        
        // 显示滑动提示
        this.showHint(deltaX > 0 ? `前进 ${Math.abs(seekTime).toFixed(1)}秒` : `后退 ${Math.abs(seekTime).toFixed(1)}秒`);
    }

    handleTouchEnd() {
        clearTimeout(this.longPressTimer);
        
        if (this.isLongPress && this.player.video) {
            // 恢复原始播放速度
            this.player.video.playbackRate = this.originalPlaybackRate;
            this.showHint('恢复正常速度');
            this.isLongPress = false;
        }
    }

    showHint(text) {
        // 使用DPlayer的通知系统显示提示
        if (this.player.notice) {
            this.player.notice(text, 2000);
        } else {
            // 备用提示方案
            const hint = document.createElement('div');
            hint.className = 'mobile-touch-hint';
            hint.textContent = text;
            document.body.appendChild(hint);
            
            setTimeout(() => {
                hint.remove();
            }, 2000);
        }
    }
}

// 导出初始化函数
function initMobileTouchControl(player) {
    return new MobileTouchControl(player);
}
