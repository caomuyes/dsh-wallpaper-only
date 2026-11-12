# dsh-wallpaper

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.1--rc.2-5b8cff)

给 **DeepSeek Harness（DSH）Web GUI** 加壁纸的插件：本地图片或内置渐变铺在界面最底层，
可调遮罩浓度与背景模糊，并可选把外壳面板变成半透明"玻璃"，让壁纸透出来。

- 纯浏览器端实现，图片只在本地压缩（`canvas` → WebP），**不上传任何服务器**，不联网。
- 不改 DSH 安装包，只通过客户端插件注入一个背景层与几条 CSS 变量覆盖，卸载即还原。
- 支持浅色/深色主题跟随，Windows 桌面端与 `dsh web` 浏览器端都可用。

> **本项目目的是提供只修改 DSH 壁纸效果的插件**：只增加/替换壁纸背景与可选的玻璃面板透明度，
> 不改配色方案、字体、图标、布局等其它外观设置；关闭或卸载后界面完全还原，与其它 DSH 外观类插件互不替代。

## 功能

| 功能 | 说明 |
| --- | --- |
| 本地图片 | 选择或**拖拽**图片，压缩到最长边 2560px 后存 `IndexedDB`，换会话/重启不丢 |
| 内置渐变 | 极光 / 暮色 / 森林 / 米纸 / 午夜 五套预设，选中态有高亮光环 |
| 遮罩浓度 | 壁纸与内容之间的薄纱（浅色为白、深色为近黑），保证文字可读 |
| 背景模糊 | 只模糊背景层，不影响内容；设置页里实时预览 |
| 玻璃面板 | 半透明外壳、侧栏、标题栏，透明度由"面板不透明度"滑块控制 |
| 主题配色 | 跟随系统 / 强制浅色 / 强制深色；壁纸选择互不干扰 |

## 安装

### 方式一：会话里让 agent 安装（推荐）

把本目录交给 DSH 会话，令 agent 执行 `plugin_manager` 的 `install_bundle`（target 为本地目录绝对路径）。

### 方式二：命令行

```bash
# 本地目录（link 方式，改代码即时生效）
dsh plugin --profile desktop add link:"E:\path\to\dsh-wallpaper"

# 直接从 GitHub 安装
dsh plugin --profile desktop add github:caomuyes/dsh-wallpaper-only

# 卸载
dsh plugin --profile desktop remove dsh-wallpaper
```

安装后刷新页面（`Ctrl+Shift+R`）或重启桌面端，在 **设置 → 壁纸** 中配置。

> 仓库名为 `dsh-wallpaper-only`（强调"只改壁纸"），插件包名 / 插件 id 仍是 `dsh-wallpaper`，
> 因此卸载命令用 `remove dsh-wallpaper`。
> 桌面端安装时如提示 profile 未初始化，先打开一次桌面端再执行命令。

## 使用

1. 打开 **设置 → 壁纸**。
2. 选一张本地图片（或点一个渐变预设）。
3. 按需调整 **遮罩浓度**、**背景模糊**、**玻璃面板** 与 **面板不透明度**。
4. 设置即时生效并保存；"重置"恢复默认（极光渐变、遮罩 0.45、玻璃开、面板 0.82）。

默认配置：启用壁纸、极光渐变、遮罩 0.45、不模糊、玻璃开启、面板不透明度 0.82、主题跟随系统。

## 实现原理（为什么能透出来）

1. 在 `body` 里插一个 `position: fixed; inset: 0; z-index: -1` 的 `#dsh-wallpaper-layer`，
   用 `::after` 叠遮罩；`z-index: -1` 让它待在所有应用内容下面。
2. 把 `html` / `body` / `#root` 背景置透明，并把 `--dsw-alias-bg-base` 覆盖为 `transparent`，
   否则应用外壳的实心底色会把壁纸整个盖住。
3. **DSH 的主题 token 定义在 `body` 上**（`body` 与 `body[data-ds-dark-theme]`），
   所以透明与玻璃的覆盖必须写在 `body` 上；只写 `html` 会被 body 的同名声明遮蔽，界面依旧不透明。
4. Windows 桌面端整窗外框 `.mP3x-q_frame` 会用 `--dsw-specific-sidebar-fill` 铺满，
   插件额外把 `[class*="q_frame"]` 背景置透明，只让侧栏/标题栏保留（半透明）面板色。
5. 面板底色来自主题 token，所以玻璃效果只是改 token 的值，不改应用的任何组件。

## 兼容性

- DSH `>= 0.2.1-rc.2`（`package.json` 的 `engines.dsh`），已在 `0.2.2-rc.1` 桌面端实测。
- 浏览器端需要 `IndexedDB`；不可用时自动回退 `localStorage`。
- 只覆盖主题里与背景相关的 token；若将来 DSH 新增实色层，可能需要补一条 CSS 覆盖。

## 已知限制

- 外观设置存浏览器 `localStorage`，图片存 `IndexedDB`（桌面端按站点同源持久）：
  换浏览器或清站点数据会丢失，重新选图即可。
- 图片压缩在浏览器里完成，很大的图（如 8000px 原图）会有短暂卡顿。
- 与其它改写主题变量的插件可能互相覆盖，按加载顺序生效。

## 目录结构

```
dsh-wallpaper/
├─ package.json          # dsh 插件元数据：bundle patch + client 入口
├─ cordis.patch.yml      # bundle 层：插入 dsh-wallpaper 插件行
├─ lib/index.js          # 宿主半（空插件，仅让 bundle 行成立）
├─ lib/client.js         # 浏览器半：背景层、玻璃 token、设置页
├─ CHANGELOG.md
└─ LICENSE
```

## English

A wallpaper plugin for the DeepSeek Harness Web GUI: local images or built-in gradients behind the
whole app, adjustable scrim & blur, optional translucent "glass" panels. Images are compressed in the
browser and stored in `IndexedDB` — nothing is uploaded. Works on the Windows desktop app and `dsh web`.

**Scope: this project only changes the wallpaper effect** (background image/gradient plus optional panel
translucency). It does not touch color schemes, fonts, icons or layout, and removing it restores the
original UI — it does not replace other DSH appearance plugins.

Install: `dsh plugin --profile desktop add github:caomuyes/dsh-wallpaper-only`, then open
**Settings → Wallpaper**. The package/plugin id stays `dsh-wallpaper`; the repository name carries `-only`.

## License

[MIT](LICENSE)
