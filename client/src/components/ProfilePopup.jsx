import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

// Shared profile popup — same read-only content as pages/DM/PublicProfile.jsx,
// just shown as a modal instead of navigating to a new page. Originally built
// for Map View ("for ease of navigation" while panning/zooming the map);
// also used by HelpStatus.jsx's Requests list so the item's owner can check
// someone out without losing their place among multiple requests. Everywhere
// else (Assignments.jsx, Admin pages, HelpStatus' confirmed-counterpart
// "View profile" button) still navigates to the full PublicProfile.jsx page.

const CATEGORY_ICONS = {
  'Food': '🍎',
  'Toiletries': '🧴',
  'Clothes': '👕',
  'Social services': '🤝',
  'Professional services': '💼',
  'Money': '💰',
};

const CONTACT_META = {
  phone: { label: 'Phone' },
  whatsapp: { label: 'WhatsApp' },
  sms: { label: 'SMS' },
  teams: { label: 'Teams' },
  zoom: { label: 'Zoom' },
  meet: { label: 'Meet' },
  email: { label: 'Email' },
  post: { label: 'Post' },
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

// { id, role } — role: 'helper' | 'beneficiary'. onClose closes the modal.
export default function ProfilePopup({ id, role, onClose }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const endpoint = role === 'beneficiary' ? 'beneficiaries' : 'helpers';
  const needLabel = role === 'beneficiary' ? 'I need help with' : 'I can help with';

  useEffect(() => {
    setLoading(true);
    setError('');
    setRecord(null);
    api.get(`/${endpoint}/${id}`)
      .then(res => setRecord(res.data))
      .catch(() => setError('This profile could not be found.'))
      .finally(() => setLoading(false));
  }, [endpoint, id]);

  if (!id) return null;

  const categories = role === 'beneficiary' ? (record?.support_needs || []) : (record?.skills || []);
  const availability = role === 'beneficiary' ? record?.time_preferences : record?.availability;
  const contactOrder = Array.isArray(record?.contact_preference) ? record.contact_preference : [];
  const regions = record?.preferred_regions;
  const personalityWords = record?.personality_notes
    ? record.personality_notes.split(',').map(w => w.trim()).filter(Boolean)
    : [];
  const availabilityLines = getAvailabilitySummary(availability);

  // Admin-only extras — the DB only stores one combined `name` column (no
  // separate first/middle/last), so first name and surname are derived here
  // the same way AdminHelpers.jsx's/AdminBeneficiaries.jsx's own nameFor()
  // does, from whichever full name was typed in at registration.
  const nameParts = (record?.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '—';
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '—';
  const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
  const exactDob = record?.date_of_birth
    ? new Date(record.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const addressParts = [record?.street, record?.house_number].filter(Boolean).join(' ');

  // A counterparty (any other helper/beneficiary) only gets city + pincode,
  // never the street/house number — that's reserved for the admin view above
  // and for viewing one's own profile. Compared on user_id (not the helpers/
  // beneficiaries row id in `id`), since that's what identifies the account.
  const isOwnProfile = !!user && !!record?.user_id && record.user_id === user.id;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2200] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        {loading && <p className="text-sm text-gray-400 text-center py-10">Loading profile…</p>}

        {!loading && (error || !record) && (
          <p className="text-sm text-gray-500 text-center py-10">{error || 'This profile could not be found.'}</p>
        )}

        {!loading && record && (
          <>
            <h2 className="text-lg font-bold remar-green mb-6">{record.member_number || record.nickname || record.name || 'Profile'}</h2>

            <div className="mb-6">
              <h3 className="font-semibold remar-green mb-3 text-sm">Basic information</h3>
              <div className="flex justify-between gap-3 mb-3">
                <div className="text-sm text-gray-600 space-y-1.5">
                  <p><span className="text-gray-400">Nickname:</span> {record.nickname || record.name || '—'}</p>
                  {isAdmin && (
                    <>
                      <p><span className="text-gray-400">First name:</span> {firstName}</p>
                      {middleName && <p><span className="text-gray-400">Middle name:</span> {middleName}</p>}
                      <p><span className="text-gray-400">Surname:</span> {surname}</p>
                    </>
                  )}
                  <p><span className="text-gray-400">Gender:</span> {record.gender || '—'}</p>
                  {isAdmin ? (
                    <p><span className="text-gray-400">Date of birth:</span> {exactDob}</p>
                  ) : (
                    <p><span className="text-gray-400">Age group:</span> {getAgeDecade(record.date_of_birth) || '—'}</p>
                  )}
                  {isAdmin && (
                    <>
                      <p><span className="text-gray-400">Phone:</span> {record.phone || '—'}</p>
                      <p><span className="text-gray-400">Email:</span> {record.email || '—'}</p>
                    </>
                  )}
                </div>
                {record.photo_url && (
                  <img src={record.photo_url} alt="Photo" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                )}
              </div>
              {isAdmin ? (
                <>
                  <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">Street / House #:</span> {addressParts || '—'}</p>
                  <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">City:</span> {record.city || '—'}</p>
                  <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">Pincode:</span> {record.pincode || '—'}</p>
                </>
              ) : isOwnProfile ? (
                <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">Address:</span> {record.address || '—'}</p>
              ) : (
                <p className="text-sm text-gray-600 mb-2">
                  <span className="text-gray-400">Location:</span>{' '}
                  {[record.city, record.pincode].filter(Boolean).join(', ') || '—'}
                </p>
              )}
              {record.about_me && (
                <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">About Me:</span> {record.about_me}</p>
              )}
              <p className="text-sm text-gray-600"><span className="text-gray-400">Personality:</span> {personalityWords.join(', ') || '—'}</p>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold remar-green mb-3 text-sm">Preferences</h3>
              <div className="text-sm text-gray-600 space-y-1.5">
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
                {isAdmin && role !== 'beneficiary' && categories.includes('Professional services') && (
                  <p>
                    <span className="text-gray-400">License / Experience:</span>{' '}
                    {[record.professional_license, record.professional_experience].filter(Boolean).join(' — ') || '—'}
                  </p>
                )}
                <p><span className="text-gray-400">Availability:</span> {availabilityLines.join(', ') || '—'}</p>
              </div>
            </div>
          </>
        )}

        <button type="button" onClick={onClose}
          className="w-full text-white font-semibold text-sm rounded-lg py-2.5 transition hover:opacity-90"
          style={{ backgroundColor: '#3a6b00' }}>
          OK
        </button>
      </div>
    </div>
  );
}
