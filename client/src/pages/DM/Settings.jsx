import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';

// Reusable chevron for every navigable row below.
const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 shrink-0">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// One tappable settings row. Rows without a real destination yet (no
// onClick passed) still render at full opacity with the chevron, signalling
// "coming soon" rather than looking broken — swap in onClick as each one
// gets built out.
const Row = ({ label, onClick, danger, warning }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center justify-between py-3.5 text-left transition hover:bg-gray-50 -mx-2 px-2 rounded-lg"
  >
    <span className={`text-sm ${danger ? 'text-red-600 font-semibold' : warning ? 'text-amber-500 font-semibold' : 'text-gray-700'}`}>{label}</span>
    {!danger && !warning && <Chevron />}
  </button>
);

// A settings row that's a dropdown instead of a navigation link — used for
// the four real App preferences below (Language/Currency/Font size/Color).
// Saves immediately on change (no separate Save button) via
// PreferencesContext's updatePreferences, which is optimistic — the select
// itself is the source of truth for what's currently applied.
const SelectRow = ({ label, value, onChange, options }) => (
  <div className="w-full flex items-center justify-between py-3.5">
    <span className="text-sm text-gray-700">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-remar"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// Section card: heading + rows, separated by faint dividers instead of
// hard borders (Zubin prefers spacing/shading over visible table lines).
const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl shadow-lg p-5">
    <h2 className="font-semibold remar-green text-sm mb-1">{title}</h2>
    <div className="divide-y divide-gray-100">{children}</div>
  </div>
);

const FEEDBACK_MAILTO = 'mailto:zubinsarkar@gmail.com?subject=REMAR%20Schweiz%20App%20Feedback';

export default function Settings() {
  const { user, logout } = useAuth();
  const { t, currency, language, fontSize, colorTheme, updatePreferences } = usePreferences();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = () => {
    setConfirmingLogout(false);
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  const profilePath = user?.role === 'helper' ? '/helper/profile/me' : '/beneficiary/profile/me';
  const editProfilePath = user?.role === 'helper' ? '/helper/profile/edit' : '/beneficiary/profile/edit';

  const CURRENCY_OPTIONS = [
    { value: 'Fr', label: 'Fr' },
    { value: '€', label: '€' },
    { value: '$', label: '$' },
  ];
  const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'German' },
    { value: 'fr', label: 'French' },
  ];
  const FONT_SIZE_OPTIONS = [80, 100, 120, 150].map(v => ({ value: String(v), label: `${v}%` }));
  const COLOR_OPTIONS = [
    { value: 'standard', label: t('settings.colorStandard') },
    { value: 'lighter', label: t('settings.colorLighter') },
    { value: 'darker', label: t('settings.colorDarker') },
    { value: 'bw', label: t('settings.colorBw') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="space-y-5">
          {/* Admin logins are shared org accounts with no profile of their
              own — Profile/Edit profile/Delete account don't apply — but
              Chats still does, to keep a record of any chat history an
              admin has had with a helper/beneficiary (e.g. from the Help
              page's per-request Chat button, or a direct message). GET
              /messages/mine and friends (server/routes/messages.js) are
              already scoped by req.user.id regardless of role, so this is
              just surfacing the same page admin could already reach. */}
          <Section title={t('settings.myAccount')}>
            {!isAdmin && <Row label={t('settings.profile')} onClick={() => navigate(profilePath)} />}
            {!isAdmin && <Row label={t('settings.editProfile')} onClick={() => navigate(editProfilePath)} />}
            {/* Where Remar Store items are placed on Map View / All Help
                Available — see AdminStoreLocation.jsx. */}
            {isAdmin && <Row label={t('settings.storeLocation')} onClick={() => navigate('/admin/store-location')} />}
            {/* Only this entry point passes { manage: true } — it's what
                tells AdminAutoMatch.jsx to show Modify/Delete on each rule.
                Reaching the same page from Admin Home > Services stays
                view/toggle-only. */}
            {isAdmin && <Row label={t('settings.autoApproval')} onClick={() => navigate('/admin/auto-match', { state: { manage: true } })} />}
            <Row label={t('settings.changePassword')} onClick={() => navigate('/change-password')} />
            <Row label={t('settings.chats')} onClick={() => navigate('/messages')} />
            {/* Orange rather than the red used for Delete account below —
                logging out is reversible (just sign back in), so it
                shouldn't read as equally destructive. */}
            <Row label={t('settings.logout')} onClick={() => setConfirmingLogout(true)} warning />
            {!isAdmin && <Row label={t('settings.deleteAccount')} onClick={() => navigate('/delete-account')} danger />}
          </Section>

          {/* Only Language/Currency/Font size/Color are real settings today
              (persisted per-account — see PreferencesContext.jsx and
              server/routes/preferences.js). Notifications/Device stay as
              "coming soon" placeholder rows (no onClick) until built out. */}
          <Section title={t('settings.appPreferences')}>
            <Row label={t('settings.notifications')} />
            <Row label={t('settings.device')} />
            <SelectRow label={t('settings.language')} value={language} onChange={(v) => updatePreferences({ language: v })} options={LANGUAGE_OPTIONS} />
            <SelectRow label={t('settings.currency')} value={currency} onChange={(v) => updatePreferences({ currency: v })} options={CURRENCY_OPTIONS} />
            <SelectRow label={t('settings.fontSize')} value={String(fontSize)} onChange={(v) => updatePreferences({ font_size: Number(v) })} options={FONT_SIZE_OPTIONS} />
            <SelectRow label={t('settings.color')} value={colorTheme} onChange={(v) => updatePreferences({ color_theme: v })} options={COLOR_OPTIONS} />
          </Section>

          {!isAdmin && (
            <Section title={t('settings.support')}>
              <Row label={t('settings.bot')} onClick={() => navigate('/support/chatbot')} />
              <Row label={t('settings.contactUs')} onClick={() => navigate('/support/contact')} />
              <Row label={t('settings.supportChats')} onClick={() => navigate('/support/chats')} />
              <Row label={t('settings.tickets')} onClick={() => navigate('/support/tickets')} />
              <Row label={t('settings.faq')} />
              <Row label={t('settings.giveFeedback')} onClick={() => { window.location.href = FEEDBACK_MAILTO; }} />
            </Section>
          )}

          <Section title={t('settings.legal')}>
            <Row label={t('settings.terms')} />
            <Row label={t('settings.privacy')} />
          </Section>
        </div>
      </div>

      <ConfirmModal
        open={confirmingLogout}
        title={t('settings.logoutConfirmTitle')}
        message={t('settings.logoutConfirmMessage')}
        confirmLabel={t('settings.logout')}
        cancelLabel={t('settings.cancel')}
        warning
        onConfirm={handleLogout}
        onCancel={() => setConfirmingLogout(false)}
      />
    </div>
  );
}
