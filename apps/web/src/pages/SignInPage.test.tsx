import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from './SignInPage';
import { AuthError } from '../contexts/AuthContext';
import type * as AuthContextModule from '../contexts/AuthContext';

const auth = {
  user: null as unknown,
  loading: false,
  googleEnabled: false,
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendConfirmation: vi.fn(),
  verifyEmailCode: vi.fn(),
  sendPasswordReset: vi.fn(),
};

vi.mock('../contexts/AuthContext', async (orig) => {
  const actual = await orig<typeof AuthContextModule>();
  return { ...actual, useAuth: () => auth };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignInPage />
    </MemoryRouter>,
  );

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.googleEnabled = false;
    auth.signInWithPassword.mockResolvedValue(undefined);
    auth.signUpWithPassword.mockResolvedValue('confirm_email');
    auth.resendConfirmation.mockResolvedValue(undefined);
    auth.verifyEmailCode.mockResolvedValue(undefined);
    auth.sendPasswordReset.mockResolvedValue(undefined);
  });

  it('signs in with email and password', async () => {
    renderPage();
    type('Email', 'a@b.co');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith('a@b.co', 'secret123'));
  });

  it('validates the email before calling Supabase', () => {
    renderPage();
    type('Email', 'not-an-email');
    type('Password', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert').textContent).toContain('valid email');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('registers and then asks for the emailed verification code', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    type('Name', 'Ada');
    type('Email', 'ada@b.co');
    type('Password', 'longenough');
    type('Confirm password', 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(auth.signUpWithPassword).toHaveBeenCalledWith('ada@b.co', 'longenough', 'Ada'));
    expect(await screen.findByText('Check your email')).toBeTruthy();

    type('Verification code', '12');
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the code');
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();

    type('Verification code', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await waitFor(() => expect(auth.verifyEmailCode).toHaveBeenCalledWith('ada@b.co', '123456'));

    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(auth.resendConfirmation).toHaveBeenCalledWith('ada@b.co'));
  });

  it('shows an error when the verification code is wrong', async () => {
    auth.verifyEmailCode.mockRejectedValue(new AuthError('That code is wrong or has expired.', 'invalid_code'));
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    type('Name', 'Ada');
    type('Email', 'ada@b.co');
    type('Password', 'longenough');
    type('Confirm password', 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your email');
    type('Verification code', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect((await screen.findByRole('alert')).textContent).toContain('wrong or has expired');
  });

  it('rejects short or mismatched passwords on sign-up', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    type('Name', 'Ada');
    type('Email', 'ada@b.co');
    type('Password', 'short');
    type('Confirm password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toContain('at least 8');
    type('Password', 'longenough');
    type('Confirm password', 'different1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toContain('do not match');
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('offers a verification code when sign-in says the email is unconfirmed', async () => {
    auth.signInWithPassword.mockRejectedValue(new AuthError('Please confirm your email first.', 'email_not_confirmed'));
    renderPage();
    type('Email', 'a@b.co');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Email me a verification code' }));
    await waitFor(() => expect(auth.resendConfirmation).toHaveBeenCalledWith('a@b.co'));
    expect(await screen.findByLabelText('Verification code')).toBeTruthy();
  });

  it('sends a password reset link', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    type('Email', 'a@b.co');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(auth.sendPasswordReset).toHaveBeenCalledWith('a@b.co'));
    expect(await screen.findByText(/we sent a link to set a new password/)).toBeTruthy();
  });

  it('hides the Google button until the provider is enabled', () => {
    const { unmount } = renderPage();
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull();
    unmount();
    auth.googleEnabled = true;
    renderPage();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeTruthy();
  });
});
