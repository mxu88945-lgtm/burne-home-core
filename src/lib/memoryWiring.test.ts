import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('main chat memory retrieval wiring', () => {
  it('keeps private archive lookups out of public web search in every final request path', () => {
    const chatSource = readFileSync(new URL('../pages/Chat.tsx', import.meta.url), 'utf8');

    expect(chatSource).toMatch(/const privateMemoryLookup = isPrivateMemoryLookup\(currentQuery\)/);
    expect(chatSource).toMatch(/const usePublicWebSearch = webSearch && !privateMemoryLookup/);
    expect(chatSource.match(/webSearch: usePublicWebSearch/g)).toHaveLength(3);
  });
});
