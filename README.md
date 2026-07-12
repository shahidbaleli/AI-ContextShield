# AI Chat Context Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](content.js)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Auto-save your AI chat conversations locally and inject context across 16+ AI platforms — with zero cloud storage, zero DOM dependencies, and zero tracking.**

---

## Features

- **Auto-save** — Every message you send and receive is automatically saved to `chrome.storage.local`
- **Context Injection** — Inject a previous conversation as context into any new chat with one click
- **Works on 16+ AI platforms** — ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Qwen, and more
- **100% Private** — Everything stays on your device. No servers, no accounts, no telemetry
- **Session Management** — View, rename, and delete saved conversations from the modal
- **Popup Mode** — Shift the injection button to the extension popup for a cleaner UI
- **Model-Agnostic** — Uses only WAI-ARIA web standards (`main`, `role="main"`) — never depends on site-specific HTML

---

## Supported Platforms

| # | Platform | URL |
|---|----------|-----|
| 1 | ChatGPT | `https://chatgpt.com/*` |
| 2 | Claude | `https://claude.ai/*` |
| 3 | Gemini | `https://gemini.google.com/*` |
| 4 | Perplexity | `https://www.perplexity.ai/*` |
| 5 | DeepSeek | `https://chat.deepseek.com/*` |
| 6 | Mistral | `https://chat.mistral.ai/*` |
| 7 | HuggingFace | `https://huggingface.co/chat/*` |
| 8 | Kimi (Moonshot) | `https://kimi.moonshot.cn/*` |
| 9 | Poe | `https://poe.com/*` |
| 10 | Meta AI | `https://www.meta.ai/*` |
| 11 | Microsoft Copilot | `https://copilot.microsoft.com/*` |
| 12 | Pi | `https://pi.ai/*` |
| 13 | ChatGLM | `https://chatglm.cn/*` |
| 14 | You.com | `https://you.com/*` |
| 15 | Phind | `https://www.phind.com/*` |
| 16 | Qwen | `https://chat.qwen.ai/*` |

> **Adding a new platform?** Open `manifest.json` and add the URL to both `host_permissions` and `content_scripts > matches`, then add a `host.includes()` check in `getAiPlatformName()` inside `content.js`.

---

## How It Works

### Extraction (model-agnostic)
```
main element → innerText → split by paragraphs → apply filter → save
```
The extension hides sidebars (`nav`, `aside`, `[role="navigation"]`, `[role="complementary"]`) and input areas (`textarea`, `[contenteditable="true"]`) using `display: none` before extracting text from `<main>` or `[role="main"]`. This prevents history bleeding from sidebars without depending on site-specific class names.

### Auto-Save
A `MutationObserver` watches for DOM changes. When you type or a response arrives, a 3-second silence timer triggers a save. The NO-BLEED algorithm deduplicates messages and merges overlapping conversations.

### Context Injection
Open the floating button → select a session → click **Inject Context**. The saved messages are wrapped in a `SYSTEM INSTRUCTION` block and pasted into the input box as context for the AI.

---

## Installation (Development)

### Prerequisites
- Google Chrome, Microsoft Edge, or any Chromium-based browser

### Steps
1. **Clone the repo**
   ```bash
   git clone https://github.com/yourusername/ai-chat-context-manager.git
   ```
2. **Open extensions page**
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. **Enable Developer mode** (toggle in top-right corner)
4. **Click "Load unpacked"** and select the cloned folder
5. The extension is now active. Visit any supported AI platform to start auto-saving.

---

## Architecture (for Developers)

```
content.js          → Core logic: extraction, auto-save, modal UI, NO-BLEED dedup
popup.html / .js    → Extension popup with auto-save toggle and inject button
manifest.json       → Permissions, host permissions, content script registration
```

### Key Principles

| Principle | Why |
|-----------|-----|
| **No DOM dependency** | AI platforms change their HTML daily. Never use `querySelector` for chat elements. |
| **No cloud storage** | `chrome.storage.local` only. No APIs, no databases, no analytics. |
| **WAI-ARIA only** | Use `main`, `role="main"`, `role="navigation"`, `role="complementary"` — these are web standards, not site-specific. |
| **Filter basket** | Emoji/word filtering is independent from core save logic (`applyMessageFilter`). |

### NO-BLEED Algorithm

The deduplication logic in `autoSaveChat()`:

1. Extract visible messages from the DOM
2. Load the saved session for the current `activeSessionId`
3. Find the FIRST overlapping message between visible and saved messages
4. **Overlap found** → Merge: keep saved content before the overlap, append new content after
5. **No overlap & sessionLocked** → Append new messages to injected session
6. **No overlap & !sessionLocked** → Create a new session (new conversation detected)

---

## How to Add a New AI Platform

1. **Add URL to `manifest.json`** — both `host_permissions` and `content_scripts > matches`
2. **Add display name** — add a `host.includes("...")` check in `getAiPlatformName()` in `content.js`
3. **Test** — reload the extension and verify auto-save works on the new platform

No changes to extraction logic are needed. The WAI-ARIA selectors work universally.

---

## Contributing

Contributions are welcome! Please follow the architecture principles above:

- Avoid site-specific DOM selectors
- Keep all data in `chrome.storage.local`
- Test across at least 3 different AI platforms before submitting a PR

---

## Privacy

This extension operates **100% locally**. Your chat data is stored in `chrome.storage.local` and never leaves your browser. No analytics, no tracking, no external requests.

---

## License

[MIT License](LICENSE.txt) — free to use, modify, and distribute.
