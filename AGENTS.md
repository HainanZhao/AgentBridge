# AGENTS

This document is the developer/operator handbook for Clawless.

## Local Development Setup

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env
```

3. Edit `.env` and set at least:

```env
TELEGRAM_TOKEN=your_bot_token_here
TYPING_INTERVAL_MS=4000
GEMINI_TIMEOUT_MS=1200000
GEMINI_NO_OUTPUT_TIMEOUT_MS=300000
ACP_STREAM_STDOUT=false
ACP_DEBUG_STREAM=false
```

## Run Locally

- CLI entry (same behavior as published binary):

```bash
npm run cli
```

- Development watch mode:

```bash
npm run dev
```

- Production-style local run:

```bash
npm start
```

## Quality Checks

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
```

## Runtime Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_TOKEN` | Yes | - | Your Telegram bot token from BotFather |
| `TELEGRAM_WHITELIST` | No | [] | List of authorized Telegram usernames. If empty, all users are blocked by default. Format: JSON array `["username1", "username2"]` |
| `TYPING_INTERVAL_MS` | No | 4000 | Interval (in milliseconds) for refreshing Telegram typing status |
| `GEMINI_TIMEOUT_MS` | No | 1200000 | Overall timeout for a single Gemini CLI run |
| `GEMINI_NO_OUTPUT_TIMEOUT_MS` | No | 300000 | Idle timeout; aborts if Gemini emits no output for this duration |
| `GEMINI_KILL_GRACE_MS` | No | 5000 | Grace period after SIGTERM before escalating Gemini child process shutdown to SIGKILL |
| `GEMINI_APPROVAL_MODE` | No | yolo | Gemini approval mode (`default`, `auto_edit`, `yolo`, `plan`) |
| `GEMINI_MODEL` | No | - | Gemini model override passed to CLI |
| `ACP_PERMISSION_STRATEGY` | No | allow_once | Auto-select ACP permission option kind (`allow_once`, `reject_once`, `cancelled`) |
| `ACP_STREAM_STDOUT` | No | false | Writes raw ACP text chunks to stdout as they arrive |
| `ACP_DEBUG_STREAM` | No | false | Writes structured ACP chunk timing/count debug logs |
| `MAX_RESPONSE_LENGTH` | No | 4000 | Maximum response length in characters |
| `HEARTBEAT_INTERVAL_MS` | No | 60000 | Server heartbeat log interval in milliseconds (`0` disables logs) |
| `CALLBACK_HOST` | No | 127.0.0.1 | Bind address for callback server |
| `CALLBACK_PORT` | No | 8788 | Bind port for callback server |
| `CALLBACK_AUTH_TOKEN` | No | - | Optional bearer/token guard for callback endpoint |
| `CALLBACK_MAX_BODY_BYTES` | No | 65536 | Maximum accepted callback request body size |
| `AGENT_BRIDGE_HOME` | No | ~/.clawless | Home directory for runtime files |
| `MEMORY_FILE_PATH` | No | ~/.clawless/MEMORY.md | Persistent memory file path injected into Gemini prompt context |
| `MEMORY_MAX_CHARS` | No | 12000 | Max memory-file characters injected into prompt context |
| `SCHEDULES_FILE_PATH` | No | ~/.clawless/schedules.json | Persistent scheduler storage file |

### Local Callback Endpoint

- `POST http://127.0.0.1:8788/callback/telegram` - Send messages to Telegram
- `GET http://127.0.0.1:8788/healthz` - Health check
- `POST/GET/DELETE http://127.0.0.1:8788/api/schedule`, `GET/PATCH http://127.0.0.1:8788/api/schedule/:id` - Scheduler API

Request body for callback:

```json
{
  "text": "Nightly job finished successfully"
}
```

- `chatId` is optional; if omitted, the bridge sends to a persisted chat binding learned from inbound Telegram messages.
- To bind once, send any message to the bot from your target chat.
- If `CALLBACK_AUTH_TOKEN` is set, send either `x-callback-token: <token>` or `Authorization: Bearer <token>`.

