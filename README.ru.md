# 🚀 PromptDeck

**English** | [中文](./README.zh.md) | **Русский** | [Back to English](./README.md)

**PromptDeck** — локальная open-source десктоп-студия для промптов и бенчмаркинга LLM бок о бок — полностью офлайн, данные никогда не покидают ваш компьютер.

Запускайте один промпт сразу на нескольких локальных моделях — через [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai) или сервер `llama.cpp` — смотрите стрим в реальном времени и сравнивайте **токены/сек (TPS)**, **время до первого токена (TTFT)** и общее время; результаты сохраняются локально в SQLite.

![PromptDeck Screenshot](./docs/screenshot-main.png)

---

## ✨ Возможности

- 🧭 **App Shell** — иконки-сайдбар (Bench, Tests, Cloud, History, Board, Config) + slim-топбар 48px (статус подключения, URL сервера, число моделей). Кнопки действий появляются только когда есть результаты
- ☁️ **Облачные провайдеры** — эндпоинты в стиле 9Router: каталог из 19 провайдеров (OpenRouter, DeepSeek, Groq, Together AI, OpenAI, xAI Grok, Kimi, NVIDIA NIM, Ollama Cloud, Gemini, Kilo Gateway, Bazaarlink, BytePlus ModelArk, Poolside, Agnes, Xiaomi MiMo, Mistral, B.AI, Anthropic) с секциями Free Tier / API Key, свои эндпоинты, именованные API-ключи с прямыми ссылками на их создание, страница провайдера с тестом соединения и выбором моделей (поиск, 1-токен проба, тумблеры)

  ![Cloud Providers](./docs/screenshot-cloud.png)

  ![Provider Detail](./docs/screenshot-provider-detail.png)

- ⚡ **Сравнение 2–4 моделей одновременно** — один промпт на локальных и облачных моделях сразу, стрим бок о бок, режимы Parallel / Sequential (последовательный не даёт моделям драться за GPU — цифры чище)
- 🔁 **Повторы запусков (1–5)** — показывается медиана с подсказкой mean±stdev, джиттер больше не решает победителя
- 💰 **Учёт затрат** — стоимость рана в колонках Bench, итоги по моделям в Test Suite, заморозка в истории и экспортах (только при точных токенах от сервера + прайсинге — никогда не гадаем)
- 🧠 **Thinking-трейсы** — reasoning-модели показывают сворачиваемый блок Thinking над ответом
- 🏆 **Голоса и лидерборд** — коронуйте лучший ответ и копите Elo-рейтинг + среднюю скорость; победа в заезде из 4 весит больше дуэли
- 🙈 **Слепое голосование** — личности скрыты за буквами везде (колонки, график, diff); порядок тасуется перед раном и вскрывается после голоса
- ⚖️ **LLM-судья** — одна модель оценивает все выводы вслепую по фиксированной шкале, бейдж «выбор судьи» только советует; коронуете вы
- ✅ **Автопроверки сьюта** — правила на тест (contains/regex/exact/valid-JSON) с бейджами и сводным pass-rate

  ![Model Leaderboard](./docs/screenshot-leaderboard.png)

- 🧪 **Тест-сьют (пакетное выполнение)** — прогоните 1–10 промптов по всем выбранным моделям и сравните scoreboard-матрицу: TPS в ячейках, 👑 быстрейшей модели, итоги avg TPS + fastest, клик для полного вывода, копия Markdown, скачивание CSV. Прогоны сьюта сохраняются в историю

  ![Test Suite Scoreboard](./docs/screenshot-testsuite.png)

- 🔌 **Мультипровайдерность** — [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai) или любой сервер `llama.cpp` (OpenAI-совместимый API)
- 📊 **Живые метрики и графики** — TPS, TTFT и общее время каждого рана, столбчатые диаграммы для всех моделей (`~` — оценка, если сервер не отдал usage)

  ![Benchmark Chart](./docs/screenshot-chart.png)

- 🔍 **Side-by-side diff** — построчное сравнение любых двух выводов с процентом схожести

  ![Diff View](./docs/screenshot-diff.png)

- 🕘 **Локальная история** — каждый бенчмарк в SQLite, сайдбар с коронами, `~` для оценок, относительным временем, лучшим TPS и стоимостью; полнотекстовый поиск, фильтр Winners, постраничность, бэкап/восстановление JSON

  ![History Sidebar](./docs/screenshot-history.png)

- 📝 **Рендер Markdown** — полный GFM (таблицы, код и т.д.); удалённые картинки грузятся только по клику, ссылки открываются во внешнем браузере
- 💾 **Пресеты** — сохраняйте частые промпты рядом со встроенными

  ![Prompt Presets](./docs/screenshot-presets.png)

- 📄 **Экспорт в PDF** — текстовый PDF (выделяемый текст, пагинация); нелатиница автоматически идёт через image-экспорт для корректного рендера
- ⌨️ **Горячие клавиши** — `Ctrl+Enter` (или `Cmd+Enter`) — запуск, `Esc` — стоп/закрыть, `Ctrl+K` — фокус в промпт
- ⚙️ **Панель настроек** — провайдер и соединение, внешность, язык, продвинутые контролы (system prompt, temperature, top-p, context length, server defaults, seed, max tokens, повторы) — всё персистентно

  ![Settings Panel](./docs/screenshot-settings.png)

- 🌑 **Три темы** — светлая, тёмная и **AMOLED** (чистый чёрный `#000000` + неон). Переключение из топбара или настроек

  ![AMOLED Dark Theme](./docs/screenshot-amoled.png)

