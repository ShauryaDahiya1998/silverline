import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router doesn't reset scroll position on client-side navigation the
// way a full page load does — without this, navigating to a new route (e.g.
// Home -> Settings via BottomNav) keeps whatever scroll offset the previous
// page was left at, so the new page can render mid-scroll instead of from
// the top. Mounted once inside AppRoutes, below BrowserRouter, so it sees
// every route change.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
