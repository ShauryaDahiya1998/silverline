import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { getStatusLabel, resolveDisplayStatus, formatDate, formatHelpId } from '../../utils/helpStatus';
import { DUMMY_OPEN_ITEMS, DUMMY_HISTORY_ITEMS } from '../../data/dummyHelp';
import StatusDot from '../../components/StatusDot';

// Short "12 Aug" form used only in the Help ongoing table on Home, where
// space is tight — the fuller formatDate() from helpStatus.js is still used
// everywhere else (Help Status, Help History).
const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Fixed order for the Help status legend — the five-stage lifecycle also
// used by STATUS_COLORS / getStatusLabel / HelpStatus.jsx's STAGES, plus
// Deleted tacked on at the end (a deleted help item, not part of the
// normal forward lifecycle — see StatusDot, which renders it as a red X
// instead of a dot).
const LEGEND_ORDER = ['Initiated', 'Requested', 'Matched', 'Scheduled', 'Completed', 'Deleted'];

// LEGEND_ORDER's own values stay in English — StatusDot and getStatusLabel
// match against these literally — this just maps each one to its
// translation key for display.
const STATUS_KEYS = {
  Initiated: 'status.initiated', Requested: 'status.requested', Matched: 'status.matched',
  Scheduled: 'status.scheduled', Completed: 'status.completed', Deleted: 'status.cancelled',
};

