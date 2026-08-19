import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { formatDate } from '../../utils/helpStatus';
import ProfilePopup from '../../components/ProfilePopup';
import PhotoLightbox from '../../components/PhotoLightbox';

// Filter-panel version of NewHelp.jsx's LOGISTICS_OPTIONS — worded from the
// current viewer's own perspective rather than the item creator's, but the
// same canonical 'pickup'/'dropoff' values underneath, so a beneficiary's
// "I can pick up" matches items whose helper creator checked "Pick up from
// my location" (both mean "collectable from the creator's own location"),
// and likewise for 'dropoff'.
const LOGISTICS_FILTER_OPTIONS = {
  helper: [
    { value: 'pickup', label: 'Pick up from my location' },
    { value: 'dropoff', label: 'I can drop off' },
  ],
  beneficiary: [
    { value: 'pickup', label: 'I can pick up' },
    { value: 'dropoff', label: 'Drop off at my location' },
  ],
};
const LOGISTICS_FILTER_LABEL = { helper: 'Delivery preference', beneficiary: 'Collection preference' };

// Compact badge text for a Help ID row in a person list (helper/beneficiary-
// agnostic — just names the two real-world options plainly) — the full,
// role-worded breakdown only appears in the Help detail popup (see
// LOGISTICS_FILTER_OPTIONS above and the detailHelp popup below).
const LOGISTICS_SHORT_LABEL = { pickup: 'Pickup', dropoff: 'Drop-off' };

// A person's helps, narrowed to just the ones that actually match the
// current delivery/collection-preference filter — used wherever a person's
// help list is rendered, so an active filter only shows the matching Help
// IDs instead of every Help ID that person happens to have (see
// matchesFilters above, which only decides whether the *person* qualifies
// at all). Returns every help unfiltered when no logistics filter is set.

// ─────────────────────────────────────────────────────────────────────────
// Markers on this map are real people only — sourced from open/assigned
// help items (server/routes/help.js GET /help/map) and placed at their
// registered address, worldwide (falling back to a best-effort geocode of
// that address if it wasn't already resolved at registration time). At
// first load the map zooms in on the viewer's preferred area — resolved
// from router navigation state (distance-to-centre or the 5 areas) if the
// caller passed one; the app currently only ever reaches /map via the
// bottom nav with no state, so in practice this falls back to Zürich city
// centre every time (the registration pages' old "Map view" link, which
// used to pass the in-progress Regions selection this way, was removed).
// Every real marker stays loaded the whole time though (nothing is scoped
// to that area), so panning or zooming out to anywhere else in the world
// reveals whoever's there too.
//
// Marker detail scales with zoom: zoomed out (below ZOOM_THRESHOLD), each
// person is just a small round photo pin, so wide/world views stay
// readable; zoomed in to street level, the same pin expands to show their
// open help-item category icons alongside the photo.
//
// The right-hand filter panel lets you re-search a location (recenters the
// map) and filter by help category, applied client-side against the real
// data above.
// ─────────────────────────────────────────────────────────────────────────

// Below this zoom level, markers collapse to a plain photo pin (no category
// badges) — meant for "look at a whole region/country/world" views. At or
// above it, the full marker (photo + category icons) renders — meant for
// "I've zoomed in on a specific place" views. Leaflet zoom: 0 = whole
// world, ~10-12 = city, 16+ = street level. Set to match the map's default
// initial zoom (12) so the full marker is what's shown as soon as someone
// lands on their preferred area, same as before this was zoom-dependent —
// it only simplifies to a plain pin once they zoom back out past that.
const ZOOM_THRESHOLD = 12;

// Default view when the helper hasn't selected a preferred area/region.
const ZURICH_CENTRE = { label: 'Zürich city centre', lat: 47.3769, lon: 8.5417 };

const DEFAULT_PREFERRED_AREAS = [
  { ...ZURICH_CENTRE, radiusKm: 8 },
];

