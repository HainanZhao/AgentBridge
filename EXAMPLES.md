# Examples and Extensions

This file contains examples of how to extend and customize the Telegram-Gemini bridge.

## Example 1: Adding Command Handlers

You can add special commands that trigger different behaviors:

```javascript
// Add this before the general text handler in index.js

// Handle /start command
bot.start((ctx) => {
  ctx.reply(
    '👋 Welcome to Gemini CLI Bridge!\n\n' +
    'Send me any message and I\'ll forward it to your local Gemini agent.\n\n' +
    'Features:\n' +
    '• Real-time streaming responses\n' +
    '• Access to local tools via MCP\n' +
    '• Persistent conversation context\n\n' +
    'Just start chatting!'
  );
});

// Handle /help command
bot.help((ctx) => {
  ctx.reply(
    '💡 How to use:\n\n' +
    '1. Send any message or question\n' +
    '2. Wait for Gemini to process it\n' +
    '3. Watch the response stream in real-time\n\n' +
    'Your Gemini CLI session is persistent, so context is maintained across messages!'
  );
});
```

## Example 2: Adding Typing Indicator

Show that the bot is "typing" while processing:

```javascript
bot.on('text', async (ctx) => {
  let fullResponse = "";
  
  try {
    // Show typing indicator
    await ctx.sendChatAction('typing');
    
    const info = await ctx.reply("🤔 Thinking...");
    
    // Continue typing periodically
    const typingInterval = setInterval(() => {
      ctx.sendChatAction('typing').catch(() => {});
    }, 5000);
    
    const { textStream } = await streamText({
      model: geminiAgent,
      prompt: ctx.message.text,
    });

    // ... rest of the streaming logic
    
    // Stop typing indicator
    clearInterval(typingInterval);
    
  } catch (error) {
    // ... error handling
  }
});
```

## Example 3: Adding Response Time Tracking

Track how long responses take:

```javascript
bot.on('text', async (ctx) => {
  let fullResponse = "";
  const startTime = Date.now();
  
  try {
    const info = await ctx.reply("🤔 Thinking...");
    
    const { textStream } = await streamText({
      model: geminiAgent,
      prompt: ctx.message.text,
    });

    for await (const delta of textStream) {
      fullResponse += delta;
      // ... update logic
    }
    
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Add response time to final message
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      info.message_id, 
      null, 
      `${fullResponse}\n\n⏱️ _Responded in ${responseTime}s_`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    // ... error handling
  }
});
```

## Example 4: User Whitelisting

Restrict bot access to specific users:

```javascript
// Add at the top after imports
const ALLOWED_USERS = process.env.ALLOWED_USER_IDS?.split(',').map(id => parseInt(id)) || [];

// Add middleware before handlers
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
    await ctx.reply('⛔ Sorry, you are not authorized to use this bot.');
    return;
  }
  
  return next();
});
```

Then add to `.env`:
```env
ALLOWED_USER_IDS=123456789,987654321
```

## Example 5: Conversation Context Reset

Add a command to reset the Gemini CLI session:

```javascript
bot.command('reset', async (ctx) => {
  try {
    // You would need to implement session management
    // This is a simplified example
    await ctx.reply('🔄 Context reset! Starting fresh conversation.');
  } catch (error) {
    await ctx.reply('❌ Failed to reset context.');
  }
});
```

## Example 6: Adding Message Queue

Handle multiple concurrent messages gracefully:

```javascript
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: 1 });

bot.on('text', async (ctx) => {
  // Add to queue
  queue.add(async () => {
    // ... your message handling logic
  });
  
  if (queue.size > 0) {
    await ctx.reply(`⏳ ${queue.size} message(s) in queue...`);
  }
});
```

## Example 7: Custom Gemini CLI Arguments

Pass custom arguments to Gemini CLI:

```javascript
const geminiAgent = new ACP({
  command: 'gemini',
  args: [
    '--protocol', 'acp',
    '--model', 'gemini-2.0-flash-exp',  // Specify model
    '--max-tokens', '2048',             // Set token limit
    '--temperature', '0.7'               // Control creativity
  ]
});
```

## Example 8: Error Recovery with Retry

Add automatic retry on failures:

```javascript
async function streamWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await streamText({
        model: geminiAgent,
        prompt: prompt,
      });
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

bot.on('text', async (ctx) => {
  // ... 
  const { textStream } = await streamWithRetry(ctx.message.text);
  // ...
});
```

## Example 9: Logging User Interactions

Track usage patterns:

```javascript
import fs from 'fs/promises';

bot.on('text', async (ctx) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: ctx.from.id,
    username: ctx.from.username,
    message: ctx.message.text,
  };
  
  await fs.appendFile(
    'interaction_log.jsonl',
    JSON.stringify(logEntry) + '\n'
  );
  
  // ... rest of handler
});
```

## Example 10: Rich Formatting

Use Telegram's formatting options:

```javascript
// In your message updates
await ctx.telegram.editMessageText(
  ctx.chat.id, 
  info.message_id, 
  null, 
  formatResponse(fullResponse),
  { parse_mode: 'Markdown' }
);

function formatResponse(text) {
  // Convert **bold** to Telegram bold
  text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // Convert `code` to Telegram code
  text = text.replace(/`([^`]+)`/g, '`$1`');
  
  return text;
}
```

## Tips for Extensions

1. **Keep it modular**: Create separate files for complex features
2. **Handle errors**: Always wrap async operations in try-catch
3. **Test locally**: Use `npm run dev` for quick iteration
4. **Monitor performance**: Log timing and memory usage
5. **Document changes**: Update README when adding features

## Contributing

Have a cool extension? Share it by:
1. Adding it to this file
2. Creating an example in `/examples` directory
3. Opening a pull request

---

For more ideas, check out:
- [Telegraf documentation](https://telegraf.js.org/)
- [Vercel AI SDK docs](https://sdk.vercel.ai/)
- [Gemini CLI documentation](https://github.com/google/generative-ai-docs)
