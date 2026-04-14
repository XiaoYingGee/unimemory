#!/bin/bash
# scripts/setup-local.sh
# Mac 本机环境初始化（不需要 Docker 或 sudo）
# 依赖：brew, node >= 18

set -e

echo "🌸 UniMemory 本机环境初始化"
echo ""

# 1. 检查 PostgreSQL
if ! command -v psql &> /dev/null; then
  echo "📦 安装 PostgreSQL 16..."
  brew install postgresql@16
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

# 2. 启动 PostgreSQL 服务
echo "🚀 启动 PostgreSQL 服务..."
brew services start postgresql@16

# 等待服务启动
sleep 2

# 3. 创建数据库和用户
echo "🗄️  初始化数据库..."
createdb unimemory 2>/dev/null || echo "数据库已存在，跳过"
psql -d unimemory -c "CREATE USER unimemory WITH PASSWORD 'unimemory';" 2>/dev/null || echo "用户已存在，跳过"
psql -d unimemory -c "GRANT ALL PRIVILEGES ON DATABASE unimemory TO unimemory;"

# 4. 安装 pgvector
echo "🔌 安装 pgvector 扩展..."
brew install pgvector 2>/dev/null || echo "pgvector 已安装"
psql -d unimemory -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d unimemory -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# 5. 运行数据库迁移
echo "📋 运行数据库迁移..."
psql -d unimemory -f src/db/migrations/001_init.sql

# 6. 安装 Node 依赖
echo "📦 安装 Node 依赖..."
npm install

# 7. 复制环境变量
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  请填写 .env 中的 OPENAI_API_KEY"
fi

echo ""
echo "✅ 初始化完成！"
echo ""
echo "启动 MCP Server:"
echo "  npm run dev"
echo ""
echo "运行测试:"
echo "  npm test"
