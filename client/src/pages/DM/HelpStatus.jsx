import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { getStatusLabel, formatDate, formatDateTime, displayName } from '../../utils/helpStatus';
import { DUMMY_HELPS } from '../../data/dummyHelp';
import ProfilePopup from '../../components/ProfilePopup';
import PhotoLightbox from '../../components/PhotoLightbox';
import LogisticsTickList from '../../components/LogisticsTickList';
import ConfirmModal from '../../components/ConfirmModal';
import ScheduleCard from '../../components/ScheduleCard';
import ChatWidget from '../../components/ChatWidget';

// Help Status page — reached by clicking a row in Home's Help ongoing
// table. Shows the request's details, a location-tracking placeholder, a
// link to the other party's profile, requests/matching (with the option to
// cancel a match even after the fact), a general support chatbot link,
// feedback + rating (once completed), and Modify / Delete Help.
export default function HelpStatus() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currency } = usePreferences();
  const navigate = useNavigate();
  const isDemo = id in DUMMY_HELPS;
  const isHelper = user?.role === 'helper';
  const isAdmin = user?.role === 'admin';

  const [help, setHelp] = useState(isDemo ? DUMMY_HELPS[id] : null);
  // { confirmed, pending: [...] } — confirmed is the matched counterpart (if
  // any), pending is every open request against this item, oldest first.
  // Multiple beneficiaries can now select the same helper-offered item (or,
  // in the original flow, multiple helpers can apply to the same beneficiary
  // request), so this is a list rather than a single row.
  const [counterpart, setCounterpart] = useState({ confirmed: null, pending: [] });
  const [loading, setLoading] = useState(!isDemo);
  const [notFound, setNotFound] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  // Which assignment's feedback the form above has already been pre-filled
  // from (see the effect below) — so a later refetch (e.g. right after this
  // viewer's own submit) doesn't stomp on it again, and so it only ever
  // syncs once per match rather than on every render.
  const [feedbackInitFor, setFeedbackInitFor] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  // Accept/Reject on a pending request against this help item — shown only
  // to whoever created it (see isOwner below), covering both directions: a
  // beneficiary approving a helper's application to their request, or a
  // helper accepting a beneficiary's request against their own offered item.
  // Tracks which specific assignment is mid-request so only that row's
  // buttons show a busy state when there's more than one pending.
  const [respondingId, setRespondingId] = useState(null);
  const [respondError, setRespondError] = useState('');
  // { id, role } of whoever's name was tapped in the Requests list — shows
  // their profile as a popup (same component Map View uses) instead of
  // navigating away, so the owner can quickly check someone out without
  // losing their place among multiple requests.
  const [popupPerson, setPopupPerson] = useState(null);
  // Holds the just-accepted person while the "thank you for accepting"
  // popup is showing — dismissing it via OK sends the Creator back to
  // Home rather than opening a Chat page.
  const [acceptedPerson, setAcceptedPerson] = useState(null);
  // Full-size view of a tapped photo thumbnail — see PhotoLightbox.
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Admin's Value/Hours approval box — draft text for the two inputs while
  // being edited, and a save-in-flight/error pair. Only ever rendered for
  // the admin-approved request row (see isApproved below); server-computed
  // defaults (Help.xlsx pricing — see helpPricing.js) land in help.value/
  // help.duration_hours the moment admin_approved flips true, so there's
  // nothing to initialize here beyond what the fetched help item already
  // carries — see the adminValueDraft/adminHoursDraft sync effect below.
  const [adminValueDraft, setAdminValueDraft] = useState('');
  const [adminHoursDraft, setAdminHoursDraft] = useState('');
  const [adminValueSaving, setAdminValueSaving] = useState(false);
  const [adminValueError, setAdminValueError] = useState('');
  // Apply/Request — a non-owner who hasn't yet sent a request against this
  // item (see canApply below) picks any delivery/collection options here
  // before sending, same as Map View's Select/Request popup (see
  // MapView.jsx's acceptedLogistics/handleSelect — this mirrors that same
  // flow for whoever reaches a help item's own detail page directly, e.g.
  // by browsing Remar Store, rather than through Map View).
  const [applyLogistics, setApplyLogistics] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  // Confirm-before-send (item 4) — Request/Apply and Accept/Approve now ask
  // "are you sure?" first, same ConfirmModal pattern already used for
  // Delete/Revoke/Withdraw below. confirmApprove carries which specific
  // request (assignmentId) and who it's against (person) since both the
  // owner's Accept and admin's Approve buttons funnel through the one
  // handleRespond('confirmed', ...) call.
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(null);

  const refetchCounterpart = () => api.get(`/help/${id}/counterpart`).then(res => setCounterpart(res.data)).catch(() => {});

  useEffect(() => {
    if (isDemo) return;
    Promise.all([
      api.get(`/help/${id}`).then(res => setHelp(res.data)).catch(() => setNotFound(true)),
      refetchCounterpart(),
    ]).finally(() => setLoading(false));
  }, [id, isDemo]);

  // Pre-fills the feedback form (below) from whatever this viewer's own
  // side has already submitted (see PUT /assignments/:id/feedback), so it
  // shows up frozen on return visits/reloads too, not just within the
  // session it was submitted in. Recomputed straight from the raw help/
  // counterpart state rather than the isOwner/confirmedCounterpart consts
  // further down — those don't exist yet on an early "still loading"
  // render, and this hook (like all hooks) has to run unconditionally,
  // before any of the guards below it. Only syncs once per assignment
  // (feedbackInitFor) so a later refetch right after this viewer's own
  // submit doesn't stomp the form back to whatever it just replaced.
  useEffect(() => {
    if (!help || isAdmin) return;
    const isOwnerNow = help.created_by === user?.id;
    const cc = isOwnerNow ? counterpart.confirmed : (counterpart.confirmed || (counterpart.pending || [])[0] || null);
    if (!cc?.assignment_id || cc.assignment_id === feedbackInitFor) return;
    const existingFeedback = isOwnerNow ? cc.creator_feedback : cc.consumer_feedback;
    const existingRating = isOwnerNow ? cc.creator_rating : cc.consumer_rating;
    setFeedback(existingFeedback || '');
    setRating(existingRating || 0);
    setFeedbackSaved(existingFeedback != null || existingRating != null);
    setFeedbackInitFor(cc.assignment_id);
  }, [help, counterpart, isAdmin, user?.id, feedbackInitFor]);

  // Keeps the admin Value/Hours approval box's two draft inputs in sync with
  // whatever help.value/help.duration_hours currently is — covers the
  // initial page load (already-Matched item), the moment defaults land
  // right after Approve (server computes them synchronously — see
  // helpPricing.js — and handleRespond below re-fetches the help item), and
  // our own save round-tripping back through setHelp. Only meaningful for
  // admin; a no-op otherwise.
  useEffect(() => {
    if (!help || !isAdmin) return;
    setAdminValueDraft(help.value != null ? String(help.value) : '');
    setAdminHoursDraft(help.duration_hours != null ? String(help.duration_hours) : '');
  }, [help?.id, help?.value, help?.duration_hours, isAdmin]);

  // Saves the admin's edited Value/Hours (PUT /help/:id/admin-value) — fired
  // on blur from either input. The server itself rejects this once the help
  // item is 'completed' (frozen for reporting), so no client-side isCompleted
  // guard is needed here beyond not rendering the inputs at all by then (see
  // the render below).
  const handleSaveAdminValue = async () => {
    if (!help) return;
    setAdminValueSaving(true);
    setAdminValueError('');
    try {
      const res = await api.put(`/help/${help.id}/admin-value`, {
        value: adminValueDraft === '' ? null : Number(adminValueDraft),
        duration_hours: adminHoursDraft === '' ? null : Number(adminHoursDraft),
      });
      setHelp(prev => (prev ? { ...prev, value: res.data.value, duration_hours: res.data.duration_hours } : prev));
    } catch (err) {
      setAdminValueError(err.response?.data?.error || 'Could not save — please try again.');
    } finally {
      setAdminValueSaving(false);
    }
  };

  // Opens this person's conversation inline in the ChatWidget (item 2)
  // right on this page, instead of navigating away to Account > Chats —
  // used by every Chat button below, and the auto-open straight after
  // Accept. Threads are scoped per help item (see messages.js), so this
  // help item's row id/display id travel along too.
  const chatWidgetRef = useRef(null);
  // Tracks the ChatWidget's own rendered height (it reports this back via
  // onHeightChange — see ChatWidget.jsx) so the page can reserve enough
  // extra bottom space to keep Modify/Delete clear of it. The widget floats
  // via position:fixed right above the bottom nav and grows taller as more
  // chats stack up or one is expanded, so a static padding value can't
  // account for it — this has to track the real, current height.
  const [chatWidgetHeight, setChatWidgetHeight] = useState(0);
  const openChat = (person) => {
    if (!person?.user_id) return;
    // Chat header shows the same nickname-first, surname-not-full-name
    // convention used everywhere else a counterparty is named in this app
    // (see displayName in utils/helpStatus.js) — never the full name.
    chatWidgetRef.current?.open({
      userId: person.user_id, name: displayName(person) || 'Chat',
      helpRowId: help.id, helpDisplayId: shortId,
    });
  };

  // General rule, not Store-specific: if a chat thread already exists for
  // THIS help item — started by either party, at any point, e.g. admin
  // messaging a helper before any match — it should keep showing up here
  // as a minimized chat window every time this Help ID page loads, not
  // only after someone explicitly taps Chat. Whoever DIDN'T send the last
  // message sees it highlighted (unread), same highlighting the widget
  // already does once a reply arrives while it's open. Uses help?.help_id
  // rather than the shortId const below since this has to run before the
  // loading/not-found early returns further down (Rules of Hooks), and
  // shortId isn't computed until after them.
  //
  // Also waits on `loading` itself (not just help?.id): the "Loading…"
  // early return further down renders in place of the whole page — including
  // <ChatWidget> itself — for as long as `loading` is still true. help?.id
  // can already be set by then (the /help fetch above can resolve before the
  // sibling /help/:id/counterpart one in the same Promise.all), so without
  // this guard the effect could fire, find chatWidgetRef.current still null
  // (ChatWidget hasn't mounted yet), and silently do nothing — with no
  // second chance to retry once loading flips false and ChatWidget finally
  // mounts, since help?.id itself never changes again to re-trigger it. That
  // race is exactly what made the minimized window fail to reappear on some
  // page loads.
  useEffect(() => {
    if (!help?.id || isDemo || loading) return undefined;
    let cancelled = false;
    api.get('/messages/mine').then(res => {
      if (cancelled) return;
      const threads = (res.data || []).filter(t => t.help?.row_id === help.id && t.other_user_id && t.other_user_id !== user?.id);
      for (const t of threads) {
        chatWidgetRef.current?.ensureSession({
          userId: t.other_user_id, name: t.other_name, helpRowId: help.id,
          helpDisplayId: help.help_id || null, threadId: t.thread_id, unread: t.unread_count > 0,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [help?.id, isDemo, user?.id, loading]);

  const handleRespond = async (status, assignmentId, person) => {
    if (!assignmentId) return;
    setRespondingId(assignmentId);
    setRespondError('');
    try {
      const respondRes = await api.put(`/assignments/${assignmentId}/respond`, { status });
      await Promise.all([
        api.get(`/help/${id}`).then(res => setHelp(res.data)).catch(() => {}),
        refetchCounterpart(),
      ]);
      // Accepting a beneficiary (or, symmetrically, a helper's application)
      // shows the "thank you for accepting" popup first; dismissing it
      // sends the Creator to Home (see acceptedPerson below), not to Chat.
      // Doesn't apply to an admin's own Accept — that IS the approval (no
      // "once Admin approves" to wait on), and admin has no personal Chats
      // inbox to open anyway. respondRes.data.admin_approved tells us
      // whether Auto-approval rule 1 (routes/assignments.js) fired right
      // here — if so the popup should say so instead of the usual "waiting
      // on Admin" wording, since there's nothing left to wait on.
      if (status === 'confirmed' && !isAdmin) setAcceptedPerson({ ...person, autoApproved: !!respondRes.data.admin_approved });
    } catch (err) {
      setRespondError(err.response?.data?.error || 'Could not update the request — please try again.');
    } finally {
      setRespondingId(null);
    }
  };

  // Sends a fresh request against this help item — a helper applies (POST
  // /assignments/apply), a beneficiary requests (POST /assignments/request),
  // same role-based endpoint choice as Map View's Select/Request popup. Only
  // ever shown to a non-owner who hasn't already got a request in (see
  // canApply below), which today mainly means Remar Store items reached by
  // browsing Store rather than Map View — Map View's own popup still works
  // exactly as before and is unaffected by this.
  const handleApply = async () => {
    setApplying(true);
    setApplyError('');
    try {
      const endpoint = isHelper ? '/assignments/apply' : '/assignments/request';
      await api.post(endpoint, { help_row_id: help.id, logistics_preference: applyLogistics.length ? applyLogistics : undefined });
      await refetchCounterpart();
    } catch (err) {
      setApplyError(err.response?.data?.error || 'Could not send this request — please try again.');
    } finally {
      setApplying(false);
    }
  };

  // Mutual scheduled/completed confirmation — once admin has approved a
  // match, Cancel/Modify/Delete are replaced by two independent yes/no
  // checkboxes (one per question) for BOTH parties. Each side only ever
  // toggles their own flag (creator_scheduled/consumer_scheduled and
  // creator_completed/consumer_completed on the assignment); the status only
  // advances to Scheduled/Completed once both sides have ticked the same
  // box — see PUT /assignments/:id/ack and getStatusLabel's bothScheduled
  // param / the server's own both-completed check.
  const [ackBusyType, setAckBusyType] = useState(null);
  const [ackError, setAckError] = useState('');

  const handleAck = async (type, value) => {
    if (!confirmedCounterpart?.assignment_id) return;
    setAckBusyType(type);
    setAckError('');
    try {
      await api.put(`/assignments/${confirmedCounterpart.assignment_id}/ack`, { type, value });
      await Promise.all([
        api.get(`/help/${id}`).then(res => setHelp(res.data)).catch(() => {}),
        refetchCounterpart(),
      ]);
    } catch (err) {
      setAckError(err.response?.data?.error || 'Could not update — please try again.');
    } finally {
      setAckBusyType(null);
    }
  };

  // In-app confirmation popup (see ConfirmModal.jsx) instead of the browser's
  // native window.confirm() — 'delete' | 'revoke' | null. Both Delete and
  // Revoke below open this rather than acting immediately; the modal's own
  // Confirm button is what actually runs handleCancel/the revoke respond
  // call.
  const [confirmModal, setConfirmModal] = useState(null);

  const handleCancel = async () => {
    if (isDemo) {
      setCancelled(true);
      setTimeout(() => navigate('/home'), 900);
      return;
    }
    setCancelling(true);
    setCancelError('');
    try {
      await api.put(`/help/${id}`, { ...help, status: 'cancelled' });
      setCancelled(true);
      setTimeout(() => navigate('/home'), 900);
    } catch (err) {
      setCancelError(err.response?.data?.error || 'Could not delete — only the person who created this help item, or an admin, can delete it.');
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!confirmedCounterpart?.assignment_id) return;
    setFeedbackSubmitting(true);
    setFeedbackError('');
    try {
      await api.put(`/assignments/${confirmedCounterpart.assignment_id}/feedback`, {
        feedback: feedback.trim() || null, rating: rating || null,
      });
      // Once submitted, the box stays showing exactly what was sent
      // (frozen, disabled styling) rather than reopening for edits —
      // refetching updates confirmedCounterpart so admin (and this
      // viewer, on a later visit) sees it too.
      setFeedbackSaved(true);
      await refetchCounterpart();
    } catch (err) {
      setFeedbackError(err.response?.data?.error || 'Could not submit feedback — please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  if (notFound || !help) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-sm text-gray-500 mb-4">This help request couldn't be found.</p>
        </div>
      </div>
    );
  }

  const label = getStatusLabel(help.status, help.scheduled_date);
  const isCompleted = label === 'Completed';
  const isEditable = !isDemo && label !== 'Deleted' && !isCompleted;
  // This page is shared between Home's Help ongoing and Help history tables
  // (both link to the same /help/:id route) — the title reflects which one
  // this item actually belongs to rather than staying a generic "Help",
  // using the same isHistoryRow split the two tables themselves use
  // (completed or deleted = history, everything else = ongoing).
  const pageTitle = (isCompleted || label === 'Deleted') ? 'Help history' : 'Help ongoing';
  // Only whoever created this help item — or an admin, reviewing/approving
  // requests from this same page as their "manual acceptance" — can
  // accept/reject the requests against it. Works for both directions since
  // counterpart is already scoped server-side to the viewer's own role: a
  // beneficiary approving a helper's application to their request (existing
  // flow), or a helper accepting a beneficiary's request against their own
  // offered item (new Select flow). A non-owner only ever sees their own
  // single request here (also server-scoped), with no action buttons —
  // they're the one waiting.
  const isOwner = !isDemo && (help.created_by === user?.id || isAdmin);
  // A Remar Store item's "creator" is one of its two system accounts (see
  // db.js) — direction is only ever set on a Remar Store/admin-owned item
  // (see POST /help), so it doubles as "this item really was created by
  // Admin" for the request-flow gating just below.
  const isStoreItem = !!help.direction;
  // A brand-new, still-'pending' request has to reach the item's REAL
  // creator first — only once they've accepted it (moving it to
  // 'confirmed') does it reach admin for final sign-off (see PUT
  // /assignments/:id/respond's matching server-side check). Admin only
  // skips straight to seeing/acting on a still-pending request for a Remar
  // Store item, where admin already stands in for the (login-less) system
  // account as the real creator. Everywhere else, admin viewing a non-owned
  // item before its creator has responded sees the same read-only view a
  // non-owner would — no Accept/Reject buttons yet.
  const canRespondToFreshRequests = !isDemo && (help.created_by === user?.id || (isAdmin && isStoreItem));
  // A non-owner only ever lands on this page because they themselves picked
  // this exact help item (Map View's Select/Request) — so unlike the owner,
  // who may have zero-to-many still-undecided candidates, a non-owner's
  // counterpart (the item's creator) is already known the moment they sent
  // that request, whether or not the owner has accepted it yet. Falls back
  // through pending too rather than only 'confirmed' so the UI doesn't
  // pretend "Not yet assigned" about someone they explicitly chose.
  const myOwnRequest = !isOwner ? (counterpart.confirmed || (counterpart.pending || [])[0] || null) : null;
  const confirmedCounterpart = isOwner ? counterpart.confirmed : myOwnRequest;
  // Once a help item is Completed, its actual matched assignment (and only
  // that one) has itself reached assignment_status 'completed' too — a
  // losing requester's own request just sits at 'pending' forever instead
  // (nothing ever rejects it outright), so this is a reliable way to tell
  // the real matched party (creator or consumer) apart from someone whose
  // request was simply never accepted. Used to keep the Help feedback
  // section from showing for that non-matched requester once the item's
  // done — they were never part of the actual delivery, so there's nothing
  // for them to rate.
  const isMatchedParty = confirmedCounterpart?.assignment_status === 'completed';
  // Item 3 fix: admin's own GET /:id/counterpart branch already shapes
  // `pending` as "every still-relevant request" — fresh 'pending' rows,
  // confirmed-but-not-yet-admin-approved rows, AND already-approved ones
  // (kept around so the Requests list can keep showing "Approved on …" in
  // place — see the server-side comment on that query). Gating this whole
  // array behind canRespondToFreshRequests (which is deliberately false for
  // admin on a non-Store item — the real creator has to act first) used to
  // hide ALL of it, including rows the creator HAD already accepted and
  // that were just waiting on admin's own sign-off — so that half of the
  // creator-first-then-admin flow silently disappeared for every non-Store
  // item. Admin always gets the full list now; canRespondToFreshRequests
  // still decides (per-row, below) whether Accept/Reject buttons render on
  // a still-genuinely-fresh request.
  const pendingRequests = isAdmin ? (counterpart.pending || []) : (canRespondToFreshRequests ? (counterpart.pending || []) : []);
  // isStoreItem is already computed above (it also gates
  // canRespondToFreshRequests) — reused here for the same "nobody can log in
  // to tick this side's boxes directly" reason: admin needs to see the ack
  // checkboxes too, standing in for the creator (same proxy PUT
  // /assignments/:id/ack already allows server-side).
  // Once the admin has approved the match (help.status only ever reaches
  // 'assigned' post-approval — see helpStatus.js notes), Cancel/Modify/
  // Delete give way to the two mutual-confirmation checkboxes below, for
  // both the creator (owner) and the consumer (non-owner) side — not just
  // the owner. Skipped for a regular (non-Store) admin-viewed item (which
  // instead gets its own Unmatch/Delete row, since nobody stands in for a
  // real person's own side) and demo items (no real assignment to ack
  // against).
  const showAckQuestions = !isDemo && help.status === 'assigned' && !!confirmedCounterpart && (!isAdmin || isStoreItem);
  const myScheduled = confirmedCounterpart ? (isOwner ? confirmedCounterpart.creator_scheduled : confirmedCounterpart.consumer_scheduled) : false;
  const counterpartScheduled = confirmedCounterpart ? (isOwner ? confirmedCounterpart.consumer_scheduled : confirmedCounterpart.creator_scheduled) : false;
  const myDeliveryCompleted = confirmedCounterpart ? (isOwner ? confirmedCounterpart.creator_completed : confirmedCounterpart.consumer_completed) : false;
  const counterpartDeliveryCompleted = confirmedCounterpart ? (isOwner ? confirmedCounterpart.consumer_completed : confirmedCounterpart.creator_completed) : false;
  // Revoking — a non-owner "unsending" their own still-pending request.
  // Only meaningful while it's still pending; once the owner has accepted
  // it, un-matching is the owner's Cancel button, not this one.
  const canRevoke = !isOwner && myOwnRequest && myOwnRequest.assignment_status === 'pending';
  // Apply/Request — a non-owner who's just browsing (hasn't sent a request
  // against this item yet, and it's still actually open) gets a Request/
  // Apply action right here on the detail page, same as Map View's Select/
  // Request popup — most relevant for Remar Store items, since browsing
  // Store lands directly on this page rather than going through Map View.
  const canApply = !isDemo && !isOwner && !isAdmin && help.status === 'open' && !myOwnRequest;
  const applyLogisticsOptions = Array.isArray(help.logistics_preference) ? help.logistics_preference : [];
  const applyHasLogisticsOptions = applyLogisticsOptions.length > 0;
  // Admin isn't "a helper" or "a beneficiary" the way isHelper assumes, so
  // the confirmed/pending rows carry their own role per-row instead (see
  // GET /help/:id/counterpart's admin branch) — fall back to whichever role
  // shows up first when nothing's confirmed yet.
  const adminCounterpartRole = isAdmin ? (counterpart.confirmed?.role || counterpart.pending?.[0]?.role) : null;
  // This help item's own creator — only populated for an admin viewer (see
  // GET /help/:id/counterpart's admin branch). Needed so the Requests list
  // below can show both sides of a request that's already been accepted by
  // the creator and is just waiting on the admin's own approval, not just
  // whoever's requesting.
  const creator = counterpart.creator || null;
  // Admin-only: whichever of creator/confirmedCounterpart is the helper vs.
  // the beneficiary — a match always pairs one of each, so between these two
  // known parties exactly one fills each slot (or neither, pre-match). Powers
  // the two side-by-side Helper/Beneficiary boxes below, replacing the
  // single "whichever one is the counterpart" box every other viewer sees.
  const helperParty = isAdmin ? (creator?.role === 'helper' ? creator : (confirmedCounterpart?.role === 'helper' ? confirmedCounterpart : null)) : null;
  const beneficiaryParty = isAdmin ? (creator?.role === 'beneficiary' ? creator : (confirmedCounterpart?.role === 'beneficiary' ? confirmedCounterpart : null)) : null;
  // Admin-only: both parties' post-completion feedback/rating, read off the
  // one confirmed assignment row (see PUT /assignments/:id/feedback) —
  // creator_* belongs to whichever of helper/beneficiary actually created
  // this help item (h.created_by), consumer_* to the other, regardless of
  // which role that happens to be, so this maps them onto the fixed
  // Helper/Beneficiary boxes below rather than creator/consumer ones.
  const creatorIsHelper = creator?.role === 'helper';
  const helperFeedback = confirmedCounterpart ? (creatorIsHelper ? confirmedCounterpart.creator_feedback : confirmedCounterpart.consumer_feedback) : null;
  const helperRating = confirmedCounterpart ? (creatorIsHelper ? confirmedCounterpart.creator_rating : confirmedCounterpart.consumer_rating) : null;
  const beneficiaryFeedback = confirmedCounterpart ? (creatorIsHelper ? confirmedCounterpart.consumer_feedback : confirmedCounterpart.creator_feedback) : null;
  const beneficiaryRating = confirmedCounterpart ? (creatorIsHelper ? confirmedCounterpart.consumer_rating : confirmedCounterpart.creator_rating) : null;
  // The real, permanent Help ID assigned at creation (e.g. XAAA0002) — same
  // value shown in the Help ongoing/history tables. Previously this showed
  // a truncated internal UUID instead, which never matched.
  const shortId = isDemo ? 'DEMO' : (help.help_id || `#${help.id.slice(0, 6).toUpperCase()}`);
  // Whichever role actually created this help item — a helper offering it
  // (Delivery preference) or a beneficiary requesting it (Collection
  // preference). Admin already has this directly (the `creator` object from
  // GET /help/:id/counterpart's admin branch); everyone else can work it out
  // from their own role plus whether they're the owner (isOwner === it's my
  // own item, so the creator role is simply my own; otherwise the creator is
  // whoever isn't me, i.e. the opposite role).
  const creatorRole = isAdmin ? (creator?.role || null) : (isOwner ? user?.role : (isHelper ? 'beneficiary' : 'helper'));
  const logisticsLabel = creatorRole === 'helper' ? 'Delivery preference' : creatorRole === 'beneficiary' ? 'Collection preference' : null;
  const logisticsValueLabels = creatorRole === 'beneficiary'
    ? { pickup: 'I can pick up', dropoff: 'Drop off at my location' }
    : { pickup: 'Pick up from my location', dropoff: 'I can drop off' };

  return (
    // Extra bottom padding on top of the base pb-28 (which just clears the
    // bottom nav) reserves room for the ChatWidget's current height plus a
    // 5mm gap, so scrolling all the way down always leaves Modify/Delete at
    // least 5mm above the topmost chat header instead of overlapping it —
    // only applied once a chat is actually open (chatWidgetHeight > 0).
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28"
      style={chatWidgetHeight > 0 ? { paddingBottom: `calc(7rem + ${chatWidgetHeight}px + 5mm)` } : undefined}>
      <div className="max-w-3xl mx-auto">

        {/* Title bar — same font as the "Help ongoing" / "Help history"
            labels on Home for visual consistency across these related pages.
            Reads "Help ongoing" or "Help history" (see pageTitle above)
            depending on which table this item actually belongs to — the
            specific Help ID is already shown in the "#" field of the card
            just below, so this stays a short status-of-page label rather
            than repeating it. */}
        <h1 className="text-xs text-gray-400 mb-5">{pageTitle}</h1>

        {cancelled && (
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-5 text-center text-sm font-semibold text-red-600">
            Help request deleted — taking you back to Home…
          </div>
        )}

        {/* # / Date / Service Type */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-400 mb-1">#</p>
            <p className="text-sm font-semibold text-gray-800">{shortId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Date</p>
            <p className="text-sm font-semibold text-gray-800">{formatDate(help.scheduled_date || help.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Service Type</p>
            <p className="text-sm font-semibold text-gray-800">{help.category || '—'}</p>
          </div>
        </div>

        {/* Sub-type + Item + New/Used (condition only shown when the help
            item actually has one — Food/Clothes/Toiletries items, per
            NewHelp.jsx) */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Service Sub-Type</p>
            <p className="text-sm font-semibold text-gray-800">{help.sub_category || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Item</p>
            <p className="text-sm font-semibold text-gray-800">{help.title || '—'}</p>
          </div>
          {help.condition && (
            <div>
              <p className="text-xs text-gray-400 mb-1">New / Used</p>
              <p className="text-sm font-semibold text-gray-800">
                {help.condition}{help.condition === 'Used' && help.age_value ? ` — ${help.age_value} ${help.age_unit || ''}`.trim() : ''}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-1">Quantity</p>
            <p className="text-sm font-semibold text-gray-800">
              {help.quantity != null ? `${help.quantity} ${help.unit || ''}`.trim() : '—'}
            </p>
          </div>
        </div>

        {/* Delivery preference (item created by a helper) / Collection
            preference (created by a beneficiary) — Food/Clothes/Toiletries
            only, set on New Help below Quantity (see NewHelp.jsx). Shown
            here right below the Quantity field above, same section pairing
            as on the form itself. */}
        {logisticsLabel && Array.isArray(help.logistics_preference) && help.logistics_preference.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <LogisticsTickList label={logisticsLabel} values={help.logistics_preference} valueLabels={logisticsValueLabels} />
          </div>
        )}

        {/* Description — kept separate from Item so both stay readable
            instead of being squeezed into one truncated line. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
          <p className="text-xs text-gray-400 mb-1">Description</p>
          <p className="text-sm text-gray-700">{help.description || 'No additional description provided'}</p>
        </div>

        {/* Photos — optional, only ever uploaded for Food/Clothes/Toiletries
            items (see NewHelp.jsx). Always shown, with a plain empty state
            when there aren't any, rather than hiding the whole section. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
          <p className="text-xs text-gray-400 mb-2">Photos</p>
          {Array.isArray(help.photo_urls) && help.photo_urls.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {help.photo_urls.map((src, idx) => (
                <button key={idx} type="button" onClick={() => setLightboxSrc(src)} className="block">
                  <img src={src} alt={`Photo ${idx + 1}`}
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition cursor-zoom-in" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No photos uploaded</p>
          )}
        </div>

        {/* Location — admin-only, Remar Store items only. Re-surfaces the
            city/pincode fields GET /help/:id already returns (location_city/
            location_pincode) right below Photos, for admin's own visibility
            into where a Store item is fulfilled from; regular Help ID pages
            keep the Location section removed elsewhere in the app. */}
        {isAdmin && isStoreItem && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <p className="text-xs text-gray-400 mb-1">Location</p>
            <p className="text-sm text-gray-700">
              {help.is_online ? 'Online' : [help.location_city, help.location_pincode].filter(Boolean).join(', ') || 'Not specified'}
            </p>
          </div>
        )}

        {/* Counterpart profile. Admin sees both sides at once — a Helper box
            and a Beneficiary box side by side (helper left of beneficiary),
            rather than just "the counterpart" — since admin isn't a party to
            the match, both matter equally. Everyone else still sees the
            single "other party" box they always have. Once someone's
            assigned, their nickname/surname is directly clickable to pop up
            their profile — no separate "View profile" button needed. */}
        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white rounded-2xl shadow-lg p-4 flex flex-col items-center justify-center text-center gap-1.5">
              <p className="text-xs text-gray-400">Helper</p>
              {helperParty ? (
                <button type="button" onClick={() => setPopupPerson({ id: helperParty.id, role: helperParty.role })}
                  className="text-sm font-semibold text-gray-800 hover:underline">
                  {displayName(helperParty)}
                </button>
              ) : (
                <p className="text-sm font-semibold text-gray-800">Not yet assigned</p>
              )}
              {/* Item 3 — chat with this party once matched, but only for a
                  Store item (isStoreItem) and only the real consumer side —
                  never the "Remar Store" creator side, a login-less system
                  account nobody would ever read a message sent to. */}
              {isStoreItem && helperParty && helperParty === confirmedCounterpart && (
                <button type="button" onClick={() => openChat(helperParty)}
                  className="text-xs font-semibold px-3.5 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                  Chat
                </button>
              )}
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-4 flex flex-col items-center justify-center text-center gap-1.5">
              <p className="text-xs text-gray-400">Beneficiary</p>
              {beneficiaryParty ? (
                <button type="button" onClick={() => setPopupPerson({ id: beneficiaryParty.id, role: beneficiaryParty.role })}
                  className="text-sm font-semibold text-gray-800 hover:underline">
                  {displayName(beneficiaryParty)}
                </button>
              ) : (
                <p className="text-sm font-semibold text-gray-800">Not yet assigned</p>
              )}
              {isStoreItem && beneficiaryParty && beneficiaryParty === confirmedCounterpart && (
                <button type="button" onClick={() => openChat(beneficiaryParty)}
                  className="text-xs font-semibold px-3.5 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                  Chat
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 flex flex-col items-center justify-center text-center gap-1.5">
            <p className="text-xs text-gray-400">{isHelper ? 'Beneficiary' : 'Helper'}</p>
            {/* Nickname/surname is itself the profile popup trigger — same
                pattern as the admin dual-box view above — so there's no
                separate "View profile" button anywhere on this page. */}
            {confirmedCounterpart ? (
              <button type="button" onClick={() => setPopupPerson({ id: confirmedCounterpart.id, role: confirmedCounterpart.role })}
                className="text-sm font-semibold text-gray-800 hover:underline">
                {displayName(confirmedCounterpart)}
              </button>
            ) : (
              <p className="text-sm font-semibold text-gray-800">Not yet assigned</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <button type="button" disabled={!confirmedCounterpart} onClick={() => openChat(confirmedCounterpart)}
                className="text-xs font-semibold px-4 py-2 rounded-full text-white transition disabled:opacity-40 disabled:cursor-default"
                style={{ backgroundColor: '#3a6b00' }}>
                Chat
              </button>
              {/* Cancel a match even after it's been accepted — the item's
                  owner only, once the creator has accepted the request (there's
                  a confirmedCounterpart). Doesn't reject/delete the request
                  outright, it reverts the assignment (and this help item) back
                  to "Requested" so it's still there, just no longer matched.
                  Lives here now (View profile / Chat / Cancel) rather than its
                  own separate row further down. */}
              {!isAdmin && isOwner && confirmedCounterpart && !showAckQuestions && (
                <button type="button" onClick={() => handleRespond('pending', confirmedCounterpart.assignment_id, null)}
                  disabled={respondingId === confirmedCounterpart.assignment_id}
                  className="text-xs font-semibold px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                  {respondingId === confirmedCounterpart.assignment_id ? '…' : 'Cancel'}
                </button>
              )}
              {/* Withdraw — the non-owner (consumer) side un-sending their own
                  request while it's still pending. Same action the standalone
                  "Revoke" row used to hold below Chatbot, renamed first to
                  Cancel and moved up here (View profile / Chat / Withdraw),
                  then to Withdraw to better name what it actually does —
                  the item itself isn't cancelled/deleted, only this one
                  person's own pending request on it (helps.status is never
                  touched by this — see PUT /assignments/:id/respond — so the
                  item simply becomes requestable again by anyone, including
                  this same person, once no other active request remains).
                  Kept visually next to the owner's own (still separately-
                  named) Cancel button above, once there's something to show
                  it against (myOwnRequest === confirmedCounterpart for a
                  non-owner, whether pending or already matched — see its
                  definition above). */}
              {canRevoke && (
                <button type="button"
                  onClick={() => setConfirmModal('revoke')}
                  disabled={respondingId === myOwnRequest.assignment_id || isCompleted}
                  className="text-xs font-semibold px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                  {respondingId === myOwnRequest.assignment_id ? '…' : 'Withdraw'}
                </button>
              )}
            </div>
            {respondError && ((!isAdmin && isOwner && confirmedCounterpart && !showAckQuestions) || canRevoke) && (
              <p className="text-xs text-red-600 text-center mt-1">{respondError}</p>
            )}
          </div>
        )}

        {/* Value + Hours approval box — admin-only, shown once this Help ID
            has been Matched (help.status reaches 'assigned' the moment
            admin_approved flips true, whichever of the three paths in
            assignments.js caused it) and stays visible straight through
            Completed — deliberately NOT nested inside the Requests list
            below, since that list can stop showing this match entirely once
            it's Completed (see its own comment), which would otherwise take
            this box down with it. Server fills in defaults from Help.xlsx
            pricing the moment admin_approved flips true (see
            helpPricing.js); admin can overwrite either figure here right up
            until Completed, at which point the numbers freeze (read-only)
            for reporting — see AdminReports.jsx's Value/Hours/TAT tiles.
            {currency} matches whatever the admin has chosen under Settings >
            App preferences > Currency. */}
        {isAdmin && !isDemo && (help.status === 'assigned' || help.status === 'completed') && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <h2 className="font-semibold remar-green text-sm mb-3">Estimated contribution</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Value</p>
                {isCompleted ? (
                  <p className="text-sm font-semibold text-gray-800">
                    {help.value != null ? `${currency} ${Number(help.value).toFixed(2)}` : '—'}
                  </p>
                ) : (
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs text-gray-500">{currency}</span>
                    <input type="number" step="0.01" min="0" value={adminValueDraft}
                      onChange={e => setAdminValueDraft(e.target.value)}
                      onBlur={handleSaveAdminValue}
                      className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs text-gray-700 text-center" />
                  </div>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Hour(s)</p>
                {isCompleted ? (
                  <p className="text-sm font-semibold text-gray-800">{help.duration_hours != null ? help.duration_hours : '—'}</p>
                ) : (
                  <input type="number" step="0.5" min="0" value={adminHoursDraft}
                    onChange={e => setAdminHoursDraft(e.target.value)}
                    onBlur={handleSaveAdminValue}
                    className="w-16 mx-auto block border border-gray-300 rounded px-1.5 py-1 text-xs text-gray-700 text-center" />
                )}
              </div>
            </div>
            {adminValueSaving && <p className="text-[10px] text-gray-400 text-center mt-2">Saving…</p>}
            {adminValueError && <p className="text-xs text-red-600 text-center mt-2">{adminValueError}</p>}
          </div>
        )}

        {/* Apply/Request — a non-owner who hasn't sent a request yet gets a
            way to do so right here, same as Map View's Select/Request popup
            (see handleApply above). Most relevant for Remar Store items,
            reached by browsing Store rather than Map View, which otherwise
            had no way to actually request them — but works the same for any
            other still-open item this viewer lands on directly. Requires
            picking at least one delivery/collection option first whenever
            the item actually offers any, same rule as Map View's popup. */}
        {canApply && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <h2 className="font-semibold remar-green text-sm mb-3">
              {isHelper ? 'Apply for this help item' : 'Request this help item'}
            </h2>
            {applyHasLogisticsOptions && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-1.5">
                  {isHelper ? 'Delivery preference' : 'Collection preference'} — select the one(s) that work for you
                </p>
                <div className="space-y-1.5">
                  {applyLogisticsOptions.map((v) => {
                    const optLabel = isHelper
                      ? { pickup: 'Pick up from my location', dropoff: 'I can drop off' }[v]
                      : { pickup: 'I can pick up', dropoff: 'Drop off at my location' }[v];
                    return (
                      <label key={v} className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={applyLogistics.includes(v)}
                          onChange={() => setApplyLogistics(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))}
                          className="w-4 h-4 accent-[#3a6b00]" />
                        <span className="text-sm text-gray-700">{optLabel || v}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {applyError && <p className="text-xs text-red-600 mb-2">{applyError}</p>}
            <button type="button" onClick={() => setConfirmApply(true)}
              disabled={applying || (applyHasLogisticsOptions && applyLogistics.length === 0)}
              className="w-full text-white font-semibold text-sm rounded-lg py-2.5 transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#3a6b00' }}>
              {applying ? 'Sending…' : (isHelper ? 'Apply' : 'Request')}
            </button>
          </div>
        )}

        {/* Requests — every open request against this item (multiple
            beneficiaries can select the same helper-offered item, or
            multiple helpers can apply to the same beneficiary request),
            oldest first, with Chat/Reject/Accept on each. Owner-only — a
            non-owner's single request against this item is already shown
            up in the Counterpart profile box above (with its own Chat and
            Cancel), so there's nothing left for this list to add for them. */}
        {isOwner && pendingRequests.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <h2 className="font-semibold remar-green text-sm mb-3 flex items-baseline gap-2">
              <span>Requests ({pendingRequests.length})</span>
              {pendingRequests.length > 1 && (
                <span className="font-normal text-gray-400 text-xs">first in list, ordered first</span>
              )}
            </h2>
            {respondError && <p className="text-xs text-red-600 mb-2">{respondError}</p>}
            <div className="space-y-2.5">
              {pendingRequests.map((p) => {
                const isBusy = respondingId === p.assignment_id;
                // Admin always gets the Creator/Consumer layout below,
                // regardless of whether the help item's own creator has
                // accepted this particular request yet (assignment_status
                // 'pending') or already has and it's just waiting on the
                // admin's own sign-off ('confirmed') — previously this only
                // applied to the 'confirmed' case, so most requests (still
                // plain 'pending' the moment an admin opens the item from
                // Help ongoing) fell through to the old single-name layout
                // below instead. Admin approving here works either way (see
                // PUT /assignments/:id/respond — isOwner is true for admin
                // regardless of the row's current status), so there's no
                // reason to gate the layout on it.
                if (isAdmin) {
                  const creatorRoleLabel = creator ? (creator.role === 'helper' ? 'Helper' : 'Beneficiary') : '—';
                  const consumerRoleLabel = p.role === 'helper' ? 'Helper' : 'Beneficiary';
                  const isApproved = p.assignment_status === 'confirmed' && p.admin_approved;
                  const awaitingApproval = p.assignment_status === 'confirmed' && !p.admin_approved;
                  // Item 3 fix: a still-genuinely-'pending' row (the real
                  // creator hasn't accepted it yet) is shown to admin here
                  // read-only for a non-Store item — same creator-first rule
                  // as canRespondToFreshRequests already enforces everywhere
                  // else, just applied per-row now that this list also
                  // carries confirmed-awaiting-approval rows admin SHOULD be
                  // able to act on (see pendingRequests above).
                  const canActOnThis = awaitingApproval || canRespondToFreshRequests;
                  return (
                    <div key={p.assignment_id} className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-3">
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${isApproved ? 'text-green-600' : 'text-amber-500'}`}>
                        {isApproved ? `Approved on ${formatDateTime(p.updated_at)}` : awaitingApproval ? 'Awaiting your approval' : canActOnThis ? 'Pending request' : 'Pending request — awaiting the creator'}
                      </p>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Creator</p>
                          <p className="text-xs text-gray-500">
                            {creatorRoleLabel}{creator?.member_number ? ` · ${creator.member_number}` : ''}
                          </p>
                          <button type="button" disabled={!creator} onClick={() => creator && setPopupPerson({ id: creator.id, role: creator.role })}
                            className="text-sm font-semibold text-gray-800 truncate text-left hover:underline disabled:no-underline disabled:cursor-default">
                            {creator ? displayName(creator) : '—'}
                          </button>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Consumer</p>
                          <p className="text-xs text-gray-500">
                            {consumerRoleLabel}{p.member_number ? ` · ${p.member_number}` : ''}
                          </p>
                          <button type="button" onClick={() => setPopupPerson({ id: p.id, role: p.role })}
                            className="text-sm font-semibold text-gray-800 truncate text-left hover:underline">
                            {displayName(p)}
                          </button>
                        </div>
                      </div>
                      {/* Chat (item 3) — admin standing in for the real
                          creator on a Remar Store item now gets a Chat option
                          against the consumer/requester side too, same as a
                          real helper/beneficiary creator would from the
                          equivalent non-admin row below. Chatting with
                          "Remar Store" itself (the creator side, a
                          login-less system account) wouldn't reach anyone,
                          so this is only ever offered against the consumer
                          `p`, and only for a Store item — a regular item's
                          creator/consumer are real people who already have
                          their own Chat buttons elsewhere on this page. */}
                      {isStoreItem && (
                        <div className="flex items-center justify-center">
                          <button type="button" onClick={() => openChat(p)}
                            className="text-xs font-semibold px-4 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-white transition">
                            Chat
                          </button>
                        </div>
                      )}
                      {!isApproved && canActOnThis && (
                        <div className="flex items-center justify-center gap-3">
                          <button type="button" onClick={() => handleRespond('cancelled', p.assignment_id, p)} disabled={isBusy || isCompleted}
                            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-red-600 text-white transition disabled:opacity-50 hover:opacity-90">
                            Reject
                          </button>
                          <button type="button" onClick={() => setConfirmApprove({ assignmentId: p.assignment_id, person: p })} disabled={isBusy || isCompleted}
                            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-green-600 text-white transition disabled:opacity-50 hover:opacity-90">
                            {isBusy ? '…' : 'Approve'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={p.assignment_id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <button type="button" onClick={() => setPopupPerson({ id: p.id, role: p.role })}
                        className="text-sm font-semibold text-gray-800 truncate text-left hover:underline">
                        {displayName(p)}
                      </button>
                      <p className="text-xs text-gray-400">{formatDate(p.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* This row only ever renders for a non-admin owner —
                          admin always takes the Creator/Consumer layout
                          branch above instead (see isAdmin return earlier in
                          this .map, and its own Chat button for item 3). */}
                      {!isAdmin && (
                        <button type="button" onClick={() => openChat(p)}
                          className="text-xs font-semibold px-3.5 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-white transition">
                          Chat
                        </button>
                      )}
                      {isOwner && (
                        <>
                          <button type="button" onClick={() => handleRespond('cancelled', p.assignment_id, p)} disabled={isBusy || isCompleted}
                            className="text-xs font-semibold px-3.5 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-white transition disabled:opacity-50">
                            Reject
                          </button>
                          <button type="button" onClick={() => setConfirmApprove({ assignmentId: p.assignment_id, person: p })} disabled={isBusy || isCompleted}
                            className="text-xs font-semibold px-3.5 py-1.5 rounded-full text-white transition disabled:opacity-50" style={{ backgroundColor: '#3a6b00' }}>
                            {isBusy ? '…' : 'Accept'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chatbot — a helper/beneficiary's own support shortcut, not
            something an admin (who's reviewing someone else's help item, not
            asking for support themselves) needs on this page. */}
        {!isAdmin && (
          <button type="button" onClick={() => navigate('/support/chatbot')}
            className="w-full bg-white rounded-2xl shadow-lg p-5 mb-5 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mb-2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3.5" />
              <circle cx="12" cy="16.5" r="0.5" fill="#9ca3af" />
            </svg>
            <p className="text-sm font-semibold text-gray-700">Chatbot</p>
            <p className="text-xs text-gray-400 mt-1">Get quick answers from the support chatbot</p>
          </button>
        )}

        {/* Item 12 — optional post-match Schedule: only once this Help ID is
            actually Matched (same gate as the Delivery progress card below),
            and not for a demo item (no real assignment to schedule against).
            Creator only — setting up the date/time/venue and sending the
            calendar invite is the item owner's call, not the consumer's, so
            this no longer shows (read-only or otherwise) on the consumer's
            side. Uses canRespondToFreshRequests rather than isOwner for this
            gate, same as the ack questions below, so admin only stands in as
            "the creator" here for a Remar Store item (no login-able account
            of its own to do this) — not for a regular item, where admin
            isn't really the creator and shouldn't be scheduling on their
            behalf. Sits above Delivery progress now rather than below it,
            since scheduling logically comes before tracking delivery
            progress against that schedule. */}
        {!isDemo && canRespondToFreshRequests && !!confirmedCounterpart && ['assigned', 'completed'].includes(help.status) && (
          <ScheduleCard
            help={help}
            assignmentId={confirmedCounterpart.assignment_id}
            calendarDatetime={confirmedCounterpart.calendar_datetime}
            calendarDurationMinutes={confirmedCounterpart.calendar_duration_minutes}
            calendarMeetingLink={confirmedCounterpart.calendar_meeting_link}
            calendarVenue={confirmedCounterpart.calendar_venue}
            calendarSentAt={confirmedCounterpart.calendar_sent_at}
            isCompleted={isCompleted}
            onUpdated={refetchCounterpart}
          />
        )}

        {/* Mutual scheduled/completed confirmation — replaces Cancel/Modify/
            Delete for both parties once admin has approved the match. Each
            checkbox only reflects and toggles the current viewer's own side
            (creator vs. consumer); the small note beneath each shows whether
            the other party has confirmed their side too, since the status
            only advances once both have. */}
        {showAckQuestions && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 space-y-4">
            <h2 className="font-semibold remar-green text-sm">Delivery progress</h2>
            {ackError && <p className="text-xs text-red-600">{ackError}</p>}
            <div>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-gray-700">Is the delivery scheduled?</span>
                <input type="checkbox" checked={!!myScheduled} disabled={ackBusyType === 'scheduled'}
                  onChange={e => handleAck('scheduled', e.target.checked)}
                  className="w-5 h-5 accent-[#3a6b00]" />
              </label>
              <p className="text-xs text-gray-400 mt-1">
                {counterpartScheduled ? 'The other party has also confirmed scheduling.' : 'Waiting on the other party to confirm scheduling.'}
              </p>
            </div>
            <div>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-gray-700">Is the delivery completed?</span>
                <input type="checkbox" checked={!!myDeliveryCompleted} disabled={ackBusyType === 'completed'}
                  onChange={e => handleAck('completed', e.target.checked)}
                  className="w-5 h-5 accent-[#3a6b00]" />
              </label>
              <p className="text-xs text-gray-400 mt-1">
                {counterpartDeliveryCompleted ? 'The other party has also confirmed completion.' : 'Waiting on the other party to confirm completion.'}
              </p>
            </div>
          </div>
        )}

        {/* Frozen Scheduled/Delivered record — once a help item reaches
            Completed, both mutual-confirmation questions above have
            necessarily already been ticked by both sides (that's how it got
            here — see the server's both-completed check), so this shows the
            same two questions read-only instead of just dropping them,
            for every viewer and every item (including ones created by
            Admin/Remar Store). Sits above Help feedback, same position the
            live checkboxes above have while still in progress. */}
        {isCompleted && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 space-y-3">
            <h2 className="font-semibold remar-green text-sm">Delivery progress</h2>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">Help has been scheduled</span>
              <input type="checkbox" checked disabled className="w-5 h-5 accent-[#3a6b00] opacity-70" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">Help has been delivered</span>
              <input type="checkbox" checked disabled className="w-5 h-5 accent-[#3a6b00] opacity-70" />
            </label>
          </div>
        )}

        {/* Help feedback + rating — only meaningful once the help item is
            actually completed, so it's hidden until then instead of asking
            for a rating on something still in progress. Admin isn't a party
            to the match (there's no "admin's own feedback" to give), so
            instead of the submit form, admin gets a read-only view of both
            the helper's and the beneficiary's own feedback/rating side by
            side — see PUT /assignments/:id/feedback. A non-admin who isn't
            isMatchedParty (a losing requester — their own request was never
            the one accepted) gets neither view: they weren't part of the
            actual delivery, so there's nothing here for them. */}
        {isCompleted && (isAdmin ? (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 space-y-4">
            <h2 className="font-semibold remar-green text-sm">Help feedback</h2>
            {[
              { label: 'Helper', feedback: helperFeedback, rating: helperRating },
              { label: 'Beneficiary', feedback: beneficiaryFeedback, rating: beneficiaryRating },
            ].map(({ label: partyLabel, feedback: partyFeedback, rating: partyRating }) => (
              <div key={partyLabel} className="bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="text-xs font-semibold text-gray-500">{partyLabel}</p>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} className="text-base leading-none" style={{ color: partyRating && n <= partyRating ? '#d97706' : '#e5e7eb' }}>★</span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-gray-700">{partyFeedback || <span className="text-gray-400">No feedback submitted yet.</span>}</p>
              </div>
            ))}
          </div>
        ) : isMatchedParty ? (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <h2 className="font-semibold remar-green text-sm mb-4">Help feedback</h2>
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              {feedbackError && <p className="text-xs text-red-600">{feedbackError}</p>}
              <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)}
                placeholder="How did it go?" disabled={feedbackSaved} readOnly={feedbackSaved}
                className={`w-full border rounded-lg px-4 py-2.5 text-sm resize-none ${feedbackSaved ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-remar'}`} />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 mr-1">Help rating</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => !feedbackSaved && setRating(n)} disabled={feedbackSaved}
                      className={`text-xl leading-none ${feedbackSaved ? 'cursor-default' : ''}`}
                      style={{ color: n <= rating ? (feedbackSaved ? '#9ca3af' : '#d97706') : '#e5e7eb' }}>
                      ★
                    </button>
                  ))}
                </div>
                {!feedbackSaved && (
                  <button type="submit" disabled={feedbackSubmitting} className="text-sm font-semibold text-white px-5 py-2 rounded-full transition disabled:opacity-50" style={{ backgroundColor: '#3a6b00' }}>
                    {feedbackSubmitting ? 'Submitting…' : 'Submit feedback'}
                  </button>
                )}
              </div>
              {feedbackSaved && <p className="text-xs text-gray-400 text-right">Submitted — thank you for your feedback.</p>}
            </form>
          </div>
        ) : null)}

        {cancelError && <p className="text-xs text-red-600 text-center mb-3">{cancelError}</p>}

        {/* Modify / Delete Help — owner (or admin) only; a non-owner has no
            business editing or deleting someone else's help item, they get
            Cancel on their own request instead (see the Counterpart profile
            box above). No Back or Main Menu here either — the bottom nav
            already covers navigating away from this page.

            Admin-only swap: once admin has approved a match (there's a
            confirmedCounterpart), "Modify" becomes "Unmatch" in the same
            spot — un-matching the creator/consumer pairing (reverts the
            assignment, and this help item's status, back to "Requested")
            rather than editing the item's details, since editing a live
            matched item isn't the more useful action here. Reuses the same
            un-matching call as the non-admin owner's Cancel button above. */}
        {isOwner && isEditable && !showAckQuestions && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isAdmin && confirmedCounterpart ? (
              <button type="button" onClick={() => handleRespond('pending', confirmedCounterpart.assignment_id, null)}
                disabled={respondingId === confirmedCounterpart.assignment_id}
                className="text-sm font-semibold px-5 py-2.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                {respondingId === confirmedCounterpart.assignment_id ? '…' : 'Unmatch'}
              </button>
            ) : (
              <button type="button" onClick={() => navigate(`/help/${help.id}/edit`)}
                className="text-sm font-semibold px-5 py-2.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Modify
              </button>
            )}
            <button type="button" onClick={() => setConfirmModal('delete')} disabled={cancelling}
              className="text-sm font-semibold px-5 py-2.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50">
              {cancelling ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}

        {popupPerson && (
          <ProfilePopup id={popupPerson.id} role={popupPerson.role} onClose={() => setPopupPerson(null)} />
        )}

        {/* In-app confirmation for Delete/Revoke — replaces the browser's
            native window.confirm(), which doesn't render inside the app UI
            (and, per task history, can hang the debugging/automation tools
            that drive this app). */}
        <ConfirmModal open={confirmModal === 'delete'} title="Delete this help request?"
          message="This can't be undone." confirmLabel="Delete" danger
          onConfirm={() => { setConfirmModal(null); handleCancel(); }}
          onCancel={() => setConfirmModal(null)} />
        <ConfirmModal open={confirmModal === 'revoke'} title="Withdraw your request?"
          message="This can't be undone. The item itself isn't affected — it just becomes requestable again." confirmLabel="Withdraw" danger
          onConfirm={() => { setConfirmModal(null); handleRespond('cancelled', myOwnRequest.assignment_id, null); }}
          onCancel={() => setConfirmModal(null)} />

        {/* Item 4 — confirm before sending a Request/Apply, and before
            Accept/Approve (covers both the creator's own Accept and admin's
            final sign-off, since both funnel through the same handleRespond
            call — see confirmApprove above). */}
        <ConfirmModal open={confirmApply}
          title={isHelper ? 'Are you sure you want to apply?' : 'Are you sure you want to request?'}
          confirmLabel={isHelper ? 'Apply' : 'Request'}
          onConfirm={() => { setConfirmApply(false); handleApply(); }}
          onCancel={() => setConfirmApply(false)} />
        <ConfirmModal open={!!confirmApprove}
          title={isAdmin ? 'Are you sure you want to approve?' : 'Accept this request?'}
          confirmLabel={isAdmin ? 'Approve' : 'Accept'}
          onConfirm={() => { const c = confirmApprove; setConfirmApprove(null); handleRespond('confirmed', c.assignmentId, c.person); }}
          onCancel={() => setConfirmApprove(null)} />

        {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

        {/* Item 2/3 — inline chat widget, right above the bottom nav. Every
            Chat button on this page (Counterpart box, Requests list, admin
            dual box) opens into this same widget via chatWidgetRef. */}
        <ChatWidget ref={chatWidgetRef} onHeightChange={setChatWidgetHeight} />

        {acceptedPerson && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2200] px-4">
            <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6 text-center">
              <p className="text-sm text-gray-700 mb-5">
                {acceptedPerson.autoApproved
                  ? 'Congratulations, based on your history, you have been matched automatically and can immediately proceed towards scheduling!'
                  : "Thank you for accepting, the status of the help will change to Matched once Admin approves the request since an auto-match couldn't be applied here"}
              </p>
              <button type="button"
                onClick={() => { setAcceptedPerson(null); navigate('/home'); }}
                className="w-full text-white font-semibold text-sm rounded-lg py-2.5 transition hover:opacity-90"
                style={{ backgroundColor: '#3a6b00' }}>
                OK
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
