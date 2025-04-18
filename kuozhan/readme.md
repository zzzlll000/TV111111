player.html   增加mobile-touch-control.js  实现长按加速
    <script src="https://s4.zstatic.net/ajax/libs/hls.js/1.5.6/hls.min.js" integrity="sha256-X1GmLMzVcTBRiGjEau+gxGpjRK96atNczcLBg5w6hKA=" crossorigin="anonymous"></script>
    <script src="https://s4.zstatic.net/ajax/libs/dplayer/1.26.0/DPlayer.min.js" integrity="sha256-OJg03lDZP0NAcl3waC9OT5jEa8XZ8SM2n081Ik953o4=" crossorigin="anonymous"></script>
    <script src="js/mobile-touch-control.js"></script>
    <script src="js/config.js"></script>
player.html   增加css样式 长按和屏蔽右键提示以及移动端优化
    /* 添加移动端触摸提示样式 */
        .mobile-touch-hint {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 16px;
            z-index: 1000;
            pointer-events: none;
        }

        /* 新增：隐藏DPlayer菜单 */
        .dplayer-menu.dplayer-menu-show {
            display: none !important;
        }

            /* 新增移动端响应式布局 */
        @media (max-width: 768px) {
            /* 调整播放器高度 */
            #player {
                height: 40vh;
            }
        }
            /* 超小屏幕设备优化 */
        @media (max-width: 480px) {
            #player {
                height: 30vh;
            }
        }
