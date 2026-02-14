# Clawless — Bring Your Own Agent (Interface + ACP)

Clawless is an interface bridge built around one core idea: **Bring Your Own Agent**.

Instead of forcing a built-in runtime, Clawless lets you keep your preferred local ACP-capable CLI (Gemini CLI by default) and adds a reliable interface layer, callbacks, and scheduling on top.

Today, Telegram is the first interface adapter; more interfaces are planned.

## Bring Your Own Agent (Main Value)

Clawless is designed so your messaging layer and automation layer stay stable while your agent runtime can change.

- Keep your preferred local agent CLI workflow
- Keep your existing MCP tools and local files
- Swap runtimes without rebuilding your bot integration
- Avoid lock-in to a single all-in-one framework

## Why Clawless

If you have tried heavier all-in-one agent frameworks, Clawless is the minimal alternative:

- **BYO-agent first**: use your preferred local ACP-capable CLI runtime
- **Lightweight setup**: minimal glue instead of a full platform migration
- **Local-first control**: your machine, your tools, your data flow
- **Transport only**: interface layer is separate from the agent runtime

## Interface Adapters

- **Current adapters**: Telegram, WhatsApp, Slack
- **Platform selection**: Choose your preferred messaging platform via configuration
- **Design goal**: keep one message context contract so all interfaces reuse queueing, callbacks, scheduler, and ACP flow

## Features

- 🔀 **Bring Your Own Agent Runtime**: Keep messaging/callback/scheduler UX while choosing your preferred local ACP-capable CLI
- 🔌 **Multi-Platform Interface Layer**: Telegram, WhatsApp, and Slack support
- 🤖 **Multiple Messaging Platforms**: Interact with your local agent runtime through Telegram, WhatsApp, or Slack
- ⌨️ **Typing Status UX**: Shows typing indicator while the agent is processing (platform-dependent)
- 🛠️ **Rich Tool Support**: Leverages MCP (Model Context Protocol) servers connected to your local CLI runtime
- 🔒 **Privacy**: Runs on your hardware, you control data flow
- 💾 **Persistent Context**: Maintains local session unlike standard API calls
- 📬 **Sequential Queueing**: Processes one message at a time to avoid overlap and races
- 🔔 **Local Callback Endpoint**: Accepts localhost HTTP POST requests and forwards payloads to your messaging platform
- ⏰ **Cron Scheduler**: Schedule tasks to run at specific times or on recurring basis via REST API

## Architecture

```
┌──────────────────────┐     ┌────────────────┐     ┌──────────────────────────┐
│ Interface Adapter    │◄───►│   Clawless     │◄───►│ Local Agent.             │
│ (Telegram/WhatsApp/  │     │   (Node.js)    │ ACP │ e.g. Gemini CLI (default)│
│  Slack)              │     │                │     │                          │
└──────────────────────┘     └────────────────┘     └──────────────────────────┘
```

The bridge:
1. Receives messages from the active interface adapter (Telegram, WhatsApp, or Slack)
2. Forwards them to **your configured local agent CLI** via ACP (Agent Communication Protocol)
3. Sends interface-appropriate progress/status updates, then returns a single final response

## Prerequisites

