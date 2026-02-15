import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { buildPermissionResponse, noOpAcpFileOperation } from './clientHelpers.js';
import { getErrorMessage } from '../utils/error.js';

const ACP_DEBUG_STREAM = String(process.env.ACP_DEBUG_STREAM || '').toLowerCase() === 'true';
const GEMINI_KILL_GRACE_MS = parseInt(process.env.GEMINI_KILL_GRACE_MS || '5000', 10);

export interface TempAcpRunnerOptions {
  scheduleId: string;
  promptForGemini: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  noOutputTimeoutMs: number;
  permissionStrategy: string;
  stderrTailMaxChars?: number;
  logInfo: (message: string, details?: unknown) => void;
}

export async function runPromptWithTempAcp(options: TempAcpRunnerOptions): Promise<string> {
  const {
    scheduleId,
    promptForGemini,
    command,
    args,
    cwd,
    timeoutMs,
    noOutputTimeoutMs,
    permissionStrategy,
    stderrTailMaxChars = 4000,
    logInfo,
  } = options;

  const { source: mcpServersSource, mcpServers } = getMcpServersForSession();
  const mcpServerNames = mcpServers
    .map((server) => {
      if (server && typeof server === 'object' && 'name' in server) {
        return String((server as { name?: unknown }).name ?? '');
      }

      return '';
    })
    .filter((name) => name.length > 0);

  const tempProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd,
  });

  logInfo('Scheduler temp Gemini ACP process started', {
    scheduleId,
    pid: tempProcess.pid,
    command,
    args,
  });

  let tempConnection: any = null;
  let tempSessionId: string | null = null;
  let tempCollector: { onActivity: () => void; append: (chunk: string) => void } | null = null;
  let tempStderrTail = '';
  let noOutputTimeout: NodeJS.Timeout | null = null;
  let overallTimeout: NodeJS.Timeout | null = null;
  let cleanedUp = false;

  const normalizeEnvArray = (envValue: unknown) => {
    if (Array.isArray(envValue)) {
      return envValue
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const candidate = entry as { name?: unknown; value?: unknown };
          return {
            name: String(candidate.name ?? ''),
            value: String(candidate.value ?? ''),
          };
        })
        .filter((entry) => entry.name.length > 0);
    }

    if (envValue && typeof envValue === 'object') {
      return Object.entries(envValue as Record<string, unknown>).map(([name, value]) => ({
        name,
        value: String(value ?? ''),
      }));
    }

    return [];
  };

  const normalizeSingleMcpServer = (name: string, serverConfig: unknown) => {
    if (!serverConfig || typeof serverConfig !== 'object' || Array.isArray(serverConfig)) {
      return null;
    }

    const candidate = serverConfig as Record<string, unknown>;
    const hasCommand = typeof candidate.command === 'string' && candidate.command.length > 0;
    const hasUrl = typeof candidate.url === 'string' && candidate.url.length > 0;

    if (hasCommand) {
      return {
        name,
        command: String(candidate.command),
        args: Array.isArray(candidate.args) ? candidate.args.map((arg) => String(arg)) : [],
        env: normalizeEnvArray(candidate.env),
      };
    }

    if (hasUrl) {
      const type = candidate.type === 'sse' ? 'sse' : 'http';
      const headers = Array.isArray(candidate.headers)
        ? candidate.headers
            .filter((header) => header && typeof header === 'object')
            .map((header) => {
              const typedHeader = header as { name?: unknown; value?: unknown };
              return {
                name: String(typedHeader.name ?? ''),
                value: String(typedHeader.value ?? ''),
              };
            })
            .filter((header) => header.name.length > 0)
        : [];

      return {
        type,
        name,
        url: String(candidate.url),
        headers,
      };
    }

    return null;
  };

  const normalizeMcpServers = (value: unknown): unknown[] => {
    if (Array.isArray(value)) {
      return value
        .map((entry, index) => normalizeSingleMcpServer(`server_${index + 1}`, entry))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([name, serverConfig]) => normalizeSingleMcpServer(name, serverConfig))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    }

    return [];
  };

  function getMcpServersForSession() {
    const raw = process.env.ACP_MCP_SERVERS_JSON;
    if (!raw) {
      const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
      if (!fs.existsSync(settingsPath)) {
        return {
          source: 'default-empty',
          mcpServers: [],
        };
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { mcpServers?: unknown };
        return {
          source: 'gemini-settings',
          mcpServers: normalizeMcpServers(parsed?.mcpServers),
        };
      } catch (error) {
        logInfo('Failed to read Gemini settings mcpServers for temp ACP runner; falling back to empty array', {
          scheduleId,
          settingsPath,
          error: getErrorMessage(error),
        });
        return {
          source: 'default-empty',
          mcpServers: [],
        };
      }
    }

    try {
      return {
        source: 'env-override',
        mcpServers: normalizeMcpServers(JSON.parse(raw)),
      };
    } catch (error) {
      logInfo('Invalid ACP_MCP_SERVERS_JSON for temp ACP runner; falling back to Gemini settings mcpServers', {
        scheduleId,
        error: getErrorMessage(error),
      });

      const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
      if (!fs.existsSync(settingsPath)) {
        return {
          source: 'default-empty',
          mcpServers: [],
        };
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { mcpServers?: unknown };
        return {
          source: 'gemini-settings',
          mcpServers: normalizeMcpServers(parsed?.mcpServers),
        };
      } catch (settingsError) {
        logInfo('Failed to read Gemini settings mcpServers after invalid env override; using empty array', {
          scheduleId,
          settingsPath,
          error: getErrorMessage(settingsError),
        });

        return {
          source: 'default-empty',
          mcpServers: [],
        };
      }
    }
  }

  const terminateProcessGracefully = () => {
    return new Promise<void>((resolve) => {
      if (!tempProcess || tempProcess.killed || tempProcess.exitCode !== null) {
        resolve();
        return;
      }

      let settled = false;

      const finalize = (reason: string) => {
        if (settled) {
          return;
        }
        settled = true;
        logInfo('Scheduler temp Gemini process termination finalized', {
          scheduleId,
          pid: tempProcess.pid,
          reason,
        });
        resolve();
      };

      tempProcess.once('exit', () => finalize('exit'));

      logInfo('Scheduler temp Gemini process SIGTERM', {
        scheduleId,
        pid: tempProcess.pid,
        graceMs: GEMINI_KILL_GRACE_MS,
      });
      tempProcess.kill('SIGTERM');

      setTimeout(
        () => {
          if (settled || tempProcess.killed || tempProcess.exitCode !== null) {
            finalize('already-exited');
            return;
          }

          logInfo('Scheduler temp Gemini process SIGKILL escalation', {
            scheduleId,
            pid: tempProcess.pid,
          });
          tempProcess.kill('SIGKILL');
          finalize('sigkill');
        },
        Math.max(0, GEMINI_KILL_GRACE_MS),
      );
    });
  };

  const appendTempStderrTail = (text: string) => {
    tempStderrTail = `${tempStderrTail}${text}`;
    if (tempStderrTail.length > stderrTailMaxChars) {
      tempStderrTail = tempStderrTail.slice(-stderrTailMaxChars);
    }
  };

  const clearTimers = () => {
    if (noOutputTimeout) {
      clearTimeout(noOutputTimeout);
      noOutputTimeout = null;
    }
    if (overallTimeout) {
      clearTimeout(overallTimeout);
      overallTimeout = null;
    }
  };

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    clearTimers();

    try {
      if (tempConnection && tempSessionId) {
        await tempConnection.cancel({ sessionId: tempSessionId });
      }
    } catch (_) {}

    if (!tempProcess.killed && tempProcess.exitCode === null) {
      await terminateProcessGracefully();
    }

    logInfo('Scheduler temp Gemini ACP process cleanup complete', {
      scheduleId,
      pid: tempProcess.pid,
    });
  };

  tempProcess.stderr.on('data', (chunk: Buffer) => {
    const rawText = chunk.toString();
    appendTempStderrTail(rawText);
    const text = rawText.trim();
    if (text) {
      console.error(`[gemini:scheduler:${scheduleId}] ${text}`);
    }
    tempCollector?.onActivity();
  });

  tempProcess.on('error', (error: Error) => {
    logInfo('Scheduler temp Gemini ACP process error', {
      scheduleId,
      pid: tempProcess.pid,
      error: error.message,
    });
  });

  tempProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    logInfo('Scheduler temp Gemini ACP process exited', {
      scheduleId,
      pid: tempProcess.pid,
      code,
      signal,
    });
  });

  try {
    const input = Writable.toWeb(tempProcess.stdin) as unknown as WritableStream<Uint8Array>;
    const output = Readable.toWeb(tempProcess.stdout) as unknown as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const tempClient = {
      async requestPermission(params: any) {
        return buildPermissionResponse(params?.options, permissionStrategy);
      },
      async sessionUpdate(params: any) {
        if (!tempCollector || params.sessionId !== tempSessionId) {
          return;
        }

        tempCollector.onActivity();

        if (params.update?.sessionUpdate === 'agent_message_chunk' && params.update?.content?.type === 'text') {
          const chunkText = params.update.content.text;
          tempCollector.append(chunkText);
        }
      },
      async readTextFile(_params: any) {
        return noOpAcpFileOperation(_params);
      },
      async writeTextFile(_params: any) {
        return noOpAcpFileOperation(_params);
      },
    };

    tempConnection = new acp.ClientSideConnection(() => tempClient, stream);

    await tempConnection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const session = await tempConnection.newSession({
      cwd,
      mcpServers,
    });
    tempSessionId = session.sessionId;

    logInfo('Scheduler temp ACP session ready', {
      scheduleId,
      sessionId: tempSessionId,
      mcpServersMode: mcpServersSource,
      mcpServersCount: mcpServers.length,
      mcpServerNames,
    });

    return await new Promise<string>((resolve, reject) => {
      let response = '';
      let settled = false;
      const startedAt = Date.now();
      let chunkCount = 0;
      let firstChunkAt: number | null = null;

      const settle = async (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        await cleanup();
        handler();
      };

      const refreshNoOutputTimer = () => {
        if (!noOutputTimeoutMs || noOutputTimeoutMs <= 0) {
          return;
        }
        if (noOutputTimeout) {
          clearTimeout(noOutputTimeout);
        }
        noOutputTimeout = setTimeout(async () => {
          try {
            if (tempConnection && tempSessionId) {
              await tempConnection.cancel({ sessionId: tempSessionId });
            }
          } catch (_) {}

          await settle(() => reject(new Error(`Scheduler Gemini ACP produced no output for ${noOutputTimeoutMs}ms`)));
        }, noOutputTimeoutMs);
      };

      overallTimeout = setTimeout(async () => {
        try {
          if (tempConnection && tempSessionId) {
            await tempConnection.cancel({ sessionId: tempSessionId });
          }
        } catch (_) {}

        await settle(() => reject(new Error(`Scheduler Gemini ACP timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      tempCollector = {
        onActivity: refreshNoOutputTimer,
        append: (chunk: string) => {
          refreshNoOutputTimer();
          chunkCount += 1;
          if (!firstChunkAt) {
            firstChunkAt = Date.now();
          }
          if (ACP_DEBUG_STREAM) {
            logInfo('Scheduler ACP chunk received', {
              scheduleId,
              chunkIndex: chunkCount,
              chunkLength: chunk.length,
              elapsedMs: Date.now() - startedAt,
              bufferLengthBeforeAppend: response.length,
            });
          }
          response += chunk;
        },
      };

      refreshNoOutputTimer();

      tempConnection
        .prompt({
          sessionId: tempSessionId,
          prompt: [{ type: 'text', text: promptForGemini }],
        })
        .then(async (result: any) => {
          if (ACP_DEBUG_STREAM) {
            logInfo('Scheduler ACP prompt stop reason', {
              scheduleId,
              stopReason: result?.stopReason || '(none)',
              chunkCount,
              firstChunkDelayMs: firstChunkAt ? firstChunkAt - startedAt : null,
              elapsedMs: Date.now() - startedAt,
              bufferedLength: response.length,
            });
          }
          if (result?.stopReason === 'cancelled' && !response) {
            await settle(() => reject(new Error('Scheduler Gemini ACP prompt was cancelled')));
            return;
          }

          await settle(() => resolve(response || 'No response received.'));
        })
        .catch(async (error: any) => {
          await settle(() => reject(new Error(error?.message || 'Scheduler Gemini ACP prompt failed')));
        });
    });
  } catch (error: any) {
    logInfo('Scheduler temporary Gemini ACP run failed', {
      scheduleId,
      error: getErrorMessage(error),
      stderrTail: tempStderrTail || '(empty)',
    });
    throw error;
  } finally {
    await cleanup();
  }
}
