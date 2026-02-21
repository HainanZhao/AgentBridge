import { describe, it, expect } from 'vitest';
import { smartTruncate, splitIntoSmartChunks } from './messageTruncator.js';

describe('messageTruncator', () => {
  describe('smartTruncate', () => {
    it('should return the original text if it is within maxLength', () => {
      const text = 'Short message';
      expect(smartTruncate(text, { maxLength: 20 })).toBe(text);
    });

    it('should truncate at paragraph end if possible', () => {
      const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = smartTruncate(text, { maxLength: 30 });
      expect(result).toContain('Paragraph 1');
      expect(result).not.toContain('Paragraph 3');
      expect(result.endsWith('...')).toBe(true);
    });

    it('should close an open code block', () => {
      const text = 'Check this code:\n```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```';
      const result = smartTruncate(text, { maxLength: 60 });
      expect(result).toContain('```typescript');
      expect(result).toContain('```...');
      // Ensure there are two sets of backticks (one to open, one to close)
      const count = (result.match(/```/g) || []).length;
      expect(count).toBe(2);
    });
  });

  describe('splitIntoSmartChunks', () => {
    it('should return a single chunk if text is within maxLength', () => {
      const text = 'Short message';
      expect(splitIntoSmartChunks(text, 20)).toEqual([text]);
    });

    it('should split into multiple chunks at paragraph ends', () => {
      const text = 'P1\n\nP2\n\nP3\n\nP4';
      const chunks = splitIntoSmartChunks(text, 10);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(10);
      }
    });

    it('should not split between backslash and its character', () => {
      const text = 'Hello \\(world\\)';
      // 14 chars. If we split at 8, it's 'Hello \\' and '(world\\)'
      const chunks = splitIntoSmartChunks(text, 8);
      // 'Hello \\' is not good if it's splitting an escape
      // But the current logic doesn't know about it.
      // We expect it to split BEFORE the backslash.
      expect(chunks[0]).not.toBe('Hello \\');
    });

    it('should not split inside a markdown link', () => {
      // With maxLength=30 the natural split (limit=27) lands inside the URL of
      // [X](https://x.com). getSafeMarkdownSplitPoint must push the split back
      // to before '[', so the full link lands intact in the following chunk.
      const text = 'Beginning text here. [X](https://x.com) and more text';
      const chunks = splitIntoSmartChunks(text, 30);
      const linkChunk = chunks.find((c) => c.includes('[X](https://x.com)'));
      expect(linkChunk).toBeDefined();
    });

    it('should not split inside an inline code span', () => {
      // With maxLength=30 the natural split (limit=27) lands inside `code here`.
      // getSafeMarkdownSplitPoint must push the split back to before the opening
      // backtick, so the full span lands intact in the following chunk.
      const text = 'Beginning text here. `code here` and more text to force split';
      const chunks = splitIntoSmartChunks(text, 30);
      const codeChunk = chunks.find((c) => c.includes('`code here`'));
      expect(codeChunk).toBeDefined();
    });

    it('should maintain code block formatting across chunks', () => {
      const text = 'Here is code:\n```js\nconsole.log(1);\nconsole.log(2);\nconsole.log(3);\n```';
      // 40 is small enough to split the code block
      const chunks = splitIntoSmartChunks(text, 40);

      expect(chunks.length).toBeGreaterThan(1);

      // First chunk should close the code block
      expect(chunks[0]).toContain('```');
      expect((chunks[0].match(/```/g) || []).length % 2).toBe(0);

      // Second chunk should re-open the code block
      expect(chunks[1]).toContain('```js');
      expect((chunks[1].match(/```/g) || []).length % 2).toBe(0);
    });

    it('should not split inside a markdown image', () => {
      // Images use ![alt](url) syntax - use maxLength large enough to fit the image
      const text = 'Beginning text here. ![logo](https://example.com/logo.png) and more text';
      const chunks = splitIntoSmartChunks(text, 50);
      const imageChunk = chunks.find((c) => c.includes('![logo](https://example.com/logo.png)'));
      expect(imageChunk).toBeDefined();
    });

    it('should handle multiple inline code spans', () => {
      const text = 'Use `foo` and `bar` and `baz` together in your code';
      const chunks = splitIntoSmartChunks(text, 25);
      // Each code span should be intact in some chunk
      expect(chunks.some((c) => c.includes('`foo`'))).toBe(true);
      expect(chunks.some((c) => c.includes('`bar`'))).toBe(true);
      expect(chunks.some((c) => c.includes('`baz`'))).toBe(true);
    });

    it('should handle multiple markdown links', () => {
      const text = 'Check [link1](https://a.com) and [link2](https://b.com) for info';
      const chunks = splitIntoSmartChunks(text, 30);
      // Each link should be intact in some chunk
      expect(chunks.some((c) => c.includes('[link1](https://a.com)'))).toBe(true);
      expect(chunks.some((c) => c.includes('[link2](https://b.com)'))).toBe(true);
    });

    it('should handle link with parentheses in URL', () => {
      // URLs can contain parentheses, e.g., Wikipedia disambiguation pages
      const text = 'See [Python](https://en.wikipedia.org/wiki/Python_(programming_language)) for details';
      const chunks = splitIntoSmartChunks(text, 40);
      // The link should be kept intact (though this may fail with current impl)
      const linkChunk = chunks.find((c) => c.includes('[Python]'));
      expect(linkChunk).toBeDefined();
    });

    it('should handle escaped brackets in link text', () => {
      // Link text can contain escaped brackets: [text \[with\] brackets](url)
      const text = 'See [link with \\[brackets\\]](https://example.com) here';
      const chunks = splitIntoSmartChunks(text, 35);
      const linkChunk = chunks.find((c) => c.includes('[link with \\[brackets\\]]'));
      expect(linkChunk).toBeDefined();
    });

    it('should handle unclosed inline code span', () => {
      // Unclosed backtick - should push split back to before the backtick
      const text = 'Here is `unclosed code that continues on and on and on';
      const chunks = splitIntoSmartChunks(text, 30);
      // The backtick should be in a later chunk (not split inside the unclosed span)
      expect(chunks[0]).not.toContain('`unclosed');
    });

    it('should handle unclosed markdown link', () => {
      // Unclosed link - should push split back to before the [
      const text = 'Here is [an unclosed link that goes on and on and on';
      const chunks = splitIntoSmartChunks(text, 30);
      // The [ should be in a later chunk
      expect(chunks[0]).not.toContain('[an unclosed');
    });

    it('should handle inline code inside triple-backtick block', () => {
      // Single backticks inside code blocks should not be treated as inline code
      const text = 'Code:\n```js\nconst x = `template`;\nconsole.log(x);\n```';
      const chunks = splitIntoSmartChunks(text, 35);
      // Should handle the code block properly
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle consecutive markdown constructs', () => {
      // Multiple constructs right after each other - use larger maxLength to fit
      const text = 'Use `code` then [link](https://a.com) then `more`';
      const chunks = splitIntoSmartChunks(text, 35);
      expect(chunks.some((c) => c.includes('`code`'))).toBe(true);
      expect(chunks.some((c) => c.includes('[link](https://a.com)'))).toBe(true);
      expect(chunks.some((c) => c.includes('`more`'))).toBe(true);
    });

    it('should handle text ending with backslash', () => {
      const text = 'Text ending with backslash\\';
      const chunks = splitIntoSmartChunks(text, 15);
      // Should not crash and should handle gracefully
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join(' ').replace(/\\s+/g, ' ').trim()).toContain('backslash');
    });

    it('should handle empty text', () => {
      expect(splitIntoSmartChunks('', 100)).toEqual(['']);
    });

    it('should handle text with only whitespace', () => {
      const text = '   \n\n   \n   ';
      const chunks = splitIntoSmartChunks(text, 5);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle very small maxLength', () => {
      const text = 'A very long message that needs splitting';
      const chunks = splitIntoSmartChunks(text, 5);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(5);
      }
    });

    it('should handle link at the very start', () => {
      const text = '[First](https://a.com) then regular text that goes on';
      const chunks = splitIntoSmartChunks(text, 30);
      expect(chunks.some((c) => c.includes('[First](https://a.com)'))).toBe(true);
    });

    it('should handle inline code at the very start', () => {
      const text = '`code at start` then regular text that continues on';
      const chunks = splitIntoSmartChunks(text, 20);
      expect(chunks.some((c) => c.includes('`code at start`'))).toBe(true);
    });

    it('should guarantee forward progress with code blocks and small maxLength', () => {
      const text = '```js\nconsole.log("hello");\n```';
      // Small maxLength that forces splitting inside a code block
      const chunks = splitIntoSmartChunks(text, 15);
      expect(chunks.length).toBeGreaterThan(0);
      // Should not infinite loop and should produce non-empty chunks
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it('should not infinite loop when code block prefix grows remaining', () => {
      const text = '```typescript\nconst x = 1;\nconst y = 2;\n```';
      // maxLength just barely bigger than the reopened prefix "```typescript\n"
      const chunks = splitIntoSmartChunks(text, 18);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.length).toBeLessThan(20); // sanity: not runaway
    });

    it('should handle code block containing triple backticks in content', () => {
      const text = 'Example:\n```md\nHere is ```nested``` in code\n```';
      const chunks = splitIntoSmartChunks(text, 30);
      expect(chunks.length).toBeGreaterThan(0);
      // Should not crash or produce empty chunks
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it('should handle a single long word with no spaces', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const chunks = splitIntoSmartChunks(text, 10);
      expect(chunks.length).toBeGreaterThan(1);
      // All content must be preserved
      expect(chunks.join('')).toBe(text);
    });

    it('should handle link at position 0 longer than maxLength', () => {
      const text = '[very long link text](https://example.com/very/long/path) after';
      const chunks = splitIntoSmartChunks(text, 20);
      expect(chunks.length).toBeGreaterThan(0);
      // Should still make progress and not loop
      expect(chunks.join('').length).toBeGreaterThan(0);
    });

    it('should handle inline code at position 0 longer than maxLength', () => {
      const text = '`very long inline code span that exceeds max` after';
      const chunks = splitIntoSmartChunks(text, 20);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').length).toBeGreaterThan(0);
    });

    it('should handle bold text split across boundary', () => {
      const text = 'Some text **bold text here** and more text after that';
      const chunks = splitIntoSmartChunks(text, 25);
      expect(chunks.length).toBeGreaterThan(0);
      // At minimum no crash; bold isn't tracked so just verify progress
      expect(chunks.join(' ')).toContain('bold');
    });

    it('should handle text with only backticks', () => {
      const text = '``````````';
      const chunks = splitIntoSmartChunks(text, 5);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').length).toBeGreaterThan(0);
    });

    it('should handle adjacent markdown links', () => {
      const text = '[a](https://a.com)[b](https://b.com)[c](https://c.com)';
      const chunks = splitIntoSmartChunks(text, 25);
      expect(chunks.length).toBeGreaterThan(0);
      // Each link should be intact in some chunk
      expect(chunks.some((c) => c.includes('[a](https://a.com)'))).toBe(true);
      expect(chunks.some((c) => c.includes('[b](https://b.com)'))).toBe(true);
      expect(chunks.some((c) => c.includes('[c](https://c.com)'))).toBe(true);
    });

    it('should handle newlines inside code blocks correctly', () => {
      const text = '```\nline1\nline2\nline3\nline4\nline5\n```';
      const chunks = splitIntoSmartChunks(text, 20);
      expect(chunks.length).toBeGreaterThan(0);
      // Each chunk with code block markers should have even count
      for (const chunk of chunks) {
        const count = (chunk.match(/```/g) || []).length;
        expect(count % 2).toBe(0);
      }
    });
  });
});
