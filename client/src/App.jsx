import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import BottomNav from './components/BottomNav';
import ErrorModal from './components/ErrorModal';
import NotificationToast from './components/NotificationToast';
import ScrollToTop from './components/ScrollToTop';
import { registerPush } from './utils/pushNotifications';
// All current, live pages moved into pages/DM/ ("Desktop Mac") — the
// existing single production app, unchanged in behavior. pages/MI/
// ("Mobile iPhone") is where redesigned mobile-first versions land as each
// page gets fine-tuned; nothing in the live app imports from MI yet (see
// Index.jsx + MiViewer.jsx for the internal DM/MI comparison tool).
import Login from './pages/DM/Login';
import HelperRegister from './pages/DM/HelperRegister';
import BeneficiaryRegister from './pages/DM/BeneficiaryRegister';
import AdminHome from './pages/DM/AdminHome';
import AdminHelpers from './pages/DM/AdminHelpers';
import AdminBeneficiaries from './pages/DM/AdminBeneficiaries';
import AdminNewHelp from './pages/DM/AdminNewHelp';
import AdminStoreNewHelp from './pages/DM/AdminStoreNewHelp';
import AdminHonors from './pages/DM/AdminHonors';
import AdminCertificates from './pages/DM/AdminCertificates';
import AdminReports from './pages/DM/AdminReports';
import AdminEscalations from './pages/DM/AdminEscalations';
import AdminAutoMatch from './pages/DM/AdminAutoMatch';
import AdminBankDetails from './pages/DM/AdminBankDetails';
import AdminDonation from './pages/DM/AdminDonation';
import AdminStoreLocation from './pages/DM/AdminStoreLocation';
import AdminHelpOngoingList from './pages/DM/AdminHelpOngoingList';
import AdminHelpHistoryList from './pages/DM/AdminHelpHistoryList';
import Home from './pages/DM/Dashboard';
import Settings from './pages/DM/Settings';
import Tasks from './pages/DM/Tasks';
import Assignments from './pages/DM/Assignments';
import VerifyEmail from './pages/DM/VerifyEmail';
import ForgotPassword from './pages/DM/ForgotPassword';
import ResetPassword from './pages/DM/ResetPassword';
import MapView from './pages/DM/MapView';
import RegisterVerify from './pages/DM/RegisterVerify';
import PublicProfile from './pages/DM/PublicProfile';
import Donate from './pages/DM/Donate';
import Store from './pages/DM/Store';
import StoreCategoryList from './pages/DM/StoreCategoryList';
import Contribution from './pages/DM/Contribution';
import Consumption from './pages/DM/Consumption';
import NewHelp from './pages/DM/NewHelp';
import HelpStatus from './pages/DM/HelpStatus';
import HelpHistory from './pages/DM/HelpHistory';
import HelpOngoingList from './pages/DM/HelpOngoingList';
import HelpHistoryList from './pages/DM/HelpHistoryList';
import EditHelperProfile from './pages/DM/EditHelperProfile';
import EditBeneficiaryProfile from './pages/DM/EditBeneficiaryProfile';
import SupportChatbot from './pages/DM/SupportChatbot';
import Support from './pages/DM/Support';
import SupportContact from './pages/DM/SupportContact';
import SupportChats from './pages/DM/SupportChats';
import SupportTickets from './pages/DM/SupportTickets';
import GiveFeedback from './pages/DM/GiveFeedback';
import AdminFeedback from './pages/DM/AdminFeedback';
import ChangePassword from './pages/DM/ChangePassword';
import DeviceSettings from './pages/DM/DeviceSettings';
import NotificationPreferences from './pages/DM/NotificationPreferences';
import PrivacyPolicy from './pages/DM/PrivacyPolicy';
import AboutRemar from './pages/DM/AboutRemar';
import DeleteAccount from './pages/DM/DeleteAccount';
import Messages from './pages/DM/Messages';
import Index from './pages/Index';
import MiViewer from './pages/MiViewer';

const ProtectedRoute = ({ children, roles }) => {
const { user, profileReady } = useAuth();
if (!user) return <Navigate to="/login" replace />;
if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
// Wait for AuthContext's one-time profile-existence check (helper/
// beneficiary only) rather than rendering Home/Profile/etc. before we know
// whether there's really a profile behind this session — see AuthContext.
if (!profileReady) {
return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
}
return children;
};

const HomeRedirect = () => {
const { user } = useAuth();
if (!user) return <Navigate to="/login" replace />;
if (user.role === 'admin') return <Navigate to="/dashboard" replace />;
return <Navigate to="/home" replace />;
};

