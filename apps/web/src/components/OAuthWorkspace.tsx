import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEMO_CLIENT_ID, DEMO_CLIENT_SECRET, DEMO_REDIRECT_URI, authorizeWithPkce, createOAuthState, createPkcePair, exchangeAuthorizationCode, requestClientCredentialsToken, verifyMockJwt, type OAuthTokenResponse, type TokenVerification } from '../lib/oauth-simulator';
import { saveProgress } from '../lib/progress';
import type { LevelMeta } from '../lib/content-loader';
import styles from './OAuthWorkspace.module.css';

interface OAuthWorkspaceProps { level: LevelMeta; hintsUsed: number; onPassed: () => void }
interface OAuthCheckResult { label: string; passed: boolean; expected: string; actual: string }

function isAuthorizationCodeLevel(level: LevelMeta): boolean {
  return level.module === 'oauth-oidc' && level.order === 1;
}

export default function OAuthWorkspace({ level, hintsUsed, onPassed }: OAuthWorkspaceProps) {
  const { session } = useAuth();
  const authorizationCodeFlow = isAuthorizationCodeLevel(level);
  const [clientId, setClientId] = useState(DEMO_CLIENT_ID);
  const [clientSecret, setClientSecret] = useState(DEMO_CLIENT_SECRET);
  const [redirectUri, setRedirectUri] = useState(DEMO_REDIRECT_URI);
  const [scope, setScope] = useState(authorizationCodeFlow ? 'openid profile email api:read' : 'api:read');
  const [verifier, setVerifier] = useState('');
  const [challenge, setChallenge] = useState('');
  const [stateValue, setStateValue] = useState('');
  const [returnedState, setReturnedState] = useState('');
  const [nonce, setNonce] = useState('');
  const [code, setCode] = useState('');
  const [tokens, setTokens] = useState<OAuthTokenResponse | null>(null);
  const [tokenToInspect, setTokenToInspect] = useState('');
  const [verification, setVerification] = useState<TokenVerification | null>(null);
  const [checks, setChecks] = useState<OAuthCheckResult[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    setClientId(DEMO_CLIENT_ID);
    setClientSecret(DEMO_CLIENT_SECRET);
    setRedirectUri(DEMO_REDIRECT_URI);
    setScope(isAuthorizationCodeLevel(level) ? 'openid profile email api:read' : 'api:read');
    setVerifier(''); setChallenge(''); setStateValue(''); setReturnedState(''); setNonce(''); setCode('');
    setTokens(null); setTokenToInspect(''); setVerification(null); setChecks(null); setMessage('');
  }, [level.id, level.module, level.order]);

  const startAuthorization = useCallback(async () => {
    setBusy(true); setMessage('');
    try {
      const pair = await createPkcePair();
      const nextState = createOAuthState();
      const nextNonce = createOAuthState();
      const response = await authorizeWithPkce({ clientId, redirectUri, challenge: pair.challenge, nonce: nextNonce, scope, state: nextState });
      if (response.state !== nextState) throw new Error('OAuth state did not match. Reject this callback.');
      setVerifier(pair.verifier); setChallenge(pair.challenge); setStateValue(nextState); setReturnedState(response.state); setNonce(nextNonce); setCode(response.code);
      setTokens(null); setTokenToInspect(''); setVerification(null); setChecks(null);
      setMessage('Demo learner consented. The provider returned a one-time authorization code.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [clientId, redirectUri, scope]);

  const exchangeCode = useCallback(async () => {
    if (!code) { setMessage('Start the authorization step to receive a code first.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await exchangeAuthorizationCode({ code, verifier, clientId, redirectUri });
      setTokens(response);
      setTokenToInspect(response.id_token);
      setVerification(null);
      setMessage('Code exchanged. Verify the ID token signature and nonce before trusting its claims.');
      setChecks(null);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [clientId, code, nonce, redirectUri, verifier]);

  const requestServiceToken = useCallback(async () => {
    setBusy(true); setMessage('');
    try {
      const response = await requestClientCredentialsToken({ clientId, clientSecret, scope });
      setTokens(response);
      setTokenToInspect(response.access_token);
      setVerification(null);
      setMessage('Service token issued. Verify its signature and issuer before trusting its scope.');
      setChecks(null);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [clientId, clientSecret, scope]);

  const verifyToken = useCallback(async () => {
    if (!tokenToInspect.trim()) { setMessage('Paste a JWT or issue a demo token before verifying it.'); return; }
    const result = await verifyMockJwt(tokenToInspect.trim(), authorizationCodeFlow ? nonce : undefined, clientId);
    setVerification(result);
    setMessage(result.reason);
    setChecks(null);
  }, [authorizationCodeFlow, clientId, nonce, tokenToInspect]);

  const submit = useCallback(async () => {
    const verifiedClaims = verification?.claims;
    const results: OAuthCheckResult[] = level.checks.map((check) => {
      const action = String(check.action ?? 'token_verified');
      const expected = check.expected;
      let actual: unknown = false;
      if (action === 'pkce_flow_complete') actual = Boolean(code && verifier && challenge && returnedState === stateValue && verification?.valid && verifiedClaims?.nonce === nonce);
      else if (action === 'client_credentials_scope') actual = Boolean(verification?.valid && String(verifiedClaims?.scope ?? '').split(/\s+/).includes(String(check.scope)));
      else if (action === 'token_verified') actual = Boolean(verification?.valid);
      else if (action === 'claim_present') actual = Boolean(verifiedClaims?.[String(check.claim)]);
      else if (action === 'claim_equals') actual = verifiedClaims?.[String(check.claim)];
      else if (action === 'scope_exact') actual = verification?.valid ? String(verifiedClaims?.scope ?? '') : '';
      const passed = actual === expected;
      return { label: String(check.label ?? action.replaceAll('_', ' ')), passed, expected: String(expected ?? true), actual: String(actual) };
    });
    setChecks(results);
    const passed = results.length > 0 && results.every((result) => result.passed);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    let synced = true;
    if (session?.access_token) {
      try { await saveProgress(session.access_token, { level_id: level.id, status: passed ? 'passed' : 'in_progress', attempts: nextAttempts, hints_used: hintsUsed, time_spent_sec: 0 }); }
      catch { synced = false; }
    }
    if (passed) onPassed();
    setMessage(passed ? session?.access_token ? synced ? 'Level passed. Your progress is saved.' : 'Checks passed, but progress could not sync.' : 'Checks passed. Sign in to sync progress across devices.' : 'Complete the flow and verify the token, then submit again.');
  }, [attempts, challenge, code, hintsUsed, level.checks, level.id, nonce, onPassed, returnedState, session?.access_token, stateValue, tokens, verification, verifier]);

  return (
    <section className={styles.workspace} aria-label="OAuth and JWT practice workspace">
      <header className={styles.header}><div><strong>{authorizationCodeFlow ? 'OAuth 2.0 + OIDC · Authorization Code with PKCE' : 'OAuth 2.0 · Client Credentials'}</strong><p>Simulated identity provider at <code>login.fde.test</code>. No real account or network request.</p></div><button className="btn btn-primary" onClick={() => void submit()}>Submit</button></header>
      <div className={styles.config}>
        <label>Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
        {!authorizationCodeFlow && <label>Client secret<input type="text" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} /></label>}
        {authorizationCodeFlow && <label>Redirect URI<input value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} /></label>}
        <label>Scope<input value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      </div>
      {authorizationCodeFlow ? <>
        <section className={styles.step}><div><h3>1. Authorization request</h3><p>Generate a verifier, S256 challenge, state value, and OIDC nonce.</p></div><button className="btn btn-secondary" disabled={busy} onClick={() => void startAuthorization()}>Start authorization</button>{code && <dl><dt>State returned</dt><dd><code>{returnedState}</code> {returnedState === stateValue ? '✓ matches' : '× mismatch'}</dd><dt>PKCE challenge</dt><dd><code>{challenge}</code></dd><dt>Authorization code</dt><dd><code>{code}</code></dd><dt>Verifier held by client</dt><dd><code>{verifier}</code></dd><dt>OIDC nonce</dt><dd><code>{nonce}</code></dd></dl>}</section>
        <section className={styles.step}><div><h3>2. Token request</h3><p>Exchange the one-time code using the original verifier and exact redirect URI.</p></div><button className="btn btn-secondary" disabled={busy || !code} onClick={() => void exchangeCode()}>Exchange code</button></section>
      </> : <section className={styles.step}><div><h3>Request a service token</h3><p>The client authenticates directly. There is no learner redirect or user consent in this flow.</p></div><button className="btn btn-secondary" disabled={busy} onClick={() => void requestServiceToken()}>Request token</button></section>}
      <section className={styles.step}><div><h3>3. Decode and verify</h3><p>Decoding reads the claims; verification checks the HMAC signature, issuer, expiry, and OIDC nonce when present.</p></div><button className="btn btn-secondary" disabled={!tokens} onClick={() => void verifyToken()}>Verify token</button>{verification && <p className={verification.valid ? styles.valid : styles.invalid}>{verification.valid ? '✓' : '×'} {verification.reason}</p>}</section>
      <section className={styles.tokenTool}><label>JWT to decode and verify<textarea value={tokenToInspect} onChange={(event) => { setTokenToInspect(event.target.value); setVerification(null); setChecks(null); }} placeholder="Paste a JWT here or issue a demo token above" /></label><button className="btn btn-secondary" disabled={!tokenToInspect.trim()} onClick={() => void verifyToken()}>Decode and verify JWT</button>{verification && <pre>{JSON.stringify({ header: verification.header, claims: verification.claims }, null, 2)}</pre>}</section>
      {tokens && <details className={styles.token}><summary>Issued token details · expires in {tokens.expires_in}s · scope: {tokens.scope}</summary><h4>Access token</h4><textarea readOnly value={tokens.access_token} /><h4>ID token</h4><textarea readOnly value={tokens.id_token} /><p>Use either token in the JWT inspector above.</p></details>}
      <p className={styles.securityNote}>Training simulator only: the HMAC signing key and client secret are visible in this app. Production clients must validate signatures using trusted provider keys and keep secrets on a server.</p>
      {checks && <div className={`${styles.checks} ${checks.every((check) => check.passed) ? styles.valid : styles.invalid}`} aria-live="polite"><h3>{checks.every((check) => check.passed) ? 'All checks passed' : 'Some checks need work'}</h3>{checks.map((check, index) => <p key={`${check.label}-${index}`}>{check.passed ? '✓' : '×'} {check.label}{!check.passed && <><br /><code>Expected: {check.expected}</code><br /><code>Got: {check.actual}</code></>}</p>)}</div>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