export default function Home() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();
  const isHelper = user?.role === 'helper';

  const [profile, setProfile] = useState(null);
  const [openHelps, setOpenHelps] = useState([]);
  const [historyHelps, setHistoryHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const profileEndpoint = isHelper ? '/helpers/me' : '/beneficiaries/me';

    // Normalize helper (assignment-shaped) and beneficiary (help-shaped)
    // rows from GET /help/mine into one common shape the tables below use.
    const normalize = (row) => ({
      // A helper's own self-created, not-yet-assigned offers have no
      // assignment row, so assignment_id/assignment_status come back null —
      // fall back to the help item's own id/status so those still get a
      // stable key and a correct status dot instead of crashing into
      // "undefined".
      key: isHelper ? (row.assignment_id || row.help_row_id) : row.id,
      helpRowId: isHelper ? row.help_row_id : row.id,
      assignmentId: isHelper ? row.assignment_id : null,
      // Real, permanent Help ID assigned server-side at creation (see
      // POST /help) — no longer computed from the row's position in this
      // list, which drifted as items were added or completed.
      helpId: row.help_id,
      title: row.title,
      subService: row.required_skills?.[0] || '—',
      scheduledDate: row.scheduled_date,
      createdAt: row.created_at,
      durationHours: row.duration_hours,
      value: row.value,
      status: resolveDisplayStatus(row.assignment_status, row.status),
      // Only matters for the 'confirmed' assignment-status case (getStatusLabel
      // ignores it otherwise) — whether an admin has actually signed off on
      // this match yet, so the dot doesn't turn Matched-green prematurely.
      adminApproved: row.admin_approved ?? true,
      // Both the item's creator and the other matched party have ticked
      // "is the delivery scheduled?" on the Help page (see
      // PUT /assignments/:id/ack) — reads as Scheduled once true, same
      // derived-label mechanism getStatusLabel already had for a future
      // scheduled_date, just driven by mutual confirmation instead.
      bothScheduled: !!(row.creator_scheduled && row.consumer_scheduled),
      onTime: row.on_time,
      ratingReceived: row.rating_received,
      ratingGiven: row.rating_given,
    });

    Promise.all([
      api.get(profileEndpoint).then(res => setProfile(res.data)).catch(() => {}),
      api.get('/help/mine').then(res => {
        setOpenHelps([...DUMMY_OPEN_ITEMS, ...(res.data.open || []).map(normalize)]);
        setHistoryHelps([...DUMMY_HISTORY_ITEMS, ...(res.data.history || []).map(normalize)]);
      }).catch(() => { setOpenHelps(DUMMY_OPEN_ITEMS); setHistoryHelps(DUMMY_HISTORY_ITEMS); }),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHelper]);

  const accountId = user?.email || profile?.phone || '—';
  const memberNumber = profile?.member_number || '—';
  const viewProfilePath = profile
    ? (isHelper ? `/helper/profile/${profile.id}` : `/beneficiary/profile/${profile.id}`)
    : null;

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">{t('home.loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">

        {/* Section 1 — Profile. Photo and name are themselves the "view
            profile" link (no separate button) — clicking either opens the
            read-only public profile page. Role | member ID | account ID
            sits to the right of the role label. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-3 mt-[2mm]">
          <div className="flex items-center gap-4">
            <button type="button" disabled={!viewProfilePath} onClick={() => viewProfilePath && navigate(viewProfilePath)}
              className="flex-shrink-0 disabled:cursor-default">
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="Photo" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100" />
              )}
            </button>
            <button type="button" disabled={!viewProfilePath} onClick={() => viewProfilePath && navigate(viewProfilePath)}
              className="flex-1 min-w-0 text-left disabled:cursor-default">
              <p className="font-semibold text-gray-900 truncate hover:underline">{profile?.nickname || profile?.name || t('home.yourProfile')}</p>
              <p className="text-xs text-gray-400 flex flex-wrap items-baseline gap-x-1.5">
                <span>{isHelper ? t('home.helper') : t('home.beneficiary')}</span>
                <span className="text-gray-300">|</span>
                <span>{memberNumber}</span>
                <span className="text-gray-300">|</span>
                <span>{accountId}</span>
              </p>
            </button>
          </div>
        </div>

        {/* Section 2 — Help Management */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-3">
          <h2 className="font-semibold remar-green text-sm mb-3">{t('home.helpManagement')}</h2>
          <div className="grid grid-cols-3 mb-5">
            <button type="button" onClick={() => navigate('/store')}
              className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-[#3a6b00] transition">
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 overflow-hidden">
                <img src="/remar-logo.png" alt="" className="w-6 h-6 object-contain" />
              </span>
              <span className="text-xs font-semibold text-center leading-tight">{t('home.remarStore')}</span>
            </button>

            <button type="button" onClick={() => navigate('/map')}
              className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-[#3a6b00] transition">
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                {/* Same Earth mark as the bottom nav's "Help" item (see
                    BottomNav.jsx ICONS.map) — kept in sync there rather than
                    shared so this file has no dependency on a nav-specific
                    module. */}
                <img src="/earth-icon.png" alt="" className="w-6 h-6 object-contain" />
              </span>
              <span className="text-xs font-semibold text-center leading-tight">{isHelper ? t('home.allRequiredHelp') : t('home.allAvailableHelp')}</span>
            </button>

            <button type="button" onClick={() => navigate('/help/new')}
              className="flex flex-col items-center gap-1.5 text-gray-700 hover:text-[#3a6b00] transition">
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                {/* Same glossy green cross as the bottom nav's "New Help"
                    item (see BottomNav.jsx ICONS.plus). */}
                <img src="/plus-icon.png" alt="" className="w-6 h-6 object-contain" />
              </span>
              <span className="text-xs font-semibold text-center leading-tight">{t('home.newHelp')}</span>
            </button>
          </div>

          {/* "Tab" background — light green for ongoing, light grey for
              history (see matching comment below) — now covers the whole
              list (header + every row), not just the header pill, so each
              section reads as one continuous colored block; the "Help
              status" legend label further down stays plain/background-less
              on purpose. */}
          <div className="rounded-lg overflow-hidden mb-6" style={{ backgroundColor: '#e8f5df' }}>
            <button type="button" onClick={() => navigate('/help/ongoing')}
              className="w-full flex items-center gap-1 text-xs text-gray-500 hover:text-[#3a6b00] hover:bg-[#c8e6ae] transition px-2.5 py-1.5">
              {t('home.helpOngoing')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {/* Only the 3 most recent rows show here — no inline scrolling, so
                the only way to see the rest is by clicking "Help ongoing"
                above through to the unrestricted full list (matches
                AdminHome.jsx's equivalent table). */}
            <table className="w-full text-xs table-fixed">
              <thead>
                {/* Header row now shares the same background as the body —
                    no separate tint — since the divider line below is
                    already enough to mark it as the header. */}
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">{t('home.date')}</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">{t('home.helpId')}</th>
                  <th className="text-left font-medium px-3 py-1">{t('home.item')}</th>
                  <th className="text-center font-medium px-2 py-1 w-16">{t('home.status')}</th>
                </tr>
              </thead>
              <tbody>
                {openHelps.slice(0, 3).map((h, i) => {
                  const label = getStatusLabel(h.status, h.scheduledDate, h.adminApproved, h.bothScheduled);
                  const helpId = h.helpId || formatHelpId(i + 1);
                  return (
                    <tr key={h.key} onClick={() => navigate(`/help/${h.helpRowId}`)}
                      className="cursor-pointer hover:bg-[#c8e6ae] transition">
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.createdAt)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">{helpId}</td>
                      <td className="px-3 py-1 text-gray-700 truncate">{h.title}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-center" title={label}>
                          <StatusDot label={label} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {openHelps.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-xs">{t('home.noHelpOngoing')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#f0f0f1' }}>
            <button type="button" onClick={() => navigate('/help/history')}
              className="w-full flex items-center gap-1 text-xs text-gray-500 hover:text-[#3a6b00] hover:bg-[#d6d6d8] transition px-2.5 py-1.5">
              {t('home.helpHistory')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {/* Same continuous-background treatment as Help ongoing above —
                "Help history" links to the unrestricted full list for the
                rest. Rows open /help/:id — the exact same HelpStatus.jsx page
                Help ongoing rows open — rather than a separate history-only
                layout, so a Help ID's detail page always looks the same
                regardless of which table it was clicked from
                (HelpStatus.jsx already hides the edit/request actions and
                shows the feedback section once a match is Completed, so it
                degrades correctly here). */}
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">{t('home.date')}</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">{t('home.helpId')}</th>
                  <th className="text-left font-medium px-3 py-1">{t('home.item')}</th>
                  <th className="text-center font-medium px-2 py-1 w-16">{t('home.status')}</th>
                </tr>
              </thead>
              <tbody>
                {historyHelps.slice(0, 3).map((h, i) => {
                  const helpId = h.helpId || formatHelpId(i + 1);
                  const historyLabel = getStatusLabel(h.status, h.scheduledDate);
                  return (
                    <tr key={h.key}
                      onClick={() => navigate(`/help/${h.helpRowId}`)}
                      className="cursor-pointer hover:bg-[#d6d6d8] transition">
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.createdAt)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">{helpId}</td>
                      <td className="px-3 py-1 text-gray-700">
                        <span className="truncate block">{h.title}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-center" title={historyLabel}>
                          <StatusDot label={historyLabel} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {historyHelps.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-xs">{t('home.noHelpHistory')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Status legend, matching the dots used in the tables above. Two
              borderless columns: "Help status" stacked on its own two lines
              on the left, the five state words (Initiated/Requested/Matched/
              Scheduled/Completed) wrapping freely on the right — no visible
              divider between them, just spacing. */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-start gap-4">
              <span className="text-[11px] text-gray-400 flex-shrink-0 leading-tight whitespace-pre-line">{t('home.helpStatus')}</span>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
                {LEGEND_ORDER.map(label => (
                  <span key={label} className="inline-flex items-center gap-1.5 text-gray-500 flex-shrink-0 whitespace-nowrap">
                    <StatusDot label={label} />
                    <span className="text-[10px]">{t(STATUS_KEYS[label])}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3 — Services. Donate and My Contribution are helper only
            (Request Certificate now lives on My Contribution itself, not
            here); My Consumption is beneficiary only. (Contact support now
            lives under the bottom nav's Support icon / Settings, not
            duplicated here.) */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-4">{t('home.services')}</h2>

          <div className="space-y-3">
            {isHelper && (
              <>
                {/* Donate gets a standout highlighted treatment (gradient
                    pill, bigger icon, subtitle) vs. the plain text rows
                    below it, so it reads as the most visually prominent
                    service on this list. */}
                <button type="button" onClick={() => navigate('/donate')}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
                  style={{ background: 'linear-gradient(135deg, #7cb83a 0%, #3a6b00 100%)' }}>
                  {/* Supplied glossy 3D coin-stack + growing-sprout image, no
                      watermark — same fixed-image treatment as the other
                      supplied icons rather than a currentColor outline svg. */}
                  <img src="/donate-icon.png" alt="" className="w-8 h-8 object-contain flex-shrink-0 drop-shadow" />
                  <span className="text-left">
                    <span className="block text-sm font-bold leading-tight">{t('home.donate')}</span>
                    <span className="block text-[11px] text-white/85 leading-tight">{t('home.donateSubtitle')}</span>
                  </span>
                </button>

                {/* My Contribution gets the same standout highlighted
                    treatment as Donate (pill, bigger icon, subtitle) but
                    with a grey background instead of the green gradient, so
                    it reads as prominent without competing with Donate for
                    "most important" visual weight. */}
                <button type="button" onClick={() => navigate('/my-contribution')}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
                  style={{ background: 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
                  {/* Glossy green 3D puzzle piece — the person's reference
                      was a Dreamstime stock photo with a visible watermark,
                      so this is redrawn as original artwork closely matching
                      its actual silhouette: two unequal bumps at the top
                      (a larger lobe plus a smaller separated "ear"), a
                      concave scoop bitten out of the left edge, a rounded
                      knob on the bottom edge, a plain right edge, and the
                      whole shape tilted the same way — filled with the same
                      radial-gradient glossy-sphere treatment as the other
                      custom-built icons (back-arrow, gear, gauge) rather
                      than a currentColor outline svg. */}
                  <svg viewBox="0 0 100 100" className="w-8 h-8 flex-shrink-0 drop-shadow">
                    <defs>
                      <radialGradient id="puzzleGloss" cx="32%" cy="24%" r="85%">
                        <stop offset="0%" stopColor="#b8e07a" />
                        <stop offset="50%" stopColor="#7cb83a" />
                        <stop offset="100%" stopColor="#3d6e12" />
                      </radialGradient>
                    </defs>
                    <path
                      transform="rotate(18 50 50)"
                      fill="url(#puzzleGloss)"
                      stroke="#254a08"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                      d="M32 24 L34 24 A10 10 0 0 1 54 24 L60 24 A4 4 0 0 1 68 24
                         A8 8 0 0 1 76 32 L76 68 A8 8 0 0 1 68 76
                         L60 76 A10 10 0 0 1 40 76 L32 76 A8 8 0 0 1 24 68
                         L24 59 A9 9 0 0 0 24 41 L24 32 A8 8 0 0 1 32 24 Z"
                    />
                  </svg>
                  <span className="text-left">
                    <span className="block text-sm font-bold leading-tight">{t('home.myContribution')}</span>
                    <span className="block text-[11px] text-white/85 leading-tight">{t('home.myContributionSubtitle')}</span>
                  </span>
                </button>
              </>
            )}

            {!isHelper && (
              /* Same grey-pill highlighted treatment as My Contribution on
                 the helper Home page's Services section (bigger icon,
                 subtitle, grey gradient) rather than a plain text row. */
              <button type="button" onClick={() => navigate('/my-consumption')}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
                style={{ background: 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
                {/* Glossy black speedometer/gauge — the person's reference was
                    a watermarked stock thumbnail, so this is redrawn as
                    original artwork: a colored gauge arc (green through red)
                    on a dark dial face, glossy black bezel, and a silver
                    needle, same fixed-color treatment as the other
                    custom-built icons (back-arrow, gear) rather than a
                    currentColor outline svg. */}
                <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0 drop-shadow">
                  <defs>
                    <radialGradient id="gaugeBezel" cx="35%" cy="28%" r="85%">
                      <stop offset="0%" stopColor="#4b4b4b" />
                      <stop offset="55%" stopColor="#1c1c1c" />
                      <stop offset="100%" stopColor="#050505" />
                    </radialGradient>
                  </defs>
                  <circle cx="12" cy="12" r="9.6" fill="url(#gaugeBezel)" stroke="#000000" strokeWidth="0.3" />
                  <circle cx="12" cy="12" r="8.2" fill="#161616" />
                  <path d="M5.76 15.6 A7.2 7.2 0 0 1 5.76 8.4" fill="none" stroke="#4caf50" strokeWidth="2.1" strokeLinecap="round" />
                  <path d="M5.76 8.4 A7.2 7.2 0 0 1 12 4.8" fill="none" stroke="#f2c94c" strokeWidth="2.1" strokeLinecap="round" />
                  <path d="M12 4.8 A7.2 7.2 0 0 1 18.24 8.4" fill="none" stroke="#f2994a" strokeWidth="2.1" strokeLinecap="round" />
                  <path d="M18.24 8.4 A7.2 7.2 0 0 1 18.24 15.6" fill="none" stroke="#eb5757" strokeWidth="2.1" strokeLinecap="round" />
                  <line x1="12" y1="12" x2="8.1" y2="7.4" stroke="#e5e7eb" strokeWidth="1.3" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="1.5" fill="#3a3a3a" stroke="#0a0a0a" strokeWidth="0.4" />
                </svg>
                <span className="text-left">
                  <span className="block text-sm font-bold leading-tight">{t('home.myConsumption')}</span>
                  <span className="block text-[11px] text-white/85 leading-tight">{t('home.myConsumptionSubtitle')}</span>
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
