import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { HELP_TAXONOMY, HELP_CATEGORIES_ORDER, HELP_UNITS, getItemDelivery } from '../../data/helpTaxonomy';
import { showAppError } from '../../utils/errorBus';
import ConfirmLocationField from '../../components/ConfirmLocationField';
import ConfirmModal from '../../components/ConfirmModal';
import { getStatusLabel } from '../../utils/helpStatus';
import { pickPhoto } from '../../utils/pickPhoto';

const AGE_UNITS = ['Days', 'Weeks', 'Months', 'Years'];
const REDIRECT_SECONDS = 5;
const MAX_PHOTOS = 3;

// "10 Aug" style short date, matching the Help ongoing/history tables.
const formatShortDate = (d) => {
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// New/Used (and the age-if-Used field) only makes sense for physical goods
// that can genuinely be pre-owned — not for services (Social/Professional),
// pure cash gifts (Money), and so on.
const CONDITION_CATEGORIES = ['Food', 'Clothes', 'Toiletries'];

// Delivery preference (helper) / Collection preference (beneficiary) — same
// two real-world options, just worded from whichever side is filling out
// the form. Values are canonical ('pickup'/'dropoff') so the server and the
// filter panel on All Help Available/Required only ever need to reason
// about one pair, not four different strings — see server/routes/help.js
// and db.js's migration comment for the full mapping.
const LOGISTICS_OPTIONS = {
  helper: [
    { value: 'pickup', label: 'Pick up from my location' },
    { value: 'dropoff', label: 'I can drop off' },
  ],
  beneficiary: [
    { value: 'pickup', label: 'I can pick up' },
    { value: 'dropoff', label: 'Drop off at my location' },
  ],
};
const LOGISTICS_LABEL = { helper: 'Delivery preference', beneficiary: 'Collection preference' };

// New Help request form — Category → Sub-category → Item, each narrowing
// the next dropdown's options, sourced from Help.xlsx. Reachable from the
// bottom nav's "New Help" button and Home's "New Help" button (both roles).
// Also doubles as the Modify flow: when reached at /help/:id/edit (from the
// Modify button on Help Status), it prefills from the existing help item
// and saves changes with PUT instead of creating a new one.
export default function NewHelp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [item, setItem] = useState('');
  const [condition, setCondition] = useState('');
  const [ageValue, setAgeValue] = useState('');
  const [ageUnit, setAgeUnit] = useState(AGE_UNITS[0]);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(HELP_UNITS[0]);
  // Delivery/Collection preference — see LOGISTICS_OPTIONS above. Both
  // options can be selected at once (checkboxes, not a single choice).
  const [logisticsPreference, setLogisticsPreference] = useState([]);
  const toggleLogistics = (value) => setLogisticsPreference(prev =>
    prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  // Item 5: online-vs-physical, looked up from Help.xlsx's Delivery column
  // (see helpTaxonomy.js's getItemDelivery). Online items skip the location
  // field entirely (shown as "Online" everywhere); physical items get a
  // Confirm location field (see ConfirmLocationField) so this specific Help
  // ID's address can differ from whatever's on the creator's own profile.
  const [confirmLocation, setConfirmLocation] = useState(null);
  // Up to 3 optional photos — only offered for the same categories as New/Used
  // (Food/Clothes/Toiletries, see CONDITION_CATEGORIES/showCondition below).
  // Stored as base64 data URLs, same pattern as the registration photo upload.
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdHelpId, setCreatedHelpId] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const [existingHelp, setExistingHelp] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  // Possible-duplicate warning — checked against the creator's own recent
  // (last 3 days), still-open helps right before actual creation. See
  // checkDuplicatesThenSubmit below and GET /help/check-duplicate.
  const [duplicates, setDuplicates] = useState([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Edit mode: load the existing help item and prefill every field from it.
  useEffect(() => {
    if (!isEditMode) return;
    api.get(`/help/${id}`).then(res => {
      const h = res.data;
      setExistingHelp(h);
      setCategory(h.category || '');
      setSubCategory(h.sub_category || '');
      setItem(h.title || '');
      setCondition(h.condition || '');
      setAgeValue(h.age_value != null ? String(h.age_value) : '');
      setAgeUnit(h.age_unit || AGE_UNITS[0]);
      setDescription(h.description || '');
      setQuantity(h.quantity != null ? String(h.quantity) : '');
      setUnit(h.unit || HELP_UNITS[0]);
      setPhotos(Array.isArray(h.photo_urls) ? h.photo_urls : []);
      setLogisticsPreference(Array.isArray(h.logistics_preference) ? h.logistics_preference : []);
      if (h.confirm_street || h.confirm_city || h.confirm_pincode) {
        setConfirmLocation({
          street: h.confirm_street || '', house_number: h.confirm_house_number || '',
          city: h.confirm_city || '', pincode: h.confirm_pincode || '',
          latitude: h.confirm_latitude || null, longitude: h.confirm_longitude || null,
        });
      }
    }).catch(() => showAppError('Could not load this help item to modify it.'))
      .finally(() => setLoadingExisting(false));
  }, [id, isEditMode]);

  // Countdown shown on the confirmation screen — ticks down from
  // REDIRECT_SECONDS to 0, then navigates on. Only runs once `created`
  // is true, and cleans itself up if the component unmounts first.
  useEffect(() => {
    if (!created) return;
    if (secondsLeft <= 0) {
      navigate(isEditMode ? `/help/${id}` : '/home');
      return;
    }
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [created, secondsLeft, navigate, isEditMode, id]);

  const subCategories = category ? Object.keys(HELP_TAXONOMY[category]) : [];
  const items = category && subCategory ? HELP_TAXONOMY[category][subCategory] : [];
  const showCondition = CONDITION_CATEGORIES.includes(category);
  const isOnline = item ? getItemDelivery(category, subCategory, item) === 'Online' : false;

  const handleCategoryChange = (val) => {
    setCategory(val);
    setSubCategory('');
    setItem('');
    // Clear any condition/age/photos picked under a previous category that
    // did show these fields, so they can't linger unseen into a category
    // where they're hidden and shouldn't apply.
    setCondition('');
    setAgeValue('');
    setPhotos([]);
    setPhotoError('');
    setLogisticsPreference([]);
  };

  // Native "Take Photo / Choose from Library" action sheet (see
  // utils/pickPhoto.js) — adds one photo per tap rather than the old file
  // input's multi-select, since a camera capture can only ever be one photo
  // at a time anyway; tapping the + tile repeatedly still fills up to
  // MAX_PHOTOS.
  const handlePhotoSelect = async () => {
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setPhotoError('');
    try {
      const dataUrl = await pickPhoto();
      if (dataUrl) setPhotos(prev => [...prev, dataUrl]);
    } catch {
      setPhotoError('Could not access the camera/photos — please try again.');
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  const handleSubCategoryChange = (val) => {
    setSubCategory(val);
    setItem('');
  };

  // Returns the specific field that's missing/invalid rather than one
  // catch-all message, so the alert tells you exactly what to fix instead of
  // making you re-scan the whole form (e.g. "Please enter the condition
  // (New/Used) of the item" rather than a list of every possible field).
  // Checked in the same top-to-bottom order the fields appear in the form.
  const getValidationError = () => {
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

  // Actually creates/saves the help item — split out from handleSubmit so
  // the "create anyway" button on the duplicate-warning popup can jump
  // straight here without re-running the check that already just found it.
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
        is_online: isOnline,
        confirm_street: !isOnline ? (confirmLocation?.street || null) : null,
        confirm_house_number: !isOnline ? (confirmLocation?.house_number || null) : null,
        confirm_city: !isOnline ? (confirmLocation?.city || null) : null,
        confirm_pincode: !isOnline ? (confirmLocation?.pincode || null) : null,
        confirm_latitude: !isOnline ? (confirmLocation?.latitude || null) : null,
        confirm_longitude: !isOnline ? (confirmLocation?.longitude || null) : null,
      };
      const res = isEditMode
        // Spread the original record first so fields this form doesn't
        // touch (status, required_skills, location, scheduled_date,
        // duration_hours, ...) aren't wiped out by the update.
        ? await api.put(`/help/${id}`, { ...existingHelp, ...payload })
        : await api.post('/help', payload);
      // The server generates and stores a permanent Help ID (and the
      // creation date/time/device) on the help item — use what it actually
      // has rather than guessing a position-based one.
      setCreatedHelpId(res.data.help_id);
      setCreatedDate(formatShortDate(res.data.created_at));
      setSecondsLeft(REDIRECT_SECONDS);
      setCreated(true);
    } catch (err) {
      showAppError(err.response?.data?.error || `Could not ${isEditMode ? 'save changes to' : 'create'} the help request. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  // Form's real submit handler — validates, then (only when actually
  // creating something new, not editing) checks for a possible duplicate
  // before handing off to doSubmit. Modifying an existing item never
  // triggers this — you're not creating a second help item, just changing
  // the one you already have.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = getValidationError();
    if (validationError) {
      showAppError(validationError);
      return;
    }
    if (isEditMode) {
      await doSubmit();
      return;
    }
    setCheckingDuplicates(true);
    try {
      const res = await api.get('/help/check-duplicate', {
        params: { title: item, quantity: Number(quantity), condition: showCondition ? condition : undefined },
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

  if (loadingExisting) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    // Same negative-margin/padding-top swap as Dashboard.jsx/Settings.jsx/
    // Store.jsx — cancels body's own safe-area-inset-top padding (a white
    // strip above this grey page otherwise), re-added here as just 3mm
    // total (was 2mm + the original py-10's 2.5rem) so the title sits close
    // under the camera/notch area.
    <div
      className="min-h-screen bg-gray-50 px-4 pb-28"
      style={{ marginTop: 'calc(-1 * (env(safe-area-inset-top, 0px) + 2mm))', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3mm)' }}
    >
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">{isEditMode ? 'Modify Help' : 'New Help'}</h1>
          <p className="text-sm text-gray-500 mb-5">
            {user?.role === 'helper' ? 'Describe what you are offering' : 'Describe what you are looking for'}
          </p>

          {created ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-remar-light flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="#579500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">
                {isEditMode ? `Help ID ${createdHelpId} updated` : `Help ID ${createdHelpId} created on ${createdDate}`}
              </p>
              <p className="text-xs text-gray-400 mt-3">Don't click, page will automatically navigate</p>
              <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center mx-auto mt-2 text-xs font-semibold text-gray-500">
                {secondsLeft}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field 1 — Category */}
              <div>
                <label className={labelClass}>Select category</label>
                <select required value={category} onChange={e => handleCategoryChange(e.target.value)} className={selectClass}>
                  <option value="" disabled>Choose a category…</option>
                  {HELP_CATEGORIES_ORDER.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* Field 2 — Sub-category */}
              <div>
                <label className={labelClass}>Select sub-category</label>
                <select required disabled={!category} value={subCategory} onChange={e => handleSubCategoryChange(e.target.value)} className={selectClass}>
                  <option value="" disabled>{category ? 'Choose a sub-category…' : 'Select a category first'}</option>
                  {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>

              {/* Field 3 — Item */}
              <div>
                <label className={labelClass}>Select item</label>
                <select required disabled={!subCategory} value={item} onChange={e => setItem(e.target.value)} className={selectClass}>
                  <option value="" disabled>{subCategory ? 'Choose an item…' : 'Select a sub-category first'}</option>
                  {items.map(it => <option key={it} value={it}>{it}</option>)}
                </select>
              </div>

              {/* Field 4 — New / Used, with age shown only when Used. Only
                  shown at all for Food/Clothes/Toiletries — see
                  CONDITION_CATEGORIES above. */}
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

              {/* Optional photos (up to 3) — same categories as New/Used
                  (Food/Clothes/Toiletries), never required. */}
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
                      <button type="button" onClick={handlePhotoSelect}
                        className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xl cursor-pointer hover:bg-gray-50">
                        +
                      </button>
                    )}
                  </div>
                  {photoError && <p className="text-xs text-red-600 mt-1.5">{photoError}</p>}
                </div>
              )}

              {/* Field 5 — Additional description */}
              <div>
                <label className={labelClass}>Description (brand, material, color, size, activity, etc.)</label>
                <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Brand, colour, material, etc."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
              </div>

              {/* Field 6 — Quantity + Unit */}
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

              {/* Location — Online items skip a location field entirely
                  (shown as "Online" everywhere); physical items get the
                  Location field (Me / Other party, see ConfirmLocationField).
                  See helpTaxonomy.js's getItemDelivery. Sits below Quantity
                  now rather than right after Item selection. */}
              {item && (isOnline ? (
                <div>
                  <label className={labelClass}>Location</label>
                  <div className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-500 bg-gray-50">Online</div>
                </div>
              ) : (
                <ConfirmLocationField value={confirmLocation} onChange={setConfirmLocation} />
              ))}

              {/* Field 7 — Delivery preference (helper) / Collection
                  preference (beneficiary), Food/Clothes/Toiletries only,
                  same categories as New/Used above. Both options can be
                  checked at once. */}
              {showCondition && (
                <div>
                  <label className={labelClass}>{LOGISTICS_LABEL[user?.role] || 'Delivery preference'}</label>
                  <div className="space-y-2">
                    {(LOGISTICS_OPTIONS[user?.role] || LOGISTICS_OPTIONS.helper).map(opt => (
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
                {checkingDuplicates ? 'Checking…' : submitting ? 'Saving…' : isEditMode ? 'Save changes' : 'Submit'}
              </button>
            </form>
          )}

          {/* Possible-duplicate warning — a still-open help I created within
              the last 3 days already matches this exact item/quantity/
              condition (see GET /help/check-duplicate). Doesn't block
              creation, just gives a chance to go check the existing one
              first instead of accidentally piling up a near-identical
              request. */}
          <ConfirmModal
            open={duplicates.length > 0}
            title="You may already have this"
            message={
              `You created ${duplicates.length > 1 ? 'these' : 'a'} similar Help item${duplicates.length > 1 ? 's' : ''} in the last 3 days that ${duplicates.length > 1 ? "aren't" : "isn't"} completed yet:\n\n` +
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
