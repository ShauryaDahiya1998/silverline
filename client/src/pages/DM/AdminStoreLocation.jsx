import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import { showAppError } from '../../utils/errorBus';

// Best-effort geocode of the entered address into coordinates — same free
// OpenStreetMap lookup HelperRegister.jsx/BeneficiaryRegister.jsx use.
const geocodeAddress = async (address) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${address}, Switzerland`)}`);
    const data = await res.json();
    if (data[0]) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  } catch (err) {
    // Non-blocking — the address still saves without coordinates, it just
    // won't place a pin on Map View until this succeeds another time.
  }
  return { latitude: null, longitude: null };
};

// Admin > Settings > Store location. This is the single address every
// Remar Store item is placed at — on Map View / All Help Available, and as
// the Location shown on a Store item's own detail page/popup. There are two
// Remar Store system accounts (HRR0000 fronting "Help Available" offers,
// BRR0000 fronting "Help Required" requests — see db.js's bootstrap); saving
// here writes the same address to both (see PUT /helpers/store-location) so
// it stays one address regardless of which account created the item. Same
// fields as helper/beneficiary registration's address section.
export default function AdminStoreLocation() {
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/helpers/store-location').then(res => {
      const d = res.data;
      setStreet(d.street || '');
      setHouseNumber(d.house_number || '');
      setCity(d.city || '');
      setPincode(d.pincode || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pincode.trim()) {
      showAppError('Pincode is required');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const address = [street, houseNumber, city, pincode].filter(Boolean).join(', ');
      const { latitude, longitude } = await geocodeAddress(address);
      await api.put('/helpers/store-location', {
        street: street || null, house_number: houseNumber || null, city: city || null, pincode: pincode.trim(),
        latitude, longitude,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not save the Store location — please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <PageHeader title="Store location" className="mb-1" titleClassName="text-lg font-bold remar-green" />
          <p className="text-sm text-gray-500 mb-5">
            Where every Remar Store item is placed — on Map View / All Help Available, and as the Location shown on each item's own detail page.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Street name</label>
              <input value={street} onChange={e => setStreet(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">House #</label>
              <input value={houseNumber} onChange={e => setHouseNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">City</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Pincode <span className="text-red-500">*</span></label>
              <input required value={pincode} onChange={e => setPincode(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            </div>

            <button type="submit" disabled={saving}
              className="w-full text-white font-semibold text-sm rounded-lg py-3 mt-2 transition disabled:opacity-50"
              style={{ backgroundColor: '#3a6b00' }}>
              {saving ? 'Saving…' : 'Save location'}
            </button>
            {saved && <p className="text-xs text-center" style={{ color: '#3a6b00' }}>Saved.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
