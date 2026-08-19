import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Internal tool only — not linked from Navbar/BottomNav, never seen by real
// helpers/beneficiaries (confirmed with Zubin this is a dev convention, not
// a live feature). This is his entry point for reviewing pages: pick
// Desktop Mac for the page exactly as-is, or Mobile iPhone to see the same
// page rendered inside an iPhone 15 Pro Max frame (see MiViewer.jsx).
const PAGE_GROUPS = [
  {
    label: 'Auth & Registration',
    pages: [
      { label: 'Login', path: '/login' },
      { label: 'Helper Register', path: '/register/helper' },
      { label: 'Beneficiary Register', path: '/register/beneficiary' },
      { label: 'Forgot Password', path: '/forgot-password' },
      { label: 'Reset Password', path: '/reset-password' },
      { label: 'Verify Email', path: '/verify-email' },
    ],
  },
  {
    label: 'Helper / Beneficiary',
    pages: [
      { label: 'Home', path: '/home' },
      { label: 'New Help', path: '/help/new' },
      { label: 'Help Status (demo)', path: '/help/demo' },
      { label: 'Help History (demo)', path: '/help/history/demo-history' },
      { label: 'Map View', path: '/map' },
      { label: 'Settings', path: '/settings' },
      { label: 'My Profile', path: '/helper/profile/me' },
      { label: 'Donate', path: '/donate' },
      { label: 'My Contribution', path: '/my-contribution' },
      { label: 'My Consumption', path: '/my-consumption' },
      { label: 'Remar Store', path: '/store' },
      { label: 'Tasks', path: '/tasks' },
    ],
  },
  {
    label: 'Admin',
    pages: [
      { label: 'Admin Dashboard', path: '/dashboard' },
      { label: 'Assignments', path: '/assignments' },
    ],
  },
];

export default function Index() {
  const [mode, setMode] = useState('mi');
  const navigate = useNavigate();

  // Clicking a mode button both switches which links are shown below AND
  // jumps straight to Home in that mode — so the click always takes you
  // somewhere, instead of just silently flipping a filter (especially
  // confusing since "Mobile iPhone" is already selected by default).
  const chooseMode = (m) => {
    setMode(m);
    navigate(m === 'mi' ? '/mi/home' : '/home');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-lg font-bold remar-green mb-1">REMAR Schweiz — Preview Index</h1>
        <p className="text-sm text-gray-500 mb-6">
          Internal tool — pick Desktop Mac for the page as-is, or Mobile iPhone to see the same page inside an iPhone 15 Pro Max frame. Picking a mode opens Home in that mode; use the list below to jump to any other page.
        </p>

        <div className="flex gap-2 mb-6">
          <button type="button" onClick={() => chooseMode('mi')}
            className={`flex-1 text-sm font-semibold rounded-lg py-3 border transition ${mode === 'mi' ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            style={mode === 'mi' ? { backgroundColor: '#3a6b00' } : undefined}>
            📱 Mobile iPhone
          </button>
          <button type="button" onClick={() => chooseMode('dm')}
            className={`flex-1 text-sm font-semibold rounded-lg py-3 border transition ${mode === 'dm' ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            style={mode === 'dm' ? { backgroundColor: '#3a6b00' } : undefined}>
            🖥️ Desktop Mac
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          {mode === 'mi'
            ? 'Every page below opens inside an iPhone 15 Pro Max frame (same content as Desktop Mac — this is a viewing mode, not yet a separate redesign).'
            : 'Every page below opens exactly as it runs today, full browser width.'}
        </p>

        <div className="space-y-5">
          {PAGE_GROUPS.map(group => (
            <div key={group.label} className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="font-semibold remar-green text-sm mb-3">{group.label}</h2>
              <div className="grid grid-cols-2 gap-2">
                {group.pages.map(p => (
                  <Link key={p.path} to={mode === 'mi' ? `/mi${p.path}` : p.path}
                    className="text-sm text-gray-700 hover:text-[#3a6b00] hover:underline px-2 py-1.5 rounded-lg hover:bg-gray-50 transition">
                    {p.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
