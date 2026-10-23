import { describe, expect, it } from '@jest/globals';

import { colors } from '@/theme';

describe('theme tokens', () => {
  it('keeps the prototype terracotta brand colour', () => {
    expect(colors.brand).toBe('#c0562f');
  });
});
