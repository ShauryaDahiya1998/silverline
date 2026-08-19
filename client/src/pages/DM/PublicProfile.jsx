import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';

// Same Help.xlsx taxonomy icon set used on both registration forms and the
// Map View, so a category reads the same way everywhere it's shown.
const CATEGORY_ICONS = {
  'Food': '🍎',
  'Toiletries': '🧴',
  'Clothes': '👕',
  'Social services': '🤝',
  'Professional services': '💼',
  'Money': '💰',
};

// Contact preference is stored as just an ordered list of keys — this maps
// each key back to the label/icon shown at registration time.
const CONTACT_META = {
  phone: { label: 'Phone', icon: '📞' },
  whatsapp: { label: 'WhatsApp', iconUrl: 'https://cdn.simpleicons.org/whatsapp' },
  sms: { label: 'SMS', badgeText: 'SMS' },
  teams: { label: 'Teams', iconUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Office_Teams_(2019%E2%80%932025).svg' },
  zoom: { label: 'Zoom', iconUrl: 'https://cdn.simpleicons.org/zoom' },
  meet: { label: 'Meet', iconUrl: '/icons/googlemeet.png' },
  email: { label: 'Email', icon: '✉️' },
  post: { label: 'Post', badgeText: 'POST' },
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Decade bucket, same as the registration Preview (e.g. 23 -> "20s", 41 -> "40s")
const getAgeDecade = (dob) => {
  if (!dob) return '';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 20) return 'Under 20';
  return `${Math.floor(age / 10) * 10}s`;
};

// Human-readable list of the valid availability/time-preference slots.
const getAvailabilitySummary = (availability) => {
  if (!availability) return [];
  const lines = [];
  DAYS.forEach(day => {
    (availability[day] || []).forEach(slot => {
      if (slot?.from && slot?.to) lines.push(`${day} ${slot.from}–${slot.to}`);
    });
  });
  return lines;
};

// role: 'helper' | 'beneficiary' — everything else about the page is shared,
// since it mirrors the same Preview content from both registration forms.
export default function PublicProfile({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isOwnProfile = id === 'me';
  const editPath = role === 'beneficiary' ? '/beneficiary/profile/edit' : '/helper/profile/edit';
  const endpoint = role === 'beneficiary' ? 'beneficiaries' : 'helpers';
  const needLabel = role === 'beneficiary' ? 'I need help with' : 'I can help with';
  const categories = role === 'beneficiary' ? (record?.support_needs || []) : (record?.skills || []);
  const availability = role === 'beneficiary' ? record?.time_preferences : record?.availability;

  useEffect(() => {
    setLoading(true);
    setError('');
    // id === 'me' — used by the bottom nav's Profile icon and Navbar's "My
    // Profile" link so a helper/beneficiary can view their own profile
    // through this same read-only page, without needing to know their own
    // helpers/beneficiaries row id up front.
    const path = id === 'me' ? `/${endpoint}/me` : `/${endpoint}/${id}`;
    api.get(path)
      .then(res => setRecord(res.data))
      .catch(() => setError('This profile could not be found.'))
      .finally(() => setLoading(false));
  }, [endpoint, id]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading profile…</div>;
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-gray-500 text-sm">{error || 'This profile could not be found.'}</p>
      </div>
    );
  }

  // Same admin/self/counterparty rule as components/ProfilePopup.jsx (the
  // Help Universe version of this same read-only content): a counterparty
  // only gets city + pincode, never street/house number — full address is
  // reserved for admin and for viewing one's own profile.
  const addressParts = [record.street, record.house_number].filter(Boolean).join(' ');
  const contactOrder = Array.isArray(record.contact_preference) ? record.contact_preference : [];
  const regions = record.preferred_regions;
  const personalityWords = record.personality_notes
    ? record.personality_notes.split(',').map(w => w.trim()).filter(Boolean)
    : [];
  const availabilityLines = getAvailabilitySummary(availability);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {/* Assigned member ID (H-0002 / B-0002 style) instead of name/nickname
              at the top — keeps the profile header consistent with how each
              person is identified everywhere else (Account ID, certificates). */}
          <div className="flex items-start justify-between gap-3 mb-8">
            <h2 className="text-lg font-bold remar-green">{record.member_number || record.nickname || record.name || 'Profile'}</h2>
            {isOwnProfile && (
              <button type="button" onClick={() => navigate(editPath)}
                className="shrink-0 text-xs font-semibold text-white px-4 py-2 rounded-lg hover:opacity-90 transition"
                style={{ backgroundColor: '#3a6b00' }}>
                Edit
              </button>
            )}
          </div>

          {/* Basic information */}
          <div className="border-b pb-8 mb-8">
            <h3 className="font-semibold remar-green mb-4 text-sm">Basic information</h3>
            <div className="flex justify-between gap-3 mb-3">
              <div className="text-sm text-gray-600 space-y-2">
                <p><span className="text-gray-400">Nickname:</span> {record.nickname || record.name || '—'}</p>
                <p><span className="text-gray-400">Gender:</span> {record.gender || '—'}</p>
                <p><span className="text-gray-400">Age group:</span> {getAgeDecade(record.date_of_birth) || '—'}</p>
              </div>
              {record.photo_url && (
                <img src={record.photo_url} alt="Photo" className="w-[90px] h-[90px] object-cover flex-shrink-0" />
              )}
            </div>
            {isAdmin ? (
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-1"><span className="text-gray-400">Street / House #:</span> {addressParts || '—'}</p>
                <p className="text-sm text-gray-600 mb-1"><span className="text-gray-400">City:</span> {record.city || '—'}</p>
                <p className="text-sm text-gray-600"><span className="text-gray-400">Pincode:</span> {record.pincode || '—'}</p>
              </div>
            ) : isOwnProfile ? (
              <p className="text-sm text-gray-600 whitespace-nowrap mb-6"><span className="text-gray-400">Address:</span> {record.address || '—'}</p>
            ) : (
              <p className="text-sm text-gray-600 whitespace-nowrap mb-6">
                <span className="text-gray-400">Location:</span> {[record.city, record.pincode].filter(Boolean).join(', ') || '—'}
              </p>
            )}
            {record.about_me && (
              <p className="text-sm text-gray-600 mb-4"><span className="text-gray-400">About Me:</span> {record.about_me}</p>
            )}
            <p className="text-sm text-gray-600"><span className="text-gray-400">Personality:</span> {personalityWords.join(', ') || '—'}</p>
          </div>

          {/* Preferences */}
          <div>
            <h3 className="font-semibold remar-green mb-4 text-sm">Preferences</h3>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <span className="text-gray-400">Contact:</span>{' '}
                {contactOrder.length ? contactOrder.map(key => CONTACT_META[key]?.label || key).join(' > ') : '—'}
              </p>
              <p>
                <span className="text-gray-400">Regions:</span>{' '}
                {regions?.mode === 'distance' && regions.center
                  ? `Within ${regions.distance_km} km of ${regions.center.label}`
                  : regions?.mode === 'areas' && regions.areas?.length
                  ? regions.areas.join(', ')
                  : '—'}
              </p>
              <p>
                <span className="text-gray-400">{needLabel}:</span>{' '}
                {categories.length ? categories.map(c => `${CATEGORY_ICONS[c] || ''} ${c}`).join(', ') : '—'}
              </p>
              <p><span className="text-gray-400">Availability:</span> {availabilityLines.join(', ') || '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
