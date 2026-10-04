// Turns any error into a message that is safe to show a customer or staff member.
//
// Our Cloud Functions already write readable messages for the errors they
// expect ("Only 2 left of Gym Fuel Pack.", "We don't deliver to this pincode
// yet."), so those are shown as they are. Anything else gets a generic line.
export function friendlyError(err) {
  // Errors we raise ourselves in the browser (see CheckoutError) carry a safe message.
  if (err?.name === 'CheckoutError') return err.message;

  const code = typeof err?.code === 'string' ? err.code : '';
  // App Check refusing the request comes back as a bare "Unauthenticated" (our own sign-in messages are longer).
  if (code === 'functions/unauthenticated' && /^unauthenticated$/i.test(String(err.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim())) {
    return 'We could not confirm this request came from FreshBliss. Please reload the page and try again.';
  }
  if (code.startsWith('functions/') && !['functions/internal', 'functions/unknown'].includes(code) && err.message) {
    // The Firebase SDK adds the HTTP status to the end ("... yet. [400]"). Drop it.
    return err.message.replace(/\s*\[\d{3}\]$/, '');
  }
  console.error('Unexpected error:', err);
  return 'Something went wrong. Please try again.';
}
