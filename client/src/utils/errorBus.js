// Tiny pub/sub so any code — deep in a page's submit handler or a shared
// utility — can pop the app-wide error modal without needing a React hook,
// context provider, or prop-drilling. ErrorModal (mounted once, in App.jsx)
// is the sole subscriber; it renders whatever message was last shown until
// the user dismisses it.
let listener = null;

export function showAppError(message) {
  if (!message) return;
  if (listener) listener(String(message));
}

export function subscribeAppError(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
