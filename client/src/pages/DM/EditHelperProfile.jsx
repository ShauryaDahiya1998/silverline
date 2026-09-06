import { useState, useRef, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { registerCredential, removeCredential } from '../../utils/webauthn';
import DateOfBirthPicker from '../../components/DateOfBirthPicker';
import { showAppError } from '../../utils/errorBus';
import { formatIsdCode } from '../../utils/phone';
import { capWordsUnder100 } from '../../utils/text';
import { pickPhoto } from '../../utils/pickPhoto';
import { Geolocation } from '@capacitor/geolocation';

// Same form as Helper Registration (HelperRegister.jsx) — kept field-for-field
// identical on purpose so editing feels exactly like registering — minus the
// Account ID / password fields (the account already exists), pre-filled from
// GET /helpers/me, and saved via PUT /helpers/:id instead of creating a
// new account. See HelperRegister.jsx for the original; keep both in sync if
// a field is added there.
const SKILLS = ['Food', 'Toiletries', 'Clothes', 'Social services', 'Professional services', 'Money'];
const SKILL_ICONS = {
  'Food': '🍎',
  'Toiletries': '🧴',
  'Clothes': '👕',
  'Social services': '🤝',
  'Professional services': '💼',
  'Money': '💰',
};
const AGE_GROUPS = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const PERSONALITY_WORDS = [
  'friendly', 'kind', 'empathetic', 'caring', 'welcoming', 'outgoing', 'talkative', 'sociable',
  'gregarious', 'reserved', 'quiet', 'cheerful', 'calm', 'serious', 'thoughtful', 'optimistic',
  'sensitive', 'resilient', 'diligent', 'organized', 'ambitious', 'practical', 'meticulous',
  'adaptable', 'curious', 'analytical', 'creative', 'imaginative', 'reflective', 'decisive',
  'cooperative', 'diplomatic', 'assertive', 'patient', 'independent', 'supportive', 'energetic',
  'lively', 'relaxed', 'steady', 'spontaneous', 'cautious', 'principled', 'open-minded',
  'traditional', 'adventurous', 'conscientious',
];

const TIME_SLOTS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

const emptyAvailability = () => Object.fromEntries(
  DAYS.map(day => [day, [{ from: '', to: '' }, { from: '', to: '' }, { from: '', to: '' }]])
);

// Fills in any missing day/slot from a possibly-incomplete saved record (old
// data from before this shape was finalized) so getSlotStatus never indexes
// into undefined.
const normalizeAvailability = (raw) => {
  const base = emptyAvailability();
  if (!raw || typeof raw !== 'object') return base;
  DAYS.forEach(day => {
    const daySlots = Array.isArray(raw[day]) ? raw[day] : [];
    base[day] = [0, 1, 2].map(i => ({
      from: daySlots[i]?.from || '',
      to: daySlots[i]?.to || '',
    }));
  });
  return base;
};

const CATEGORY_ITEMS = {
  'Food': ['Brocolli', 'Carot', 'Potatoe', 'Pepper', 'Onion', 'Eggplant', 'Lettuce', 'Mushrooms', 'Garlic', 'Cauliflower', 'Spinach', 'Cabbage', 'Garden rocket', 'Butterhead Lettuce', 'Tomato', 'Apple', 'Orange', 'Banana', 'Avocado', 'Grapes', 'Cucumber', 'Lemon', 'Rice', 'Wheat', 'Pasta', 'Oats', 'Soya sauce', 'Tomato sauce', 'Chili sauce', 'Salt', 'Sugar', 'Oil', 'Butter', 'Ghee', 'Cheese'],
  'Toiletries': ['Shampoo', 'Conditioner', 'Duschgel', 'Toiletpaper', 'Mouthwash', 'Deodorant', 'Handwash', 'Toothpaste', 'Earbuds', 'Sanitary pads'],
  'Clothes': ['Shirt', 'Polo', 'Jacket', 'Dress', 'Sweater', 'Innerwear', 'Belt', 'Shoes', 'Cap', 'Socks'],
  'Social services': ['Mind coaching (Audio)', 'Mind coaching (Video)', 'Mind coaching (In-person)', 'Cleaning', 'Furniture assembly/ repair', 'Cooking', 'Plumbing', 'Home delivery', 'Hiking', 'Yoga', 'Swimming', 'Jogging', 'Velo cycling', 'Walking'],
  'Professional services': ['Tax', 'Legal', 'Technology', 'Mental health'],
  'Money': ['Cash', 'SEPA transfer', 'Paypal'],
};

const AVATARS = [
  { id: 'female-young-blonde-happy', gender: 'female', age: 'young', mood: 'happy', src: '/avatars/female-young-blonde-happy.jpg' },
  { id: 'female-young-brown-happy', gender: 'female', age: 'young', mood: 'happy', src: '/avatars/female-young-brown-happy.jpg' },
  { id: 'female-young-serious', gender: 'female', age: 'young', mood: 'serious', src: '/avatars/female-young-serious.jpg' },
  { id: 'female-middle-aged-happy', gender: 'female', age: 'middle-aged', mood: 'happy', src: '/avatars/female-middle-aged-happy.jpg' },
  { id: 'female-middle-aged-serious', gender: 'female', age: 'middle-aged', mood: 'serious', src: '/avatars/female-middle-aged-serious.jpg' },
  { id: 'female-old-happy', gender: 'female', age: 'old', mood: 'happy', src: '/avatars/female-old-happy.jpg' },
  { id: 'female-old-serious', gender: 'female', age: 'old', mood: 'serious', src: '/avatars/female-old-serious.jpg' },
  { id: 'male-young-blonde-happy', gender: 'male', age: 'young', mood: 'happy', src: '/avatars/male-young-blonde-happy.jpg' },
  { id: 'male-young-brown-happy', gender: 'male', age: 'young', mood: 'happy', src: '/avatars/male-young-brown-happy.jpg' },
  { id: 'male-young-brown-asian-happy', gender: 'male', age: 'young', mood: 'happy', src: '/avatars/male-young-brown-asian-happy.jpg' },
  { id: 'male-young-serious', gender: 'male', age: 'young', mood: 'serious', src: '/avatars/male-young-serious.jpg' },
  { id: 'male-middle-aged-happy', gender: 'male', age: 'middle-aged', mood: 'happy', src: '/avatars/male-middle-aged-happy.jpg' },
  { id: 'male-middle-aged-serious', gender: 'male', age: 'middle-aged', mood: 'serious', src: '/avatars/male-middle-aged-serious.jpg' },
  { id: 'male-old-happy', gender: 'male', age: 'old', mood: 'happy', src: '/avatars/male-old-happy.jpg' },
  { id: 'male-old-serious', gender: 'male', age: 'old', mood: 'serious', src: '/avatars/male-old-serious.jpg' },
];

const genderBucket = (gender) => {
  if (gender === 'Male') return 'male';
  if (gender === 'Female') return 'female';
  return 'other';
};

const getAgeFromDOB = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const getAgeDecade = (dob) => {
  const age = getAgeFromDOB(dob);
  if (age === null) return '';
  if (age < 20) return 'Under 20';
  return `${Math.floor(age / 10) * 10}s`;
};

const computeAgeGroup = (age) => {
  if (age === null || age === undefined || isNaN(age)) return '';
  if (age <= 25) return AGE_GROUPS[0];
  if (age <= 35) return AGE_GROUPS[1];
  if (age <= 45) return AGE_GROUPS[2];
  if (age <= 55) return AGE_GROUPS[3];
  if (age <= 65) return AGE_GROUPS[4];
  return AGE_GROUPS[5];
};

const getAvatarAgeBucket = (age) => {
  if (age === null || age === undefined || isNaN(age)) return 'young';
  if (age < 35) return 'young';
  if (age < 55) return 'middle-aged';
  return 'old';
};

const getDefaultAvatarIndex = (gender, dob) => {
  const age = getAgeFromDOB(dob);
  const ageBucket = getAvatarAgeBucket(age);
  const gBucket = genderBucket(gender) === 'other' ? 'female' : genderBucket(gender);
  let idx = AVATARS.findIndex(a => a.gender === gBucket && a.age === ageBucket && a.mood === 'happy');
  if (idx === -1) idx = AVATARS.findIndex(a => a.gender === gBucket && a.age === ageBucket);
  return idx === -1 ? 0 : idx;
};

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const geocodeAddress = async (address) => {
  if (!address) return { latitude: null, longitude: null };
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${address}, Switzerland`)}`);
    const data = await res.json();
    if (data[0]) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  } catch (err) {
    // fall through to no coordinates
  }
  return { latitude: null, longitude: null };
};

