/**
 * Smartly truncates or splits a message for Telegram.
 * Prioritizes cutting at paragraph ends, then line ends, then spaces.
 * Ensures that if a code block is opened, it is closed in the current chunk.
 */

/**
 * Scans text up to splitPoint and returns the latest safe split point that
 * doesn't fall inside an inline markdown construct (inline code span or link).
 * Triple-backtick code blocks are already handled by splitIntoSmartChunks, so
 * this function just skips over them to avoid mis-matching single backticks.
 */
function getSafeMarkdownSplitPoint(text: string, splitPoint: number): number {
  const limit = Math.min(splitPoint, text.length);
  let i = 0;

  while (i < limit) {
    const ch = text[i];

    // Skip backslash-escaped characters
    if (ch === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }

    if (ch === '`') {
      // Triple-backtick code block — let the existing code-block logic handle
      // it; just skip past the block so a single ` inside doesn't confuse us.
      if (text.slice(i, i + 3) === '```') {
        i += 3;
        while (i < text.length && text[i] !== '\n') i++; // skip language spec
        const closeIndex = text.indexOf('```', i);
        if (closeIndex === -1 || closeIndex >= limit) {
          // Block extends beyond limit — return limit and let existing logic close it.
          return limit;
        }
        i = closeIndex + 3;
        continue;
      }

      // Single-backtick inline code span
      const start = i;
      i++;
      while (i < text.length && text[i] !== '`') i++;
      if (i < limit) {
        i++; // consume closing `
      } else {
        return start; // unclosed inline code span within limit
      }
      continue;
    }

    // Markdown image ![alt](url) or link [text](url)
    if (ch === '!' && i + 1 < text.length && text[i + 1] === '[') {
      // Image syntax: treat ![ as a unit
      const start = i;
      i += 2; // skip ![
      // Find closing ]
      while (i < text.length && text[i] !== ']') {
        if (text[i] === '\\' && i + 1 < text.length) i++; // skip \]
        i++;
      }
      if (i >= limit) {
        return start; // unclosed ![ within limit
      }
      i++; // consume ]
      if (i < text.length && text[i] === '(') {
        i++; // consume (
        // Find closing )
        while (i < text.length && text[i] !== ')') {
          if (text[i] === '\\' && i + 1 < text.length) i++; // skip \)
          i++;
        }
        if (i >= limit) {
          return start; // image URL extends beyond limit
        }
        i++; // consume )
      }
      continue;
    }

    // Markdown link [text](url)
    if (ch === '[') {
      const start = i;
      i++;
      // Find closing ]
      while (i < text.length && text[i] !== ']') {
        if (text[i] === '\\' && i + 1 < text.length) i++; // skip \]
        i++;
      }
      if (i >= limit) {
        return start; // unclosed [ within limit
      }
      i++; // consume ]
      if (i < text.length && text[i] === '(') {
        i++; // consume (
        // Find closing )
        while (i < text.length && text[i] !== ')') {
          if (text[i] === '\\' && i + 1 < text.length) i++; // skip \)
          i++;
        }
        if (i >= limit) {
          return start; // link URL extends beyond limit
        }
        i++; // consume )
      }
      continue;
    }

    i++;
  }

  return limit;
}

export interface TruncateOptions {
  maxLength: number;
  ellipsis?: string;
}

export function smartTruncate(text: string, options: TruncateOptions): string {
  const { maxLength, ellipsis = '...' } = options;

  if (text.length <= maxLength) {
    return text;
  }

  const reserveLength = ellipsis.length + 8;
  const cutIndex = maxLength - reserveLength;

  if (cutIndex <= 0) {
    return text.slice(0, maxLength);
  }

  const subText = text.slice(0, cutIndex);

  let splitIndex = -1;
  const lastParagraph = subText.lastIndexOf('\n\n');
  if (lastParagraph !== -1 && lastParagraph > cutIndex * 0.5) {
    splitIndex = lastParagraph;
  } else {
    const lastLine = subText.lastIndexOf('\n');
    if (lastLine !== -1 && lastLine > cutIndex * 0.7) {
      splitIndex = lastLine;
    } else {
      const lastSpace = subText.lastIndexOf(' ');
      if (lastSpace !== -1 && lastSpace > cutIndex * 0.8) {
        splitIndex = lastSpace;
      } else {
        splitIndex = cutIndex;
      }
    }
  }

  let result = text.slice(0, splitIndex).trimEnd();

  // Handle code blocks
  const codeBlockCount = result.split('\x60\x60\x60').length - 1;
  if (codeBlockCount % 2 !== 0) {
    result += '\n\x60\x60\x60';
  }

  result += ellipsis;

  return result;
}

export function splitIntoSmartChunks(text: string, maxLength: number): string[] {
  if (!text) return [''];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  // Ensure we have a reasonable limit for splitting
  const reserve = Math.min(20, Math.floor(maxLength * 0.1));
  const limit = Math.max(maxLength - reserve, 1);

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const subText = remaining.slice(0, limit);

    let splitPoint = -1;
    const lastParagraph = subText.lastIndexOf('\n\n');
    if (lastParagraph !== -1 && lastParagraph > limit * 0.5) {
      splitPoint = lastParagraph;
    } else {
      const lastLine = subText.lastIndexOf('\n');
      if (lastLine !== -1 && lastLine > limit * 0.7) {
        splitPoint = lastLine;
      } else {
        const lastSpace = subText.lastIndexOf(' ');
        if (lastSpace !== -1 && lastSpace > limit * 0.8) {
          splitPoint = lastSpace;
        } else {
          splitPoint = limit;
        }
      }
    }

    // Ensure we don't split in the middle of a backslash escape
    if (splitPoint > 0 && remaining[splitPoint - 1] === '\\') {
      splitPoint -= 1;
    }

    // Adjust split point to avoid breaking inline markdown constructs (links, inline code)
    splitPoint = getSafeMarkdownSplitPoint(remaining, splitPoint);

    // Ensure splitPoint is at least 1 to avoid infinite loops
    if (splitPoint <= 0) {
      splitPoint = limit;
    }

    let chunk = remaining.slice(0, splitPoint).trimEnd();

    // Check for open code block
    const isInsideCodeBlock = (chunk.split('\x60\x60\x60').length - 1) % 2 !== 0;

    if (isInsideCodeBlock) {
      const lastCodeBlockIndex = chunk.lastIndexOf('\x60\x60\x60');
      const textAfterLastCodeBlock = chunk.slice(lastCodeBlockIndex + 3);
      const languageMatch = textAfterLastCodeBlock.match(/^([a-zA-Z0-9]+)/);
      const language = languageMatch ? languageMatch[1] : '';

      chunk += '\n\x60\x60\x60';
      const nextRemaining = `\x60\x60\x60${language ? language : ''}\n${remaining.slice(splitPoint).trimStart()}`;

      // Guard against non-progress: if the reopened prefix makes remaining
      // the same length or longer, skip the code-block carry and just
      // consume the bytes to guarantee forward progress.
      if (nextRemaining.length >= remaining.length) {
        remaining = remaining.slice(splitPoint).trimStart();
      } else {
        remaining = nextRemaining;
      }
    } else {
      remaining = remaining.slice(splitPoint).trimStart();
    }

    chunks.push(chunk);
  }

  return chunks;
}