function AppRoutes() {
// Settings > App preferences > Color applies as a CSS filter around the
// routed app content — see PreferencesContext.jsx's COLOR_FILTERS.
// ErrorModal is deliberately outside it so a Lighter/Darker/B&W theme never
// makes an error popup harder to read. BottomNav is ALSO deliberately
// outside it (applying colorFilter to itself instead, see BottomNav.jsx) —
// a `filter` on this div creates a new containing block for any
// `position: fixed` descendant, which used to turn BottomNav from
// viewport-fixed into "fixed relative to this div" (i.e. it scrolled with
// the page) whenever a non-standard theme was active.
const { colorFilter } = usePreferences();
const { user } = useAuth();
// Registers this device for push notifications once someone's actually
// logged in (see utils/pushNotifications.js) — this is what makes iOS/
// Android register the Notifications permission for real, rather than
// just deep-linking to whatever permission state already exists (see
// Settings.jsx's Notifications row). No-ops on web / before login.
useEffect(() => {
if (user) registerPush();
}, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
return (
<>
<ScrollToTop />
<div style={{ filter: colorFilter, minHeight: '100vh' }}>
<Routes>
<Route path="/" element={<HomeRedirect />} />
<Route path="/login" element={<Login />} />
<Route path="/verify-registration/:role" element={<RegisterVerify />} />
<Route path="/register/helper" element={<HelperRegister />} />
<Route path="/register/beneficiary" element={<BeneficiaryRegister />} />
<Route path="/dashboard" element={
<ProtectedRoute roles={['admin']}><AdminHome /></ProtectedRoute>
} />
{/* Admin's own equivalents of the Helpers/Beneficiaries lists and the
    on-behalf-of New Help flow, plus the Services pages linked from Admin
    Home (Honors, Contribution certificates) — Remar store/Auto-match/
    Donation reuse existing pages below instead of new admin-only ones. */}
<Route path="/admin/helpers" element={
<ProtectedRoute roles={['admin']}><AdminHelpers /></ProtectedRoute>
} />
<Route path="/admin/beneficiaries" element={
<ProtectedRoute roles={['admin']}><AdminBeneficiaries /></ProtectedRoute>
} />
<Route path="/admin/help/new/:role/:personId" element={
<ProtectedRoute roles={['admin']}><AdminNewHelp /></ProtectedRoute>
} />
{/* Admin creating a Remar Store item directly (not on anyone's behalf) —
    reached from the Store page's Add button. */}
<Route path="/admin/store/new" element={
<ProtectedRoute roles={['admin']}><AdminStoreNewHelp /></ProtectedRoute>
} />
<Route path="/admin/honors" element={
<ProtectedRoute roles={['admin']}><AdminHonors /></ProtectedRoute>
} />
<Route path="/admin/certificates" element={
<ProtectedRoute roles={['admin']}><AdminCertificates /></ProtectedRoute>
} />
<Route path="/admin/reports" element={
<ProtectedRoute roles={['admin']}><AdminReports /></ProtectedRoute>
} />
<Route path="/admin/escalations" element={
<ProtectedRoute roles={['admin']}><AdminEscalations /></ProtectedRoute>
} />
<Route path="/admin/auto-match" element={
<ProtectedRoute roles={['admin']}><AdminAutoMatch /></ProtectedRoute>
} />
<Route path="/admin/bank-details" element={
<ProtectedRoute roles={['admin']}><AdminBankDetails /></ProtectedRoute>
} />
{/* Admin's own full-list equivalents of Help ongoing/history — system-wide
    rather than scoped to one account's GET /help/mine. Declared alongside
    the other /admin/* routes so they're grouped together. */}
<Route path="/admin/help/ongoing" element={
<ProtectedRoute roles={['admin']}><AdminHelpOngoingList /></ProtectedRoute>
} />
<Route path="/admin/help/history" element={
<ProtectedRoute roles={['admin']}><AdminHelpHistoryList /></ProtectedRoute>
} />
{/* Helper/beneficiary landing page after login — distinct from the
    admin-only /dashboard above since the two are structurally different
    pages, not just role-gated views of the same one. */}
<Route path="/home" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><Home /></ProtectedRoute>
} />
<Route path="/settings" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><Settings /></ProtectedRoute>
} />
<Route path="/donate" element={
<ProtectedRoute roles={['helper', 'admin']}><Donate /></ProtectedRoute>
} />
{/* Remar Store — same page for all three roles, server-side-scoped per
    GET /help/store: admin sees everything (with an All/Available/Required
    filter), helpers see only "Help Required" items, beneficiaries see only
    "Help Available" items. Helpers/beneficiaries respond to these Help IDs
    the normal way through HelpStatus.jsx. */}
<Route path="/store" element={
<ProtectedRoute roles={['admin', 'helper', 'beneficiary']}><Store /></ProtectedRoute>
} />
<Route path="/store/:category" element={
<ProtectedRoute roles={['admin', 'helper', 'beneficiary']}><StoreCategoryList /></ProtectedRoute>
} />
<Route path="/admin/donation" element={
<ProtectedRoute roles={['admin']}><AdminDonation /></ProtectedRoute>
} />
<Route path="/admin/store-location" element={
<ProtectedRoute roles={['admin']}><AdminStoreLocation /></ProtectedRoute>
} />
<Route path="/my-contribution" element={
<ProtectedRoute roles={['helper']}><Contribution /></ProtectedRoute>
} />
<Route path="/my-consumption" element={
<ProtectedRoute roles={['beneficiary']}><Consumption /></ProtectedRoute>
} />
<Route path="/help/new" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><NewHelp /></ProtectedRoute>
} />
{/* Full-list pages — reached by tapping "Help ongoing" / "Help history" on
    Home, which only shows a preview. Declared before the :id routes below
    so these literal segments always win. */}
