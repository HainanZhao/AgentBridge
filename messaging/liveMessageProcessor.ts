import { debounce } from 'lodash-es';
import { generateShortId } from '../utils/commandText.js';

type LogInfoFn = (message: string, details?: unknown) => void;

type ProcessSingleMessageParams = {
  messageContext: any;
  messageRequestId: number;
  maxResponseLength: number;
  streamUpdateIntervalMs: number;
  messageGapThresholdMs: number;
  acpDebugStream: boolean;
  runAcpPrompt: (promptText: string, onChunk?: (chunk: string) => void) => Promise<string>;
  scheduleAsyncJob: (message: string, chatId: string, jobRef: string) => Promise<string>;
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
  let modeDetected = !!messageContext.skipHybridMode;
  let isAsyncMode = false;
  let prefixBuffer = '';
  // No max length needed - we detect prefix in streaming and also check full response at the end

  if (modeDetected) {
    logInfo('Mode detection skipped due to skipHybridMode flag', { requestId: messageRequestId });
  }

  const previewText = () => {
    if (previewBuffer.length <= maxResponseLength) {
      return previewBuffer;
    }
    return `${previewBuffer.slice(0, maxResponseLength - 1)}…`;
  };

  const flushPreview = async (force = false, allowStart = true) => {
    if (finalizedViaLiveMessage || isAsyncMode || !modeDetected) {
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
    if (!liveMessageId || isAsyncMode || !modeDetected) {
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
    const prompt = modeDetected
      ? messageContext.text
      : `[SYSTEM: HYBRID MODE]
Instructions:
1. Analyze the User Request below.
2. Determine if it is "Quick" (answer immediately) or "Async" (background task).
3. Use ASYNC mode if:
   - The request requires using any tools (e.g., reading files, running commands, searching code)
   - The task might take longer than 10 seconds
   - Examples: scanning a repo codebase, running tests, building projects, fetching URLs, processing multiple files
   - IMPORTANT: If you choose ASYNC mode, DO NOT perform the task now. DO NOT call any tools. Just provide the confirmation message and exit.
4. Use QUICK mode only for:
   - Simple questions that can be answered from knowledge
   - No tools required
   - Response can be generated in a few seconds

Response Format:
- "[MODE: QUICK] " followed by your immediate answer
- "[MODE: ASYNC] " followed by a brief confirmation (e.g. "I'll start that background task...")

User Request: "${messageContext.text}"`;

    // Note: fullResponse is unused - we process chunks via the callback instead
    const _fullResponse = await runAcpPrompt(prompt, async (chunk) => {
      // If we already detected ASYNC mode, we suppress output (we'll handle it at the end)
      // But we still consume the stream to let the prompt finish.
      if (modeDetected && isAsyncMode) return;

      const now = Date.now();
      const gapSinceLastChunk = lastChunkAt > 0 ? now - lastChunkAt : 0;

      if (!modeDetected) {
        prefixBuffer += chunk;

        // Try to detect prefix (trim whitespace to handle newlines/spaces before prefix)
        const trimmedBuffer = prefixBuffer.trim();
        if (trimmedBuffer.startsWith('[MODE: QUICK]')) {
          modeDetected = true;
          isAsyncMode = false;
          logInfo('Mode detected via streaming: QUICK', { requestId: messageRequestId });
          // Strip the prefix and any leading whitespace from the buffer
          const content = prefixBuffer.replace(/\[MODE: QUICK\]\s*/, '');
          previewBuffer += content;
        } else if (trimmedBuffer.startsWith('[MODE: ASYNC]')) {
          modeDetected = true;
          isAsyncMode = true;
          logInfo('Mode detected via streaming: ASYNC', { requestId: messageRequestId });
          // We don't update previewBuffer for ASYNC because we handle it separately
        }
        // Continue buffering until prefix detected - we'll check full response at the end if not found

        // If we just switched to QUICK mode, we might have content to flush
        if (modeDetected && !isAsyncMode) {
          void debouncedFlush();
        }
        return;
      }

      // Normal streaming for QUICK mode
      if (gapSinceLastChunk > messageGapThresholdMs && liveMessageId && previewBuffer.trim()) {
        await finalizeCurrentMessage();
      }

      lastChunkAt = now;
      previewBuffer += chunk;
      void debouncedFlush();
    });
    promptCompleted = true;

    // Handle edge case where the entire response came in one chunk or small enough to handle at end
    if (!modeDetected) {
      const trimmedBuffer = prefixBuffer.trim();
      if (trimmedBuffer.startsWith('[MODE: ASYNC]')) {
        isAsyncMode = true;
        modeDetected = true;
      } else if (trimmedBuffer.startsWith('[MODE: QUICK]')) {
        // Strip any prefix if it exists
        const content = prefixBuffer.replace(/\[MODE: QUICK\]\s*/, '');
        previewBuffer = content;
        modeDetected = true;
      } else {
        // No valid prefix found in full response - log warning and default to QUICK for backward compatibility
        logInfo('No valid mode prefix detected in full response, defaulting to QUICK', {
          requestId: messageRequestId,
          responsePreview: prefixBuffer.slice(0, 100),
        });
        modeDetected = true;
        isAsyncMode = false;
        previewBuffer = prefixBuffer;
      }
    }

    if (isAsyncMode) {
      const jobRef = `job_${generateShortId()}`;
      logInfo('Async mode detected, fire-and-forget background job', {
        requestId: messageRequestId,
        jobRef,
      });

      // Schedule the original user request as fire-and-forget
      scheduleAsyncJob(messageContext.text, messageContext.chatId, jobRef).catch((error) => {
        logInfo('Fire-and-forget scheduleAsyncJob failed', {
          requestId: messageRequestId,
          jobRef,
          error: getErrorMessage(error),
        });
      });

      // Send the full agent response (including [MODE: ASYNC] prefix) back to user
      let finalMsg = _fullResponse.trim();
      if (!finalMsg) {
        finalMsg = `[MODE: ASYNC] I've scheduled this task. I'll notify you when it's done.`;
      }

      // Always append reference as a footer for clarity
      finalMsg = `${finalMsg}\n\nReference: ${jobRef}`;

      await messageContext.sendText(finalMsg);
      return;
    }

    // Normal completion for QUICK mode
    debouncedFlush.cancel();
    await flushPreview(true);

    if (startingLiveMessage) {
      try {
        await startingLiveMessage;
      } catch (_) {}
    }

    if (liveMessageId) {
      try {
        // Use previewBuffer here because fullResponse contains the raw text with prefix
        await messageContext.finalizeLiveMessage(liveMessageId, previewBuffer || 'No response received.');
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
        responseLength: (previewBuffer || '').length,
      });
    }

    if (!finalizedViaLiveMessage) {
      await messageContext.sendText(previewBuffer || 'No response received.');
    }

    // Track conversation history after successful completion
    if (onConversationComplete && previewBuffer) {
      try {
        onConversationComplete(messageContext.text, previewBuffer, messageContext.chatId);
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
