---
title: "完善 Master 管理员初始化流程"
type: plan
status: completed
created_at: "2026-08-31"
archived_at: "2026-08-31"
---
# 完善 Master 管理员初始化流程

## 实现清单

- [x] 抽离管理员 bootstrap，支持 `ADMIN_*`、兼容 `SEED_ADMIN_*` 和 8-64 位密码校验
- [x] 将管理员初始化与演示 seed 分离，生产默认关闭 `AUTO_SEED`
- [x] 增加显式管理员密码重置命令、发行包脚本和 Docker 用法
- [x] 加强 `JWT_SECRET` 安全校验并同步 Docker/Compose/发行包配置
- [x] 更新 README、部署指南、数据模型说明与 CHANGELOG
- [x] 补充服务端回归测试并完成本地与 WSL Docker 验证
