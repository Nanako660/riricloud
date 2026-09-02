---
title: "Nginx 反向代理与订阅伪静态链接"
type: plan
status: completed
target_version: 0.4.x
created_at: "2026-09-02"
archived_at: "2026-09-02"
---
# Nginx 反向代理与订阅伪静态链接

## 目标

- 保持 RiriCloud 唯一真实订阅接口为 `/api/v1/sub/<UUID>`。
- 通过 Nginx rewrite 支持 `/<UUID>` 或 `/<prefix>/<UUID>` 短订阅地址。
- 让用户端可配置展示标准 API 链接或 Nginx 短链接。

## 任务

- [x] 创建特性分支并确认工作区干净。
- [x] 新增 `subscriptionShortLinksEnabled` 系统设置及公开设置字段。
- [x] 统一仪表盘和订阅页的订阅 URL 构造逻辑。
- [x] 添加 Nginx rewrite、普通反向代理和 WebSocket 配置示例。
- [x] 同步 API、数据模型、架构、部署、前端和视觉验证文档。
- [x] 补充单元测试并运行完整质量门禁。
- [x] 完成后归档本规划文档。
