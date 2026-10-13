# Jiuwen Bot

这是使用 JiuwenSwarm 进程 SDK 的独立本地浏览器应用。现有 `../ds-bot/` 仍是 DSH 插件。首个小型后端包含 Chief + Worker、两个私聊和一个群聊、流式回复、受权限控制的 `read_note` 工具、SQLite 历史与取消功能。

## 确定性演示

需要 Node.js 22.19+（或 24+）、Git 和 npm。在 `jiuwen-bot/` 中运行：

```sh
npm ci
npm run setup:sdk
npm run doctor -- --mock
npm test
npm run smoke
npm run dev
```

打开 **http://127.0.0.1:4318**。演示使用锁定版本的 TypeScript SDK 和原创子进程测试夹具，不调用模型。发送 `read note` 测试审批、`question` 测试提问、`hang` 后点击 Stop 测试取消。Team 对话按 Chief → Worker → Chief 执行。Ctrl+C 停止服务与运行中的任务。

`setup:sdk` 将 `runtime-lock.json` 指定的版本下载到 Git 忽略的 `.runtime/`，使用上游 npm 锁文件构建 SDK。SDK 是依赖，不复制到本应用源码中。新检出应先 setup 再测试；本应用依赖独立于 DS Bot。

## 使用 Python Runtime

锁定的上游版本要求 **Python >=3.11,<3.14**。在 macOS 或 Linux 上运行：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install ./.runtime/jiuwenswarm
```

按 JiuwenSwarm 文档配置模型，运行时数据目录必须为应用专用的 **`jiuwen-bot/.data/live/runtime/`**；配置文件位于 `runtime/config/config.yaml`。不要使用已有 JiuwenSwarm 或 DSH 主目录，也不要启用无关连接器。本应用不会生成、导入、输出或复制凭据。若配置使用环境变量引用，可通过 `JIUWEN_BOT_CREDENTIAL_VARS` 指定以 `API_KEY`、`TOKEN`、`SECRET` 或 `PASSWORD` 结尾的必要凭据变量名（逗号分隔）；只有这些值会传给子进程。演示与测试无需凭据。

```sh
npm run doctor
npm start
```

Doctor 检查锁定版本、SDK 构建、Python 版本、模块可用性、能力查询子进程和非空模型目录，不生成文本，也不能证明凭据有效。缺少必需进程能力时，服务拒绝启动。

| 环境变量 | 含义 |
| --- | --- |
| `PORT` | HTTP 端口，默认 `4318`；始终绑定 `127.0.0.1` |
| `JIUWEN_BOT_DATA` | 专用数据目录，默认 `.data/live` 或 `.data/mock` |
| `JIUWEN_BOT_PYTHON` | 安装环境中的 Python 可执行文件绝对路径 |
| `JIUWEN_BOT_CREDENTIAL_VARS` | 显式传递的凭据变量名，不在此设置中填写凭据值 |

不要将 `~/.dsh`、用户 DSH 实例或现有 JiuwenSwarm 主目录用于本应用或测试。每次 SDK 调用均清理继承环境，并为 Python 设置独立的 home、临时目录和 `JIUWENSWARM_DATA_DIR`。

## 验证状态

Linux 上确定性的 SDK/子进程测试与本地 API 冒烟测试通过。已尝试安装完整 Python Runtime，但其锁定的 `agent-core` GitCode 依赖在本环境返回 HTTP 418，因此 **尚未验证** Python 生成与真实模型行为。未授权或执行真实模型调用。目标 Mac 的启动、关闭与真实模型验收也尚未完成；Linux 夹具通过不代表 Mac 已验证。

详见 [架构](docs/architecture.md)、[API](docs/api.md)、[验收与比较](docs/acceptance.md)、[评估记录](docs/evaluation.md)。浏览器客户端用于测试后端；Electron、移动端、高级记忆、调度、浏览器自动化、连接器与原生团队编排暂缓。

上游参考：[锁定 SDK 契约](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/sdks/README.md)、[协议](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/sdks/PROTOCOL.md)、[配置](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/docs/en/Configuration.md)。产品参考 Fei 的 DeepSeek-Bot；本应用代码与界面为原创实现。
