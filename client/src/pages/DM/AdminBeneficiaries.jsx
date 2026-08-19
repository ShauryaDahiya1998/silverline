import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import ProfilePopup from '../../components/ProfilePopup';

// Cached across re-renders/re-mounts, same pattern as MapView.jsx's
// addressGeocodeCache — a pincode only ever needs to be resolved to a city
// once, so repeat visits to this page (or several rows sharing a pincode)
// don't keep re-hitting the free Nominatim API.
const pincodeCityCache = new Map();

// Best-effort city lookup from a postal code alone — same Nominatim query
// HelperRegister.jsx's Preview step uses when City was left blank.
async function cityFromPincode(pincode) {
  if (!pincode) return '';
  if (pincodeCityCache.has(pincode)) return pincodeCityCache.get(pincode);
  let city = '';
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&postalcode=${encodeURIComponent(pincode)}&limit=1`);
    const data = await res.json();
    const a = data[0]?.address;
    city = a?.city || a?.town || a?.village || '';
  } catch (err) {
    // Leave city blank — the row just falls back to showing the pincode itself.
  }
  pincodeCityCache.set(pincode, city);
  return city;
}

// Admin's Beneficiaries list, reachable from the bottom nav.
export default function AdminBeneficiaries() {
  const navigate = useNavigate();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [derivedCities, setDerivedCities] = useState({});
  const [profilePopupId, setProfilePopupId] = useState(null);

  useEffect(() => {
    api.get('/beneficiaries').then(res => setBeneficiaries(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Backfills a city for any row that has a pincode but no city on file —
  // fires once per pincode (see the cache above), not once per row.
  useEffect(() => {
    const missing = beneficiaries.filter(b => !b.city && b.pincode && derivedCities[b.pincode] === undefined);
    if (!missing.length) return;
    const uniquePincodes = [...new Set(missing.map(b => b.pincode))];
    uniquePincodes.forEach(async (pincode) => {
      const city = await cityFromPincode(pincode);
      setDerivedCities(prev => ({ ...prev, [pincode]: city }));
    });
  }, [beneficiaries, derivedCities]);

  const locationFor = (b) => b.city || derivedCities[b.pincode] || b.pincode || '—';
  const nameFor = (b) => {
    if (b.nickname) return b.nickname;
    const parts = (b.name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '—';
  };

  const exportFile = (format) => window.open(`/api/beneficiaries/export/${format}`, '_blank');

  const openChat = (b) => navigate('/messages', { state: { withUserId: b.user_id, withName: b.nickname || b.name } });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Beneficiaries" />

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
          ) : (
            <div>
              <table className="w-full text-[11px] table-fixed">
                <thead>
                  <tr className="text-left text-gray-400 text-[10px] uppercase tracking-wide bg-gray-50">
                    <th className="px-1.5 py-2 font-medium w-[20%]">ID</th>
                    <th className="px-1.5 py-2 font-medium w-[24%]">Name</th>
                    <th className="px-1.5 py-2 font-medium w-[28%]">Location</th>
                    <th className="px-1 py-2 font-medium text-right w-[12%]">Helps</th>
                    <th className="px-1.5 py-2 font-medium text-right w-[16%]">Chat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {beneficiaries.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50 transition">
                      <td className="px-1.5 py-2 text-gray-500 truncate">{b.member_number || '—'}</td>
                      <td className="px-1.5 py-2 font-medium text-gray-800 truncate">
                        {/* Explicit text-[11px] — a <button> doesn't inherit the
                            table's font-size from its ancestors (browser
                            default button font), so without this the name
                            rendered visibly larger than the rest of the row. */}
                        <button type="button" onClick={() => setProfilePopupId(b.id)} className="hover:underline text-left truncate block w-full text-[11px] font-medium text-gray-800">
                          {nameFor(b)}
                        </button>
                      </td>
                      <td className="px-1.5 py-2 text-gray-500 truncate">{locationFor(b)}</td>
                      <td className="px-1 py-2 text-gray-500 text-right">{b.helps_count ?? 0}</td>
                      <td className="px-1.5 py-2 text-right">
                        <button type="button" onClick={() => openChat(b)}
                          className="text-[11px] font-semibold border border-gray-300 text-gray-600 px-1.5 py-1 rounded-md hover:bg-gray-50 transition">
                          Chat
                        </button>
                      </td>
                    </tr>
                  ))}
                  {beneficiaries.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No beneficiaries registered yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => exportFile('csv')}
            className="text-sm bg-yellow-400 text-green-900 px-4 py-1.5 rounded-lg font-semibold hover:bg-yellow-300 transition">
            Download CSV
          </button>
          <button type="button" onClick={() => exportFile('xlsx')}
            className="text-sm bg-yellow-400 text-green-900 px-4 py-1.5 rounded-lg font-semibold hover:bg-yellow-300 transition">
            Download XLSX
          </button>
        </div>
      </div>

      {profilePopupId && (
        <ProfilePopup id={profilePopupId} role="beneficiary" onClose={() => setProfilePopupId(null)} />
      )}
    </div>
  );
}