// Turns the Regions selection passed from HelperRegister into an array of
// { label, lat, lon, radiusKm }. Distance-to-centre mode already carries
// coordinates; 5-areas mode only stored free-text labels, so those are
// geocoded here via the same free Nominatim search used on the registration
// page. Falls back to the Zürich default if nothing usable was selected.
async function resolvePreferredAreas(passedRegion) {
  if (!passedRegion) return DEFAULT_PREFERRED_AREAS;
  const { regionMode, regionCenter, regionDistanceKm, preferredAreas } = passedRegion;

  if (regionMode === 'distance' && regionCenter?.lat && regionCenter?.lon) {
    return [{
      label: regionCenter.label,
      lat: parseFloat(regionCenter.lat),
      lon: parseFloat(regionCenter.lon),
      radiusKm: Number(regionDistanceKm) > 0 ? Number(regionDistanceKm) : 8,
    }];
  }

  if (regionMode === 'areas' && Array.isArray(preferredAreas) && preferredAreas.some(Boolean)) {
    const labels = preferredAreas.filter(Boolean);
    const results = await Promise.all(labels.map(async (label) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`);
        const data = await res.json();
        if (data[0]) return { label, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), radiusKm: 3 };
      } catch (err) {
        // Geocoding failed for this area — just skip it rather than block the others.
      }
      return null;
    }));
    const valid = results.filter(Boolean);
    if (valid.length) return valid;
  }

  return DEFAULT_PREFERRED_AREAS;
}

// Resolves the signed-in helper/beneficiary's own saved preferred region —
// helpers/beneficiaries.preferred_regions, set at registration or Edit
// Profile (see HelperRegister.jsx/BeneficiaryRegister.jsx's Regions
// section) — into the same { label, lat, lon, radiusKm }[] shape the map
// shading needs. The app only ever reaches /map via the bottom nav with no
// router state, so resolvePreferredAreas(location.state) above was always
// falling through to the hardcoded Zürich default regardless of what the
// signed-in person had actually registered — this reads their real saved
// choice instead. Falls back to resolvePreferredAreas(passedRegion) (in
// case some future caller does pass router state) and finally to Zürich if
// the person never set a preferred region at all.
async function resolveOwnPreferredAreas(passedRegion, role) {
  if (role === 'helper' || role === 'beneficiary') {
    try {
      const res = await api.get(role === 'helper' ? '/helpers/me' : '/beneficiaries/me');
      const stored = res.data?.preferred_regions;
      if (stored?.mode === 'distance' && stored.center?.lat && stored.center?.lon) {
        return [{
          label: stored.center.label || 'Preferred centre',
          lat: parseFloat(stored.center.lat),
          lon: parseFloat(stored.center.lon),
          radiusKm: Number(stored.distance_km) > 0 ? Number(stored.distance_km) : 8,
        }];
      }
      if (stored?.mode === 'areas' && Array.isArray(stored.areas) && stored.areas.some(Boolean)) {
        const labels = stored.areas.filter(Boolean);
        const results = await Promise.all(labels.map(async (label) => {
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`);
            const data = await geoRes.json();
            if (data[0]) return { label, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), radiusKm: 3 };
          } catch (err) {
            // Geocoding failed for this area — just skip it rather than block the others.
          }
          return null;
        }));
        const valid = results.filter(Boolean);
        if (valid.length) return valid;
      }
    } catch (err) {
      // No profile yet, or the request failed — fall through to the legacy/default path.
    }
  }
  return resolvePreferredAreas(passedRegion);
}

const HELP_CATEGORIES = {
  'Food': { icon: '🍎', color: '#579500' },
  'Toiletries': { icon: '🧴', color: '#0B84A5' },
  'Clothes': { icon: '👕', color: '#E0546B' },
  'Social services': { icon: '🤝', color: '#B0479E' },
  'Professional services': { icon: '💼', color: '#00897B' },
  'Money': { icon: '💰', color: '#C98A1F' },
};
const CATEGORY_KEYS = Object.keys(HELP_CATEGORIES);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

// Cached across re-renders (and across this page's whole lifetime) so
// re-opening Map View doesn't needlessly re-geocode the same addresses.
const addressGeocodeCache = new Map();

// Best-effort geocode of a plain-text address — a free Nominatim search,
// worldwide (no country appended: people's help items can be located
// anywhere, not just Switzerland). Used as a fallback for real people whose
// profile was never successfully geocoded at registration time (address
// that didn't resolve, geocoding request that failed, etc.).
async function geocodeFallback(address) {
  if (!address) return null;
  if (addressGeocodeCache.has(address)) return addressGeocodeCache.get(address);
  let point = null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
    const data = await res.json();
    if (data[0]) point = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (err) {
    // Leave point null — this address just won't get a marker.
  }
  addressGeocodeCache.set(address, point);
  return point;
}

// Real still-open (not yet Matched) help items (server/routes/help.js GET
// /help/map),
// grouped by person into one marker each — one helper or beneficiary can
// have several open items at once, but only needs a single pin collecting
// every category they currently have open. Only rows created by `role`
// are relevant (a helper's map shows beneficiaries requesting help, and
// vice versa — see entityRole below).
async function loadRealPeople(role) {
  let rows = [];
  try {
    const res = await api.get('/help/map');
    rows = res.data.filter((r) => r.creator_role === role);
  } catch (err) {
    return [];
  }
  const byPerson = new Map();
  for (const row of rows) {
    if (!row.profile_id) continue;
    if (!byPerson.has(row.profile_id)) {
      // Only a true nickname goes in `nickname` here (unlike the old
      // person_name, which already fell back to the full name) — surname is
      // derived below so the Map View list/popups can show "nickname, or
      // surname if there isn't one" as their own two-step fallback, per how
      // they're meant to display a person's name.
      const fullName = row.person_full_name || '';
      const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
      const surname = nameParts.length ? nameParts[nameParts.length - 1] : '';
      byPerson.set(row.profile_id, {
        id: row.profile_id,
        nickname: row.person_nickname || '',
        fullName,
        surname,
        photo: row.photo_url || null,
        lat: row.latitude != null ? parseFloat(row.latitude) : null,
        lon: row.longitude != null ? parseFloat(row.longitude) : null,
        address: row.address,
        categories: new Set(),
        slots: [],
        helps: [],
      });
    }
    const person = byPerson.get(row.profile_id);
    if (row.category) person.categories.add(row.category);
    // One entry per help row — a person can have several open help items at
    // once, each shown individually (Item + Help ID) in the Map View lists
    // and popup, rather than just the merged category badges used on pins.
    person.helps.push({
      id: row.help_row_id,
      help_id: row.help_id,
      title: row.title,
      description: row.description,
      category: row.category,
      sub_category: row.sub_category,
      quantity: row.quantity,
      unit: row.unit,
      condition: row.condition,
      age_value: row.age_value,
      age_unit: row.age_unit,
      photo_urls: row.photo_urls,
      logistics_preference: row.logistics_preference,
      created_at: row.created_at,
      location_city: row.location_city,
      location_pincode: row.location_pincode,
      is_online: row.is_online,
    });
  }
  const people = Array.from(byPerson.values());
  await Promise.all(people.map(async (p) => {
    if (p.lat == null || p.lon == null) {
      const point = await geocodeFallback(p.address);
      if (point) { p.lat = point.lat; p.lon = point.lon; }
    }
  }));
  // Anyone still without coordinates has no usable address to place a pin
  // at all — nothing more that can be done for them here.
  return people.filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({ ...p, categories: Array.from(p.categories) }));
}

