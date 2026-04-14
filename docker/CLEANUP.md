# Docker 资源清理指南

## 常用命令

```bash
# 启动
docker compose up -d

# 停止（保留数据）
docker compose down

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f postgres

# 进入数据库
docker exec -it unimemory-postgres psql -U unimemory -d unimemory
```

## 清理命令（按需选择）

```bash
# 停止并删除容器（保留数据卷 ✅）
docker compose down

# 停止并删除容器 + 数据卷（⚠️ 数据会丢失）
docker compose down -v

# 单独删除数据卷
docker volume rm unimemory_pgdata

# 查看所有 unimemory 相关资源
docker volume ls | grep unimemory
docker ps -a | grep unimemory
```

## 资源清单

| 资源 | 名称 | 类型 | 说明 |
|------|------|------|------|
| 容器 | `unimemory-postgres` | container | PostgreSQL + pgvector |
| 数据卷 | `unimemory_pgdata` | volume | 数据库文件持久化 |
| 网络 | `unimemory_default` | network | docker compose 默认网络 |

删除时按顺序：先 `down`，再按需 `volume rm`。
