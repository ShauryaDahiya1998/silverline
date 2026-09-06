import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { Geolocation } from '@capacitor/geolocation';

// Shown on New Help for any physical item (see helpTaxonomy.js's
// getItemDelivery) — lets the creator say who this specific Help ID's
// address will come from: "Me" (the creator's own address, defaulted from
// their registered profile, editable with a Nominatim type-to-search
// dropdown — same pattern MapView.jsx's location search already uses —
// plus a "use my current location" icon button) or "Other party" (no
// address to collect yet — whoever ends up matched on the other side will
// provide it later, e.g. on the Schedule step).
// value/onChange shape: { street, house_number, city, pincode, latitude,
// longitude } — city/pincode always shown to a requesting consumer; the
// rest only once the creator accepts their request (see GET /help/:id).
// fetchRegistered: optional async () => {street,house_number,city,pincode,
// latitude,longitude}|null, overriding the default /helpers/me or
// /beneficiaries/me lookup — used by AdminStoreNewHelp.jsx, where the
// "registered address" that makes sense is the Remar Store's own configured
// location (admin accounts have no helpers/beneficiaries row of their own).
export default function ConfirmLocationField({ value, onChange, fetchRegistered }) {
  const { user } = useAuth();
  const [provider, setProvider] = useState('');
  const [registered, setRegistered] = useState(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const lastPickedRef = useRef('');
  // Only auto-fill the registered address into the text box the first time
  // "Me" is picked (or once `registered` finishes loading after that) — an
  // edit the creator then makes shouldn't keep getting stomped back to the
  // registered address on every re-render.
  const defaultedRef = useRef(false);

  // Best-effort — only used to prefill the "Me" option's address box.
  // fetchRegistered is read via a ref so an inline arrow function passed by
  // the caller each render (see AdminStoreNewHelp.jsx) doesn't retrigger
  // this fetch on every keystroke elsewhere on the form.
  const fetchRegisteredRef = useRef(fetchRegistered);
  fetchRegisteredRef.current = fetchRegistered;
  useEffect(() => {
    if (fetchRegisteredRef.current) {
      fetchRegisteredRef.current().then(p => p && setRegistered(p)).catch(() => {});
      return;
    }
    const endpoint = user?.role === 'beneficiary' ? '/beneficiaries/me' : '/helpers/me';
    api.get(endpoint).then(res => {
      const p = res.data;
      setRegistered({
        street: p.street || '', house_number: p.house_number || '',
        city: p.city || '', pincode: p.pincode || '',
        latitude: p.latitude || null, longitude: p.longitude || null,
      });
    }).catch(() => {});
  }, [user?.role]);

  useEffect(() => {
    if (provider === 'me' && registered && !defaultedRef.current) {
      const formatted = [registered.street, registered.house_number, registered.city, registered.pincode].filter(Boolean).join(', ');
      lastPickedRef.current = formatted;
      setAddressQuery(formatted);
      onChange(registered);
      defaultedRef.current = true;
    }
  }, [provider, registered]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseMe = () => {
    setProvider('me');
    setError('');
  };

  const chooseOther = () => {
    setProvider('other');
    setError('');
    setAddressQuery('');
    setSuggestions([]);
    onChange(null);
  };

  useEffect(() => {
    if (provider !== 'me' || !addressQuery.trim() || addressQuery === lastPickedRef.current) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(addressQuery)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [addressQuery, provider]);

  const pickSuggestion = (s) => {
    lastPickedRef.current = s.display_name;
    setAddressQuery(s.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
    const a = s.address || {};
    onChange({
      street: a.road || '', house_number: a.house_number || '',
      city: a.city || a.town || a.village || '', pincode: a.postcode || '',
      latitude: parseFloat(s.lat), longitude: parseFloat(s.lon),
    });
  };

  // @capacitor/geolocation instead of the raw navigator.geolocation API —
  // this is what actually registers the Location permission with iOS/
  // Android natively (and is what makes the Location row appear on the
  // app's native Settings page). It falls back to the browser's own
  // geolocation API transparently when this app is opened as a plain
  // website (not through Capacitor), so nothing changes there.
  const useCurrentLocation = async () => {
    setError('');
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const a = data?.address || {};
        const next = {
          street: a.road || '', house_number: a.house_number || '',
          city: a.city || a.town || a.village || '', pincode: a.postcode || '',
          latitude, longitude,
        };
        const formatted = [next.street, next.house_number, next.city, next.pincode].filter(Boolean).join(', ') || (data?.display_name ?? '');
        lastPickedRef.current = formatted;
        setAddressQuery(formatted);
        onChange(next);
      } catch {
        onChange({ street: '', house_number: '', city: '', pincode: '', latitude, longitude });
      }
    } catch {
      setError('Could not access your current location — check your device permissions.');
    } finally {
      setLocating(false);
    }
  };

  const btnClass = (active) => `flex-1 text-xs font-semibold rounded-lg py-2 border transition ${
    active ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
  }`;
  const btnStyle = (active) => active ? { backgroundColor: '#3a6b00' } : undefined;

  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <label className="text-xs font-semibold text-gray-500">Location</label>
        <span className="text-xs text-gray-400">To be provided by</span>
      </div>
      <div className="flex gap-2 mb-2">
        <button type="button" onClick={chooseMe} className={btnClass(provider === 'me')} style={btnStyle(provider === 'me')}>
          Me
        </button>
        <button type="button" onClick={chooseOther} className={btnClass(provider === 'other')} style={btnStyle(provider === 'other')}>
          Other party
        </button>
      </div>

      {provider === 'me' && (
        <div className="relative mb-2">
          <div className="flex items-center gap-2">
            <input type="text" value={addressQuery} onChange={e => setAddressQuery(e.target.value)}
              onFocus={() => suggestions.length && setShowSuggestions(true)}
              placeholder="Start typing an address…"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            <button type="button" onClick={useCurrentLocation} disabled={locating} title="Use my current location"
              className="flex-shrink-0 w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition disabled:opacity-50">
              <img src="/location-me-icon.png" alt="" className={`w-6 h-6 object-contain ${locating ? 'opacity-40' : ''}`} />
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-[calc(100%-44px)] bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button key={i} type="button" onMouseDown={() => pickSuggestion(s)}
                  className="block w-full text-left px-3 py-2 text-[11px] hover:bg-gray-100 truncate">
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {provider === 'other' && (
        <p className="text-xs text-gray-500 mb-2">The other party's address will be used once this Help ID is matched.</p>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
    </div>
  );
}