- 🌍 **Выбор языка** — English, Deutsch, Français, 中文, Русский и فارسی (полный RTL) в grid-попапе из топбара или настроек

  ![Language Picker](./docs/screenshot-language.png)

- 📋 **Экспорт в один клик** — Markdown-отчёт или весь JSON истории в буфер, либо CSV (включая токены и стоимость)
- 💾 **Бэкап и восстановление** — вся база (раны + пресеты) в JSON из сайдбара истории
- 🔑 **Системный keychain** — облачные API-ключи в хранилище ОС (автомиграция), больше не plaintext-файлы
- 🔄 **Автообновление** — подписанные обновления с GitHub releases, с вашего согласия
- 🔒 **Локально по умолчанию, приватно всегда** — на [Tauri](https://tauri.app), без телеметрии; в облако ходим только к настроенным вами провайдерам с вашим ключом

---

## 🖥️ Стек

| Слой        | Технология                                         |
| ----------- | -------------------------------------------------- |
| Оболочка    | [Tauri 2](https://tauri.app) (Rust)                |
| Фронтенд    | React + TypeScript + Vite                          |
| Стили       | Tailwind CSS v4                                    |
| Состояние   | Zustand (persisted)                                |
| База        | SQLite (via `tauri-plugin-sql`)                    |
| Графики     | Recharts                                           |
| PDF-экспорт | jsPDF + autotable (текст) / html2canvas (fallback) |
| i18n        | react-i18next                                      |
| Markdown    | react-markdown + remark-gfm                        |
| Тесты       | Vitest (`npm test`)                                |

---

## 📦 Требования

Перед запуском PromptDeck поднимите хотя бы один локальный LLM-бэкенд:

- **[Ollama](https://ollama.com)** — локально (`ollama serve`), с хотя бы одной моделью:
  ```bash
  ollama pull llama3
  ```
- **или [LM Studio](https://lmstudio.ai)** — загруженная модель + запущенный локальный сервер (вкладка Developer → Start Server)
- **или сервер [`llama.cpp`](https://github.com/ggerganov/llama.cpp)** — с включённым OpenAI-совместимым эндпоинтом

Также нужны:

1. **[Rust](https://www.rust-lang.org/tools/install)** (stable)
2. **[Node.js](https://nodejs.org)** (v18+) и npm

---

## 🚀 Запуск

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Cadman021/prompt-deck.git
cd prompt-deck

# 2. Установите зависимости
npm install

# 3. Режим разработки
npm run tauri dev
```

Сборка под вашу ОС:

```bash
npm run tauri build
```

---

## 📸 Как пользоваться

1. Запустите приложение и выберите провайдера (Ollama, LM Studio или llama.cpp) в панели Config — PromptDeck сам найдёт модели
2. Для облака: откройте страницу **Cloud**, добавьте API-ключ, обновите список моделей и включите нужные
3. На странице **Bench** добавьте до 4 колонок моделей (локальные и облачные можно мешать), напишите промпт (или возьмите пресет)
4. Жмите **Run** (или `Ctrl+Enter`) — все модели стримят ответы live
5. Сравнивайте TPS / TTFT на графике, коронуйте победителя, открывайте **Diff** для любых двух выводов или смотрите **Leaderboard**
6. Нужно глубже? Страница **Tests**: до 10 промптов, **Run suite** — scoreboard покажет, кто сильнее на всей пачке
7. Пересматривайте старые раны в сайдбаре истории или экспортируйте отчёт в PDF, Markdown, JSON, CSV

---

## 🗺️ Roadmap

- [x] Облачные провайдеры — каталог, API-ключи, выбор моделей, бенчмарки в Bench + Test Suite
- [x] Оценка стоимости облачных ранов (цена рана в Bench, итоги в Suite, заморозка в истории)
- [x] Подписанные автообновления с GitHub releases
- [x] Тест-сьют — пакетное выполнение со scoreboard
- [x] AMOLED-тёмная тема (+ светлая / тёмная)
- [x] Side-by-side diff двух выводов
- [x] Экспорт истории в CSV
- [x] Хранение API-ключей в системном keychain (автомиграция, in-memory кэш, тихий fallback)
- [ ] Статистика трат на облако

Идеи приветствуются — см. [Contributing](#-contributing) ниже.

---

## 🤝 Контрибьютинг

Issues и PR приветствуются! Чтобы добавить фичу или починить баг:

1. Форкните репозиторий
2. Создайте ветку (`git checkout -b feature/my-feature`)
3. Закоммитьте изменения
4. Откройте Pull Request

Для крупных изменений сначала откройте issue, чтобы обсудить подход. Подробнее — в [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 🙏 Контрибьюторы

Спасибо всем, кто делает PromptDeck лучше:

- [@AyanJaved](https://github.com/AyanJaved) — относительные timestamps в истории
- [@lb1192176991-lab](https://github.com/lb1192176991-lab) — фильтр Winners, сброс настроек, Ctrl+K
- [@afifm561](https://github.com/afifm561) — кнопка retry-failed в Test Suite

Хотите присоединиться? Ищите [`good first issue`](https://github.com/Cadman021/prompt-deck/labels/good%20first%20issue) — новичкам рады!

---

## 📄 Лицензия

Проект под [GNU General Public License v3.0](./LICENSE).

---

## ⭐ Поддержка

Если PromptDeck полезен — поставьте звезду: это помогает проекту расти и мотивирует разработку!
