```docker-compose.yaml
services:
  liberTV:      # 服务名称，可以自定义
    image: dengshendocker/libretv:latest  # 使用你的 Docker Hub 镜像，替换为实际镜像名
    container_name: liberTV   # 可选，指定容器名称
    ports:
      - "8899:80"
    restart: unless-stopped  # 容器退出时自动重启，除非手动停止
```