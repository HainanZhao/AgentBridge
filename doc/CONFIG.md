# Configuration & Setup Guide

## Quick Setup

1. Run `clawless` once to generate `~/.clawless/config.json`
2. Edit the file with your platform token and whitelist
3. Run `clawless` again

## Telegram Setup

### Getting a Bot Token

1. Open Telegram and search [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the token provided

### Whitelist Configuration

The bot only accepts messages from whitelisted users. Add your Telegram username:

```json
{
  "messagingPlatform": "telegram",
  "telegramToken": "<your-token>",
  "telegramWhitelist": ["your_username"]
}
```

- Use your Telegram username (without `@`)
- Max 10 users recommended for security
- **Required**: Startup fails if whitelist is empty

## Slack Setup

### Getting Credentials

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode and get an App Token
3. Get Bot Token from OAuth & Permissions
4. Get Signing Secret from Basic Information

### OAuth Scopes

If using email-based allowlist, add these scopes:
- `users:read`
- `users:read.email`

### Configuration

```json
{
  "messagingPlatform": "slack",
  "slackBotToken": "xoxb-...",
  "slackSigningSecret": "...",
  "slackAppToken": "xapp-...",
  "slackWhitelist": ["U01234567"]
}
```

- Whitelist uses Slack user IDs (not usernames)
- Max 10 users recommended for security
- **Required**: Startup fails if whitelist is empty

## Config TUI

Run `clawless --config` to open the interactive editor:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Enter` | Edit value |
| `←` / `→` | Change enum values |
| `s` | Save and exit |
| `q` | Quit without saving |

## Environment Variables

All config keys can be overridden via environment variables (uppercase, underscore-separated):

```bash
CLI_AGENT=opencode
TELEGRAM_WHITELIST=user1,user2
```

---

## Configuration Reference

All `config.json` keys, defaults, and meanings:

| Key | Default | Meaning |
|---|---|---|
| `messagingPlatform` | `telegram` | Active interface adapter (`telegram` or `slack`). |
| `telegramToken` | `your_telegram_bot_token_here` | Telegram bot token from BotFather (required in Telegram mode). |
| `telegramWhitelist` | `[]` | Allowed Telegram usernames (required and non-empty in Telegram mode). |
| `slackBotToken` | `""` | Slack bot token (required in Slack mode). |
| `slackSigningSecret` | `""` | Slack signing secret (required in Slack mode). |
| `slackAppToken` | `""` | Optional Slack Socket Mode app token. |
| `slackWhitelist` | `[]` | Allowed Slack user IDs (required and non-empty in Slack mode). |
| `timezone` | `UTC` | Timezone used by scheduler cron execution. |
| `typingIntervalMs` | `4000` | Typing indicator refresh interval while processing. |
| `streamUpdateIntervalMs` | `5000` | Minimum interval between progressive streaming message updates. |
| `cliAgent` | `gemini` | CLI agent type to use (`gemini` or `opencode`). |
| `cliAgentApprovalMode` | `yolo` | Agent approval mode (`default`, `auto_edit`, `yolo`, `plan`). |
| `cliAgentModel` | `""` | Optional model override for the agent. |
| `cliAgentTimeoutMs` | `1200000` | Hard timeout for one agent run (ms). |
| `cliAgentNoOutputTimeoutMs` | `300000` | Idle timeout when no output is produced (ms). |
| `cliAgentKillGraceMs` | `5000` | Grace period before forced process kill after termination (ms). |
| `acpPermissionStrategy` | `allow_once` | Auto selection strategy for ACP permission prompts. |
| `acpPrewarmRetryMs` | `30000` | Delay before retrying ACP prewarm after failure (ms). |
| `acpPrewarmMaxRetries` | `10` | Max prewarm retries (`0` = unlimited). |
| `acpMcpServersJson` | `""` | Optional JSON override for ACP MCP server list. |
| `acpStreamStdout` | `false` | Emit raw ACP stream chunks to stdout. |
| `acpDebugStream` | `false` | Emit structured ACP stream debug logs. |
| `maxResponseLength` | `4000` | Max outbound response length in characters. |
| `heartbeatIntervalMs` | `300000` | Heartbeat log interval (`0` disables heartbeat logs). |
| `callbackHost` | `localhost` | Bind host for local callback/API server. |
| `callbackPort` | `8788` | Bind port for local callback/API server. |
| `callbackAuthToken` | `""` | Optional auth token for callback and local API routes. |
| `callbackMaxBodyBytes` | `65536` | Max accepted callback/API request body size. |
| `clawlessHome` | `~/.clawless` | Base directory for runtime state files. |
| `memoryFilePath` | `~/.clawless/MEMORY.md` | Persistent memory note file injected into prompt context. |
| `memoryMaxChars` | `12000` | Max memory-file characters included in prompt context. |
| `conversationHistoryEnabled` | `true` | Enable/disable conversation history tracking. |
| `conversationHistoryFilePath` | `~/.clawless/conversation-history.jsonl` | Conversation history JSONL file path. |
| `conversationHistoryMaxEntries` | `100` | Max retained conversation entries (FIFO). |
| `conversationHistoryMaxCharsPerEntry` | `2000` | Max chars stored per user/assistant entry. |
| `conversationHistoryMaxTotalChars` | `8000` | Max chars used when formatting recap context. |
| `conversationHistoryRecapTopK` | `4` | Default number of entries returned for recap/semantic API output. |
| `conversationSemanticRecallEnabled` | `true` | Enable/disable semantic recall features (SQLite FTS lexical ranking). |
| `conversationSemanticStorePath` | `~/.clawless/conversation-semantic-memory.db` | SQLite semantic recall store file path. |
| `conversationSemanticMaxEntries` | `1000` | Max retained semantic entries (FIFO). |
| `conversationSemanticMaxCharsPerEntry` | `4000` | Max chars per entry used for lexical recall indexing. |
| `schedulesFilePath` | `~/.clawless/schedules.json` | Scheduler persistence file path. |

## CLI Agent Selection

To switch between different CLI agents (e.g., Gemini CLI, OpenCode), set the `cliAgent` configuration key:

```json
{
  "cliAgent": "opencode",
  "cliAgentApprovalMode": "yolo"
}
```

Supported agents:
- `gemini` - Google Gemini CLI (default)
- `opencode` - OpenCode CLI agent

The system will automatically validate that the selected agent is installed and executable at startup.
