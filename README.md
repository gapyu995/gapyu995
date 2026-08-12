# 🐍 霓虹贪吃蛇 · GitHub 贡献图

> Neon Snake × GitHub Contribution Grid — 蛇在贡献网格上游走，吃掉贡献点身体变长，20 步后留下永久痕迹。

## 🎮 游戏规则

- 蛇自动寻路（BFS + Flood Fill 策略），朝最近的食物移动
- **Phase 1** (< 20 步) ：吃食物 → 蛇身 +1
- **Phase 2** (≥ 20 步) ：在原始 GitHub 贡献格上吃食物 → 留下永久贡献标记 + 蛇身 -2
- 食物只出现在你真正有过 GitHub 贡献的格子上
- 同时最多 4 个食物，带出现动画

## 📸 预览

### 静态图
<img src="https://raw.githubusercontent.com/gapyu995/github-pacman-custom/main/snake-contribution.svg" alt="Snake Contribution SVG" />

### 动画
<img src="https://raw.githubusercontent.com/gapyu995/github-pacman-custom/main/snake-contribution.gif" alt="Snake Contribution GIF" />

## 🚀 本地运行

```bash
npm install
node fetchData.js          # 获取你的 GitHub 贡献数据
node generateGame.js       # 生成 snake-contribution.svg
node generateGif.js        # 生成 snake-contribution.gif
```

## ⚙️ GitHub Actions

每日自动更新 `snake-contribution.svg`（UTC 0:00）。

## 🛠 技术栈

- Node.js + `@octokit/rest` 获取 GitHub 贡献数据
- 共享游戏引擎 `gameEngine.js`（Snake 类、BFS 寻路、Flood Fill AI）
- SVG：纯字符串拼接 + 霓虹发光滤镜
- GIF：Jimp 逐帧渲染 + gif-encoder-2
