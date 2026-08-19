import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { HELP_TAXONOMY, HELP_CATEGORIES_ORDER, HELP_UNITS, getItemDelivery } from '../../data/helpTaxonomy';
import { showAppError } from '../../utils/errorBus';
import ConfirmLocationField from '../../components/ConfirmLocationField';
import ConfirmModal from '../../components/ConfirmModal';
import { getStatusLabel } from '../../utils/helpStatus';

const AGE_UNITS = ['Days', 'Weeks', 'Months', 'Years'];
const CONDITION_CATEGORIES = ['Food', 'Clothes', 'Toiletries'];
const MAX_PHOTOS = 3;
// Same auto-redirect countdown as the regular New Help confirmation screen
// (see NewHelp.jsx) — ticks down then navigates back to the Store on its own.
const REDIRECT_SECONDS = 5;

// Direction decides which system account fronts the item (see db.js) and
// which logistics wording applies, same pair of values/labels NewHelp.jsx
// uses for a real helper vs. beneficiary — 'offer' fronts as HRR0000 (a
// helpers-table row), 'request' fronts as BRR0000 (a beneficiaries-table
// row), so the wording mirrors whichever side Remar Store is standing in for.
const LOGISTICS_OPTIONS = {
  offer: [
    { value: 'pickup', label: 'Pick up from Store location' },
    { value: 'dropoff', label: 'Store can drop off' },
  ],
  request: [
    { value: 'pickup', label: 'Store can pick up' },
    { value: 'dropoff', label: 'Drop off at Store location' },
  ],
};
const LOGISTICS_LABEL = { offer: 'Delivery preference', request: 'Collection preference' };

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// "10 Aug" style short date, matching NewHelp.jsx's own duplicate-warning popup.
const formatShortDate = (d) => {
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Admin creates a Remar Store item directly (not on behalf of a specific
// helper/beneficiary — see client/src/pages/DM/AdminNewHelp.jsx for that
// flow). Same category/sub-category/item fields as any other New Help
// (client/src/pages/DM/NewHelp.jsx), plus a direction choice: "Available"
// (Remar Store offering something, addressed to beneficiaries — fronted by
// the HRR0000 system account) or "Required" (Remar Store asking for
// something, addressed to helpers — fronted by the BRR0000 system account,
// see db.js's bootstrap). Reached from the Store page's New Help button
// (admin only).
export default function AdminStoreNewHelp() {
  const navigate = useNavigate();

  const [direction, setDirection] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [item, setItem] = useState('');
  const [condition, setCondition] = useState('');
  const [ageValue, setAgeValue] = useState('');
  const [ageUnit, setAgeUnit] = useState(AGE_UNITS[0]);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(HELP_UNITS[0]);
  const [logisticsPreference, setLogisticsPreference] = useState([]);
  const toggleLogistics = (value) => setLogisticsPreference(prev =>
    prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  // Item 5: same online/physical + Confirm location handling as the regular
  // New Help form (see NewHelp.jsx) — "registered address" here means the
  // Remar Store's own configured location (GET /helpers/store-location),
  // since admin accounts have no helpers/beneficiaries row of their own.
  const [confirmLocation, setConfirmLocation] = useState(null);
  const fetchStoreLocation = async () => {
    const res = await api.get('/helpers/store-location');
    const p = res.data;
    return {
      street: p.street || '', house_number: p.house_number || '',
      city: p.city || '', pincode: p.pincode || '',
      latitude: p.latitude || null, longitude: p.longitude || null,
    };
  };
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdHelpId, setCreatedHelpId] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  // Possible-duplicate warning — same feature as NewHelp.jsx's own (see that
  // file's comment), scoped to whichever Store system account (HRR0000/
  // BRR0000) this item would be created under — see GET
  // /help/check-duplicate's ?store=&direction= admin override.
  const [duplicates, setDuplicates] = useState([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Countdown shown on the confirmation screen — ticks down from
  // REDIRECT_SECONDS to 0, then navigates back to the Store on its own.
  useEffect(() => {
    if (!created) return;
    if (secondsLeft <= 0) {
      navigate('/store');
      return;
    }
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [created, secondsLeft, navigate]);

  const subCategories = category ? Object.keys(HELP_TAXONOMY[category]) : [];
  const items = category && subCategory ? HELP_TAXONOMY[category][subCategory] : [];
  const showCondition = CONDITION_CATEGORIES.includes(category);
  const isOnline = item ? getItemDelivery(category, subCategory, item) === 'Online' : false;

  const handleCategoryChange = (val) => {
    setCategory(val);
    setSubCategory('');
    setItem('');
    setCondition('');
    setAgeValue('');
    setPhotos([]);
    setPhotoError('');
    setLogisticsPreference([]);
  };

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const toAdd = files.slice(0, room);
    if (files.length > room) setPhotoError(`Only added ${room} photo${room === 1 ? '' : 's'} — ${MAX_PHOTOS} max.`);
    else setPhotoError('');
    try {
      const dataUrls = await Promise.all(toAdd.map(readFileAsDataURL));
      setPhotos(prev => [...prev, ...dataUrls]);
    } catch {
      setPhotoError('Could not read one of those photos — please try again.');
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  const handleSubCategoryChange = (val) => {
    setSubCategory(val);
    setItem('');
  };

  // Returns the specific field that's missing/invalid rather than one
  // catch-all message — same rationale as NewHelp.jsx's own version.
  const getValidationError = () => {
    if (!direction) return 'Please choose Required or Available.';
    if (!category) return 'Please select a category.';
    if (!subCategory) return 'Please select a sub-category.';
    if (!item) return 'Please select an item.';
    if (quantity === '' || Number(quantity) <= 0) return 'Please enter a quantity greater than 0.';
    if (showCondition) {
      if (!condition) return 'Please enter the condition (New/Used) of the item.';
      if (condition === 'Used' && (ageValue === '' || Number(ageValue) <= 0)) return 'Please enter the age of the item.';
    }
    return null;
  };

  const isValid = getValidationError() === null;

  // Actually creates the Store item — split out from handleSubmit so the
  // "create anyway" button on the duplicate-warning popup can jump straight
  // here without re-running the check that already just found it.
  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        title: item,
        description: description || null,
        category,
        sub_category: subCategory,
        quantity: Number(quantity),
        unit,
        condition: showCondition ? condition : null,
        age_value: showCondition && condition === 'Used' ? Number(ageValue) : null,
        age_unit: showCondition && condition === 'Used' ? ageUnit : null,
        photo_urls: showCondition && photos.length ? photos : null,
        logistics_preference: showCondition && logisticsPreference.length ? logisticsPreference : null,
        store: true,
        direction,
        is_online: isOnline,
        confirm_street: !isOnline ? (confirmLocation?.street || null) : null,
        confirm_house_number: !isOnline ? (confirmLocation?.house_number || null) : null,
        confirm_city: !isOnline ? (confirmLocation?.city || null) : null,
        confirm_pincode: !isOnline ? (confirmLocation?.pincode || null) : null,
        confirm_latitude: !isOnline ? (confirmLocation?.latitude || null) : null,
        confirm_longitude: !isOnline ? (confirmLocation?.longitude || null) : null,
      };
      const res = await api.post('/help', payload);
      setCreatedHelpId(res.data.help_id);
      setSecondsLeft(REDIRECT_SECONDS);
      setCreated(true);
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not create the Store item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Form's real submit handler — validates, then checks for a possible
  // duplicate against whichever Store system account (HRR0000/BRR0000) this
  // item would be created under before handing off to doSubmit.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = getValidationError();
    if (validationError) {
      showAppError(validationError);
      return;
    }
    setCheckingDuplicates(true);
    try {
      const res = await api.get('/help/check-duplicate', {
        params: { title: item, quantity: Number(quantity), condition: showCondition ? condition : undefined, store: true, direction },
      });
      if (res.data.length > 0) {
        setDuplicates(res.data);
        return; // Wait for the popup — Create anyway calls doSubmit itself.
      }
    } catch {
      // If the check itself fails, don't block creation over it — just
      // proceed as if nothing was found.
    } finally {
      setCheckingDuplicates(false);
    }
    await doSubmit();
  };

  const selectClass = "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar disabled:bg-gray-50 disabled:text-gray-400";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">New Help</h1>
          <p className="text-sm text-gray-500 mb-5">
            {direction === 'request' ? 'Visible to all helpers' : direction === 'offer' ? 'Visible to all beneficiaries' : 'Choose Required or Available to get started'}
          </p>

          {created ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-remar-light flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="#579500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">Help ID {createdHelpId} created</p>
              <p className="text-xs text-gray-400 mt-2">
                {direction === 'request'
                  ? 'Now visible to all helpers in Remar Store, asking to be fulfilled.'
                  : 'Now visible to all beneficiaries in Remar Store, offered by Remar Store.'}
              </p>
              <p className="text-xs text-gray-400 mt-3">Don't click, page will automatically navigate</p>
              <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center mx-auto mt-2 text-xs font-semibold text-gray-500">
                {secondsLeft}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>Required or Available</label>
                <div className="flex gap-2">
                  {[{ value: 'request', label: 'Required (Helpers)' }, { value: 'offer', label: 'Available (Beneficiaries)' }].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setDirection(opt.value)}
                      className={`flex-1 text-sm font-semibold rounded-lg py-2.5 border transition ${
                        direction === opt.value ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                      style={direction === opt.value ? { backgroundColor: '#3a6b00' } : undefined}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Select category</label>
                <select required value={category} onChange={e => handleCategoryChange(e.target.value)} className={selectClass}>
                  <option value="" disabled>Choose a category…</option>
                  {HELP_CATEGORIES_ORDER.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>Select sub-category</label>
                <select required disabled={!category} value={subCategory} onChange={e => handleSubCategoryChange(e.target.value)} className={selectClass}>
                  <option value="" disabled>{category ? 'Choose a sub-category…' : 'Select a category first'}</option>
                  {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>Select item</label>
                <select required disabled={!subCategory} value={item} onChange={e => setItem(e.target.value)} className={selectClass}>
                  <option value="" disabled>{subCategory ? 'Choose an item…' : 'Select a sub-category first'}</option>
                  {items.map(it => <option key={it} value={it}>{it}</option>)}
                </select>
              </div>

              {showCondition && (
                <div>
                  <label className={labelClass}>New / Used</label>
                  <div className="flex gap-2 mb-2">
                    {['New', 'Used'].map(opt => (
                      <button key={opt} type="button" onClick={() => setCondition(opt)}
                        className={`flex-1 text-sm font-semibold rounded-lg py-2.5 border transition ${
                          condition === opt ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                        style={condition === opt ? { backgroundColor: '#3a6b00' } : undefined}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {condition === 'Used' && (
                    <div className="flex gap-2">
                      <input required type="number" min="0" step="1" value={ageValue} onChange={e => setAgeValue(e.target.value)}
                        placeholder="Age"
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                      <select value={ageUnit} onChange={e => setAgeUnit(e.target.value)} className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar">
                        {AGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {showCondition && (
                <div>
                  <label className={labelClass}>Photos (optional, up to {MAX_PHOTOS})</label>
                  <div className="flex gap-2 flex-wrap">
                    {photos.map((src, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                        <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removePhoto(idx)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-4 text-center">
                          ×
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <label className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xl cursor-pointer hover:bg-gray-50">
                        +
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                      </label>
                    )}
                  </div>
                  {photoError && <p className="text-xs text-red-600 mt-1.5">{photoError}</p>}
                </div>
              )}

              <div>
                <label className={labelClass}>Additional item description</label>
                <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Brand, colour, material, etc."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
              </div>

              <div>
                <label className={labelClass}>Quantity</label>
                <div className="flex gap-2">
                  <input required type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)}
                    placeholder="0"
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                  <select value={unit} onChange={e => setUnit(e.target.value)} className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-remar">
                    {HELP_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {item && (isOnline ? (
                <div>
                  <label className={labelClass}>Location</label>
                  <div className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-500 bg-gray-50">Online</div>
                </div>
              ) : (
                <ConfirmLocationField value={confirmLocation} onChange={setConfirmLocation} fetchRegistered={fetchStoreLocation} />
              ))}

              {showCondition && direction && (
                <div>
                  <label className={labelClass}>{LOGISTICS_LABEL[direction]}</label>
                  <div className="space-y-2">
                    {LOGISTICS_OPTIONS[direction].map(opt => (
                      <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={logisticsPreference.includes(opt.value)}
                          onChange={() => toggleLogistics(opt.value)}
                          className="w-4 h-4 accent-[#3a6b00]" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={submitting || checkingDuplicates}
                className="w-full text-white font-semibold text-sm rounded-lg py-3 mt-2 transition disabled:opacity-50"
                style={{ backgroundColor: '#3a6b00' }}>
                {checkingDuplicates ? 'Checking…' : submitting ? 'Saving…' : 'Submit'}
              </button>
            </form>
          )}

          {/* Possible-duplicate warning — see NewHelp.jsx's own copy of this
              modal for the full explanation. Scoped to the Store system
              account here (HRR0000/BRR0000, per direction). */}
          <ConfirmModal
            open={duplicates.length > 0}
            title="You may already have this"
            message={
              `Remar Store already has ${duplicates.length > 1 ? 'these' : 'a'} similar Help item${duplicates.length > 1 ? 's' : ''} created in the last 3 days that ${duplicates.length > 1 ? "aren't" : "isn't"} completed yet:\n\n` +
              duplicates.map(d => `${d.help_id} — ${d.quantity} ${d.unit || ''} · ${getStatusLabel(d.status)} · ${formatShortDate(d.created_at)}`).join('\n') +
              '\n\nCreate this one anyway?'
            }
            confirmLabel="Create anyway" cancelLabel="Cancel" warning
            onConfirm={() => { setDuplicates([]); doSubmit(); }}
            onCancel={() => setDuplicates([])}
          />
        </div>
      </div>
    </div>
  );
}
