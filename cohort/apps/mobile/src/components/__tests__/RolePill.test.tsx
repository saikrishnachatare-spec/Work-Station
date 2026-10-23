import { describe, expect, it } from '@jest/globals';

import { render, screen } from '@testing-library/react-native';

import { RolePill } from '../RolePill';

describe('RolePill', () => {
  it('renders the role label', () => {
    render(<RolePill role="mentor" />);
    expect(screen.getByText('Mentor')).toBeOnTheScreen();
  });
});
