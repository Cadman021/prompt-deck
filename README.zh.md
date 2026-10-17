# 🚀 PromptDeck

**English** | **中文** | [Русский](./README.ru.md) | [Back to English](./README.md)

**PromptDeck** 是一个本地开源桌面应用，用于并排提示和评测大语言模型——完全离线，数据永远不会离开你的机器。

对多个本地模型运行同一个提示——通过 [Ollama](https://ollama.com)、[LM Studio](https://lmstudio.ai) 或 `llama.cpp` 服务器——实时观看流式输出，对比**每秒 Token 数（TPS)**、**首 Token 时间（TTFT)**和总耗时，结果保存在本地 SQLite 中以便日后查看。

![PromptDeck Screenshot](./docs/screenshot-main.png)

---

## ✨ 功能

- 🧭 **App Shell 工作区** — 图标侧边栏（Bench、Tests、Cloud、History、Board、Config）+ 48px 顶栏（服务商连接状态、服务器 URL、模型数量）。结果操作只在有结果时出现在上下文工具栏，模型输出永远拥有最大空间
- 🔎 **自动探测与首次引导** — PromptDeck 自动扫描常见本地端口（Ollama `11434`、LM Studio `1234`、llama.cpp `8080`）并支持一键连接；若未发现任何服务，引导卡片会直接给出 Ollama / LM Studio 安装链接
- ☁️ **云服务商** — 9Router 风格管理 OpenAI 兼容端点：19 个精选服务商（OpenRouter、DeepSeek、Groq、Together AI、OpenAI、xAI Grok、Kimi、NVIDIA NIM、Ollama Cloud、Gemini、Kilo Gateway、Bazaarlink、BytePlus ModelArk、Poolside、Agnes、Xiaomi MiMo、Mistral、B.AI、Anthropic），分免费套餐 / API Key 分区，自定义端点，每个服务商可存多个命名 API Key（附直达 Key 申请链接），详情页可测试连接、挑选模型（搜索、单模型 1-token 探测、启用开关）

  ![Cloud Providers](./docs/screenshot-cloud.png)

  ![Provider Detail](./docs/screenshot-provider-detail.png)

- ⚡ **同时对比 2–4 个模型** — 对本地和云端模型运行同一个提示，实时并排观看流式输出，支持并行或串行模式（串行避免 GPU 争用，本地数字更干净）
- 🔁 **重复运行（1–5 次）** — 报告中位数，tooltip 显示均值±标准差，抖动不再决定胜负
- 💰 **费用追踪** — Bench 列显示单次运行费用，Test Suite 显示每个模型总费用，并冻结存入历史和导出（仅在服务端 token 精确 + 服务商有定价时显示——绝不猜测）
- 🧠 **思考过程** — 推理模型在答案上方显示可折叠的 Thinking 区块
- 🏆 **投票 + 排行榜** — 为每次运行选出最佳答案，按 Elo 评分和平均速度长期追踪每个模型（4 模型对决的胜利比单挑更值钱）
- 🙈 **盲测投票** — 用字母标签隐藏模型身份（列表、图表、Diff 全覆盖）以消除偏见，运行前自动打乱顺序，投票后自动揭晓
- ⚖️ **LLM 裁判** — 一个模型按固定标准（准确/完整/清晰）盲评所有输出，给出建议徽章；最终加冕的永远是你
- ✅ **套件自动检查** — 每个测试可配规则（包含/正则/精确/有效 JSON），单元格显示通过徽章并汇总通过率

  ![Model Leaderboard](./docs/screenshot-leaderboard.png)

- 🧪 **测试套件（批量执行）** — 把 1–10 个测试提示词依次跑遍所有选中模型，用记分板矩阵对比：每格 `tok/s`、每项最快者 👑、按相对速度热力着色、平均 TPS + 最快次数汇总、点击查看完整输出、复制 Markdown、下载 CSV。测试结果会存入历史记录
- 🧩 **可分享的测试套件** — 把套件（提示词 + 自动检查 + 选中模型）导出为 JSON 并导入回来，让基准测试可跨机器复现

  ![Test Suite Scoreboard](./docs/screenshot-testsuite.png)

- 🔌 **多服务商支持** — 连接 [Ollama](https://ollama.com)、[LM Studio](https://lmstudio.ai) 或任意 `llama.cpp` 服务器（OpenAI 兼容 API）
- 📊 **实时指标与可视化图表** — 每次运行追踪 TPS、TTFT 和总耗时，用柱状图一目了然对比所有模型（服务器不报告用量时 `~` 表示估算值）

  ![Benchmark Chart](./docs/screenshot-chart.png)

- 📡 **实时生成反馈** — 运行时显示阶段条（准备中 → 生成中）、实时计时、实时 `~tok/s` 估算和闪烁光标，让较慢的首 token 不再像卡死
- 🏁 **Bench 结论条** — 运行结束后立即看到最快、TTFT 最低、最省的模型，以及最慢者慢多少（百分比）
- 🔍 **并排 Diff** — 逐行对比任意两个输出，含相似度百分比和增删行数

  ![Diff View](./docs/screenshot-diff.png)

- 🕘 **本地历史** — 每次基准测试存入 SQLite，更宽敞的侧边栏：模型芯片不截断、优胜者皇冠、估算 TPS 的 `~` 标记、单次最佳速度和费用汇总，支持全文搜索和 Winners 筛选，Copy JSON / Export CSV / 全库备份与恢复都在面板顶部

  ![History Sidebar](./docs/screenshot-history.png)

- 📝 **Markdown 渲染** — 模型输出完整支持 GFM（表格、代码块等）；远程图片默认不加载、链接用外部浏览器打开
- 💻 **代码高亮** — 代码块带语言标签、一键复制按钮，以及仅在流式输出*结束后*才加载的语法高亮，绝不与本地推理争抢资源
- 💾 **可保存的提示词预设** — 收藏常用提示词，与内置快捷提示词并列

  ![Prompt Presets](./docs/screenshot-presets.png)

- 📄 **精美的 PDF 导出** — 拉丁文内容导出为可选中文本的 PDF；中文等非拉丁文自动走图片导出以保证渲染正确
- ⌨️ **键盘快捷键** — `Ctrl+Enter`（或 `Cmd+Enter`）运行，`Esc` 停止或关闭面板，`Ctrl+K` 聚焦输入框
- ⚙️ **设置面板** — 服务商与连接、外观、语言、高级模型控制（系统提示词、temperature、top-p、上下文长度、server defaults、seed、最大 token 数、重复次数），全部持久化保存

  ![Settings Panel](./docs/screenshot-settings.png)

- 🌑 **三种主题** — 浅色、深色和 **AMOLED 纯黑**（`#000000` 画布 + 霓虹光效）。可从顶栏循环切换或在设置中指定

  ![AMOLED Dark Theme](./docs/screenshot-amoled.png)

- 🌍 **语言选择** — English、Deutsch、Français、中文、Русский 和 فارسی（波斯语完整 RTL 支持），顶栏或设置中的九宫格弹窗

  ![Language Picker](./docs/screenshot-language.png)

- 📋 **一键导出** — 结果工具栏复制 Markdown 报告，历史面板顶部获取完整 JSON 历史 / CSV
- 💾 **备份与恢复** — 在历史侧边栏把整个数据库（运行记录 + 预设）导出/导入为 JSON
- 🔑 **系统钥匙串** — 云 API Key 存在系统凭据库（自动迁移），不再是明文文件
- 🔄 **自动更新** — 从 GitHub releases 签名更新，经你确认后下载安装重启
- 🔒 **默认本地、永远隐私** — 基于 [Tauri](https://tauri.app)，无遥测；仅当你主动配置了 API Key 时才会调用云端

---

## 🖥️ 技术栈

| 层       | 技术                                           |
| -------- | ---------------------------------------------- |
| 外壳     | [Tauri 2](https://tauri.app) (Rust)            |
| 前端     | React + TypeScript + Vite                      |
| 样式     | Tailwind CSS v4                                |
| 状态     | Zustand (持久化)                               |
| 数据库   | SQLite (via `tauri-plugin-sql`)                |
| 图表     | Recharts                                       |
| PDF 导出 | jsPDF + autotable（文本）/ html2canvas（兜底） |
| i18n     | react-i18next                                  |
| Markdown | react-markdown + remark-gfm                    |
| 代码     | react-syntax-highlighter（懒加载）             |
| 测试     | Vitest (`npm test`)                            |

---

## 📦 前置条件

运行 PromptDeck 之前，请先启动至少一个本地 LLM 后端：

- **[Ollama](https://ollama.com)** — 本地运行（`ollama serve`），至少 pull 一个模型：
  ```bash
  ollama pull llama3
  ```
- **或 [LM Studio](https://lmstudio.ai)** — 加载模型并启动本地服务器（Developer 选项卡 → Start Server）
- **或 [`llama.cpp` server](https://github.com/ggerganov/llama.cpp)** — 启用 OpenAI 兼容端点运行

还需要：

1. **[Rust](https://www.rust-lang.org/tools/install)**（stable 工具链）
2. **[Node.js](https://nodejs.org)**（v18+）和 npm

---

## 🚀 开始使用

```bash
# 1. 克隆仓库
git clone https://github.com/Cadman021/prompt-deck.git
cd prompt-deck

# 2. 安装依赖
npm install

# 3. 开发模式运行
npm run tauri dev
```

构建各系统生产版本：

```bash
npm run tauri build
```

---

## 📸 使用流程

1. 启动应用——它会自动扫描本地服务器（也可在 Config 面板选择服务商）并列出可用模型；若什么都没运行，引导卡片会帮你启动一个
2. 云端模型：打开 **Cloud** 页面，给服务商添加 API Key，刷新模型列表，启用想用的模型
3. 在 **Bench** 页面添加最多 4 个模型列（本地和云端可混搭），写提示词（或选用/保存预设）
4. 点击 **Run**（或 `Ctrl+Enter`）——所有选中模型实时流式输出
5. 用图表即时对比 TPS / TTFT，为最佳答案加冕，用 **Diff** 对比任意两个输出，或看 **Leaderboard** 的长期统计
6. 需要更深对比？切换到 **Tests** 页面，堆 10 个提示词，点 **Run suite**，看记分板就知道整个 batch 谁最强
7. 在历史侧边栏回看过去的运行，或导出 PDF、Markdown、JSON、CSV 完整报告

---

## 🗺️ 路线图

- [x] 云服务商 — 目录、API Key、模型挑选，Bench + Test Suite 双可用
- [x] 云端费用估算（Bench 单次费用、Test Suite 合计、冻结存档）
- [x] 签名应用内自动更新（GitHub releases）
- [x] 测试套件 — 批量执行 + 记分板
- [x] AMOLED 深色主题（+ 浅色 / 深色）
- [x] 双输出并排 Diff
- [x] 基准历史导出 CSV
- [x] 自动探测本地服务器 + 首次引导卡片
- [x] 可分享的测试套件（JSON 导出 / 导入）
- [x] 流式阶段、计时与实时 tok/s
- [x] 语法高亮且可复制的代码块
- [x] API Key 存入系统钥匙串（自动迁移、内存缓存、静默兜底）
- [ ] 云端运行费用/用量统计

欢迎贡献想法 — 见下方 [Contributing](#-contributing)。

---

## 🤝 参与贡献

欢迎 Issues 和 PR！想加功能或修 bug：

1. Fork 仓库
2. 建分支 (`git checkout -b feature/my-feature`)
3. 提交修改
4. 发起 Pull Request

大改动请先开 issue 讨论，避免白费力气。详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 🙏 贡献者

感谢每一位让 PromptDeck 更好的人：

- [@AyanJaved](https://github.com/AyanJaved) — 历史卡片相对时间
- [@lb1192176991-lab](https://github.com/lb1192176991-lab) — Winners 筛选、重置设置、Ctrl+K 聚焦
- [@afifm561](https://github.com/afifm561) — 测试套件失败重试按钮

想加入？看看 [`good first issue`](https://github.com/Cadman021/prompt-deck/labels/good%20first%20issue) —— 欢迎新人！

---

## 📄 许可证

本项目采用 [GNU 通用公共许可证 v3.0](./LICENSE)。

---

## ⭐ 支持

如果觉得 PromptDeck 有用，点个 star 吧 — 能让更多人发现它，也是对持续开发的鼓励！
