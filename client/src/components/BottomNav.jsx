import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

// Persistent bottom navigation for helper/beneficiary accounts — stays on
// screen across every page they can reach (Home, Profile, Settings,
// Tasks, Map) until they log out, matching the wireframe's home / person /
// gear / plus / list / map icon row.
const ICONS = {
  // Supplied green rounded-square home button image, same fixed-image
  // treatment as 'store'/'map' below rather than a currentColor outline svg.
  home: <img src="/home-icon.png" alt="" className="w-7 h-7 object-contain" />,
  // Glossy green circular back-arrow button, matching the reference the
  // person shared (a stock icon) but redrawn from scratch as original
  // artwork — that reference carried a visible stock-photo watermark, so it
  // isn't something we can embed directly. Radial gradient for the
  // glossy-sphere look, fixed colors rather than currentColor like the
  // other image-style icons here.
  back: (
    <svg viewBox="0 0 24 24" className="w-7 h-7">
      <defs>
        <radialGradient id="backGloss" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#9ccc65" />
          <stop offset="45%" stopColor="#579500" />
          <stop offset="100%" stopColor="#2d5400" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#backGloss)" stroke="#1f3d00" strokeWidth="0.4" />
      <path d="M14.5 6 L8 12 L14.5 18" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="12" x2="17.5" y2="12" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  ),
  person: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  ),
  // Glossy green 3D gear/cog, same treatment as 'back' above — the
  // reference the person shared was a Vecteezy stock icon tiled with visible
  // watermarks, so this is redrawn as original artwork: an 8-tooth gear
  // polygon (computed, not traced) filled with a radial gradient for the
  // glossy-sphere look, with a darker stroked ring around the centre hole
  // for a recessed-rim effect.
  gear: (
    <svg viewBox="0 0 24 24" className="w-7 h-7">
      <defs>
        <radialGradient id="gearGloss" cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#a5d66a" />
          <stop offset="50%" stopColor="#579500" />
          <stop offset="100%" stopColor="#2d5400" />
        </radialGradient>
      </defs>
      <path
        fillRule="evenodd"
        fill="url(#gearGloss)"
        stroke="#1f3d00"
        strokeWidth="0.3"
        strokeLinejoin="round"
        d="M 10.35 4.79 L 10.66 1.79 L 13.34 1.79 L 13.65 4.79 L 15.93 5.73 L 18.28 3.83 L 20.17 5.72 L 18.27 8.07 L 19.21 10.35 L 22.21 10.66 L 22.21 13.34 L 19.21 13.65 L 18.27 15.93 L 20.17 18.28 L 18.28 20.17 L 15.93 18.27 L 13.65 19.21 L 13.34 22.21 L 10.66 22.21 L 10.35 19.21 L 8.07 18.27 L 5.72 20.17 L 3.83 18.28 L 5.73 15.93 L 4.79 13.65 L 1.79 13.34 L 1.79 10.66 L 4.79 10.35 L 5.73 8.07 L 3.83 5.72 L 5.72 3.83 L 8.07 5.73 Z
           M 12 8.7 A 3.3 3.3 0 1 0 12 15.3 A 3.3 3.3 0 1 0 12 8.7 Z"
      />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#1f3d00" strokeWidth="0.8" />
    </svg>
  ),
  // Supplied glossy green 3D cross image, same fixed-image treatment as
  // 'home'/'store'/'help' above rather than a currentColor outline svg.
  plus: <img src="/plus-icon.png" alt="" className="w-7 h-7 object-contain" />,
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  // Earth — used for the bottom nav's "Help" item (links to Map View).
  // A supplied glossy 3D globe image rather than a drawn svg, same
  // treatment as the 'store' logo mark below (fixed image, not currentColor).
  map: <img src="/earth-icon.png" alt="" className="w-7 h-7 object-contain" />,
  // Supplied 3D headset-agent + question-mark image, same fixed-image
  // treatment as 'home'/'store' above rather than a currentColor outline svg.
  help: <img src="/support-icon.png" alt="" className="w-7 h-7 object-contain" />,
  // Supplied glossy green hand-with-leaf image, same fixed-image treatment
  // as 'home'/'store'/'help' above — hue-unified to the same green family.
  helpers: <img src="/helpers-nav-icon.png" alt="" className="w-7 h-7 object-contain" />,
  // Supplied handshake image (green + blue) — same treatment as 'helpers'
  // above, hue-unified on its green hand only (the blue hand is left as-is).
  beneficiaries: <img src="/beneficiaries-nav-icon.png" alt="" className="w-7 h-7 object-contain" />,
  // Remar store's own logo mark, same icon used on Section 3's Remar store
  // service button — not a generic outline svg like the rest of these.
  store: <img src="/remar-logo.png" alt="" className="w-7 h-7 object-contain" />,
};

