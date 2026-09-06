import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { getStatusLabel, resolveDisplayStatus, formatHelpId } from '../../utils/helpStatus';
import StatusDot from '../../components/StatusDot';

// Same "12 Aug" short date used on the helper/beneficiary Home.
const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Deleted tacked on at the end — a deleted help item, not part of the
// normal forward lifecycle (see StatusDot, which renders it as a red X).
const LEGEND_ORDER = ['Initiated', 'Requested', 'Matched', 'Scheduled', 'Completed', 'Deleted'];

// Admin's landing page after login — same 3-section layout as the helper/
// beneficiary Home (client/src/pages/DM/Dashboard.jsx), but scoped to the
// whole platform rather than one person's own account: Section 1 is the
// admin account itself (there's no personal profile behind an admin login),
// Section 2 is every open/completed help item system-wide, Section 3 links
// out to the admin-only service/management pages.
export default function AdminHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [adminInfo, setAdminInfo] = useState(null);
  const [openHelps, setOpenHelps] = useState([]);
  const [historyHelps, setHistoryHelps] = useState([]);
  const [loading, setLoading] = useState(true);
  // Whether there's a donation/escalation/certificate request this admin
  // hasn't opened that page for yet — see donations.js's /unseen,
  // support.js's /tickets/unseen, and certificates.js's /unseen. Drives the
  // Donation tile turning green, the Escalations tile turning light red, and
  // the Certificate tile turning light green, each with a small "new"
  // superscript, in the Services section below. Cleared when the admin
  // actually visits that page (mark-seen calls in AdminDonation.jsx /
  // AdminEscalations.jsx / AdminCertificates.jsx).
  const [donationUnseen, setDonationUnseen] = useState(false);
  const [escalationUnseen, setEscalationUnseen] = useState(false);
  const [certificateUnseen, setCertificateUnseen] = useState(false);

  useEffect(() => {
    // A help item's status text needs the SAME derivation admin sees here as
    // its own creator sees on their own Home (GET /help/mine) — h.status
    // alone only ever flips once an admin has actually approved a match, so
    // a request that's still "Requested" (nobody's replied yet, or the
    // creator's accepted but admin hasn't signed off) would otherwise read
    // as "Initiated" here even though it doesn't anywhere else. GET /help
    // now folds in each item's latest assignment (assignment_status,
    // admin_approved) precisely so this can mirror that same logic.
    // A completed item stays out of history for 3 days after completion
    // (see matching comment in server/routes/help.js) so it doesn't vanish
    // from view the instant it's marked done.
    const HISTORY_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
    const isHistoryRow = (row) => {
      if (row.status === 'cancelled') return true;
      if (row.status === 'completed') {
        if (!row.completed_at) return true;
        return Date.now() - new Date(row.completed_at).getTime() >= HISTORY_DELAY_MS;
      }
      return row.assignment_status ? ['completed', 'cancelled'].includes(row.assignment_status) : false;
    };
    const normalize = (row) => ({
      key: row.id,
      helpRowId: row.id,
      helpId: row.help_id,
      title: row.title,
      scheduledDate: row.scheduled_date,
      createdAt: row.created_at,
      value: row.value,
      status: resolveDisplayStatus(row.assignment_status, row.status),
      adminApproved: row.admin_approved ?? true,
      bothScheduled: !!(row.creator_scheduled && row.consumer_scheduled),
      onTime: row.on_time,
    });

    Promise.all([
      api.get('/auth/admin-info').then(res => setAdminInfo(res.data)).catch(() => {}),
      api.get('/help').then(res => {
        setOpenHelps(res.data.filter(r => !isHistoryRow(r)).map(normalize));
        setHistoryHelps(res.data.filter(isHistoryRow).map(normalize));
      }).catch(() => {}),
      api.get('/donations/unseen').then(res => setDonationUnseen(!!res.data.hasNew)).catch(() => {}),
      api.get('/support/tickets/unseen').then(res => setEscalationUnseen(!!res.data.hasNew)).catch(() => {}),
      api.get('/certificates/unseen').then(res => setCertificateUnseen(!!res.data.hasNew)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading dashboard…</div>;
  }

  return (
    // Same negative-margin/padding-top swap as Dashboard.jsx (helper/
    // beneficiary Home) — cancels out body's own safe-area-inset-top padding
    // (which otherwise left a white strip above this grey page) and re-adds
    // it as this div's own padding so Section 1 still starts exactly 2mm
    // below the notch/camera area, filled with this page's own background.
    <div
      className="min-h-screen bg-gray-50 px-4 pb-28"
      style={{ marginTop: 'calc(-1 * (env(safe-area-inset-top, 0px) + 2mm))', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2mm)' }}
    >
      <div className="max-w-3xl mx-auto">

        {/* Section 1 — Account. Admin logins are shared org accounts (no
            personal profile row), so this shows the fixed "Admin" identity
            instead of a photo/nickname. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-3">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f0f8e8' }}>
              <svg viewBox="0 0 24 24" fill="#3a6b00" stroke="none" className="w-7 h-7">
                <path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-4Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">Admin</p>
              <p className="text-xs text-gray-400 flex flex-wrap items-baseline gap-x-1.5">
                <span>HRR0000</span>
                <span className="text-gray-300">|</span>
                <span>{adminInfo?.email || user?.email || '—'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Section 2 — Help Management, system-wide across every helper and
            beneficiary rather than just one account. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-3">
          <h2 className="font-semibold remar-green text-sm mb-3">Help Management</h2>

          {/* "Tab" background — light green for ongoing, light grey for
              history — matches Dashboard.jsx's helper/beneficiary Home, and
              now covers the whole list (header + every row), not just the
              header pill; the "Help status" legend label further down stays
              plain on purpose. */}
          <div className="rounded-lg overflow-hidden mb-6" style={{ backgroundColor: '#e8f5df' }}>
            <button type="button" onClick={() => navigate('/admin/help/ongoing')}
              className="w-full flex items-center gap-1 text-xs text-gray-500 hover:text-[#3a6b00] hover:bg-[#c8e6ae] transition px-2.5 py-1.5">
              Help ongoing
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {/* Only the 3 most recent rows show here — "Help ongoing" above
                links to the unrestricted full list for the rest. */}
            <table className="w-full text-xs table-fixed">
              <thead>
                {/* Header row shares the same background as the body — no
                    separate tint — since the divider line below is already
                    enough to mark it as the header. */}
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">Date</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">Help ID</th>
                  <th className="text-left font-medium px-3 py-1">Item</th>
                  <th className="text-center font-medium px-2 py-1 w-16">Status</th>
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
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-xs">No help ongoing</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#f0f0f1' }}>
            <button type="button" onClick={() => navigate('/admin/help/history')}
              className="w-full flex items-center gap-1 text-xs text-gray-500 hover:text-[#3a6b00] hover:bg-[#d6d6d8] transition px-2.5 py-1.5">
              Help history
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {/* Same continuous-background treatment as Help ongoing above —
                "Help history" links to the unrestricted full list for the
                rest. */}
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">Date</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">Help ID</th>
                  <th className="text-left font-medium px-3 py-1">Item</th>
                  <th className="text-center font-medium px-2 py-1 w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyHelps.slice(0, 3).map((h, i) => {
                  const helpId = h.helpId || formatHelpId(i + 1);
                  const historyLabel = getStatusLabel(h.status, h.scheduledDate);
                  return (
                    <tr key={h.key} onClick={() => navigate(`/help/${h.helpRowId}`)}
                      className="cursor-pointer hover:bg-[#d6d6d8] transition">
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.createdAt)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">{helpId}</td>
                      <td className="px-3 py-1 text-gray-700 truncate">{h.title}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-center" title={historyLabel}>
                          <StatusDot label={historyLabel} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {historyHelps.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-xs">No help history yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Two borderless columns: "Help status" stacked on its own two
              lines on the left, the legend wrapping freely on the right —
              matches Dashboard.jsx's helper/beneficiary Home. */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-start gap-4">
              <span className="text-[11px] text-gray-400 flex-shrink-0 leading-tight">Help<br />status</span>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
                {LEGEND_ORDER.map(label => (
                  <span key={label} className="inline-flex items-center gap-1.5 text-gray-500 flex-shrink-0 whitespace-nowrap">
                    <StatusDot label={label} />
                    <span className="text-[10px]">{label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3 — Services, admin-only management/service pages. */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-4">Services</h2>

          <div className="space-y-3">
            {/* Same grey-pill highlighted treatment as My Contribution on the
                helper Home page's Services section, applied to every admin
                service row here (bigger icon, subtitle, grey gradient)
                rather than plain text rows. */}
            {/* Real supplied 3D renders (green ribbon/medal), same fixed-
                image treatment as the icon assets elsewhere in the app —
                hue-unified to the same green family as everything else. */}
            {/* Turns light green — the same pale --remar-green-light family
                used for "resolved"/"issued" pills elsewhere in the app,
                rather than Donation's darker solid green — whenever there's
                a certificate request this admin hasn't seen yet, with a
                small "new" superscript next to the label. Text switches to
                dark green rather than staying white, since white on a pale
                background wouldn't read (same reasoning as Escalations'
                light-red state below). */}
            <button type="button" onClick={() => navigate('/admin/certificates')}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 shadow-md hover:shadow-lg hover:brightness-105 transition ${certificateUnseen ? 'remar-green' : 'text-white'}`}
              style={{ background: certificateUnseen
                ? 'linear-gradient(135deg, #e8f5d0 0%, #c3e393 100%)'
                : 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <img src="/certificate-icon.png" alt="" className="w-8 h-8 object-contain flex-shrink-0 drop-shadow" />
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">
                  Certificate
                  {certificateUnseen && <sup className="ml-1 text-[9px] font-bold uppercase tracking-wide text-[#3d6a00]">new</sup>}
                </span>
                <span className={`block text-[11px] leading-tight ${certificateUnseen ? 'text-[#579500]/80' : 'text-white/85'}`}>Issue and manage service certificates</span>
              </span>
            </button>

            {/* Glossy green star-medal rosette with striped ribbon tails,
                same gradient/stroke treatment as Auto-approval/Reports below
                — the reference shared for this one carried a visible
                Vecteezy watermark, so likewise redrawn as original artwork
                instead of used directly. */}
            <button type="button" onClick={() => navigate('/admin/honors')}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
              style={{ background: 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0 drop-shadow">
                <defs>
                  <radialGradient id="honorsGloss" cx="35%" cy="28%" r="85%">
                    <stop offset="0%" stopColor="#a5d66a" />
                    <stop offset="50%" stopColor="#579500" />
                    <stop offset="100%" stopColor="#2d5400" />
                  </radialGradient>
                </defs>
                <path d="M7,13 L10,13 L7,19 L4,22 Z" fill="#6ea52e" stroke="#1f3d00" strokeWidth="0.3" strokeLinejoin="round" />
                <path d="M17,13 L14,13 L17,19 L20,22 Z" fill="#6ea52e" stroke="#1f3d00" strokeWidth="0.3" strokeLinejoin="round" />
                <path d="M7.5,14 L5.3,20.2" stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />
                <path d="M9,14.3 L6.8,20.5" stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />
                <path d="M16.5,14 L18.7,20.2" stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />
                <path d="M15,14.3 L17.2,20.5" stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />
                <circle cx="12" cy="8.5" r="6.3" fill="url(#honorsGloss)" stroke="#1f3d00" strokeWidth="0.4" />
                <circle cx="12" cy="8.5" r="5.1" fill="none" stroke="#c8ecb0" strokeWidth="0.5" opacity="0.6" />
                <path d="M12,5.9 L12.647,7.610 L14.473,7.697 L13.046,8.840 L13.528,10.603 L12,9.6 L10.472,10.603 L10.954,8.840 L9.527,7.697 L11.353,7.610 Z" fill="#eefbe0" />
              </svg>
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">Honors</span>
                <span className="block text-[11px] text-white/85 leading-tight">Recognitions awarded to helpers</span>
              </span>
            </button>

            {/* A help item now only becomes Matched with an admin's sign-off
                (manual, from the Help page's Requests list, or an
                auto-approval rule) — this is where those rules live.
                Glossy green thumbs-up badge, same gradient/stroke treatment
                as the back-arrow/gear icons — the reference the person
                shared was an Alamy stock button (visible watermark), so
                redrawn from scratch as original artwork rather than used
                directly. */}
            <button type="button" onClick={() => navigate('/admin/auto-match')}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
              style={{ background: 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0 drop-shadow">
                <defs>
                  <radialGradient id="approveGloss" cx="35%" cy="28%" r="85%">
                    <stop offset="0%" stopColor="#a5d66a" />
                    <stop offset="50%" stopColor="#579500" />
                    <stop offset="100%" stopColor="#2d5400" />
                  </radialGradient>
                </defs>
                <circle cx="12" cy="12" r="11" fill="url(#approveGloss)" stroke="#1f3d00" strokeWidth="0.4" />
                <path d="M8 13.5h1.8l1.1-4.6c.15-.65.7-1.1 1.35-1.1.75 0 1.35.6 1.35 1.35v2.35h2.6c.7 0 1.2.65 1.05 1.35l-.75 3.4c-.15.65-.7 1.1-1.35 1.1H9.5" fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 13.5v3.15c0 .4-.3.7-.7.7H6.3c-.4 0-.7-.3-.7-.7V13.5c0-.4.3-.7.7-.7h1c.4 0 .7.3.7.7Z" fill="#ffffff" />
              </svg>
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">Auto-approval</span>
                <span className="block text-[11px] text-white/85 leading-tight">Manage auto-approve matching rules</span>
              </span>
            </button>

            {/* Same supplied glossy coin-stack + growing-sprout image used
                for Donate on the helper Home page's Services section
                (Dashboard.jsx), rather than the REMAR logo mark. Turns the
                same green as that Donate tile — instead of its usual grey —
                whenever there's a donation this admin hasn't seen yet, with
                a small "new" superscript next to the label. */}
            <button type="button" onClick={() => navigate('/admin/donation')}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
              style={{ background: donationUnseen
                ? 'linear-gradient(135deg, #7cb83a 0%, #3a6b00 100%)'
                : 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <img src="/donate-icon.png" alt="" className="w-8 h-8 object-contain flex-shrink-0 drop-shadow" />
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">
                  Donation
                  {donationUnseen && <sup className="ml-1 text-[9px] font-bold uppercase tracking-wide text-white/95">new</sup>}
                </span>
                <span className="block text-[11px] text-white/85 leading-tight">Log donations received from helpers</span>
              </span>
            </button>

            {/* Real supplied 3D warning-triangle render — the one icon
                that stays red rather than joining the app's green family,
                since it's a genuine "needs attention" signal. Turns a light
                shade of red — instead of its usual grey — whenever there's
                an escalation this admin hasn't seen yet, with a small "new"
                superscript next to the label. Text switches to a dark red
                rather than staying white, since white on a pale background
                wouldn't read. */}
            <button type="button" onClick={() => navigate('/admin/escalations')}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 shadow-md hover:shadow-lg hover:brightness-105 transition ${escalationUnseen ? 'text-red-900' : 'text-white'}`}
              style={{ background: escalationUnseen
                ? 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'
                : 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <img src="/escalation-icon.png" alt="" className="w-8 h-8 object-contain flex-shrink-0 drop-shadow" />
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">
                  Escalations
                  {escalationUnseen && <sup className="ml-1 text-[9px] font-bold uppercase tracking-wide text-red-800">new</sup>}
                </span>
                <span className={`block text-[11px] leading-tight ${escalationUnseen ? 'text-red-900/80' : 'text-white/85'}`}>Review flagged support tickets</span>
              </span>
            </button>

            {/* Glossy green document/checklist badge, same treatment as
                Auto-approval above — the reference shared for this one
                carried a visible pngtree watermark, so likewise redrawn as
                original artwork instead of used directly. */}
            <button type="button" onClick={() => navigate('/admin/reports')}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-md hover:shadow-lg hover:brightness-105 transition"
              style={{ background: 'linear-gradient(135deg, #b8bcc0 0%, #7c8085 100%)' }}>
              <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0 drop-shadow">
                <defs>
                  <linearGradient id="reportPage" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#eef2e6" />
                  </linearGradient>
                  <radialGradient id="reportBadge" cx="35%" cy="28%" r="85%">
                    <stop offset="0%" stopColor="#a5d66a" />
                    <stop offset="50%" stopColor="#579500" />
                    <stop offset="100%" stopColor="#2d5400" />
                  </radialGradient>
                </defs>
                <rect x="4" y="2.5" width="16" height="19" rx="2.4" fill="url(#reportPage)" stroke="#c7d4bb" strokeWidth="0.6" />
                <rect x="7" y="6.2" width="10" height="1.7" rx="0.85" fill="#579500" />
                <rect x="7" y="10" width="10" height="1.7" rx="0.85" fill="#579500" />
                <rect x="7" y="13.8" width="6" height="1.7" rx="0.85" fill="#579500" />
                <circle cx="16.5" cy="17.5" r="4" fill="url(#reportBadge)" stroke="#1f3d00" strokeWidth="0.4" />
                <path d="M14.7 17.6l1.2 1.2 2-2.4" fill="none" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-left">
                <span className="block text-sm font-bold leading-tight">Reports</span>
                <span className="block text-[11px] text-white/85 leading-tight">Export activity and analytics reports</span>
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
