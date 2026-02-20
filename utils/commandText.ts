export function normalizeCommandText(text: unknown) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, '');
}

export function isAbortCommand(text: unknown) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return false;
  }

  const commands = new Set(['abort', 'cancel', 'stop', '/abort', '/cancel', '/stop']);
  if (commands.has(normalized)) {
    return true;
  }

  const compact = normalized.replace(/\s+/g, ' ');
  return compact === 'please abort' || compact === 'please cancel' || compact === 'please stop';
}

export function normalizeOutgoingText(text: unknown) {
  return String(text || '').trim();
}

/**
 * Generates a random short identifier using base36.
 * Provides 8 characters of entropy, suitable for job references and correlation IDs.
 *
 * @returns A random 8-character string (e.g., "5g7h2k9z")
 */
export function generateShortId() {
  return Math.random().toString(36).substring(2, 10);
}
