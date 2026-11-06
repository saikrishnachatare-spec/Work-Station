import { jest, beforeEach, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ClerkPrepUnmappedGate } from '../ClerkPrepUnmappedGate';
import { api } from '@/lib/api';
import { clearPendingBootstrap, peekPendingBootstrapFor } from '../pending-bootstrap';
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'sub-test' }) }));
jest.mock('@/lib/api', () => ({ api: jest.fn() }));
jest.mock('@/store/session', () => ({ signOut: jest.fn() }));
jest.mock('../pending-bootstrap', () => ({ clearPendingBootstrap: jest.fn(), peekPendingBootstrapFor: jest.fn() }));
const mockedApi = api as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
beforeEach(() => {
  jest.clearAllMocks();
  (peekPendingBootstrapFor as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue({ sub: 'sub-test', full_name: 'Synthetic User' });
});
it('409 confirms the current Clerk identity before clearing pending onboarding', async () => {
  mockedApi.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ clerkUserId: 'sub-test', cohortUserId: 'mapped-test' });
  render(<ClerkPrepUnmappedGate />);
  await waitFor(() => expect(clearPendingBootstrap).toHaveBeenCalledTimes(1));
  expect(mockedApi.mock.calls.map(c => c[0])).toEqual(['/api/me/bootstrap', '/api/me']);
});
it('409 with another Clerk identity is an error and preserves onboarding', async () => {
  mockedApi.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ clerkUserId: 'another-sub', cohortUserId: 'mapped-other' });
  render(<ClerkPrepUnmappedGate />);
  await screen.findByText(/binding could not be confirmed/);
  expect(clearPendingBootstrap).not.toHaveBeenCalled();
});
it('409 with no mapping is an error and preserves onboarding', async () => {
  mockedApi.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ clerkUserId: 'sub-test', cohortUserId: null });
  render(<ClerkPrepUnmappedGate />);
  await screen.findByText(/binding could not be confirmed/);
  expect(clearPendingBootstrap).not.toHaveBeenCalled();
});
it('403 keeps onboarding for an owner-allowlist retry', async () => {
  mockedApi.mockRejectedValueOnce({ status: 403 });
  render(<ClerkPrepUnmappedGate />);
  await screen.findByText(/Your account was created/);
  expect(clearPendingBootstrap).not.toHaveBeenCalled();
});
it('network failure preserves onboarding and offers retry', async () => {
  mockedApi.mockRejectedValueOnce(new Error('Network failed'));
  render(<ClerkPrepUnmappedGate />);
  await screen.findByText(/Network failed/);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(clearPendingBootstrap).not.toHaveBeenCalled();
});