// Default drag-order template — also used to reconstruct the saved contact
// order (an array of keys) back into full display objects on load.
const CONTACT_TEMPLATE = [
  { key: 'phone', label: 'Phone', icon: '📞' },
  { key: 'whatsapp', label: 'WhatsApp', iconUrl: 'https://cdn.simpleicons.org/whatsapp' },
  { key: 'sms', label: 'SMS', badgeText: 'SMS' },
  { key: 'teams', label: 'Teams', iconUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft_Office_Teams_(2019%E2%80%932025).svg' },
  { key: 'zoom', label: 'Zoom', iconUrl: 'https://cdn.simpleicons.org/zoom' },
  { key: 'meet', label: 'Meet', iconUrl: '/icons/googlemeet.png' },
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'post', label: 'Post', badgeText: 'POST' },
];

export default function EditHelperProfile() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState(null);
  const [memberNumber, setMemberNumber] = useState('');

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');

  const [avatarIndex, setAvatarIndex] = useState(0);
  const [avatarManuallySet, setAvatarManuallySet] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  // What these two were when the page loaded (from the account's real
  // enrolled credentials, see the GET /webauthn/status effect below) — Save
  // only re-runs the Face ID / Fingerprint capture ceremony for one that
  // actually just got switched ON here (off -> on), not for one that was
  // already on and simply carried through unchanged; it removes the stored
  // credential for one switched OFF (on -> off). Comparing against these
  // refs is what tells the two apart.
  const initialFaceIdEnabled = useRef(false);
  const initialFingerprintEnabled = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [profile, setProfile] = useState({
    nickname: '', date_of_birth: '', gender: '', about_me: '',
    street: '', houseNumber: '', city: '', pincode: '',
    phoneCode: '', phoneNumber: '', skills: [], availability: emptyAvailability(),
    professionalLicense: '', professionalExperience: ''
  });
  const [locating, setLocating] = useState(false);
  const [personalityWords, setPersonalityWords] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [derivedCity, setDerivedCity] = useState('');

  const [contactOrder, setContactOrder] = useState(CONTACT_TEMPLATE);
  const dragItemIndex = useRef(null);

  const [regionMode, setRegionMode] = useState('');
  const [regionCenterQuery, setRegionCenterQuery] = useState('');
  const [regionCenter, setRegionCenter] = useState(null);
  const [regionDistanceKm, setRegionDistanceKm] = useState('');
  const [locatingRegion, setLocatingRegion] = useState(false);
  const [regionSuggestions, setRegionSuggestions] = useState([]);
  const [showRegionSuggestions, setShowRegionSuggestions] = useState(false);
  const [preferredAreas, setPreferredAreas] = useState(['', '', '', '', '']);
  const [activeAreaTab, setActiveAreaTab] = useState(0);
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);
  const [locatingArea, setLocatingArea] = useState(false);
  const lastAreaSelectionRef = useRef('');

  useEffect(() => {
    if (!avatarManuallySet) {
      setAvatarIndex(getDefaultAvatarIndex(profile.gender, profile.date_of_birth));
    }
  }, [profile.gender, profile.date_of_birth, avatarManuallySet]);

  // Load the helper's existing profile and populate every field above —
  // the same shape the form would end up in after filling out Registration.
  useEffect(() => {
    (async () => {
      try {
        const volunteerRes = await api.get('/helpers/me');
        const record = volunteerRes.data;
        setProfileId(record.id);
        setMemberNumber(record.member_number || '');

        const nameParts = (record.name || '').trim().split(/\s+/).filter(Boolean);
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
        setMiddleName(nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '');

        const dob = record.date_of_birth ? new Date(record.date_of_birth).toISOString().slice(0, 10) : '';
        const rawPhone = (record.phone || '').replace(/^\+/, '');
        let [phoneCode, ...phoneRest] = rawPhone.split(' ');
        let phoneNumberParsed = phoneRest.join('');
        // Legacy records saved without a space between the ISD code and the
        // number end up entirely in phoneCode here — re-split on a 10-digit
        // tail so neither field silently comes back empty (which used to
        // block Save Changes via the required-field check with no visible error).
        if (phoneCode && phoneCode.length > 4 && !phoneNumberParsed) {
          phoneNumberParsed = phoneCode.slice(-10);
          phoneCode = phoneCode.slice(0, phoneCode.length - phoneNumberParsed.length).slice(0, 4);
        }

        setProfile({
          nickname: record.nickname || '',
          date_of_birth: dob,
          gender: record.gender || '',
          about_me: record.about_me || '',
          street: record.street || '',
          houseNumber: record.house_number || '',
          city: record.city || '',
          pincode: record.pincode || '',
          // Re-run through formatIsdCode so a legacy record saved without a
          // '+' (or with stray leading zeros) still comes back correctly
          // formatted, not just whatever raw digits happened to be stored.
          phoneCode: phoneCode ? formatIsdCode(phoneCode) : '',
          phoneNumber: phoneNumberParsed || '',
          skills: Array.isArray(record.skills) ? record.skills : [],
          availability: normalizeAvailability(
            typeof record.availability === 'string' ? JSON.parse(record.availability) : record.availability
          ),
          professionalLicense: record.professional_license || '',
          professionalExperience: record.professional_experience || '',
        });

        const matchedAvatar = AVATARS.findIndex(a => a.src === record.photo_url);
        if (matchedAvatar !== -1) {
          setAvatarIndex(matchedAvatar);
          setAvatarManuallySet(true);
        } else if (record.photo_url) {
          setUploadedPhoto(record.photo_url);
        }

        if (record.voice_note_url) setVoiceNote(record.voice_note_url);

        if (record.personality_notes) {
          setPersonalityWords(record.personality_notes.split(',').map(w => w.trim()).filter(Boolean));
        }

        const contactKeys = Array.isArray(record.contact_preference)
          ? record.contact_preference
          : typeof record.contact_preference === 'string'
          ? JSON.parse(record.contact_preference)
          : null;
        if (contactKeys?.length) {
          const byKey = Object.fromEntries(CONTACT_TEMPLATE.map(c => [c.key, c]));
          const ordered = contactKeys.map(k => byKey[k]).filter(Boolean);
          const missing = CONTACT_TEMPLATE.filter(c => !contactKeys.includes(c.key));
          setContactOrder([...ordered, ...missing]);
        }

        const regions = typeof record.preferred_regions === 'string'
          ? JSON.parse(record.preferred_regions)
          : record.preferred_regions;
        if (regions?.mode === 'distance') {
          setRegionMode('distance');
          setRegionCenter(regions.center || null);
          setRegionCenterQuery(regions.center?.label || '');
          setRegionDistanceKm(regions.distance_km ? String(regions.distance_km) : '');
        } else if (regions?.mode === 'areas') {
          setRegionMode('areas');
          setPreferredAreas([...(regions.areas || []), '', '', '', '', ''].slice(0, 5));
        }

        // Reflect the account's real enrolled state so the toggles below
        // aren't just permanently blank — and remember it in the refs above
        // so Save can tell "already on, unchanged" apart from "just turned
        // on" (see handleSubmit's own comment).
        try {
          const statusRes = await api.get('/webauthn/status');
          setFaceIdEnabled(statusRes.data.faceIdEnabled);
          setFingerprintEnabled(statusRes.data.fingerprintEnabled);
          initialFaceIdEnabled.current = statusRes.data.faceIdEnabled;
          initialFingerprintEnabled.current = statusRes.data.fingerprintEnabled;
        } catch { /* leave both at their false default */ }
      } catch (err) {
        showAppError('Could not load your profile — please try again');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // If City was left blank, look it up from the Pincode when the Preview opens.
  useEffect(() => {
    if (!showPreview || profile.city || !profile.pincode) {
      setDerivedCity('');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&postalcode=${encodeURIComponent(profile.pincode)}&limit=1`);
        const data = await res.json();
        const a = data[0]?.address || {};
        setDerivedCity(a.city || a.town || a.village || '');
      } catch (err) {
        setDerivedCity('');
      }
    })();
  }, [showPreview, profile.city, profile.pincode]);

  const addPersonalityWord = (word) => {
    if (!word || personalityWords.includes(word) || personalityWords.length >= 5) return;
    setPersonalityWords(prev => [...prev, word]);
  };

  const removePersonalityWord = (word) => {
    setPersonalityWords(prev => prev.filter(w => w !== word));
  };

  const toggleSkill = (skill) => {
    setProfile(p => ({
      ...p,
      skills: p.skills.includes(skill) ? p.skills.filter(s => s !== skill) : [...p.skills, skill]
    }));
  };

  const updateSlot = (day, prefIndex, field, value) => {
    setProfile(p => {
      const daySlots = p.availability[day].map((slot, idx) =>
        idx === prefIndex ? { ...slot, [field]: value } : slot
      );
      return { ...p, availability: { ...p.availability, [day]: daySlots } };
    });
  };

  const timeToMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const getSlotStatus = (day, prefIndex) => {
    const slot = profile.availability[day][prefIndex];
    if (!slot.from || !slot.to) return 'empty';
    const from = timeToMinutes(slot.from);
    const to = timeToMinutes(slot.to);
    if (to <= from) return 'invalid';
    const overlaps = profile.availability[day].some((other, idx) => {
      if (idx === prefIndex || !other.from || !other.to) return false;
      const oFrom = timeToMinutes(other.from);
      const oTo = timeToMinutes(other.to);
      return from < oTo && oFrom < to;
    });
    return overlaps ? 'invalid' : 'valid';
  };

  const allSlotStatuses = () =>
    DAYS.flatMap(day => [0, 1, 2].map(prefIndex => getSlotStatus(day, prefIndex)));

  const getAvailabilitySummary = () => {
    const lines = [];
    DAYS.forEach(day => {
      profile.availability[day].forEach((slot, i) => {
        if (getSlotStatus(day, i) === 'valid') lines.push(`${day} ${slot.from}–${slot.to}`);
      });
    });
    return lines;
  };

  // Native "Take Photo / Choose from Library" action sheet (see
  // utils/pickPhoto.js) instead of a plain file input — this is what
  // registers the Camera and Photo Library permissions with the OS.
  const handlePhotoUpload = async () => {
    const dataUrl = await pickPhoto();
    if (dataUrl) setUploadedPhoto(dataUrl);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const dataUrl = await readFileAsDataURL(blob);
        setVoiceNote(dataUrl);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      showAppError('Microphone access is required to record a voice note');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const navigateAvatar = (dir) => {
    setAvatarManuallySet(true);
    setAvatarIndex(i => (i + dir + AVATARS.length) % AVATARS.length);
  };

  const handleDragStart = (index) => { dragItemIndex.current = index; };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = (index) => {
    const from = dragItemIndex.current;
    if (from === null || from === index) return;
    setContactOrder(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(index, 0, moved);
      return updated;
    });
    dragItemIndex.current = null;
  };

  // @capacitor/geolocation instead of raw navigator.geolocation — this is
  // what registers the Location permission with iOS/Android natively
  // (falls back to the browser's own geolocation API automatically when
  // this app is opened as a plain website).
  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const a = data.address || {};
        setProfile(p => ({
          ...p,
          street: a.road || p.street,
          houseNumber: a.house_number || p.houseNumber,
          city: a.city || a.town || a.village || p.city,
          pincode: a.postcode || p.pincode,
        }));
      } catch (err) {
        showAppError('Could not detect your address automatically — please enter it manually');
      }
    } catch (err) {
      showAppError('Location permission denied — please enter your address manually');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!regionCenterQuery.trim() || regionCenterQuery === regionCenter?.label) {
      setRegionSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(regionCenterQuery)}`);
        const data = await res.json();
        setRegionSuggestions(data);
        setShowRegionSuggestions(true);
      } catch (err) {
        setRegionSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [regionCenterQuery]);

  // The two region-preference methods (distance-to-centre vs named areas)
  // are mutually exclusive — only whichever one was actually used is
  // submitted (see preferred_regions below). These two helpers wipe
  // whichever method is NOT currently being used, so the screen never
  // shows data sitting in both places at once.
  const clearAreasMethod = () => {
    setPreferredAreas(['', '', '', '', '']);
    setActiveAreaTab(0);
    lastAreaSelectionRef.current = '';
    setAreaSuggestions([]);
    setShowAreaSuggestions(false);
  };
  const clearDistanceMethod = () => {
    setRegionCenterQuery('');
    setRegionCenter(null);
    setRegionDistanceKm('');
    setRegionSuggestions([]);
    setShowRegionSuggestions(false);
  };

  const selectRegionSuggestion = (item) => {
    if (regionMode === 'areas') clearAreasMethod();
    setRegionCenter({ lat: item.lat, lon: item.lon, label: item.display_name });
    setRegionCenterQuery(item.display_name);
    setRegionMode('distance');
    setRegionSuggestions([]);
    setShowRegionSuggestions(false);
  };

  const useCurrentLocationForRegion = async () => {
    if (regionMode === 'areas') clearAreasMethod();
    setLocatingRegion(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      let label = 'Current location';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        if (data.display_name) label = data.display_name;
      } catch (err) {
        // fall back to the generic label if reverse geocoding fails
      }
      setRegionSuggestions([]);
      setShowRegionSuggestions(false);
      setRegionCenterQuery(label);
      setRegionCenter({ lat: latitude, lon: longitude, label });
      setRegionMode('distance');
    } catch (err) {
      showAppError('Location permission denied');
    } finally {
      setLocatingRegion(false);
    }
  };

  const updatePreferredArea = (value) => {
    if (regionMode === 'distance') clearDistanceMethod();
    setPreferredAreas(prev => prev.map((a, i) => i === activeAreaTab ? value : a));
    setRegionMode('areas');
  };

  useEffect(() => {
    const query = preferredAreas[activeAreaTab];
    if (!query.trim() || query === lastAreaSelectionRef.current) {
      setAreaSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setAreaSuggestions(data);
        setShowAreaSuggestions(true);
      } catch (err) {
        setAreaSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [preferredAreas, activeAreaTab]);

  const selectAreaTab = (i) => {
    setActiveAreaTab(i);
    lastAreaSelectionRef.current = preferredAreas[i];
    setAreaSuggestions([]);
    setShowAreaSuggestions(false);
  };

  // Areas 1-5 must each be a distinct place — used before finalizing either
  // a typed/selected suggestion or a current-location capture below, so the
  // same address can't silently occupy two of the five slots.
  const isDuplicateArea = (value, index) => {
    const norm = value.trim().toLowerCase();
    return preferredAreas.some((a, i) => i !== index && a.trim().toLowerCase() === norm);
  };

  const selectAreaSuggestion = (item) => {
    if (regionMode === 'distance') clearDistanceMethod();
    setAreaSuggestions([]);
    setShowAreaSuggestions(false);
    if (isDuplicateArea(item.display_name, activeAreaTab)) {
      showAppError('That address is already one of your preferred areas — only new addresses can be added.');
      setPreferredAreas(prev => prev.map((a, i) => i === activeAreaTab ? '' : a));
      lastAreaSelectionRef.current = '';
      return;
    }
    lastAreaSelectionRef.current = item.display_name;
    setPreferredAreas(prev => prev.map((a, i) => i === activeAreaTab ? item.display_name : a));
    setRegionMode('areas');
  };

  // Same pattern as useCurrentLocationForRegion below, but fills whichever
  // area tab is currently active and runs the duplicate check above.
  const useCurrentLocationForArea = async () => {
    if (regionMode === 'distance') clearDistanceMethod();
    setLocatingArea(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      let label = 'Current location';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        if (data.display_name) label = data.display_name;
      } catch (err) {
        // fall back to the generic label if reverse geocoding fails
      }
      setAreaSuggestions([]);
      setShowAreaSuggestions(false);
      if (isDuplicateArea(label, activeAreaTab)) {
        showAppError('That address is already one of your preferred areas — only new addresses can be added.');
        setPreferredAreas(prev => prev.map((a, i) => i === activeAreaTab ? '' : a));
        lastAreaSelectionRef.current = '';
        return;
      }
      lastAreaSelectionRef.current = label;
      setPreferredAreas(prev => prev.map((a, i) => i === activeAreaTab ? label : a));
      setRegionMode('areas');
    } catch (err) {
      showAppError('Location permission denied');
    } finally {
      setLocatingArea(false);
    }
  };

  const removeArea = (i) => {
    setPreferredAreas(prev => prev.map((a, idx) => idx === i ? '' : a));
    if (i === activeAreaTab) lastAreaSelectionRef.current = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    showAppError('');
    setSuccessMessage('');

    if (!firstName.trim() || !lastName.trim() || !profile.gender || !profile.date_of_birth) {
      showAppError('Please fill in all required personal information fields (marked with *)');
      return;
    }
    if (personalityWords.length < 5) {
      showAppError('Please select 5 words that describe you');
      return;
    }
    if (!profile.pincode.trim()) {
      showAppError('Pincode is required');
      return;
    }
    if (!profile.phoneCode.trim() || !profile.phoneNumber.trim()) {
      showAppError('Phone number is required (ISD code and number)');
      return;
    }
    if (!/^\+\d{1,4}$/.test(profile.phoneCode)) {
      showAppError('ISD code must be up to 4 digits');
      return;
    }
    if (!/^\d{1,10}$/.test(profile.phoneNumber)) {
      showAppError('Phone number must be up to 10 digits');
      return;
    }

    const statuses = allSlotStatuses();
    if (statuses.some(s => s === 'invalid')) {
      showAppError('Fix the highlighted time slots — "To" must be after "From", and slots on the same day can\'t overlap');
      return;
    }
    if (!statuses.some(s => s === 'valid')) {
      showAppError('Please choose at least one time slot of your preferred availability');
      return;
    }

    try {
      // profile.phoneCode already comes out of the ISD box as "+<code>"
      // (see utils/phone.js's formatIsdCode) — no extra '+' needed here.
      // Concatenated with no space/separator, per the single-string phone
      // format used everywhere else in the app (e.g. "+41791234567").
      const phone = `${profile.phoneCode}${profile.phoneNumber}`;
      const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
      const age = getAgeFromDOB(profile.date_of_birth);
      const photo_url = uploadedPhoto || AVATARS[avatarIndex].src;
      const address = [profile.street, profile.houseNumber, profile.city, profile.pincode].filter(Boolean).join(', ');
      const { latitude, longitude } = await geocodeAddress(address);
      const preferred_regions = regionMode === 'distance'
        ? { mode: 'distance', center: regionCenter, distance_km: Number(regionDistanceKm) }
        : regionMode === 'areas'
        ? { mode: 'areas', areas: preferredAreas.filter(Boolean) }
        : null;

      await api.put(`/helpers/${profileId}`, {
        ...profile,
        name,
        address,
        house_number: profile.houseNumber,
        latitude,
        longitude,
        phone,
        date_of_birth: profile.date_of_birth,
        age_group: computeAgeGroup(age),
        photo_url,
        voice_note_url: voiceNote,
        availability: profile.availability,
        contact_preference: contactOrder.map(c => c.key),
        preferred_regions,
        personality_notes: personalityWords.join(', '),
        professional_license: profile.professionalLicense,
        professional_experience: profile.professionalExperience
      });

      // Face ID / Fingerprint just switched ON here captures (and saves) a
      // fresh credential — every time it's freshly enabled, not just once
      // ever, per the toggle's own real biometric each time. Never blocks
      // the rest of Save: an unsupported browser, a cancelled OS prompt, or
      // any other failure here just leaves it un-enrolled, surfaced as a
      // popup rather than swallowed silently.
      const justEnabledFaceId = faceIdEnabled && !initialFaceIdEnabled.current;
      const justEnabledFingerprint = fingerprintEnabled && !initialFingerprintEnabled.current;
      if (justEnabledFaceId || justEnabledFingerprint) {
        try {
          const optionsRes = await api.post('/webauthn/register/options', {}, { headers: { Authorization: `Bearer ${token}` } });
          const credential = await registerCredential(optionsRes.data);
          const deviceLabel = [justEnabledFaceId && 'face', justEnabledFingerprint && 'fingerprint'].filter(Boolean).join('+');
          await api.post('/webauthn/register/verify', { ...credential, deviceLabel }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (err) {
          showAppError(err.response?.data?.error || err.message || 'Could not capture Face ID / Fingerprint — your other profile changes were still saved.');
        }
      }
      // Switched OFF here removes the account's stored credential(s) of that
      // kind (see webauthn.js's DELETE /credentials/:type) so a disabled
      // toggle actually stops working for login, not just visually.
      if (!faceIdEnabled && initialFaceIdEnabled.current) {
        try { await api.delete('/webauthn/credentials/face', { headers: { Authorization: `Bearer ${token}` } }); } catch { /* best-effort */ }
        await removeCredential(); // clears the on-device key too, native-only, see webauthn.js
      }
      if (!fingerprintEnabled && initialFingerprintEnabled.current) {
        try { await api.delete('/webauthn/credentials/fingerprint', { headers: { Authorization: `Bearer ${token}` } }); } catch { /* best-effort */ }
        await removeCredential();
      }

      navigate('/helper/profile/me');
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not save your profile — please try again');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold remar-green mb-1">Edit Profile</h1>
        <p className="text-gray-500 mb-6 text-sm">Update your REMAR helper profile</p>

        {successMessage && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">{successMessage}</div>}

        {/* noValidate: rely on handleSubmit's own checks (popup error modal)
            instead of the browser's silent native validation, which
            was blocking the click entirely with zero feedback whenever a
            required field was empty off-screen. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          {/* Account — read-only, no password here since the account already exists */}
          <div className="border-b pb-2">
            <h2 className="font-semibold remar-green mb-1">Account ID</h2>
            <p className="text-gray-700">
              {memberNumber && <span className="font-semibold">{memberNumber}</span>}
              {memberNumber && (user?.email) && <span className="text-gray-400 mx-1.5">|</span>}
              {user?.email || (!memberNumber && '—')}
            </p>
          </div>

          {/* Basic Info */}
          <div className="border-b pb-2">
            <h2 className="font-semibold remar-green mb-1.5">Basic information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2.5 gap-y-2.5">
              <div className="md:col-start-1 md:row-start-1">
                <label className="text-xs text-gray-500 mb-1 block">First name <span className="text-red-500">*</span></label>
                <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="md:col-start-1 md:row-start-2">
                <label className="text-xs text-gray-500 mb-1 block">Middle name</label>
                <input value={middleName} onChange={e => setMiddleName(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="md:col-start-1 md:row-start-3">
                <label className="text-xs text-gray-500 mb-1 block">Last name <span className="text-red-500">*</span></label>
                <input required value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="md:col-start-1 md:row-start-4">
                <label className="text-xs text-gray-500 mb-1 block">Nickname</label>
                <input value={profile.nickname} onChange={e => setProfile({ ...profile, nickname: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="md:col-start-1 md:row-start-5">
                <label className="text-xs text-gray-500 mb-1 block">Gender <span className="text-red-500">*</span></label>
                <select required value={profile.gender}
                  onChange={e => { setProfile({ ...profile, gender: e.target.value }); setAvatarManuallySet(false); }}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar">
                  <option value="">Select gender</option>
                  <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
                </select>
              </div>
              <div className="md:col-start-1 md:row-start-6">
                <label className="text-xs text-gray-500 mb-1 block">Date of birth <span className="text-red-500">*</span></label>
                <DateOfBirthPicker required value={profile.date_of_birth}
                  onChange={v => { setProfile({ ...profile, date_of_birth: v }); setAvatarManuallySet(false); }} />
              </div>

              <div className="md:col-start-2 md:row-start-1 md:row-span-3">
                <p className="text-center text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Photo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative w-full aspect-square overflow-hidden">
                    <img src={AVATARS[avatarIndex].src} alt={AVATARS[avatarIndex].id} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => navigateAvatar(-1)} aria-label="Previous avatar"
                      className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-black/40 text-white text-xs hover:bg-black/60 transition">
                      ‹
                    </button>
                    <button type="button" onClick={() => navigateAvatar(1)} aria-label="Next avatar"
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-black/40 text-white text-xs hover:bg-black/60 transition">
                      ›
                    </button>
                  </div>
                  <button type="button" onClick={handlePhotoUpload}
                    className="w-full aspect-square bg-gray-100 flex flex-col items-center justify-center overflow-hidden p-2 cursor-pointer">
                    {uploadedPhoto ? (
                      <img src={uploadedPhoto} alt="Uploaded" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <span className="text-2xl">📷</span>
                        <span className="text-[10px] remar-green font-semibold mt-1 px-1 text-center">Upload photo</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 mt-2 text-center whitespace-nowrap">If no photo is selected or uploaded, system will select one</p>
              </div>

              <div className="md:col-start-2 md:row-start-6">
                <div className="grid items-center gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                  <label className="text-xs text-gray-500">Voice note</label>
                  <span className="text-xs text-gray-500 whitespace-nowrap justify-self-start" style={{ transform: 'translateX(-3mm)' }}>Enable</span>
                  <span className="text-[9px] text-gray-400 whitespace-nowrap justify-self-start" style={{ transform: 'translateX(-3mm)' }}>Face ID</span>
                  <span className="text-[9px] text-gray-400 whitespace-nowrap justify-self-start" style={{ transform: 'translateX(-3mm)' }}>Fingerprint</span>

                  <div className="flex items-center gap-2 min-w-0">
                    <button type="button" onClick={toggleRecording}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition flex-shrink-0 ${
                        isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 remar-green hover:bg-gray-200'
                      }`}>
                      <span className="text-sm">▶</span>
                      Record
                    </button>
                    {voiceNote && !isRecording && (
                      <audio controls src={voiceNote} className="h-8 w-[90px] min-w-0" />
                    )}
                  </div>
                  <div />
                  <button type="button" onClick={() => setFaceIdEnabled(v => !v)}
                    title="Enable Face ID" aria-label="Enable Face ID" aria-pressed={faceIdEnabled}
                    style={{ transform: 'translateX(-3mm)' }}
                    className={`justify-self-start w-8 h-8 flex items-center justify-center rounded-lg border transition ${
                      faceIdEnabled ? 'border-remar bg-gray-200' : 'border-gray-300 bg-gray-100 hover:bg-gray-200'
                    }`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                      className={`w-4 h-4 ${faceIdEnabled ? 'remar-green' : 'text-gray-500'}`}>
                      <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
                      <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
                      <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
                      <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
                      <circle cx="9" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
                      <circle cx="15" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
                      <path d="M9 15c1 1 5 1 6 0" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setFingerprintEnabled(v => !v)}
                    title="Enable fingerprint" aria-label="Enable fingerprint" aria-pressed={fingerprintEnabled}
                    style={{ transform: 'translateX(-3mm)' }}
                    className={`justify-self-start w-8 h-8 flex items-center justify-center rounded-lg border transition ${
                      fingerprintEnabled ? 'border-remar bg-gray-200' : 'border-gray-300 bg-gray-100 hover:bg-gray-200'
                    }`}>
                    <img src="https://fonts.gstatic.com/s/i/materialiconsoutlined/fingerprint/v12/24px.svg" alt=""
                      className="w-4 h-4" style={fingerprintEnabled ? {} : { opacity: 0.6 }} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">About Me <span className="text-gray-400 font-normal">(up to 100 words)</span></label>
              <textarea rows={2} value={profile.about_me}
                onChange={e => setProfile({ ...profile, about_me: e.target.value })}
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">Personality <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(5 words that describe me)</span></label>
              <select value="" disabled={personalityWords.length >= 5}
                onChange={e => addPersonalityWord(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar disabled:opacity-50">
                <option value="">
                  {personalityWords.length >= 5 ? '5 of 5 selected' : 'Choose a word…'}
                </option>
                {PERSONALITY_WORDS.filter(w => !personalityWords.includes(w)).map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              {personalityWords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {personalityWords.map(w => (
                    <span key={w} className="flex items-center gap-1 bg-remar text-white text-xs px-3 py-1 rounded-full">
                      {w}
                      <button type="button" onClick={() => removePersonalityWord(w)}
                        aria-label={`Remove ${w}`} className="font-bold leading-none">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-1 mt-3">Address</p>
            <div className="flex gap-3 mb-1.5">
              <div className="w-4/5">
                <label className="text-[10px] text-gray-500 mb-1 block">Street name</label>
                <input value={profile.street}
                  onChange={e => setProfile({ ...profile, street: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="w-1/5">
                <label className="text-[10px] text-gray-500 mb-1 block whitespace-nowrap">House #</label>
                <input value={profile.houseNumber}
                  onChange={e => setProfile({ ...profile, houseNumber: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
            </div>
            <div className="flex gap-3 mb-1">
              <div className="w-1/2">
                <label className="text-[10px] text-gray-500 mb-1 block">City</label>
                <input value={profile.city}
                  onChange={e => setProfile({ ...profile, city: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div className="w-1/2">
                <label className="text-[10px] text-gray-500 mb-1 block">Pincode <span className="text-red-500">*</span></label>
                <input required value={profile.pincode}
                  onChange={e => setProfile({ ...profile, pincode: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
            </div>
            <button type="button" onClick={useCurrentLocation} disabled={locating}
              className="text-xs remar-green font-semibold hover:underline disabled:opacity-50 mb-2">
              📍 {locating ? 'Detecting location…' : 'Use current location'}
            </button>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Phone number <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input required placeholder="+49" maxLength={6} value={profile.phoneCode}
                  onChange={e => setProfile({ ...profile, phoneCode: formatIsdCode(e.target.value) })}
                  className="w-20 border rounded-lg px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-remar" />
                <input required placeholder="0000000000" maxLength={10} value={profile.phoneNumber}
                  onChange={e => setProfile({ ...profile, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="border-b pb-2">
            <h2 className="font-semibold remar-green mb-1.5">Preferences</h2>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Contact</label>
              <p className="text-[11px] text-gray-400 mb-2">Drag to reorder — most preferred on the left</p>
              <div className="bg-gray-50 rounded-lg p-2 flex gap-1.5">
                {contactOrder.map((c, i) => (
                  <div key={c.key} draggable title={c.label}
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(i)}
                    className="flex items-center justify-center w-7 h-7 flex-shrink-0 bg-gray-100 rounded-lg cursor-move select-none">
                    {c.iconUrl ? (
                      <img src={c.iconUrl} alt={c.label} className="w-4 h-4 object-contain" />
                    ) : c.badgeText ? (
                      <span className="text-[7px] font-extrabold remar-green tracking-tight">{c.badgeText}</span>
                    ) : (
                      <span className="text-sm">{c.icon}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">Regions</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div className="rounded-lg p-3 bg-gray-100">
                  <p className="text-xs font-semibold remar-green mb-2">Select by distance to centre</p>
                  <div className="relative mb-2">
                    <div className="flex items-center gap-2">
                      <input placeholder="Type a location…" value={regionCenterQuery}
                        onChange={e => {
                          const value = e.target.value;
                          if (value && regionMode === 'areas') clearAreasMethod();
                          setRegionCenterQuery(value);
                          if (value) setRegionMode('distance');
                        }}
                        onFocus={() => { if (regionSuggestions.length) setShowRegionSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowRegionSuggestions(false), 150)}
                        className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                      <button type="button" onClick={useCurrentLocationForRegion} disabled={locatingRegion} title="Use my current location"
                        className="flex-shrink-0 w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition disabled:opacity-50">
                        <img src="/location-me-icon.png" alt="" className={`w-6 h-6 object-contain ${locatingRegion ? 'opacity-40' : ''}`} />
                      </button>
                    </div>
                    {showRegionSuggestions && regionSuggestions.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-[calc(100%-44px)] bg-white rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {regionSuggestions.map((s, i) => (
                          <button key={i} type="button" onMouseDown={() => selectRegionSuggestion(s)}
                            className="block w-full text-left px-3 py-2 text-[11px] hover:bg-gray-100 truncate">
                            {s.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="text-[11px] text-gray-500 mb-1 block">Distance (km)</label>
                  <input type="number" min="1" placeholder="e.g. 10" value={regionDistanceKm}
                    onChange={e => {
                      const value = e.target.value;
                      if (value && regionMode === 'areas') clearAreasMethod();
                      setRegionDistanceKm(value);
                      if (value) setRegionMode('distance');
                    }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                  {regionCenter && regionDistanceKm && (
                    <p className="text-[11px] text-gray-500 mt-2">
                      The area within {regionDistanceKm} km of {regionCenter.label} is your preferred region.
                    </p>
                  )}
                </div>

                <div className="flex md:hidden items-center gap-2 -my-1">
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-xs font-semibold text-gray-400">OR</span>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>
                <div className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-xs font-semibold text-gray-400 shadow">
                  OR
                </div>

                <div className="rounded-lg p-3 bg-gray-100">
                  <p className="text-xs font-semibold remar-green mb-2">Select by 5 areas</p>
                  <div className="flex gap-1 mb-2">
                    {preferredAreas.map((a, i) => (
                      <button key={i} type="button" onClick={() => selectAreaTab(i)}
                        className={`w-7 h-7 rounded-full text-xs font-semibold transition ${
                          activeAreaTab === i ? 'bg-remar text-white' : a ? 'bg-gray-200 remar-green' : 'bg-white text-gray-400'
                        }`}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <input placeholder={`Type area ${activeAreaTab + 1}…`} value={preferredAreas[activeAreaTab]}
                        onChange={e => updatePreferredArea(e.target.value)}
                        onFocus={() => { if (areaSuggestions.length) setShowAreaSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 150)}
                        className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                      <button type="button" onClick={useCurrentLocationForArea} disabled={locatingArea} title="Use my current location"
                        className="flex-shrink-0 w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition disabled:opacity-50">
                        <img src="/location-me-icon.png" alt="" className={`w-6 h-6 object-contain ${locatingArea ? 'opacity-40' : ''}`} />
                      </button>
                    </div>
                    {showAreaSuggestions && areaSuggestions.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-[calc(100%-44px)] bg-white rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {areaSuggestions.map((s, i) => (
                          <button key={i} type="button" onMouseDown={() => selectAreaSuggestion(s)}
                            className="block w-full text-left px-3 py-2 text-[11px] hover:bg-gray-100 truncate">
                            {s.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {preferredAreas.some(Boolean) && (
                    <div className="flex flex-col gap-1 mt-2">
                      {preferredAreas.map((a, i) => a && (
                        <div key={i} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2 py-1">
                          <span className="text-[10px] remar-green truncate">{i + 1}. {a}</span>
                          <button type="button" onClick={() => removeArea(i)}
                            aria-label={`Remove area ${i + 1}`}
                            className="text-red-500 font-bold text-xs leading-none flex-shrink-0">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">I can help with</label>
              <div className="bg-gray-50 rounded-lg p-2.5 flex flex-wrap md:flex-nowrap gap-1.5">
                {SKILLS.map(skill => (
                  <div key={skill} className="relative group flex-shrink-0">
                    <button type="button" onClick={() => toggleSkill(skill)}
                      className={`px-2 py-1 rounded-full text-[10px] whitespace-nowrap border transition flex items-center gap-1 ${
                        profile.skills.includes(skill)
                          ? 'bg-remar text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-green-500'
                      }`}>
                      <span className="text-xs leading-none">{SKILL_ICONS[skill]}</span>
                      {skill}
                    </button>
                    {CATEGORY_ITEMS[skill]?.length > 0 && (
                      <div className="pointer-events-none absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64
                        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
                        <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg text-left">
                          {CATEGORY_ITEMS[skill].join(', ')}
                        </div>
                        <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Only shown once 'Professional services' is ticked above — kept
                field-for-field identical to HelperRegister.jsx (license
                number, capped at 100 characters — license formats vary too
                much for stricter validation — and a free-text description of
                professional experience, capped at under 100 words via
                capWordsUnder100). */}
            {profile.skills.includes('Professional services') && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Professional license number</label>
                  <input type="text" maxLength={100} value={profile.professionalLicense}
                    onChange={e => setProfile(p => ({ ...p, professionalLicense: e.target.value.slice(0, 100) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Describe professional experience</label>
                  <textarea rows={3} value={profile.professionalExperience}
                    onChange={e => setProfile(p => ({ ...p, professionalExperience: capWordsUnder100(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-remar" />
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">Availability</label>
              <p className="text-xs text-gray-400 mb-3">Choose at least one time slot of your preferred availability in the week</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="bg-gray-100 remar-green rounded-l-lg px-2 py-2 font-semibold">Preference</th>
                    {DAYS.map((day, i) => (
                      <th key={day} className={`bg-gray-100 remar-green px-1 py-2 font-semibold text-center whitespace-nowrap ${i === DAYS.length - 1 ? 'rounded-r-lg' : ''}`}>
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2].map(prefIndex => (
                    <Fragment key={prefIndex}>
                      <tr className={prefIndex % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td rowSpan={2} className="px-2 py-1 font-semibold text-gray-600 text-center align-middle">
                          {prefIndex + 1}
                        </td>
                        {DAYS.map(day => {
                          const status = getSlotStatus(day, prefIndex);
                          const selectBg = status === 'valid' ? 'bg-green-100' : status === 'invalid' ? 'bg-red-100' : 'bg-white';
                          return (
                            <td key={day} className="p-1">
                              <select value={profile.availability[day][prefIndex].from}
                                onChange={e => updateSlot(day, prefIndex, 'from', e.target.value)}
                                className={`w-full text-[11px] rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-remar transition-colors ${selectBg}`}>
                                <option value="">From</option>
                                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                      <tr className={prefIndex % 2 === 1 ? 'bg-gray-50' : ''}>
                        {DAYS.map(day => {
                          const status = getSlotStatus(day, prefIndex);
                          const selectBg = status === 'valid' ? 'bg-green-100' : status === 'invalid' ? 'bg-red-100' : 'bg-white';
                          return (
                            <td key={day} className="p-1">
                              <select value={profile.availability[day][prefIndex].to}
                                onChange={e => updateSlot(day, prefIndex, 'to', e.target.value)}
                                className={`w-full text-[11px] rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-remar transition-colors ${selectBg}`}>
                                <option value="">To</option>
                                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => navigate('/helper/profile/me')}
              className="flex-1 border-2 border-gray-300 text-gray-500 py-3 rounded-lg font-semibold text-sm whitespace-nowrap hover:bg-gray-100 transition">
              Cancel
            </button>
            <button type="button" onClick={() => setShowPreview(true)}
              className="flex-1 border-2 border-remar remar-green py-3 rounded-lg font-semibold text-sm whitespace-nowrap hover:bg-gray-100 transition">
              Preview
            </button>
            <button type="submit" className="flex-1 bg-remar text-white py-3 rounded-lg font-semibold text-sm whitespace-nowrap hover:bg-remar transition">
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold remar-green">Preview</h2>
              <button type="button" onClick={() => setShowPreview(false)} aria-label="Close preview"
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>
            <div className="border-b pb-6 mb-4">
              <h3 className="font-semibold remar-green mb-2 text-sm">Basic information</h3>
              <div className="flex gap-3 mb-3">
                <img src={uploadedPhoto || AVATARS[avatarIndex].src} alt="Photo"
                  className="w-16 h-16 object-cover flex-shrink-0" />
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="text-gray-400">Nickname:</span> {profile.nickname || lastName || '—'}</p>
                  <p><span className="text-gray-400">Gender:</span> {profile.gender || '—'}</p>
                  <p><span className="text-gray-400">Age group:</span> {getAgeDecade(profile.date_of_birth) || '—'}</p>
                  <p><span className="text-gray-400">City:</span> {profile.city || derivedCity || '—'}</p>
                </div>
              </div>
              {profile.about_me && (
                <p className="text-sm text-gray-600 mb-2"><span className="text-gray-400">About Me:</span> {profile.about_me}</p>
              )}
              <p className="text-sm text-gray-600"><span className="text-gray-400">Personality:</span> {personalityWords.join(', ') || '—'}</p>
            </div>

            <div>
              <h3 className="font-semibold remar-green mb-2 text-sm">Preferences</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="text-gray-400">Contact:</span> {contactOrder.map(c => c.label).join(' > ')}</p>
                <p>
                  <span className="text-gray-400">Regions:</span>{' '}
                  {regionMode === 'distance' && regionCenter
                    ? `Within ${regionDistanceKm} km of ${regionCenter.label}`
                    : regionMode === 'areas' && preferredAreas.some(Boolean)
                    ? preferredAreas.filter(Boolean).join(', ')
                    : '—'}
                </p>
                <p><span className="text-gray-400">I can help with:</span> {profile.skills.length ? profile.skills.map(s => `${SKILL_ICONS[s] || ''} ${s}`).join(', ') : '—'}</p>
                {profile.skills.includes('Professional services') && (
                  <p><span className="text-gray-400">Professional license number / Experience:</span> {[profile.professionalLicense, profile.professionalExperience].filter(Boolean).join(' — ') || '—'}</p>
                )}
                <p><span className="text-gray-400">Availability:</span> {getAvailabilitySummary().join(', ') || '—'}</p>
              </div>
            </div>

            <button type="button" onClick={() => setShowPreview(false)}
              className="w-full mt-5 bg-remar text-white py-2 rounded-lg font-semibold text-sm hover:bg-remar transition">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
