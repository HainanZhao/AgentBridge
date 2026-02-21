import { describe, it, expect } from 'vitest';
import { stripThinkingProcess, normalizeOutgoingText } from './commandText.js';

describe('stripThinkingProcess', () => {
  it('should remove <thought> blocks', () => {
    const input = '<thought>I should do this.</thought>Final result';
    expect(stripThinkingProcess(input)).toBe('Final result');
  });

  it('should remove multiple <thought> blocks', () => {
    const input = '<thought>One</thought>Middle<thought>Two</thought>End';
    expect(stripThinkingProcess(input)).toBe('MiddleEnd');
  });

  it('should be case-insensitive for <thought> tags', () => {
    const input = '<THOUGHT>Upper</THOUGHT>Result';
    expect(stripThinkingProcess(input)).toBe('Result');
  });

  it('should remove Thinking... markers at the start of lines (flexible dots)', () => {
    const input = 'Thinking....\nActual result';
    expect(stripThinkingProcess(input)).toBe('Actual result');
  });

  it('should remove (Thinking: ...) blocks', () => {
    const input = '(Thinking: analyzing files) Result is here';
    expect(stripThinkingProcess(input)).toBe('Result is here');
  });

  it('should remove [Thinking: ...] blocks', () => {
    const input = '[Thinking: checking status] All good';
    expect(stripThinkingProcess(input)).toBe('All good');
  });

  it('should handle combined patterns', () => {
    const input = "Thinking...\n<thought>\nLet's see.\n</thought>\n(Thinking: almost there)\nThe final answer is 42.";
    expect(stripThinkingProcess(input)).toBe('The final answer is 42.');
  });
});

describe('normalizeOutgoingText', () => {
  it('should trim and strip thinking process', () => {
    const input = '  Thinking...\nHello!  ';
    expect(normalizeOutgoingText(input)).toBe('Hello!');
  });
});
