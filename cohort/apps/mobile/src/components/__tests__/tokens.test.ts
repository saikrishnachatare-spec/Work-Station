import { describe, expect, it } from '@jest/globals';

import { colors } from '@/theme';

describe('theme tokens', () => {
  it('keeps the pastel watermelon brand colour', () => {
    expect(colors.brand).toBe('#E85D7A');
  });
});
