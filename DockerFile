# 使用官方 Nginx 镜像作为基础镜像
FROM nginx:latest

# 将本地的网页文件复制到 Nginx 的默认静态文件目录
COPY . /usr/share/nginx/html

# 暴露 80 端口
EXPOSE 80

# 启动 Nginx 并保持前台运行
CMD ["nginx", "-g", "daemon off;"]