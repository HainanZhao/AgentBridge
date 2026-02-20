import { debounce } from 'lodash-es';

type LogInfoFn = (message: string, details?: unknown) => void;

type ProcessSingleMessageParams = {
  messageContext: any;
  messageRequestId: number;
  maxResponseLength: number;
  streamUpdateIntervalMs: number;
  messageGapThresholdMs: number;
  acpDebugStream: boolean;
  runAcpPrompt: (promptText: string, onChunk?: (chunk: string) => void) => Promise<string>;
  scheduleAsyncJob: (message: string, chatId: string) => Promise<void>;
  logInfo: LogInfoFn;
  getErrorMessage: (error: unknown, fallbackMessage?: string) => string;
  onConversationComplete?: (userMessage: string, botResponse: string, chatId: string) => void;
};

export async function processSingleTelegramMessage({
  messageContext,
  messageRequestId,
  maxResponseLength,
  streamUpdateIntervalMs,
  messageGapThresholdMs,
  acpDebugStream,
  runAcpPrompt,
  scheduleAsyncJob,
  logInfo,
  getErrorMessage,
  onConversationComplete,
}: ProcessSingleMessageParams) {
  logInfo('Starting message processing', {
    requestId: messageRequestId,
    chatId: messageContext.chatId,
  });

  const stopTypingIndicator = messageContext.startTyping();
  let liveMessageId: string | number | undefined;
  let previewBuffer = '';
  let lastFlushAt = Date.now();
  let lastChunkAt = 0;
  let finalizedViaLiveMessage = false;
  let startingLiveMessage: Promise<void> | null = null;
  let promptCompleted = false;
  let isAsyncModeDetected = false;
  let isStreamingStarted = false;

  const previewText = () => {
    if (previewBuffer.length <= maxResponseLength) {
      return previewBuffer;
    }
    return `${previewBuffer.slice(0, maxResponseLength - 1)}…`;
  };

  const flushPreview = async (force = false, allowStart = true) => {
    if (finalizedViaLiveMessage || isAsyncModeDetected) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastFlushAt < streamUpdateIntervalMs) {
      return;
    }

    lastFlushAt = now;
    const text = previewText();
    if (!text) {
      return;
    }

    if (!liveMessageId) {
      if (!allowStart) {
        return;
      }

      if (startingLiveMessage) {
        await startingLiveMessage;
      } else {
        startingLiveMessage = (async () => {
          try {
            liveMessageId = await messageContext.startLiveMessage(text || '…');
          } catch (_) {
            liveMessageId = undefined;
          }
        })();

        try {
          await startingLiveMessage;
        } finally {
          startingLiveMessage = null;
        }
      }
    }

    if (!liveMessageId) {
      return;
    }

    try {
      await messageContext.updateLiveMessage(liveMessageId, text);
      if (acpDebugStream) {
        logInfo('Live preview updated', {
          requestId: messageRequestId,
          previewLength: text.length,
        });
      }
    } catch (error: any) {
      const errorMessage = getErrorMessage(error).toLowerCase();
      if (!errorMessage.includes('message is not modified')) {
        logInfo('Live preview update skipped', {
          requestId: messageRequestId,
          error: getErrorMessage(error),
        });
      }
    }
  };

  // Create a debounced flush function using lodash
  const debouncedFlush = debounce(
    async () => {
      await flushPreview(true);
    },
    streamUpdateIntervalMs,
    { leading: false, trailing: true },
  );

  const finalizeCurrentMessage = async () => {
    if (!liveMessageId || isAsyncModeDetected) {
      return;
    }

    if (startingLiveMessage) {
      try {
        await startingLiveMessage;
      } catch (_) {}
    }

    debouncedFlush.cancel();
    await flushPreview(true, false);

    try {
      const text = previewText();
      await messageContext.finalizeLiveMessage(liveMessageId, text);
      if (acpDebugStream) {
        logInfo('Finalized message due to long gap', {
          requestId: messageRequestId,
          messageLength: text.length,
        });
      }
    } catch (error: any) {
      logInfo('Failed to finalize message on gap', {
        requestId: messageRequestId,
        error: getErrorMessage(error),
      });
    }

    liveMessageId = undefined;
    previewBuffer = '';
    lastFlushAt = Date.now();
    startingLiveMessage = null;
  };

  try {
    const smartPrompt = `[SYSTEM: HYBRID MODE]
Instructions:
1. Analyze the User Request below.
2. If it is a "Quick Task" (simple question, clarification, "hello", short lookup): Answer it immediately and directly.
3. If it is an "Async Task" (long research, scraping, coding, waiting, monitoring): Respond ONLY with the exact string "ASYNC_MODE".

User Request: "${messageContext.text}"`;

    const fullResponse = await runAcpPrompt(smartPrompt, async (chunk) => {
      // If we already detected async mode, suppress all output
      if (isAsyncModeDetected) return;

      const now = Date.now();
      const gapSinceLastChunk = lastChunkAt > 0 ? now - lastChunkAt : 0;

      // Buffer the chunk
      const potentialBuffer = previewBuffer + chunk;

      // Check for ASYNC_MODE pattern in the beginning
      // We only check this if we haven't started streaming to the user yet
      if (!isStreamingStarted) {
        // If the buffer is still small, it might be the start of "ASYNC_MODE"
        // or the start of "Hello there".
        // "ASYNC_MODE" is 10 chars.
        if (potentialBuffer.length < 20) {
           if ("ASYNC_MODE".startsWith(potentialBuffer) || potentialBuffer.startsWith("ASYNC_MODE")) {
             // It *could* be async mode, or it is async mode.
             // Don't flush yet.
             previewBuffer = potentialBuffer;
             if (potentialBuffer.trim() === 'ASYNC_MODE') {
               isAsyncModeDetected = true;
             }
             return;
           }
        }
        
        // If we are here, it's NOT Async Mode (or we passed the check).
        isStreamingStarted = true;
      }

      if (gapSinceLastChunk > messageGapThresholdMs && liveMessageId && previewBuffer.trim()) {
        await finalizeCurrentMessage();
      }

      lastChunkAt = now;
      previewBuffer += chunk;
      void debouncedFlush();
    });
    promptCompleted = true;

    // Check final response for strict ASYNC_MODE (in case it came in one big chunk)
    if (fullResponse.trim() === 'ASYNC_MODE') {
      isAsyncModeDetected = true;
    }

    if (isAsyncModeDetected) {
      logInfo('Async mode detected, scheduling background job', { requestId: messageRequestId });
      await scheduleAsyncJob(messageContext.text, messageContext.chatId);
      await messageContext.sendText("I've scheduled this as a background task. I'll notify you when it's done.");
      return;
    }

    // Normal completion
    debouncedFlush.cancel();
    await flushPreview(true);

    if (startingLiveMessage) {
      try {
        await startingLiveMessage;
      } catch (_) {}
    }

    if (liveMessageId) {
      try {
        await messageContext.finalizeLiveMessage(liveMessageId, fullResponse || 'No response received.');
        finalizedViaLiveMessage = true;
      } catch (error: any) {
        finalizedViaLiveMessage = true;
        logInfo('Live message finalize failed; keeping streamed message as final output', {
          requestId: messageRequestId,
          error: getErrorMessage(error),
        });
      }
    }

    if (!finalizedViaLiveMessage && acpDebugStream) {
      logInfo('Sending final response', {
        requestId: messageRequestId,
        responseLength: (fullResponse || '').length,
      });
    }

    if (!finalizedViaLiveMessage) {
      await messageContext.sendText(fullResponse || 'No response received.');
    }

    // Track conversation history after successful completion
    if (onConversationComplete && fullResponse) {
      try {
        onConversationComplete(messageContext.text, fullResponse, messageContext.chatId);
      } catch (error: any) {
        logInfo('Failed to track conversation history', {
          requestId: messageRequestId,
          error: getErrorMessage(error),
        });
      }
    }
  } finally {
    debouncedFlush.cancel();
    if (liveMessageId && !finalizedViaLiveMessage && !promptCompleted) {
      try {
        await messageContext.removeMessage(liveMessageId);
      } catch (_) {}
    }

    stopTypingIndicator();
    logInfo('Finished message processing', {
      requestId: messageRequestId,
      chatId: messageContext.chatId,
    });
  }
}
