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
        const container = this.player.container;
        
        container.addEventListener('touchstart', this.handleTouchStart.bind(this));
        container.addEventListener('touchmove', this.handleTouchMove.bind(this));
        container.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    handleTouchStart(e) {
        if (!this.player.video) return;
        
        this.touchStartX = e.touches[0].clientX;
        this.touchStartTime = Date.now();
        this.isLongPress = false;
        
        // 长按加速逻辑
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
        
        // 无论是否是长按，都尝试恢复播放速度
        if (this.player.video && this.player.video.playbackRate !== this.originalPlaybackRate) {
            this.player.video.playbackRate = this.originalPlaybackRate;
            this.showHint('恢复正常速度');
        }
        this.isLongPress = false; // 确保状态被重置
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
