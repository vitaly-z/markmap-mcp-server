# Markmap MCP 服务器

![Sample Mindmap](./docs/markmap_zh.svg)

[![NPM Version](https://img.shields.io/npm/v/@jinzcdev/markmap-mcp-server.svg)](https://www.npmjs.com/package/@jinzcdev/markmap-mcp-server)
[![NPM Downloads](https://img.shields.io/npm/dm/@jinzcdev/markmap-mcp-server.svg)](https://www.npmjs.com/package/@jinzcdev/markmap-mcp-server)
[![GitHub License](https://img.shields.io/github/license/jinzcdev/markmap-mcp-server.svg)](LICENSE)
[![English Doc](https://img.shields.io/badge/English-View-blue)](README.md)
[![Stars](https://img.shields.io/github/stars/jinzcdev/markmap-mcp-server)](https://github.com/jinzcdev/markmap-mcp-server)

Markmap MCP Server 基于 [模型上下文协议 (MCP)](https://modelcontextprotocol.io/introduction)，使用开源项目 [markmap](https://github.com/markmap/markmap) 将 Markdown 转为交互式思维导图，并支持在**服务端**导出 PNG / JPG / SVG，便于 Agent 在对话中直接消费。转换过程在**本地完成**，无需第三方 API Key。

## 特性

- **Markdown 转思维导图**：标题与嵌套列表 → 交互式 HTML 导图
- **Agent 友好返回**：可返回文件路径、内联 HTML 和/或图片内容（启动时配置）
- **服务端导出**：通过 Playwright 导出 PNG / JPG / SVG，供聊天内预览
- **浏览器预览**：可配置的打开行为 — 始终打开、始终不打开、或由 Agent 决策（启动时配置）
- **页面导出工具栏**：在浏览器中也可一键导出图片或复制 Markdown
- **离线 HTML**：启动参数 `--offline` 内联资源，无需访问 CDN
- **文件工作流**：支持 `inputPath`、列出近期文件、清理旧文件
- **隐私优先**：纯本地生成，无云端导图 API

## 前提条件

1. Node.js **v20 或以上**
2. 使用**服务端图片导出**（`format: png|jpg|svg`）时需安装 Playwright 与 Chromium：

```bash
npm install playwright
npx playwright install chromium
```

（`playwright` 为本包的可选依赖。）

## 安装

```bash
# 从 npm 安装
npm install @jinzcdev/markmap-mcp-server -g

# 基本运行
npx -y @jinzcdev/markmap-mcp-server

# 指定输出目录并自动打开浏览器
npx -y @jinzcdev/markmap-mcp-server --output /path/to/output/directory --open always
```

### Docker

```bash
docker build -t markmap-mcp-server .
docker run --rm -i \
  -v /path/to/output:/data/markmap \
  -e MARKMAP_DIR=/data/markmap \
  markmap-mcp-server
```

或克隆仓库本地运行：

```bash
git clone https://github.com/jinzcdev/markmap-mcp-server.git
cd markmap-mcp-server
npm install && npm run build
# 可选：启用服务端图片导出
npx playwright install chromium
node build/index.js
```

## 使用方法

将以下配置添加到 MCP 客户端（Cursor / Claude Desktop 等）：

```json
{
  "mcpServers": {
    "markmap": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@jinzcdev/markmap-mcp-server"],
      "env": {
        "MARKMAP_DIR": "/path/to/output/directory",
        "MARKMAP_OPEN": "never",
        "MARKMAP_RETURN_MODE": "path"
      }
    }
  }
}
```

### 服务启动偏好（CLI / 环境变量）

以下选项在**服务启动时**决定，**不是**工具入参：

| 偏好       | CLI               | 环境变量              | 可选值                                                   | 默认值           |
| ---------- | ----------------- | --------------------- | -------------------------------------------------------- | ---------------- |
| 输出目录   | `--output` / `-o` | `MARKMAP_DIR`         | 任意目录路径                                             | `~/.markmap-mcp` |
| 打开浏览器 | `--open [mode]`   | `MARKMAP_OPEN`        | `always` \| `never` \| `agent`（裸 `--open` = `always`） | `never`          |
| 返回模式   | `--return-mode`   | `MARKMAP_RETURN_MODE` | `path` \| `content` \| `both`                            | `path`           |
| 离线 HTML  | `--offline`       | `MARKMAP_OFFLINE`     | `true` \| `false`（CLI 仅需加 `--offline` 表示开启）     | `false`          |

命令行参数优先于环境变量；`--output` 优先于 `MARKMAP_DIR`。

**`--open`：** 裸写 `--open` 等同于 `always`；也可显式传 `--open always|never|agent`。非法值会报错退出。未写 flag 时使用 `MARKMAP_OPEN`（默认 `never`）。

**返回模式：**

| 模式      | 含义                                                     |
| --------- | -------------------------------------------------------- |
| `path`    | 仅路径 JSON（`htmlFilePath` + `filePath`）               |
| `content` | 仅内联内容（原始 HTML 文本，或 base64 图片块）— 不含路径 |
| `both`    | 路径 JSON + 内联内容                                     |

生成的 HTML 固定包含 markmap 工具栏、英文导出按钮文案，并默认展开全部节点。

### 示例提示词

- 「把这篇设计文档整理成思维导图。」
- 「将 `./notes/architecture.md` 转成导图。」
- 「根据下面大纲生成 PNG 思维导图，直接在对话里展示。」

## 可用工具

### `markdown_to_mindmap`

将 Markdown 转为交互式思维导图（可选导出图片）。

| 参数        | 类型                              | 默认值  | 说明                                                                                                                     |
| ----------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `markdown`  | string                            | —       | Markdown 内容（与 `inputPath` 至少提供一个；两者都给时以 markdown 为准）                                                 |
| `inputPath` | string                            | —       | 本地 Markdown 文件绝对路径                                                                                               |
| `format`    | `html` \| `png` \| `svg` \| `jpg` | `html`  | 输出格式；图片格式需 Playwright                                                                                          |
| `filename`  | string                            | 自动    | 输出文件名（会清洗；必要时加 `markmap-` 前缀；同名覆盖）                                                                 |
| `open`      | boolean                           | `false` | 是否在浏览器中打开结果。**仅当服务器 open 模式为 `agent` 时出现在工具入参中**（`--open agent` / `MARKMAP_OPEN=agent`）。 |

**返回值（`returnMode=path`）：**

```json
{
  "htmlFilePath": "/path/to/markmap-….html",
  "filePath": "/path/to/markmap-….html"
}
```

图片格式下 `filePath` 为图片路径，`htmlFilePath` 仍为 HTML 源文件。

**返回值（`returnMode=content`）：** 原始 HTML 文本块，或 PNG/JPG/SVG 的 MCP `image`（base64）内容块 — 不含路径 JSON。HTML ≥200KB 时回退为路径 JSON。

**返回值（`returnMode=both`）：** 路径 JSON + 上述内联内容。

> **说明：** 页面内的缩放/折叠与「Export PNG/JPG/SVG」按钮属于 **HTML 预览体验**。Agent 若要直接拿到图片，请使用工具参数 `format: png|jpg|svg`。

### `list_mindmaps`

列出输出目录中近期生成的导图文件（最新优先）。仅包含文件名以 `markmap` 开头的文件。

| 参数    | 类型   | 默认值 | 说明                  |
| ------- | ------ | ------ | --------------------- |
| `limit` | number | `20`   | 最多返回条数（1–200） |

返回 `{outputDir, files: [{name, filePath, size, mtimeMs, mtime}]}`。

### `get_mindmap`

按绝对路径获取已生成的导图文件。路径必须位于配置的输出目录内（禁止路径穿越）。

| 参数       | 类型   | 默认值 | 说明                              |
| ---------- | ------ | ------ | --------------------------------- |
| `filePath` | string | —      | 导图文件（HTML 或图片）的绝对路径 |

返回 JSON `{filePath, mimeType, size}`。HTML/SVG 且小于 200KB 时另附文本内容块；PNG/JPG 仅返回元数据（无 image 块）— 需要像素时请用 `markdown_to_mindmap` 的 `format=png|jpg` 重新导出。

### `cleanup_mindmaps`

按天数清理（或清空）输出目录中的导图文件。

| 参数         | 类型    | 默认值  | 说明                                       |
| ------------ | ------- | ------- | ------------------------------------------ |
| `maxAgeDays` | number  | `7`     | 删除超过指定天数的文件                     |
| `all`        | boolean | `false` | 为 true 时删除全部导图文件                 |
| `dryRun`     | boolean | `false` | 为 true 时仅预览将被删除的文件，不实际删除 |

### Prompt：`mindmap_from_content`

辅助 Prompt：先将内容整理为层级 Markdown，再调用 `markdown_to_mindmap`。

| 参数    | 类型   | 默认值 | 说明                     |
| ------- | ------ | ------ | ------------------------ |
| `topic` | string | —      | 要整理成导图的主题或原文 |

## 相关项目

| 项目                                                                            | 说明                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **[MarkXMind Online](https://github.com/jinzcdev/markxmind)**                   | 用 Markdown 在线创建 XMind。[立即体验 →](https://markxmind.js.org/) |
| **[Obsidian MarkXMind Plugin](https://github.com/jinzcdev/obsidian-markxmind)** | 在 Obsidian 中渲染 XMindMark 思维导图。                             |

## 许可证

本项目采用 [MIT](./LICENSE) 许可证。
