// The sign-in form on /login: Google, Microsoft, or a mobile number with a one-time code.
//
//   onSuccess(user)   called once, after ANY method has signed the customer in. The page decides where to go next.
//
// The phone method has two steps that swap with a short fade: the number, then the 6-digit code that was texted to it.
// Every failure (a closed pop-up, a wrong code, too many tries...) is shown as a red-tinted message at the top of the
// form, in plain words (lib/authHelpers.js), and the buttons come back so the customer can try again. While one method
// is working all the buttons are off, so a double tap cannot open two pop-ups or ask for two codes.
//
// The bot check for phone sign-in is Firebase's invisible reCAPTCHA. It draws into #recaptcha-container, which stays on
// the page for the whole visit (it is outside the swapping step) and is emptied again by clear().

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowLeft, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Field, inputClass } from '@/components/Field';
import { confirmPhoneCode, createRecaptcha, sendPhoneCode, signInWithGoogle, signInWithMicrosoft } from '@/lib/auth';
import { OTP_LENGTH, authErrorMessage, cleanOtp, normalizeIndianMobile } from '@/lib/authHelpers';

const RESEND_SECONDS = 30;

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true" focusable="false">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

const socialButton =
  'flex min-h-12 w-full items-center justify-center gap-3 rounded-pill border border-line bg-surface-card px-5 text-nav-link text-brand-text transition-colors hover:border-green-accent hover:bg-surface-cream disabled:cursor-not-allowed disabled:opacity-60';

const primaryButton =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-brand px-5 text-nav-link text-on-brand transition-colors hover:bg-green-accent disabled:cursor-not-allowed disabled:opacity-60';

export default function LoginForm({ onSuccess }) {
  const [step, setStep] = useState('number'); // 'number' | 'code'
  const [busy, setBusy] = useState(null); // null | 'google' | 'microsoft' | 'send' | 'verify'
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState(''); // "+919876543210", shown on the code step
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const confirmationRef = useRef(null);
  const verifierRef = useRef(null);
  const phoneInputRef = useRef(null);
  const codeInputRef = useRef(null);
  // Set while this component is on screen; stops a late answer from touching a page the customer already left.
  const mounted = useRef(true);

  const disposeVerifier = useCallback(() => {
    try {
      verifierRef.current?.clear();
    } catch {
      // already cleared
    }
    verifierRef.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      disposeVerifier();
    };
  }, [disposeVerifier]);

  // Tick the "resend" countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Put the cursor in the box the customer needs next.
  useEffect(() => {
    (step === 'code' ? codeInputRef : phoneInputRef).current?.focus();
  }, [step]);

  // Run one sign-in attempt: lock the buttons, show a failure as a message, hand a success to the page.
  async function attempt(label, work) {
    setBusy(label);
    setError('');
    try {
      const user = await work();
      if (user) onSuccess(user);
      return true;
    } catch (err) {
      if (mounted.current) setError(authErrorMessage(err));
      return false;
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function requestCode() {
    const parsed = normalizeIndianMobile(phone);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    await attempt('send', async () => {
      disposeVerifier(); // a verifier works once
      verifierRef.current = createRecaptcha('recaptcha-container');
      try {
        confirmationRef.current = await sendPhoneCode(parsed.e164, verifierRef.current);
      } catch (err) {
        disposeVerifier();
        throw err;
      }
      setSentTo(parsed.e164);
      setCode('');
      setCooldown(RESEND_SECONDS);
      setStep('code');
      return null; // not signed in yet
    });
  }

  async function verifyCode() {
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    await attempt('verify', () => confirmPhoneCode(confirmationRef.current, code));
  }

  function changeNumber() {
    confirmationRef.current = null;
    disposeVerifier();
    setError('');
    setCode('');
    setStep('number');
  }

  const working = busy !== null;
  const spinner = <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />;

  return (
    <MotionConfig reducedMotion="user">
      <div aria-busy={working}>
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              key="error"
              role="alert"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5 flex items-start gap-2 overflow-hidden rounded-lg border border-danger bg-surface-danger px-4 py-3 text-small font-bold text-danger"
            >
              <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <div className="space-y-3">
          <button type="button" className={socialButton} disabled={working} onClick={() => attempt('google', signInWithGoogle)}>
            {busy === 'google' ? spinner : <GoogleMark />}
            Continue with Google
          </button>
          <button type="button" className={socialButton} disabled={working} onClick={() => attempt('microsoft', signInWithMicrosoft)}>
            {busy === 'microsoft' ? spinner : <MicrosoftMark />}
            Continue with Microsoft
          </button>
        </div>

        <div className="my-6 flex items-center gap-4" role="separator" aria-label="or">
          <span className="h-px flex-1 bg-line" />
          <span className="text-label text-ink-muted">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'number' ? (
            <motion.form
              key="number"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!working) requestCode();
              }}
            >
              <Field label="Mobile number" hint="Indian mobile number (+91). We will text you a 6-digit code.">
                {({ id, invalid, describedBy }) => (
                  <div className="flex gap-2">
                    <span className="flex min-h-12 shrink-0 items-center rounded-md border border-green-accent bg-surface-sunken px-3 text-body font-bold text-ink" aria-hidden="true">
                      +91
                    </span>
                    <input
                      ref={phoneInputRef}
                      id={id}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      value={phone}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (error) setError('');
                      }}
                      className={`${inputClass(false)} min-h-12 min-w-0 flex-1`}
                    />
                  </div>
                )}
              </Field>
              <button type="submit" className={`${primaryButton} mt-4`} disabled={working}>
                {busy === 'send' && spinner}
                {busy === 'send' ? 'Sending code' : 'Send OTP'}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="code"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!working) verifyCode();
              }}
            >
              <button
                type="button"
                onClick={changeNumber}
                disabled={working}
                className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-pill px-2 text-nav-link text-brand-text hover:bg-surface-cream disabled:opacity-60"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Change number
              </button>
              <Field label="6-digit code" hint={`Sent to ${sentTo.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3')}.`}>
                {({ id, invalid, describedBy }) => (
                  <input
                    ref={codeInputRef}
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH + 2}
                    placeholder="• • • • • •"
                    value={code}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => {
                      setCode(cleanOtp(e.target.value));
                      if (error) setError('');
                    }}
                    className={`${inputClass(false)} min-h-12 text-center text-heading-3 tracking-[0.5em]`}
                  />
                )}
              </Field>
              <button type="submit" className={`${primaryButton} mt-4`} disabled={working}>
                {busy === 'verify' ? spinner : <ShieldCheck size={18} aria-hidden="true" />}
                {busy === 'verify' ? 'Verifying' : 'Verify & Login'}
              </button>
              <p className="mt-3 text-center text-small text-ink-muted">
                Did not get it?{' '}
                {cooldown > 0 ? (
                  <span>Resend in {cooldown}s</span>
                ) : (
                  <button type="button" onClick={requestCode} disabled={working} className="font-bold text-brand-text underline disabled:opacity-60">
                    Send a new code
                  </button>
                )}
              </p>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Firebase's invisible bot check draws here. It stays mounted for the whole visit. */}
        <div id="recaptcha-container" />
      </div>
    </MotionConfig>
  );
}