// Whether a beneficiary satisfies the current filter panel selections.
// logistics is a list of canonical values ('pickup'/'dropoff') — a person
// matches if ANY of their open help items carries ANY of the selected
// values, same "match if any item qualifies" behaviour as categories above.
function matchesFilters(b, { categories, day, from, to, logistics }) {
  if (categories.length && !b.categories.some((c) => categories.includes(c))) return false;
  if (day) {
    const daySlots = b.slots.filter((s) => s.day === day);
    if (!daySlots.length) return false;
    if (from && to) {
      const overlaps = daySlots.some((s) => s.from < to && s.to > from);
      if (!overlaps) return false;
    }
  }
  if (logistics && logistics.length) {
    const anyMatch = (b.helps || []).some((h) => Array.isArray(h.logistics_preference) && h.logistics_preference.some((v) => logistics.includes(v)));
    if (!anyMatch) return false;
  }
  return true;
}

// See the comment above LOGISTICS_SHORT_LABEL.
function filterHelpsByLogistics(helps, logistics) {
  if (!logistics || !logistics.length) return helps;
  return (helps || []).filter((h) => Array.isArray(h.logistics_preference) && h.logistics_preference.some((v) => logistics.includes(v)));
}

export default function MapView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isHelper = user?.role === 'helper';
  // Admin is the creator of every Remar Store item (fronted by one of its
  // two system accounts) — no Request/Apply button makes sense on the
  // item's own creator's popup, see the detail-popup button row below.
  const isAdmin = user?.role === 'admin';
  // Markers on this map represent "the other role" relative to whoever's
  // looking: a helper sees beneficiaries who need help, a beneficiary sees
  // helpers who can help them. The underlying mock data is shared (it's all
  // dummy people either way) — only the label and profile link change.
  const entityRole = isHelper ? 'beneficiary' : 'helper';
  const entityLabel = isHelper ? 'Beneficiary' : 'Helper';
  // Plural form for section headers listing multiple people at once (e.g. a
  // beneficiary viewing the map sees "Helpers", a helper sees
  // "Beneficiaries") — irregular plural, can't just append "s".
  const entityLabelPlural = isHelper ? 'Beneficiaries' : 'Helpers';
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const allBeneficiariesRef = useRef(null);
  const selectedMarkerElRef = useRef(null);
  const lastFilterSelectionRef = useRef('');

  const [selectedId, setSelectedId] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState(null); // resolved once the preferred area is known
  const [mapReady, setMapReady] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [visibleList, setVisibleList] = useState([]);
  const [realCount, setRealCount] = useState(0);
  // Current map zoom, kept in sync via the 'zoomend' listener below — drives
  // whether markers render as simple photo pins or full photo+category
  // icons (see ZOOM_THRESHOLD).
  const [zoom, setZoom] = useState(12);
  // Bumped on every 'moveend' (pan or zoom — Leaflet fires it for both), so
  // the effect below re-reads the map's current bounds and recomputes who's
  // actually in view. Not the bounds object itself, so the effect doesn't
  // need a deep-equality check on a Leaflet LatLngBounds instance.
  const [boundsTick, setBoundsTick] = useState(0);
  // Everyone matching the filters AND currently inside the map's visible
  // bounds — shown in the "In this map view" list below the Filter panel.
  // Grows/shrinks automatically as the map is panned/zoomed.
  const [viewportList, setViewportList] = useState([]);
  // The help item currently shown in the details popup — { help, person } —
  // or null when the popup is closed.
  const [detailHelp, setDetailHelp] = useState(null);
  // Whichever profile is currently shown as a popup — { id, role } — instead
  // of navigating to the full PublicProfile page. Kept separate from
  // detailHelp so the help-details popup's own "view profile" action can
  // open this on top of/after it.
  const [profilePopup, setProfilePopup] = useState(null);
  // Full-size view of a tapped photo thumbnail in the help detail popup —
  // see PhotoLightbox.
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Feedback shown right after Select — 'sent' | 'error' | null — auto
  // clears itself; kept simple rather than a full toast system since it
  // only ever needs to confirm one thing.
  const [selectFeedback, setSelectFeedback] = useState(null);
  // Bottom sheet that overlays the map — collapsed shows just a "List View"
  // handle, tapping it (or the handle at the bottom of the expanded sheet,
  // labeled "Map view") toggles between the two.
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Filter panel state
  const [filterQuery, setFilterQuery] = useState('');
  const [filterSuggestions, setFilterSuggestions] = useState([]);
  const [showFilterSuggestions, setShowFilterSuggestions] = useState(false);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterDay, setFilterDay] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  // Collection preference (a beneficiary filtering helper offers) / Delivery
  // preference (a helper filtering beneficiary requests) — canonical
  // 'pickup'/'dropoff' values, worded from the current viewer's own
  // perspective (see LOGISTICS_FILTER_OPTIONS below), matched against
  // whatever each item's creator selected on New Help (see NewHelp.jsx and
  // matchesFilters above).
  const [filterLogistics, setFilterLogistics] = useState([]);
  const toggleFilterLogistics = (value) => setFilterLogistics((prev) =>
    (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const selectedBeneficiary = (beneficiaries || []).find((b) => b.id === selectedId) || null;

  const toggleFilterCategory = (cat) => {
    setFilterCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const selectFilterSuggestion = (item) => {
    lastFilterSelectionRef.current = item.display_name;
    setFilterQuery(item.display_name);
    setFilterSuggestions([]);
    setShowFilterSuggestions(false);
    mapRef.current?.flyTo([parseFloat(item.lat), parseFloat(item.lon)], 13);
  };

  // Debounced live-search for the "search a location" filter field.
  useEffect(() => {
    if (!filterQuery.trim() || filterQuery === lastFilterSelectionRef.current) {
      setFilterSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(filterQuery)}`);
        const data = await res.json();
        setFilterSuggestions(data);
        setShowFilterSuggestions(true);
      } catch (err) {
        setFilterSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [filterQuery]);

  // Builds one beneficiary marker and wires up click-to-select. Two modes,
  // switched by current map zoom (see ZOOM_THRESHOLD): zoomed out, just a
  // small round photo pin — enough to place someone without cluttering a
  // wide-area/world view; zoomed in, the full marker — a square photo plus
  // translucent category-icon badges to its right (filling a 2x2 grid
  // column-first) for their open help items.
  const buildBeneficiaryMarker = (L, b, currentZoom) => {
    const zoomedIn = currentZoom >= ZOOM_THRESHOLD;
    // Real people don't always have a profile photo — falls back to a
    // plain initial badge instead of a broken <img>. Every variant shares
    // the "marker-photo" class so the click handler below can outline
    // whichever one actually rendered without caring which it is.
    const initial = (b.nickname || b.surname || '?').charAt(0).toUpperCase();

    if (!zoomedIn) {
      const photoHtml = b.photo
        ? `<img src="${b.photo}" class="marker-photo" style="width:30px;height:30px;border-radius:50%;border:2px solid #579500;object-fit:cover;box-shadow:0 1px 4px rgba(0,0,0,0.35);" />`
        : `<div class="marker-photo" style="width:30px;height:30px;border-radius:50%;border:2px solid #579500;background:#e5efe0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#3d6a00;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${initial}</div>`;
      const icon = L.divIcon({ html: photoHtml, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
      const marker = L.marker([b.lat, b.lon], { icon });
      marker.on('click', () => {
        if (selectedMarkerElRef.current) {
          const prevPhoto = selectedMarkerElRef.current.querySelector('.marker-photo');
          if (prevPhoto) prevPhoto.style.outline = 'none';
        }
        const el = marker.getElement();
        const photo = el?.querySelector('.marker-photo');
        if (photo) photo.style.outline = '3px solid #3d6a00';
        selectedMarkerElRef.current = el;
        setSelectedId(b.id);
      });
      return marker;
    }

    const iconCells = b.categories.map((cat) => `
      <div style="width:20px;height:20px;background:rgba(0,0,0,0.45);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;">${HELP_CATEGORIES[cat]?.icon || ''}</div>
    `).join('');
    const photoHtml = b.photo
      ? `<img src="${b.photo}" class="marker-photo" style="width:40px;height:40px;border-radius:6px;border:2px solid #579500;object-fit:cover;box-shadow:0 1px 4px rgba(0,0,0,0.35);" />`
      : `<div class="marker-photo" style="width:40px;height:40px;border-radius:6px;border:2px solid #579500;background:#e5efe0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#3d6a00;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${initial}</div>`;
    const html = `
      <div style="display:flex;align-items:flex-start;gap:3px;">
        ${photoHtml}
        <div style="display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,20px);grid-auto-columns:20px;gap:2px;">
          ${iconCells}
        </div>
      </div>
    `;
    const icon = L.divIcon({ html, className: '', iconSize: [86, 42], iconAnchor: [20, 42] });
    const marker = L.marker([b.lat, b.lon], { icon });
    marker.on('click', () => {
      if (selectedMarkerElRef.current) {
        const prevPhoto = selectedMarkerElRef.current.querySelector('.marker-photo');
        if (prevPhoto) prevPhoto.style.outline = 'none';
      }
      const el = marker.getElement();
      const photo = el?.querySelector('.marker-photo');
      if (photo) photo.style.outline = '3px solid #3d6a00';
      selectedMarkerElRef.current = el;
      setSelectedId(b.id);
    });
    return marker;
  };

  // Re-renders beneficiary markers on the map according to the current
  // filters. Runs once markers/data are ready, then again on every filter
  // change — clearing the selection each time since a selected beneficiary
  // may have been filtered out.
  useEffect(() => {
    const L = window.L;
    const layer = markerLayerRef.current;
    if (!mapReady || !L || !layer || !allBeneficiariesRef.current) return;

    layer.clearLayers();
    selectedMarkerElRef.current = null;
    setSelectedId(null);

    const filters = { categories: filterCategories, day: filterDay, from: filterFrom, to: filterTo, logistics: filterLogistics };
    const matched = [];
    allBeneficiariesRef.current.forEach((b) => {
      if (!matchesFilters(b, filters)) return;
      matched.push(b);
      layer.addLayer(buildBeneficiaryMarker(L, b, zoom));
    });
    setVisibleCount(matched.length);
    setVisibleList(matched);
  }, [mapReady, filterCategories, filterDay, filterFrom, filterTo, filterLogistics, zoom]);

  // "In this map view" list (below the Filter panel) — everyone matching the
  // filters whose marker currently sits inside the map's visible bounds.
  // Re-reads the live bounds on every pan/zoom (boundsTick) rather than
  // storing a snapshot, so it can't go stale relative to the map itself.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !allBeneficiariesRef.current) return;
    const bounds = map.getBounds();
    const filters = { categories: filterCategories, day: filterDay, from: filterFrom, to: filterTo, logistics: filterLogistics };
    const inView = allBeneficiariesRef.current.filter(
      (b) => matchesFilters(b, filters) && bounds.contains([b.lat, b.lon])
    );
    setViewportList(inView);
  }, [mapReady, filterCategories, filterDay, filterFrom, filterTo, filterLogistics, boundsTick, zoom]);

  // Selecting a beneficiary from the List View sheet: highlight it the same
  // way clicking its marker would (so the map is already centred on them
  // whenever the sheet does get collapsed) and show their details in the
  // "Beneficiary details" panel below — but stay on List View rather than
  // jumping back to the map.
  // Shared between the "In this map view" card (below the Filter panel) and
  // the List View sheet — both show the same shape of data (every person
  // matching the current filters + map bounds, each with their individual
  // open help items), just in two different places on screen, and only one
  // of the two is ever visible at once (see sheetExpanded below).
  const renderPersonHelpsList = (list, emptyText) => (
    <div className="space-y-3">
      {list.map((p) => (
        <div key={p.id} className="border border-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            {p.photo ? (
              <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-remar-light flex items-center justify-center text-xs font-bold remar-green flex-shrink-0">
                {(p.nickname || p.surname || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <button type="button" onClick={() => setProfilePopup({ id: p.id, role: entityRole })}
              className="text-sm font-semibold text-gray-800 truncate hover:underline text-left">
              {p.nickname || p.surname}
            </button>
          </div>
          <div className="space-y-1">
            {/* Narrowed to just the Help IDs that actually match the active
                delivery/collection-preference filter (see item 8) — showing
                every Help ID this person has, filter or not, made the filter
                look broken. */}
            {filterHelpsByLogistics(p.helps, filterLogistics).map((h) => (
              <button key={h.id} type="button" onClick={() => setDetailHelp({ help: h, person: p })}
                className="w-full flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 text-left transition">
                <span className="w-5 h-5 flex items-center justify-center rounded bg-white shadow-sm text-sm flex-shrink-0">
                  {HELP_CATEGORIES[h.category]?.icon}
                </span>
                <span className="truncate text-gray-700 flex-1">{h.title}</span>
                {Array.isArray(h.logistics_preference) && h.logistics_preference.length > 0 && (
                  <span className="text-[10px] font-semibold text-white bg-[#3a6b00] rounded-full px-1.5 py-0.5 flex-shrink-0">
                    {h.logistics_preference.map((v) => LOGISTICS_SHORT_LABEL[v] || v).join(' + ')}
                  </span>
                )}
                <span className="text-gray-400 flex-shrink-0 ml-2">{h.help_id}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {list.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">{emptyText}</p>
      )}
    </div>
  );

  // Select on a help item's popup — a beneficiary selecting a helper's own
  // offered item sends the new beneficiary->helper request (POST
  // /assignments/request, status Requested); a helper selecting a
  // beneficiary's request applies to it via the existing helper-applies
  // endpoint (POST /assignments/apply), left completely unmodified. Either
  // way this only ever creates a pending assignment — acceptance happens
  // on the Help Status page (see HelpStatus.jsx's Accept/Reject).
  const [selecting, setSelecting] = useState(false);
  // The consumer's own chosen subset of the creator's offered logistics
  // options for whichever Help ID is currently open in the detail popup —
  // reset every time a different one is opened (see the effect below).
  // Required (at least one) before Request is enabled whenever the item
  // actually has options to choose from — see item 9.
  const [acceptedLogistics, setAcceptedLogistics] = useState([]);
  const toggleAcceptedLogistics = (value) => setAcceptedLogistics((prev) =>
    (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  useEffect(() => { setAcceptedLogistics([]); }, [detailHelp?.help?.id]);

  const handleSelect = async (help) => {
    setSelecting(true);
    setSelectFeedback(null);
    try {
      const endpoint = isHelper ? '/assignments/apply' : '/assignments/request';
      await api.post(endpoint, { help_row_id: help.id, logistics_preference: acceptedLogistics.length ? acceptedLogistics : undefined });
      setDetailHelp(null);
      setSelectFeedback({ type: 'sent', text: isHelper ? 'Application sent.' : 'Request sent to the helper.' });
    } catch (err) {
      setSelectFeedback({ type: 'error', text: err.response?.data?.error || 'Could not send this request — please try again.' });
    } finally {
      setSelecting(false);
    }
  };

  useEffect(() => {
    if (!selectFeedback) return;
    const t = setTimeout(() => setSelectFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [selectFeedback]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (cancelled || mapRef.current) return;
      if (!window.L) {
        // Leaflet is loaded via a CDN <script> tag in index.html; if it
        // hasn't finished loading yet (slow network), poll briefly.
        setTimeout(init, 100);
        return;
      }
      const L = window.L;

      const [resolvedAreas, realPeople] = await Promise.all([
        resolveOwnPreferredAreas(location.state, user?.role),
        loadRealPeople(entityRole),
      ]);
      if (cancelled) return;
      setRealCount(realPeople.length);

      allBeneficiariesRef.current = realPeople;
      setBeneficiaries(realPeople);

      // Leaflet needs a center/zoom set before any layer can compute bounds
      // (getBounds()/fitBounds() below would throw on an unset map view).
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true })
        .setView([ZURICH_CENTRE.lat, ZURICH_CENTRE.lon], 12);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Highlight each preferred area — just a bold dashed outline plus
      // shaded fill, no separate pin/label icon on top (a plain shaded
      // region reads as "this is your preferred area" without adding a
      // marker that competes with the real people pins). The map itself has
      // no bounds restriction, so other areas stay fully pannable/zoomable.
      const areaShapes = resolvedAreas.map((area) => (
        L.circle([area.lat, area.lon], {
          radius: area.radiusKm * 1000,
          color: '#3d6a00',
          weight: 3,
          dashArray: '8 6',
          fillColor: '#579500',
          fillOpacity: 0.18,
        }).addTo(map).bindPopup(`Preferred area: ${area.label}`)
      ));

      // Beneficiary markers live in their own layer group so the filter
      // effect above can clear and re-populate them independently.
      markerLayerRef.current = L.layerGroup().addTo(map);

      // Keeps `zoom` state in sync with the live map, whether the zoom
      // change came from scroll/pinch, the +/- controls, or a flyTo() call
      // (search suggestion, List View row) — the marker-render effect
      // watches `zoom` and swaps between simple pins and full icons.
      map.on('zoomend', () => setZoom(map.getZoom()));

      // Leaflet fires 'moveend' after both panning and zooming settle — one
      // listener covers everything that can change which bounds are visible.
      map.on('moveend', () => setBoundsTick((t) => t + 1));

      // Zoom in on the preferred area(s) plus any real people's markers, so
      // nothing ends up out of view somewhere the person has to go hunting
      // for it. The map itself has no bounds restriction, so panning or
      // zooming out anywhere else in the world still works and still shows
      // whoever real is there.
      const fitTargets = [...areaShapes.map((s) => s.getBounds()), ...realPeople.map((p) => [p.lat, p.lon])];
      if (fitTargets.length) {
        const bounds = L.latLngBounds(fitTargets);
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
      }
      setZoom(map.getZoom());

      setMapReady(true);

      // Leaflet measures its container's size once, at init, and caches it —
      // if that happens while the tab is backgrounded/minimized or mid-layout
      // (container reporting 0×0 or a stale size), the map renders blank
      // until told to re-measure. Covers that plus the tab coming back into
      // focus and the window being resized, all of which can leave a stale
      // cached size.
      const revalidate = () => map.invalidateSize();
      requestAnimationFrame(revalidate);
      setTimeout(revalidate, 300);
      document.addEventListener('visibilitychange', revalidate);
      window.addEventListener('resize', revalidate);
      map.__cleanupRevalidate = () => {
        document.removeEventListener('visibilitychange', revalidate);
        window.removeEventListener('resize', revalidate);
      };
    };

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.__cleanupRevalidate?.();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    // mt-[5mm] shifts the title + everything below it down slightly to clear
    // a device camera cutout, on top of the usual py-6 top padding.
    <div className="min-h-screen bg-gray-50 py-6 px-4 pb-28 mt-[5mm]">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold remar-green mb-4">{isHelper ? 'All Help Required' : 'All Help Available'}</h1>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Map + dashboard */}
          <div className="flex-1 min-w-0">
            <div className="relative w-full h-[70vh] rounded-2xl shadow-lg overflow-hidden">
              <div ref={containerRef} className="absolute inset-0" />

              {/* List View bottom sheet — collapsed, it's just a handle
                  strip sitting over the bottom of the map; tapping it (or
                  dragging it up, on a touch device) slides the full list up
                  to cover the map. The expanded sheet's own bottom handle
                  ("Map view") slides it back down.
                  z-index is explicit and set above Leaflet's own panes/
                  controls (which top out at 1000, for .leaflet-top/-bottom)
                  — without it, the map's tiles (loaded async, arriving
                  roughly a second after the page does) paint over the
                  sheet instead of the other way around. */}
              <div
                className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.18)] flex flex-col transition-transform duration-300 ease-out"
                style={{ height: '100%', zIndex: 1000, transform: sheetExpanded ? 'translateY(0)' : 'translateY(calc(100% - 52px))' }}
              >
                {!sheetExpanded && (
                  <button type="button" onClick={() => setSheetExpanded(true)}
                    className="flex-shrink-0 flex flex-col items-center justify-center gap-1 py-2.5">
                    <span className="w-10 h-1 rounded-full bg-gray-300" />
                    <span className="text-xs font-semibold text-gray-500">▲ List View</span>
                  </button>
                )}

                {sheetExpanded && (
                  <>
                    {/* Same viewport-scoped data as the "In this map view"
                        card below the Filter panel (see renderPersonHelpsList)
                        — whoever's currently inside the map's visible bounds,
                        each with their individual help items. The map itself
                        is fully covered while this is open, so what's shown
                        here reflects wherever it was scrolled/zoomed to right
                        before List View was opened (and refreshes again the
                        next time it's reopened after panning/zooming). */}
                    <div className="flex-1 overflow-y-auto px-4">
                      <h3 className="text-sm font-semibold remar-green sticky top-0 bg-white pt-3 pb-2">
                        {viewportList.length} {viewportList.length === 1 ? 'result' : 'results'}
                      </h3>
                      <div className="pb-2">
                        {renderPersonHelpsList(viewportList, 'No one matches the current filters or map view.')}
                      </div>
                    </div>

                    <button type="button" onClick={() => setSheetExpanded(false)}
                      className="flex-shrink-0 flex flex-col items-center justify-center gap-1 py-2.5 border-t border-gray-100">
                      <span className="w-10 h-1 rounded-full bg-gray-300" />
                      <span className="text-xs font-semibold text-gray-500">▼ Map view</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-2 mb-4">
              {realCount > 0
                ? `Showing ${visibleCount} of ${realCount} ${entityRole}s with an open help item near you.`
                : `No ${entityRole}s with an open help item and a usable address yet.`}
            </p>

            {/* Dashboard — details for the selected marker (a beneficiary if
                you're a helper, a helper if you're a beneficiary) */}
            <div className="bg-white rounded-2xl shadow p-4">
              <h2 className="text-sm font-semibold remar-green mb-3">{entityLabel} details</h2>
              {selectedBeneficiary ? (
                <div className="space-y-1.5">
                  <button type="button"
                    onClick={() => setProfilePopup({ id: selectedBeneficiary.id, role: entityRole })}
                    className="text-sm font-semibold text-remar underline hover:text-[#3d6a00] transition">
                    {selectedBeneficiary.nickname || selectedBeneficiary.surname}
                  </button>
                  {filterHelpsByLogistics(selectedBeneficiary.helps, filterLogistics).map((h) => (
                    <button key={h.id} type="button" onClick={() => setDetailHelp({ help: h, person: selectedBeneficiary })}
                      className="w-full flex items-center gap-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-left transition">
                      <span className="w-6 h-6 flex items-center justify-center rounded bg-white shadow-sm text-sm flex-shrink-0">
                        {HELP_CATEGORIES[h.category]?.icon}
                      </span>
                      <span className="truncate flex-1">{h.title}</span>
                      {Array.isArray(h.logistics_preference) && h.logistics_preference.length > 0 && (
                        <span className="text-[10px] font-semibold text-white bg-[#3a6b00] rounded-full px-1.5 py-0.5 flex-shrink-0">
                          {h.logistics_preference.map((v) => LOGISTICS_SHORT_LABEL[v] || v).join(' + ')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 flex-shrink-0">{h.help_id}</span>
                    </button>
                  ))}
                  {filterHelpsByLogistics(selectedBeneficiary.helps, filterLogistics).length === 0 && (
                    <p className="text-xs text-gray-400">No open help items.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Select a {entityLabel.toLowerCase()} on the map to see their details here.</p>
              )}
            </div>
          </div>

          {/* Filter panel */}
          <div className="w-full lg:w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow p-4 space-y-5">
              <h2 className="text-sm font-semibold remar-green">Filter</h2>

              <div className="relative">
                <label className="text-xs text-gray-500 mb-1 block">Location</label>
                <input placeholder="Search a location…" value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onFocus={() => filterSuggestions.length && setShowFilterSuggestions(true)}
                  className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-remar" />
                {showFilterSuggestions && filterSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filterSuggestions.map((s, i) => (
                      <button key={i} type="button" onMouseDown={() => selectFilterSuggestion(s)}
                        className="block w-full text-left px-3 py-2 text-[11px] hover:bg-gray-100 truncate">
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">Help categories</label>
                <div className="space-y-1.5">
                  {CATEGORY_KEYS.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={filterCategories.includes(cat)}
                        onChange={() => toggleFilterCategory(cat)}
                        className="rounded border-gray-300 text-remar focus:ring-remar" />
                      <span>{HELP_CATEGORIES[cat].icon}</span>
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">{LOGISTICS_FILTER_LABEL[isHelper ? 'helper' : 'beneficiary']}</label>
                <div className="space-y-1.5">
                  {(LOGISTICS_FILTER_OPTIONS[isHelper ? 'helper' : 'beneficiary']).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={filterLogistics.includes(opt.value)}
                        onChange={() => toggleFilterLogistics(opt.value)}
                        className="rounded border-gray-300 text-remar focus:ring-remar" />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Availability <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 mb-2 focus:outline-none focus:ring-1 focus:ring-remar">
                  <option value="">Any day</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="flex gap-2">
                  <select value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} disabled={!filterDay}
                    className="w-1/2 text-sm rounded-lg border border-gray-300 px-2 py-2 focus:outline-none focus:ring-1 focus:ring-remar disabled:opacity-50">
                    <option value="">From</option>
                    {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={filterTo} onChange={(e) => setFilterTo(e.target.value)} disabled={!filterDay}
                    className="w-1/2 text-sm rounded-lg border border-gray-300 px-2 py-2 focus:outline-none focus:ring-1 focus:ring-remar disabled:opacity-50">
                    <option value="">To</option>
                    {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* In this map view — every helper/beneficiary matching the
                filters whose marker is currently inside the map's visible
                bounds, each with their individual open help items (Item +
                Help ID). Panning/zooming the map re-triggers the effect
                above (via boundsTick) and this list grows or shrinks to
                match — zoom out to a wider area and more people appear
                here, zoom in and it narrows to just what's on screen.
                Hidden while List View is expanded (that sheet shows the
                same viewport-scoped data full-screen instead) and reappears
                the moment List View is closed back to Map view. */}
            {!sheetExpanded && (
              <div className="bg-white rounded-2xl shadow p-4 mt-4">
                <h2 className="text-sm font-semibold remar-green mb-3">{entityLabelPlural}</h2>
                <div className="max-h-[420px] overflow-y-auto">
                  {renderPersonHelpsList(viewportList, 'No one in the current map view.')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help detail popup — Help ID, Date created, Item, Description,
          Quantity, New/Used (if applicable), Photos, and the {entityLabel}
          it belongs to (nickname, or surname if there isn't one). Reused by
          both the "In this map view" list and the selected-person details
          panel below the map — every help row in either place opens this
          same popup. */}
      {detailHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] px-4"
          onClick={() => setDetailHelp(null)}>
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold remar-green mb-4">Help details</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Help ID</p>
                  <p className="text-sm font-semibold text-gray-800">{detailHelp.help.help_id || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Date created</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(detailHelp.help.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Item</p>
                <p className="text-sm font-semibold text-gray-800">{detailHelp.help.title || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Description</p>
                <p className="text-sm text-gray-700">{detailHelp.help.description || 'No additional description provided'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Location</p>
                <p className="text-sm font-semibold text-gray-800">
                  {detailHelp.help.is_online
                    ? 'Online'
                    : [detailHelp.help.location_city, detailHelp.help.location_pincode].filter(Boolean).join(', ') || 'Not specified'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Quantity</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {detailHelp.help.quantity != null ? `${detailHelp.help.quantity} ${detailHelp.help.unit || ''}`.trim() : '—'}
                  </p>
                </div>
                {detailHelp.help.condition && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">New / Used</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {detailHelp.help.condition}
                      {detailHelp.help.condition === 'Used' && detailHelp.help.age_value
                        ? ` — ${detailHelp.help.age_value} ${detailHelp.help.age_unit || ''}`.trim() : ''}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Photos</p>
                {Array.isArray(detailHelp.help.photo_urls) && detailHelp.help.photo_urls.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {detailHelp.help.photo_urls.map((src, idx) => (
                      <button key={idx} type="button" onClick={() => setLightboxSrc(src)} className="block">
                        <img src={src} alt={`Photo ${idx + 1}`}
                          className="w-16 h-16 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition cursor-zoom-in" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No photos uploaded</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{entityLabel}</p>
                <p className="text-sm font-semibold text-gray-800">
                  {detailHelp.person.nickname || detailHelp.person.surname || '—'}
                </p>
              </div>
              {/* The creator's own offered delivery/collection option(s) for
                  this Help ID, worded from this consumer's own perspective —
                  ticking at least one is required before Request is enabled
                  (see item 9). Skipped entirely for help items with no
                  logistics_preference at all (services, Money, etc.). */}
              {Array.isArray(detailHelp.help.logistics_preference) && detailHelp.help.logistics_preference.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">
                    {LOGISTICS_FILTER_LABEL[isHelper ? 'helper' : 'beneficiary']} — select the one(s) that work for you
                  </p>
                  <div className="space-y-1.5">
                    {detailHelp.help.logistics_preference.map((v) => {
                      const optLabel = (LOGISTICS_FILTER_OPTIONS[isHelper ? 'helper' : 'beneficiary'].find((o) => o.value === v) || {}).label || v;
                      return (
                        <label key={v} className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={acceptedLogistics.includes(v)}
                            onChange={() => toggleAcceptedLogistics(v)}
                            className="w-4 h-4 accent-[#3a6b00]" />
                          <span className="text-sm text-gray-700">{optLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* Cancel just closes the popup (old OK's behavior); Request
                sends a request to the {entityLabel} for this help item —
                beneficiary picking a helper's offer files the new
                beneficiary->helper request, helper picking a beneficiary's
                request applies to it via the existing apply flow. Either
                way it lands as a pending request the item's owner accepts
                from the Help Status page. Disabled until at least one
                delivery/collection option is ticked above, whenever this
                help item actually has any (see item 9). */}
            {(() => {
              const hasLogisticsOptions = Array.isArray(detailHelp.help.logistics_preference) && detailHelp.help.logistics_preference.length > 0;
              // my_assignment_status (see GET /help/map) is this viewer's
              // own latest assignment on the item, if any — blocks a
              // second Request from the same person, same as
              // HelpDetailPopup.jsx's own alreadyRequested check.
              const alreadyRequested = Boolean(detailHelp.help.my_assignment_status);
              const requestDisabled = selecting || alreadyRequested || (hasLogisticsOptions && acceptedLogistics.length === 0);
              // Admin created every Remar Store item, and clicking outside
              // the popup already dismisses it — so admin's own detail
              // popup gets no button row at all, not even a Close button.
              if (isAdmin) return null;
              return (
                <>
                  {alreadyRequested && (
                    <p className="text-xs text-amber-600 mt-3">
                      {isHelper ? "You've already applied for this item." : "You've already requested this item."}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-5">
                    <button type="button" onClick={() => setDetailHelp(null)} disabled={selecting}
                      className="flex-1 text-sm font-semibold rounded-lg py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                      Cancel
                    </button>
                    <button type="button" onClick={() => handleSelect(detailHelp.help)} disabled={requestDisabled}
                      className="flex-1 text-white font-semibold text-sm rounded-lg py-2.5 transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#3a6b00' }}>
                      {selecting ? 'Sending…' : 'Request'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Profile popup — Map View only (see ProfilePopup.jsx); triggered by
          the person-name buttons in renderPersonHelpsList and the selected-
          person "{entityLabel} details" panel below the map. */}
      {profilePopup && (
        <ProfilePopup id={profilePopup.id} role={profilePopup.role} onClose={() => setProfilePopup(null)} />
      )}

      {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Select confirmation/error toast — self-clears after 3s (see the
          effect above). */}
      {selectFeedback && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2100] px-4 py-2.5 rounded-full shadow-lg text-xs font-semibold text-white max-w-[90%] text-center"
          style={{ backgroundColor: selectFeedback.type === 'error' ? '#dc2626' : '#3a6b00' }}>
          {selectFeedback.text}
        </div>
      )}
    </div>
  );
}
