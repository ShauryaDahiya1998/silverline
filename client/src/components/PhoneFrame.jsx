// Reusable iPhone 15 Pro Max device frame — wraps any children (in
// practice, an iframe showing a real page) so it's obvious at a glance
// whether a page actually fits a phone screen.
//
// Base size from physical measurements Zubin took holding a real iPhone 15
// Pro Max up to a full-screen Chrome window (7.4cm x 15.7cm), scaled up by
// 30% per his request. Just change these numbers if it's ever off again.
const BASE_WIDTH_CM = 7.4;
const BASE_HEIGHT_CM = 15.7;
const SIZE_MULTIPLIER = 1.3;
const FRAME_WIDTH_CM = BASE_WIDTH_CM * SIZE_MULTIPLIER;
const FRAME_HEIGHT_CM = BASE_HEIGHT_CM * SIZE_MULTIPLIER;
const BEZEL_CM = 0.3;

// Standard CSS conversion (96px = 1in = 2.54cm) — fixed, not measured.
const CM_TO_PX = 96 / 2.54;

// The iframe inside still needs to report a 430x932 *logical* viewport —
// that's iOS's own device-width for this phone, and it's what makes
// responsive breakpoints inside the page behave as they would on a real
// device. It's rendered at that full logical size, then visually scaled
// down to fit the physical screen area above.
const SCREEN_WIDTH = 430;
const SCREEN_HEIGHT = 932;

const innerWidthPx = (FRAME_WIDTH_CM - BEZEL_CM * 2) * CM_TO_PX;
const innerHeightPx = (FRAME_HEIGHT_CM - BEZEL_CM * 2) * CM_TO_PX;
const SCALE = Math.min(innerWidthPx / SCREEN_WIDTH, innerHeightPx / SCREEN_HEIGHT);

export default function PhoneFrame({ children }) {
  return (
    <div
      style={{
        width: `${FRAME_WIDTH_CM}cm`,
        height: `${FRAME_HEIGHT_CM}cm`,
        padding: `${BEZEL_CM}cm`,
        borderRadius: 28,
        background: 'linear-gradient(155deg, #3a3a3c, #1c1c1e)',
        boxShadow: '0 25px 70px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.08)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 22,
          overflow: 'hidden',
          background: '#fff',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
          {children}
        </div>

        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            width: 80, height: 24, background: '#000', borderRadius: 14,
            zIndex: 20, pointerEvents: 'none',
          }}
        />

        {/* Home indicator */}
        <div
          style={{
            position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
            width: 90, height: 3, background: 'rgba(0,0,0,0.35)', borderRadius: 2,
            zIndex: 20, pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export { SCREEN_WIDTH, SCREEN_HEIGHT };
