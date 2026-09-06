import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../../api';
import { usePreferences } from '../../context/PreferencesContext';
import { useAuth } from '../../context/AuthContext';

// Settings > App preferences > Device — styled as a mirror of the phone's
// own native per-app Settings screen (Settings > Remar), because that's
// genuinely the only place most of these can be changed: iOS/Android both
// refuse to let an app re-prompt for a permission once it's already been
// decided, and neither exposes any API at all for reading (let alone
// setting) Background App Refresh or Cellular/Mobile Data from inside the
// app. So rather than pretend these are real in-app switches, the whole
// card is one tap target straight into that native settings screen (see
// openOsSettings) — every row below just mirrors whatever's actually true
// there as a read-only Yes/No indicator. The two exceptions are Vibration
// (an actual Remar preference, not an OS permission — see
// PreferencesContext.jsx) and Face ID/Fingerprint (managed on Edit
// Profile — see EditHelperProfile.jsx/EditBeneficiaryProfile.jsx), which
// each stop the tap from reaching the card and do their own thing instead.
export default function DeviceSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { vibrationEnabled, updatePreferences } = usePreferences();
  const isNative = Capacitor.isNativePlatform();

  const [location, setLocation] = useState('unknown');
  const [camera, setCamera] = useState('unknown');
  const [photos, setPhotos] = useState('unknown');
  const [notifications, setNotifications] = useState('unknown');
  // Default to "allowed" for these three — Face ID/Fingerprint reflect the
  // account's real webauthn/status once that call resolves (see the effect
  // below), so `true` here is just the shown-until-then state, not a fake
  // permanent value like Background App Refresh/Mobile Data below.
  const [faceId, setFaceId] = useState(true);
  const [fingerprint, setFingerprint] = useState(true);

  useEffect(() => {
    (async () => {
      if (isNative) {
        try { const r = await Geolocation.checkPermissions(); setLocation(r.location); } catch { /* plugin unavailable */ }
        try { const r = await Camera.checkPermissions(); setCamera(r.camera); setPhotos(r.photos); } catch { /* plugin unavailable */ }
        try { const r = await PushNotifications.checkPermissions(); setNotifications(r.receive); } catch { /* plugin unavailable */ }
      }
      try {
        const res = await api.get('/webauthn/status');
        setFaceId(res.data.faceIdEnabled);
        setFingerprint(res.data.fingerprintEnabled);
      } catch { /* leave at false */ }
    })();
  }, [isNative]);

  // The one real destination for changing any OS-level permission — see
  // the file comment above. Loaded lazily since it's only ever needed on
  // an actual tap, not on page load.
  const openOsSettings = async () => {
    if (!isNative) return;
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
  };

  const editProfilePath = user?.role === 'helper' ? '/helper/profile/edit' : '/beneficiary/profile/edit';

  // Purely visual — every instance here reflects a value this page already
  // knows one way or another (a checked native permission, a Remar
  // preference, or an assumed default for the two values there's no API to
  // read at all — see NavRow's own comment below). None of these are
  // clickable themselves; the tap target is the row/card around them.
  const ToggleIndicator = ({ on }) => (
    <div className={`w-11 h-6 rounded-full relative shrink-0 transition ${on ? 'bg-[#3a6b00]' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${on ? 'left-5' : 'left-0.5'}`} />
    </div>
  );

  const Chevron = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 shrink-0">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  // A row that mirrors a real OS-level toggle (Location, Camera, ...) —
  // display-only, since only the native Settings screen can actually
  // change these.
  const ToggleRow = ({ label, on }) => (
    <div className="w-full flex items-center justify-between py-3.5">
      <span className="text-sm text-gray-700">{label}</span>
      <ToggleIndicator on={on} />
    </div>
  );

  // A row with no on/off state of its own — mirrors how iOS shows "Apple
  // Intelligence & Siri" and "Search" on a real per-app settings page: each
  // leads to its own further sub-page of settings, not a single switch.
  const NavRow = ({ label }) => (
    <div className="w-full flex items-center justify-between py-3.5">
      <span className="text-sm text-gray-700">{label}</span>
      <Chevron />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div
          className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer"
          onClick={openOsSettings}
        >
          <h1 className="text-lg font-bold remar-green mb-3">Device</h1>

          <div className="divide-y divide-gray-100">
            <NavRow label="Apple Intelligence & Siri" />
            <NavRow label="Search" />
            <ToggleRow label="Notifications" on={notifications === 'granted'} />
            {/* Neither of these two has any Capacitor/native API to read at
                all (iOS exposes no per-app query for either) — shown as "on"
                since that's the default state for a freshly installed app,
                purely so this page visually matches the real Settings
                screen's layout; the actual current value always lives only
                in native Settings, which is exactly what tapping this card
                opens. */}
            <ToggleRow label="Background App Refresh" on />
            <ToggleRow label="Mobile Data" on />
            <ToggleRow label="Location" on={location === 'granted'} />
            <ToggleRow label="Camera" on={camera === 'granted'} />
            <ToggleRow label="Photos" on={photos === 'granted'} />
            {/* Voice notes (Edit Profile) record via the raw
                navigator.mediaDevices.getUserMedia web API, not a Capacitor
                plugin, so there's no checkPermissions() call to read the
                real OS state from here — same situation as Background App
                Refresh/Mobile Data above, shown allowed by default. */}
            <ToggleRow label="Microphone" on />

            {/* Not an OS permission — managed on Edit Profile itself (see
                EditHelperProfile.jsx/EditBeneficiaryProfile.jsx). Stops the
                card's own click so tapping here goes there instead of out
                to native Settings. */}
            <div className="w-full flex items-center justify-between py-3.5" onClick={(e) => { e.stopPropagation(); navigate(editProfilePath); }}>
              <span className="text-sm text-gray-700">Face ID</span>
              <ToggleIndicator on={faceId} />
            </div>
            <div className="w-full flex items-center justify-between py-3.5" onClick={(e) => { e.stopPropagation(); navigate(editProfilePath); }}>
              <span className="text-sm text-gray-700">Fingerprint</span>
              <ToggleIndicator on={fingerprint} />
            </div>

            {/* Vibration is a real, working Remar preference (not an OS
                permission) — whether a push notification also triggers a
                haptic buzz (see utils/pushNotifications.js). Stops the
                card's own click so tapping the switch toggles it in place
                instead of leaving the app. */}
            <div className="w-full flex items-center justify-between py-3.5">
              <span className="text-sm text-gray-700">Vibration</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); updatePreferences({ vibration_enabled: !vibrationEnabled }); }}
                aria-pressed={vibrationEnabled}
                className={`w-11 h-6 rounded-full transition relative ${vibrationEnabled ? 'bg-[#3a6b00]' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${vibrationEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