<Route path="/help/ongoing" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><HelpOngoingList /></ProtectedRoute>
} />
<Route path="/help/history" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><HelpHistoryList /></ProtectedRoute>
} />
{/* Modify flow — reached from Help Status's Modify button. Declared before
    the plain /help/:id route below so this more specific path wins. Admin
    included so items opened from the Admin Help ongoing/history full lists
    stay clickable through to here too. */}
<Route path="/help/:id/edit" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><NewHelp /></ProtectedRoute>
} />
{/* :id can be a real help item UUID or one of the "demo"/"demo-2"/"demo-3"
    always-present dummy rows in Home's Help ongoing table. */}
<Route path="/help/:id" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><HelpStatus /></ProtectedRoute>
} />
{/* :id can be a real task UUID or one of the "demo-history"/"demo-history-2"/
    "demo-history-3" always-present dummy rows in Home's Help history table. */}
<Route path="/help/history/:id" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><HelpHistory /></ProtectedRoute>
} />
<Route path="/tasks" element={
<ProtectedRoute><Tasks /></ProtectedRoute>
} />
<Route path="/support" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><Support /></ProtectedRoute>
} />
<Route path="/support/chatbot" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><SupportChatbot /></ProtectedRoute>
} />
<Route path="/support/contact" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><SupportContact /></ProtectedRoute>
} />
<Route path="/support/chats" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><SupportChats /></ProtectedRoute>
} />
<Route path="/support/tickets" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><SupportTickets /></ProtectedRoute>
} />
<Route path="/support/feedback" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><GiveFeedback /></ProtectedRoute>
} />
<Route path="/admin/feedback" element={
<ProtectedRoute roles={['admin']}><AdminFeedback /></ProtectedRoute>
} />
<Route path="/messages" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><Messages /></ProtectedRoute>
} />
<Route path="/change-password" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><ChangePassword /></ProtectedRoute>
} />
<Route path="/settings/device" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><DeviceSettings /></ProtectedRoute>
} />
<Route path="/settings/notifications" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><NotificationPreferences /></ProtectedRoute>
} />
<Route path="/settings/about" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><AboutRemar /></ProtectedRoute>
} />
<Route path="/settings/privacy" element={
<ProtectedRoute roles={['helper', 'beneficiary', 'admin']}><PrivacyPolicy /></ProtectedRoute>
} />
<Route path="/delete-account" element={
<ProtectedRoute roles={['helper', 'beneficiary']}><DeleteAccount /></ProtectedRoute>
} />
<Route path="/assignments" element={
<ProtectedRoute roles={['admin']}><Assignments /></ProtectedRoute>
} />
{/* Read-only public profile — same content as the registration Preview,
    viewable by any logged-in user (e.g. a helper looking up a beneficiary
    from Map View, or vice versa). :id is either a real helpers/
    beneficiaries row id, or the literal "me" — used by the bottom nav's
    Profile icon and Navbar's "My Profile" link to view your own profile
    through this same page (the old separate editable HelperProfile.jsx /
    BeneficiaryProfile.jsx pages were removed as duplicates). */}
{/* Edit forms — same layout as HelperRegister/BeneficiaryRegister minus
    the password fields, reachable from Settings > Edit profile. Declared
    before the :id routes below so the literal "edit" segment always wins. */}
<Route path="/helper/profile/edit" element={
<ProtectedRoute roles={['helper']}><EditHelperProfile /></ProtectedRoute>
} />
<Route path="/beneficiary/profile/edit" element={
<ProtectedRoute roles={['beneficiary']}><EditBeneficiaryProfile /></ProtectedRoute>
} />
<Route path="/helper/profile/:id" element={
<ProtectedRoute><PublicProfile role="helper" /></ProtectedRoute>
} />
<Route path="/beneficiary/profile/:id" element={
<ProtectedRoute><PublicProfile role="beneficiary" /></ProtectedRoute>
} />
{/* Internal tools for Zubin only — not linked from Navbar/BottomNav, not
    part of what helpers/beneficiaries ever see. /index lets him pick
    Mobile iPhone (phone-framed) or Desktop Mac (as-is) and jump to any
    page; /mi/* renders whatever real page matches the rest of the path
    inside an iPhone 15 Pro Max frame via MiViewer.jsx. */}
<Route path="/index" element={<Index />} />
<Route path="/mi/*" element={<MiViewer />} />
<Route path="/map" element={<MapView />} />
<Route path="/verify-email" element={<VerifyEmail />} />
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
</Routes>
</div>
<BottomNav />
<ErrorModal />
<NotificationToast />
</>
);
}

export default function App() {
return (
<AuthProvider>
<PreferencesProvider>
<BrowserRouter>
<AppRoutes />
</BrowserRouter>
</PreferencesProvider>
</AuthProvider>
);
}
