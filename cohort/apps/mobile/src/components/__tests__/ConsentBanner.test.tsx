import { jest, beforeEach, afterEach, it, expect } from '@jest/globals';
import { Platform } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ConsentBanner } from '../ConsentBanner';
import { getConsent, setConsent } from '@/lib/analytics';
jest.mock('@/lib/analytics', () => ({ getConsent: jest.fn(() => null), setConsent: jest.fn() }));
const originalOS = Platform.OS;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true }); });
afterEach(() => { jest.useRealTimers(); Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true }); });
it('Accept records accepted and dismisses the banner', () => {
  render(<ConsentBanner />);
  act(() => jest.runAllTimers());
  fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
  expect(setConsent).toHaveBeenCalledWith('accepted');
  expect(screen.queryByText('A quick note on analytics')).toBeNull();
});
it('Decline records declined and dismisses the banner', () => {
  render(<ConsentBanner />);
  act(() => jest.runAllTimers());
  fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
  expect(setConsent).toHaveBeenCalledWith('declined');
  expect(screen.queryByText('A quick note on analytics')).toBeNull();
});
it('a saved choice suppresses the banner on re-entry', () => {
  jest.mocked(getConsent).mockReturnValueOnce('accepted');
  render(<ConsentBanner />);
  act(() => jest.runAllTimers());
  expect(screen.queryByText('A quick note on analytics')).toBeNull();
});
