# Quick Start Guide

Get your Telegram-Gemini bridge running in 5 minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Gemini CLI installed (`gemini --version`)
- [ ] Telegram bot token from [@BotFather](https://t.me/BotFather)

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add your bot token:
```env
TELEGRAM_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 3. Test Gemini CLI
Verify Gemini CLI supports ACP:
```bash
gemini --protocol acp
```

### 4. Run the Bridge

**Quick test:**
```bash
npm start
```

**Development (auto-restart):**
```bash
npm run dev
```

**Production (with PM2):**
```bash
npm install -g pm2
pm2 start ecosystem.config.json
pm2 logs
```

## Verify It's Working

1. Open Telegram
2. Find your bot (search for the username you gave it)
3. Send a message: "Hello!"
4. You should see "🤔 Thinking..." followed by Gemini's response

## Common Issues

### "TELEGRAM_TOKEN is required"
- Check your `.env` file exists
- Verify the token is on the line `TELEGRAM_TOKEN=...`
- No quotes needed around the token

### "command not found: gemini"
- Install Gemini CLI first
- Verify with: `which gemini`

### Bot doesn't respond
- Check logs: `pm2 logs` (if using PM2)
- Or check console output
- Verify your bot token is correct

### Rate limit errors (429)
- Increase `UPDATE_INTERVAL_MS` in `.env` to 2000 or higher
- Restart the bot

## Next Steps

- Read the full [README.md](README.md) for detailed configuration
- Configure MCP servers for tool use
- Set up auto-start with PM2

## Getting Help

- Check [README.md](README.md) troubleshooting section
- Review Gemini CLI documentation
- Open an issue on GitHub

---

**Pro tip:** Keep the bridge running with PM2 and set it to auto-start on boot:
```bash
pm2 startup
pm2 save
```