Cron-friendly example:

```bash
curl -sS -X POST "http://127.0.0.1:8788/callback/telegram" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $CALLBACK_AUTH_TOKEN" \
  -d '{"text":"Backup completed at 03:00"}'
```

### Scheduler API

- Schedules persist to disk and are reloaded on restart.
- Default storage path: `~/.clawless/schedules.json` (override with `SCHEDULES_FILE_PATH`).
- Update schedules through API only; do not edit `schedules.json` directly.

Create recurring schedule:

```bash
curl -X POST http://127.0.0.1:8788/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Check my calendar and send me a summary",
    "description": "Daily calendar summary",
    "cronExpression": "0 9 * * *"
  }'
```

Create one-time schedule:

```bash
curl -X POST http://127.0.0.1:8788/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Remind me to take a break",
    "oneTime": true,
    "runAt": "2026-02-13T15:30:00Z"
  }'
```

Update schedule:

```bash
curl -X PATCH http://127.0.0.1:8788/api/schedule/<schedule_id> \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated reminder",
    "cronExpression": "0 10 * * *"
  }'
```

See [SCHEDULER.md](SCHEDULER.md) for complete API details.

### Persistent Memory File

- Ensures memory file exists at `~/.clawless/MEMORY.md` on startup.
- Agent runtime is started with include access to both `~/.clawless` and `~/`.
- ACP session setup uses required `mcpServers` with an empty array and relies on Gemini CLI defaults for MCP/skills loading.
- Prompts include memory instructions and current `MEMORY.md` content.

### Timeout Tuning

- `GEMINI_TIMEOUT_MS`: hard cap for total request time (recommended: `1200000`)
- `GEMINI_NO_OUTPUT_TIMEOUT_MS`: fail fast if output stalls (recommended: `300000`)
- Set `GEMINI_NO_OUTPUT_TIMEOUT_MS=0` to disable idle timeout

### Response Length Limit

- Default: 4000 characters (Telegram hard limit is 4096)
- Longer outputs are truncated with a notification

## Internal Behavior

### Processing Flow

1. User sends a message via Telegram.
2. Bridge queues the message if another request is in progress.
3. Worker dequeues when prior processing completes.
4. Agent run starts and typing status is shown.
5. Final reply is sent when run finishes.

### Queueing Behavior

- Single-worker in-memory queue
- Prevents overlapping runs
- Preserves message order
- Avoids duplicate-edit/fallback races

## Troubleshooting

### Bot does not respond

1. Check Gemini CLI installation:

```bash
which gemini
```

2. Verify ACP support:

```bash
gemini --help | grep acp
```

3. Check bot logs for runtime errors.

### Rate limit errors

- Increase `TYPING_INTERVAL_MS` (for example to `5000` or higher).
- Restart the process.

### Connection issues

- Verify internet access.
- Check Telegram API reachability.
- Ensure `TELEGRAM_TOKEN` is correct.

## Codebase Notes

### Project Structure

```text
Clawless/
├── index.ts                        # Main bridge application
├── bin/
│   └── cli.ts                      # CLI entrypoint
├── messaging/
│   └── telegramClient.ts           # Telegram adapter
├── scheduler/
│   ├── cronScheduler.ts            # Schedule persistence + cron orchestration
│   └── scheduledJobHandler.ts      # Scheduled run execution logic
├── acp/
│   ├── tempAcpRunner.ts            # Isolated ACP run helper
│   └── clientHelpers.ts            # ACP helper utilities
├── package.json                    # Node.js dependencies
├── ecosystem.config.json           # PM2 configuration
├── clawless.config.example.json    # CLI config template
└── README.md                       # User-facing docs
```

### Extension Points

- Core queue + ACP logic: `index.ts`
- Messaging adapter logic: `messaging/telegramClient.ts`
- New interfaces can implement the same message context shape (`text`, `startTyping()`, `sendText()`).

## Security Notes

- Never commit `.env`.
- Rotate tokens if exposed.
- Limit bot access via Telegram settings and whitelist.
- Monitor logs for unusual activity.
