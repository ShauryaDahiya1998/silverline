import { Link, useLocation } from 'react-router-dom';
import PhoneFrame, { SCREEN_WIDTH, SCREEN_HEIGHT } from '../components/PhoneFrame';

// Renders whatever page lives at the same path in DM, inside an iPhone 15
// Pro Max frame — via a same-origin iframe, so it's the real page (real
// CSS, real fixed positioning, real auth via shared localStorage), just
// constrained to a real 430×932 mobile viewport instead of the full
// browser window. Route: /mi/<real path>, e.g. /mi/home -> iframes /home.
export default function MiViewer() {
  const location = useLocation();
  const realPath = location.pathname.replace(/^\/mi/, '') || '/home';

  return (
    <div className="min-h-screen py-10 px-4 flex flex-col items-center gap-4" style={{ background: '#e5e7eb' }}>
      <div className="w-full max-w-md flex items-center justify-between">
        <Link to="/index" className="text-sm text-gray-500 hover:text-[#579500] transition">← Back to Index</Link>
        <span className="text-xs font-mono text-gray-400">{realPath}</span>
      </div>

      <PhoneFrame>
        <iframe
          key={realPath}
          src={realPath}
          title={`Mobile iPhone preview — ${realPath}`}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          style={{ border: 0, display: 'block' }}
        />
      </PhoneFrame>

      <p className="text-xs text-gray-400">📱 iPhone 15 Pro Max — 430×932</p>
    </div>
  );
}
