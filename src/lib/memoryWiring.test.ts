import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('main chat memory retrieval wiring', () => {
  it('keeps private archive lookups out of public web search in every final request path', () => {
    const chatSource = readFileSync(new URL('../pages/Chat.tsx', import.meta.url), 'utf8');

    expect(chatSource).toMatch(/const privateMemoryLookup = isPrivateMemoryLookup\(currentQuery\)/);
    expect(chatSource).toMatch(/const usePublicWebSearch = webSearch && !privateMemoryLookup/);
    expect(chatSource.match(/webSearch: usePublicWebSearch/g)).toHaveLength(3);
  });

  it('wires people recall, person tags and one-round [搜索:] into every request path', () => {
    const chatSource = readFileSync(new URL('../pages/Chat.tsx', import.meta.url), 'utf8');

    expect(chatSource).toContain('system += PERSON_TAG_PROMPT');
    expect(chatSource).toContain('system += SEARCH_TAG_PROMPT');
    expect(chatSource).toContain('if (peopleText) system += peopleText');
    expect(chatSource.match(/await takeSearch\(/g)).toHaveLength(3);
    expect(chatSource).toContain('useMemoryStore.getState().markUsed(usedMemoryIds)');
  });
});