export default function BottomNav() {
  const { user } = useAuth();
  const { t, colorFilter } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();

  // Internal dev-preview shell pages (/index, /mi/*) already show the real
  // page's own BottomNav inside the phone frame's iframe — the outer shell
  // shouldn't duplicate it below the frame.
  const isDevPreviewShell = location.pathname === '/index' || location.pathname.startsWith('/mi/');

  if (!user || isDevPreviewShell) return null;

  const isAdmin = user.role === 'admin';

  // Browser-history back, not a fixed route — has no `path` of its own, so
  // isActive() below never highlights it and the generic onClick handler
  // special-cases key === 'back' to call navigate(-1) instead of navigating
  // to a path.
  const backItem = { key: 'back', label: t('nav.back'), icon: 'back' };

  const items = isAdmin ? [
    { key: 'home', label: t('nav.home'), icon: 'home', path: '/dashboard' },
    backItem,
    { key: 'store', label: t('nav.store'), icon: 'store', path: '/store' },
    { key: 'map', label: t('nav.help'), icon: 'map', path: '/map' },
    { key: 'helpers', label: t('nav.helper'), icon: 'helpers', path: '/admin/helpers', extraPaths: ['/admin/help/new/helper'] },
    { key: 'beneficiaries', label: t('nav.beneficiary'), icon: 'beneficiaries', path: '/admin/beneficiaries', extraPaths: ['/admin/help/new/beneficiary'] },
    { key: 'gear', label: t('nav.settings'), icon: 'gear', path: '/settings', extraPaths: ['/change-password', '/messages', '/admin/store-location'] },
  ] : [
    { key: 'home', label: t('nav.home'), icon: 'home', path: '/home' },
    backItem,
    { key: 'store', label: t('nav.store'), icon: 'store', path: '/store' },
    { key: 'map', label: t('nav.help'), icon: 'map', path: '/map' },
    { key: 'plus', label: t('nav.newHelp'), icon: 'plus', path: '/help/new' },
    // Support (Bot, Contact us, Chats, Tickets) no longer gets its own
    // bottom-nav icon — it's already reachable from Settings > Support, and
    // duplicating it here was redundant. extraPaths for those routes moved
    // onto the gear item below so it still highlights correctly from there.
    // Edit profile and Profile itself both now live under Settings > My
    // account (see Settings.jsx) rather than getting their own bottom-nav
    // icon — extraPaths keeps the gear icon highlighted on every page that
    // section can lead to, including the profile view pages themselves.
    { key: 'gear', label: t('nav.settings'), icon: 'gear', path: '/settings', extraPaths: ['/helper/profile/edit', '/beneficiary/profile/edit', '/helper/profile/me', '/beneficiary/profile/me', '/change-password', '/messages', '/delete-account', '/support', '/support/chatbot', '/support/contact', '/support/chats', '/support/tickets'] },
  ];

  const isActive = (item) => {
    if (item.key === 'back') return false;
    const current = location.pathname;
    if (item.path && current === item.path.split('?')[0]) return true;
    if (item.extraPaths?.includes(current)) return true;
    return !!item.extraPaths?.some(p => current.startsWith(p));
  };

  const handleClick = (item) => {
    if (item.key === 'back') { navigate(-1); return; }
    navigate(item.path);
  };

  return (
    // colorFilter (Settings > App preferences > Color) is applied directly
    // here rather than inherited from an ancestor wrapper — App.jsx renders
    // BottomNav as a sibling of (not nested inside) its filtered <div>,
    // because a CSS `filter` on an ancestor creates a new containing block
    // for any `position: fixed` descendant, which silently turned this nav
    // from viewport-fixed into "fixed relative to that filtered div" (i.e.
    // it scrolled with the page) whenever a non-standard theme was active.
    // Applying the filter directly to this already-fixed <nav> itself has
    // no such effect — filter never changes an element's own positioning,
    // only its descendants' — so this keeps the tinted look without
    // breaking the fixed position.
    <nav style={{ filter: colorFilter }} className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-40">
      <div className={`max-w-lg mx-auto grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'}`}>
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleClick(item)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 mx-1 my-1.5 rounded-xl transition ${isActive(item) ? 'bg-green-50' : ''}`}
            style={{ color: isActive(item) ? '#3a6b00' : '#9ca3af' }}
          >
            {ICONS[item.icon]}
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
