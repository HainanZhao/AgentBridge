# Clawless — Bring Your Own Agent (Interface + ACP)

![Clawless](doc/Clawless.jpg)

Clawless is a lightweight bridge that connects your favorite local AI agent CLI to Telegram or Slack. Keep your tools, swap runtimes, avoid lock-in.

**Supported agents**: Gemini CLI (default), OpenCode, Claude Code

## Why Clawless

- **BYO-agent**: Use your preferred ACP-capable CLI runtime
- **Lightweight**: Minimal glue, no platform migration
- **Local-first**: Your machine, your tools, your data
- **Flexible**: Swap agents without rebuilding your bot

## Features

- 🤖 Telegram & Slack support
- 🛠️ MCP tool support via your local CLI
- 💾 Persistent conversation context
- ⚡ Async mode for long-running tasks
- ⏰ Cron scheduler via REST API

## Architecture

![Architecture Diagram](doc/architecture.svg)

1. Receives messages from Telegram or Slack
2. Forwards to your local agent CLI via ACP
3. Returns responses with progress updates

## Quick Start

**Prerequisites**: Node.js 18+, an ACP-capable CLI (Gemini CLI, OpenCode, or Claude Code)

```bash
npm i -g clawless
clawless
```

First run opens an interactive config. Add your Telegram bot token and username.

### Telegram Setup

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Edit `~/.clawless/config.json`:

```json
{
  "messagingPlatform": "telegram",
  "telegramToken": "<your-token>",
  "telegramWhitelist": ["your_username"]
}
```

### Slack Setup

```json
{
  "messagingPlatform": "slack",
  "slackBotToken": "xoxb-...",
  "slackSigningSecret": "...",
  "slackWhitelist": ["U01234567"]
}
```

### Switching Agents

```json
{
  "cliAgent": "opencode"
}
```

Or set `CLI_AGENT=opencode` / `CLI_AGENT=claude`.

## Run in Background

```bash
nohup clawless > clawless.log 2>&1 &
```

## Advanced Docs

- `AGENTS.md` — runtime, APIs, troubleshooting
- `doc/CONFIG.md` — full configuration reference
- `doc/MEMORY_SYSTEM.md` — memory architecture

## License

MIT — see [LICENSE](LICENSE)

---

Requires an ACP-capable CLI (Gemini CLI default). Ensure your CLI is configured before running.