- **Node.js** 18.0.0 or higher
- **A local ACP-capable agent CLI** installed and configured (Gemini CLI is the default setup)
- **Platform credentials** (choose one):
  - **Telegram**: Bot Token from [@BotFather](https://t.me/BotFather)
  - **WhatsApp**: WhatsApp account for web.whatsapp.com authentication
  - **Slack**: Bot Token, Signing Secret, and optionally App Token from [api.slack.com/apps](https://api.slack.com/apps)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and configure your chosen messaging platform. See platform-specific setup sections below.

### Platform Setup

Choose one of the following platforms:

#### Telegram Setup

1. Get a bot token from [@BotFather](https://t.me/BotFather):
   - Open Telegram and search for @BotFather
   - Send `/newbot` command
   - Follow the prompts to create your bot
   - Copy the token provided by BotFather

2. Configure in `.env`:
```env
MESSAGING_PLATFORM=telegram
TELEGRAM_TOKEN=your_bot_token_here
```

#### WhatsApp Setup

1. WhatsApp uses web.whatsapp.com authentication (no token needed)

2. Configure in `.env`:
```env
MESSAGING_PLATFORM=whatsapp
```

3. On first run, scan the QR code with your WhatsApp mobile app to authenticate

**Note**: WhatsApp requires a display for QR code scanning on first run. The session is saved for subsequent runs.

#### Slack Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps):
   - Click "Create New App" → "From scratch"
   - Name your app and select your workspace
   - Go to "OAuth & Permissions" and add these Bot Token Scopes:
     - `chat:write` - Send messages
     - `app_mentions:read` - Receive mentions
     - `channels:history` - Read channel messages
     - `groups:history` - Read private channel messages
     - `im:history` - Read direct messages
     - `mpim:history` - Read group messages
   - Install the app to your workspace
   - Copy the "Bot User OAuth Token"
   - Go to "Basic Information" and copy the "Signing Secret"
   - (Optional) For Socket Mode: Enable Socket Mode and copy the App-Level Token

2. Configure in `.env`:
```env
MESSAGING_PLATFORM=slack
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
# Optional: for Socket Mode (recommended for local development)
SLACK_APP_TOKEN=xapp-your-app-token-here
```

3. Invite your bot to channels where you want to use it:
   - In Slack, type `/invite @YourBotName` in any channel

### Common Configuration

Add these settings to your `.env` file (optional):
```env
TYPING_INTERVAL_MS=4000
GEMINI_TIMEOUT_MS=900000
GEMINI_NO_OUTPUT_TIMEOUT_MS=60000
ACP_STREAM_STDOUT=false
ACP_DEBUG_STREAM=false
```

## Usage

### CLI Mode

After install, the package exposes a CLI command:

```bash
clawless
```

> Note: the binary name is currently `clawless` for compatibility, while the project name is Clawless.

Local development alternatives:

```bash
npm run cli
npx clawless
```

### Config File (CLI)

On first run, the CLI automatically creates:

```text
~/.clawless/config.json
```

with placeholder values, then exits so you can edit it.

After updating placeholders, run again:

```bash
clawless
```

You can also use a custom path:

```bash
clawless --config /path/to/config.json
```

If the custom config path does not exist, a template file is created there as well.

You can still bootstrap from the example file if preferred:

```bash
cp clawless.config.example.json ~/.clawless/config.json
```

Environment variables still work and take precedence over config values.

### Run In Background

Simple background run:

```bash
nohup clawless > clawless.log 2>&1 &
```

Recommended for production: PM2 (see section below).

### Development Mode

```bash
npm run dev
```

This runs the bot with Node.js watch mode for automatic restarts on file changes.

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended for Production)

PM2 keeps your bridge running continuously and restarts it automatically if it crashes.

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the bridge:
```bash
pm2 start ecosystem.config.json
```

PM2 will automatically create the `logs/` directory for log files.

3. View logs:
```bash
pm2 logs clawless
```

4. Manage the process:
```bash
pm2 status                    # View status
pm2 restart clawless  # Restart
pm2 stop clawless     # Stop
pm2 delete clawless   # Remove from PM2
```

5. Set up auto-start on system boot:
```bash
pm2 startup
pm2 save
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MESSAGING_PLATFORM` | No | telegram | Messaging platform to use: `telegram`, `whatsapp`, or `slack` |
| `TELEGRAM_TOKEN` | Yes (for Telegram) | - | Your Telegram bot token from BotFather |
| `SLACK_BOT_TOKEN` | Yes (for Slack) | - | Your Slack bot token from api.slack.com/apps |
| `SLACK_SIGNING_SECRET` | Yes (for Slack) | - | Your Slack signing secret from api.slack.com/apps |
| `SLACK_APP_TOKEN` | No (for Slack) | - | Your Slack app token for Socket Mode (optional) |
| `TYPING_INTERVAL_MS` | No | 4000 | Interval (in milliseconds) for refreshing typing status |
| `GEMINI_TIMEOUT_MS` | No | 900000 | Overall timeout for a single Gemini CLI run |
| `GEMINI_NO_OUTPUT_TIMEOUT_MS` | No | 60000 | Idle timeout; aborts if Gemini emits no output for this duration |
| `GEMINI_KILL_GRACE_MS` | No | 5000 | Grace period after SIGTERM before escalating Gemini child process shutdown to SIGKILL |
| `GEMINI_APPROVAL_MODE` | No | yolo | Gemini approval mode (for example: `default`, `auto_edit`, `yolo`, `plan`) |
| `GEMINI_MODEL` | No | - | Gemini model override passed to CLI |
| `ACP_PERMISSION_STRATEGY` | No | allow_once | Auto-select ACP permission option kind (`allow_once`, `reject_once`, or `cancelled`) |
| `ACP_STREAM_STDOUT` | No | false | Writes raw ACP text chunks to stdout as they arrive |
| `ACP_DEBUG_STREAM` | No | false | Writes structured ACP chunk timing/count debug logs |
| `MAX_RESPONSE_LENGTH` | No | 4000 | Maximum response length in characters to prevent memory issues |
| `HEARTBEAT_INTERVAL_MS` | No | 60000 | Server heartbeat log interval in milliseconds (`0` disables heartbeat logs) |
| `CALLBACK_HOST` | No | 127.0.0.1 | Bind address for callback server |
| `CALLBACK_PORT` | No | 8788 | Bind port for callback server |
| `CALLBACK_AUTH_TOKEN` | No | - | Optional bearer/token guard for callback endpoint |
| `CALLBACK_MAX_BODY_BYTES` | No | 65536 | Maximum accepted callback request body size |
| `AGENT_BRIDGE_HOME` | No | ~/.clawless | Home directory for Clawless runtime files |
| `MEMORY_FILE_PATH` | No | ~/.clawless/MEMORY.md | Persistent memory file path injected into Gemini prompt context |
| `MEMORY_MAX_CHARS` | No | 12000 | Max memory-file characters injected into prompt context |
| `SCHEDULES_FILE_PATH` | No | ~/.clawless/schedules.json | Persistent scheduler storage file |

### Local Callback Endpoint

The bridge exposes:

- `POST http://127.0.0.1:8788/callback` - Send messages to the configured platform (generic endpoint)
- `POST http://127.0.0.1:8788/callback/telegram` - Send messages to Telegram
- `POST http://127.0.0.1:8788/callback/whatsapp` - Send messages to WhatsApp
- `POST http://127.0.0.1:8788/callback/slack` - Send messages to Slack
- `GET http://127.0.0.1:8788/healthz` - Health check
- `POST/GET/DELETE http://127.0.0.1:8788/api/schedule`, `GET http://127.0.0.1:8788/api/schedule/:id` - Scheduler API

Request body for callback:

```json
{
  "text": "Nightly job finished successfully"
}
```

- `chatId` is optional. If omitted, the bridge sends to a persisted chat binding learned from inbound messages.
- To bind once, send any message to the bot from your target chat.
- If `CALLBACK_AUTH_TOKEN` is set, send either `x-callback-token: <token>` or `Authorization: Bearer <token>`.

Cron-friendly examples:

```bash
# Generic endpoint (uses configured platform)
curl -sS -X POST "http://127.0.0.1:8788/callback" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $CALLBACK_AUTH_TOKEN" \
  -d '{"text":"Backup completed at 03:00"}'

# Platform-specific endpoint
curl -sS -X POST "http://127.0.0.1:8788/callback/telegram" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $CALLBACK_AUTH_TOKEN" \
  -d '{"text":"Backup completed at 03:00"}'
```

### Scheduler API

The bridge includes a built-in cron scheduler that allows you to schedule tasks to be executed through your configured local agent CLI:

- Schedules are persisted to disk and automatically reloaded on restart.
- Default storage path: `~/.clawless/schedules.json` (override with `SCHEDULES_FILE_PATH`).

**Create a recurring schedule:**
```bash
curl -X POST http://127.0.0.1:8788/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Check my calendar and send me a summary",
    "description": "Daily calendar summary",
    "cronExpression": "0 9 * * *"
  }'
```

**Create a one-time schedule:**
```bash
curl -X POST http://127.0.0.1:8788/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Remind me to take a break",
    "oneTime": true,
    "runAt": "2026-02-13T15:30:00Z"
  }'
```

When a scheduled job runs, it executes the message through your configured local agent runtime and sends the response to your Telegram chat.

**Ask Gemini to create schedules naturally:**
- "Remind me to take a break in 30 minutes"
- "Check my calendar every morning at 9am and send me a summary"
- "Every Friday at 5pm, remind me to review my weekly goals"

See [SCHEDULER.md](SCHEDULER.md) for complete API documentation.

### Persistent Memory File

- The bridge ensures a memory file exists at `~/.clawless/MEMORY.md` on startup.
- The configured local agent CLI is started with include access to both `~/.clawless` and your full home directory (`~/`).
- ACP session setup uses the required `mcpServers` field with an empty array and relies on Gemini CLI runtime defaults for MCP/skills loading.
- Each prompt includes memory instructions and current `MEMORY.md` content.
- When asked to memorize/remember something, the agent is instructed to append new notes under `## Notes`.

### Timeout Tuning

Use both timeouts together for reliability:

- `GEMINI_TIMEOUT_MS`: hard cap for total request time (recommended: `900000`)
- `GEMINI_NO_OUTPUT_TIMEOUT_MS`: fail fast if output stalls (recommended: `60000`)
- Set `GEMINI_NO_OUTPUT_TIMEOUT_MS=0` to disable idle timeout

### Response Length Limit

The `MAX_RESPONSE_LENGTH` prevents memory issues with very long responses:

- **Default**: 4000 characters (Telegram's limit is 4096 per message)
- Responses exceeding this limit are truncated with a notification
- Protects against unbounded memory growth

## How It Works

### The Logic Flow

1. **User sends a message** via Telegram
2. **Bridge queues** the message if another request is in progress
3. **Worker dequeues** the next message when prior processing completes
4. **Agent run starts** and typing status is shown in Telegram
5. **Single final reply** is sent when the run finishes

### Queueing Behavior

The bridge uses a single-worker in-memory queue:
- Prevents overlapping agent runs
- Preserves message order
- Avoids duplicate-edit/fallback races from message updates

## Advantages Over Standard API Bots

1. **BYO-Agent Flexibility**: Keep the same bridge while choosing or changing your local CLI runtime
2. **Persistent Context**: The local agent CLI maintains a local session, unlike stateless API calls
3. **Local File Access**: Can access files on your server if configured
4. **MCP Tool Integration**: Uses tools from connected MCP servers (Calendar, Database, etc.)
5. **Privacy Control**: Runs on your hardware, you control data processing
6. **Custom Configuration**: Use your specific local CLI setup and preferences

## Troubleshooting

### Bot doesn't respond

For the default Gemini CLI setup:

1. Check if Gemini CLI is installed:
```bash
which gemini
```

2. Verify Gemini CLI supports ACP:
```bash
gemini --help | grep acp
```

3. Check bot logs for errors

### Rate limit errors

If you see "429 Too Many Requests" errors:
1. Increase `TYPING_INTERVAL_MS` in `.env` (try 5000 or higher)
2. Restart the bot

### Connection issues

1. Verify your internet connection
2. For Telegram: Check if Telegram API is accessible and ensure `TELEGRAM_TOKEN` is correct
3. For Slack: Verify your bot tokens and signing secret are correct
4. For WhatsApp: Ensure you've scanned the QR code to authenticate

## Development

### Project Structure

```
Clawless/
├── index.ts                        # Main bridge application
├── bin/
│   └── cli.ts                      # CLI entrypoint
├── messaging/
│   ├── telegramClient.ts           # Telegram adapter
│   ├── whatsappClient.ts           # WhatsApp adapter
│   └── slackClient.ts              # Slack adapter
├── scheduler/
│   ├── cronScheduler.ts            # Schedule persistence + cron orchestration
│   └── scheduledJobHandler.ts      # Scheduled run execution logic
├── acp/
│   ├── tempAcpRunner.ts            # Isolated ACP run helper
│   └── clientHelpers.ts            # ACP helper utilities
├── package.json                    # Node.js dependencies
├── ecosystem.config.json           # PM2 configuration
├── clawless.config.example.json # CLI config template
└── README.md                       # This file
```

### Adding Features

The codebase is designed to be simple and extensible:
- Core queue + ACP logic is in `index.ts`
- Interface-specific messaging logic lives in `messaging/` directory:
  - `telegramClient.ts` for Telegram
  - `whatsappClient.ts` for WhatsApp
  - `slackClient.ts` for Slack
- New platforms can implement the same message context interface (`text`, `startTyping()`, `sendText()`, etc.)
- Error handling is centralized
- Rate limiting logic is configurable

## Security Considerations

- **Never commit** `.env` file with your tokens (it's in `.gitignore`)
- **Rotate tokens** if accidentally exposed
- **Limit bot access** using platform-specific security settings
- **Monitor logs** for unusual activity

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Credits

Built with:
- [Telegraf](https://telegraf.js.org/) - Telegram Bot framework
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [@slack/bolt](https://slack.dev/bolt-js/) - Slack Bot framework
- [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk) - Agent Communication Protocol SDK

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review Gemini CLI documentation

---

**Note**: This bridge requires a working local ACP-capable CLI (Gemini CLI is the default setup). Ensure your CLI is properly configured before running the bridge.
