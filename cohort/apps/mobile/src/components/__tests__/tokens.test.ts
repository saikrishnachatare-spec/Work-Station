import { describe, expect, it } from '@jest/globals';

import { colors } from '@/theme';

describe('theme tokens', () => {
  it('keeps the light blue brand colour', () => {
    expect(colors.brand).toBe('#4D9DE8');
  });
});
