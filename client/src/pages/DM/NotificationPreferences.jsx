import { usePreferences } from '../../context/PreferencesContext';
import { useAuth } from '../../context/AuthContext';

// Settings > App preferences > Notifications. A per-event-type Email/SMS/
// WhatsApp matrix, persisted server-side (users.notification_channels — see
// server/routes/preferences.js and server/utils/notifier.js, which is what
// actually reads this and dispatches each send). Replaces the old
// native-Settings-deep-link behavior (see Settings.jsx's former
// openNotificationSettings) — that only ever controlled whether the OS
// shows a push banner at all, not which of these channels a change in the
// app should go out on.
const EVENTS = [
  { key: 'help_status', label: 'Help Status change', description: 'When a Help item you created or requested changes status.' },
  { key: 'messages', label: 'Messages', description: 'When you receive a new chat message from another member or REMAR.' },
];

// Same channel-icon convention as the Contact preference picker on
// Registration/Edit Profile (see HelperRegister.jsx's contactOrder) — a
// real brand mark for WhatsApp, a small badge for SMS (there's no
// standalone "SMS" icon there either), and the plain envelope emoji for
// Email — rather than plain text labels, so this reads the same way that
// picker already does everywhere else in the app.
const CHANNELS = [
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'sms', label: 'SMS', badgeText: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp', iconUrl: 'https://cdn.simpleicons.org/whatsapp' },
];

// Same taxonomy as Help Universe's own HELP_CATEGORIES (MapView.jsx) and
// New Help's category picker — kept as its own copy here since neither of
// those export it as a shared module (same per-file duplication already
// used throughout this codebase for this exact list).
const HELP_CATEGORIES = {
  Food: '🍎', Toiletries: '🧴', Clothes: '👕',
  'Social services': '🤝', 'Professional services': '💼', Money: '💰',
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

// Worded from the subscriber's own perspective, same as MapView.jsx's
// LOGISTICS_FILTER_OPTIONS — a helper subscribing wants new beneficiary
// requests they could deliver to or collect nothing from (the beneficiary's
// own logistics choice), a beneficiary subscribing wants new helper offers
// they could pick up from or have dropped off. Admin gets the plain,
// perspective-free wording since they're not acting as either party.
const LOGISTICS_OPTIONS = {
  helper: [
    { value: 'pickup', label: 'Pick up from my location' },
    { value: 'dropoff', label: 'I can drop off' },
  ],
  beneficiary: [
    { value: 'pickup', label: 'I can pick up' },
    { value: 'dropoff', label: 'Drop off at my location' },
  ],
  admin: [
    { value: 'pickup', label: 'Pickup' },
    { value: 'dropoff', label: 'Drop-off' },
  ],
};

// Icon/badge treatment shared by every channel button below — identical
// markup to the Contact preference picker's own rendering (see
// HelperRegister.jsx around its contactOrder.map).
const ChannelIcon = ({ ch }) => (
  ch.iconUrl ? <img src={ch.iconUrl} alt={ch.label} className="w-4 h-4 object-contain" />
    : ch.badgeText ? <span className="text-[7px] font-extrabold remar-green tracking-tight">{ch.badgeText}</span>
    : <span className="text-sm">{ch.icon}</span>
);

const ToggleSwitch = ({ on, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`w-11 h-6 rounded-full transition relative shrink-0 ${on ? 'bg-[#3a6b00]' : 'bg-gray-300'}`}>
    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${on ? 'left-5' : 'left-0.5'}`} />
  </button>
);

export default function NotificationPreferences() {
  const { user } = useAuth();
  const { notificationChannels, helpSubscription, updatePreferences } = usePreferences();
  const logisticsOptions = LOGISTICS_OPTIONS[user?.role] || LOGISTICS_OPTIONS.admin;

  const toggleChannel = (eventKey, channelKey) => {
    const current = notificationChannels?.[eventKey]?.[channelKey] ?? false;
    const next = {
      ...notificationChannels,
      [eventKey]: { ...notificationChannels[eventKey], [channelKey]: !current },
    };
    updatePreferences({ notification_channels: next });
  };

  const updateSubscription = (patch) => {
    updatePreferences({ help_subscription: { ...helpSubscription, ...patch } });
  };

  const toggleCategory = (cat) => {
    const current = helpSubscription.categories || [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    updateSubscription({ categories: next });
  };

  const toggleLogistics = (value) => {
    const current = helpSubscription.logistics || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    updateSubscription({ logistics: next });
  };

  const ChannelRow = ({ eventKey }) => (
    <div className="grid grid-cols-3 gap-2">
      {CHANNELS.map((ch) => {
        const on = notificationChannels?.[eventKey]?.[ch.key] ?? false;
        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => toggleChannel(eventKey, ch.key)}
            aria-pressed={on}
            title={ch.label}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border transition ${
              on ? 'bg-green-50 border-remar' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <ChannelIcon ch={ch} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Notifications</h1>
          <p className="text-sm text-gray-500 mb-5">Choose how you'd like to be notified for each type of update.</p>

          <div className="space-y-6">
            {EVENTS.map((ev) => (
              <div key={ev.key}>
                <div className="text-sm font-semibold text-gray-700">{ev.label}</div>
                <p className="text-xs text-gray-400 mt-0.5 mb-3">{ev.description}</p>
                <ChannelRow eventKey={ev.key} />
              </div>
            ))}

            {/* New Help Available — the only event that also fires a real
                push notification (system banner + in-app popup/vibration,
                see utils/pushNotifications.js and utils/push.js) alongside
                whichever of Email/SMS/WhatsApp are on below; push itself
                isn't a channel toggle here since it's already governed by
                Settings > App preferences > Device's Notifications
                permission + Vibration toggle. Matching happens server-side
                against this saved filter — see utils/helpSubscriptions.js. */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-700">New Help Available</div>
                  <p className="text-xs text-gray-400 mt-0.5">Get notified when a new Help item matching your filters is posted.</p>
                </div>
                <ToggleSwitch on={helpSubscription.enabled} onClick={() => updateSubscription({ enabled: !helpSubscription.enabled })} />
              </div>

              {helpSubscription.enabled && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Categories (leave all unchecked for any)</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(HELP_CATEGORIES).map(([cat, icon]) => {
                        const on = (helpSubscription.categories || []).includes(cat);
                        return (
                          <button key={cat} type="button" onClick={() => toggleCategory(cat)} aria-pressed={on}
                            className={`flex items-center gap-1.5 text-xs font-medium py-2 px-2 rounded-lg border transition ${
                              on ? 'bg-green-50 border-remar remar-green' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}>
                            <span>{icon}</span><span className="truncate">{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Only within my preferred location — matched server-side
                      against this subscriber's own registered region
                      (helpers/beneficiaries.preferred_regions, same source
                      the Regions section on Register/Edit Profile saves —
                      see server/utils/helpSubscriptions.js). Admin has no
                      registered region of their own, so this doesn't render
                      for them, same as it's hidden on Help Universe. */}
                  {user?.role !== 'admin' && (
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-500">Only within my preferred location</label>
                      <ToggleSwitch on={!!helpSubscription.ownAreaOnly}
                        onClick={() => updateSubscription({ ownAreaOnly: !helpSubscription.ownAreaOnly })} />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Day &amp; time (matched against the poster's own availability)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={helpSubscription.day} onChange={(e) => updateSubscription({ day: e.target.value, from: '', to: '' })}
                        className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-remar">
                        <option value="">Any day</option>
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select value={helpSubscription.from} onChange={(e) => updateSubscription({ from: e.target.value })} disabled={!helpSubscription.day}
                        className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-remar disabled:opacity-50">
                        <option value="">From</option>
                        {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={helpSubscription.to} onChange={(e) => updateSubscription({ to: e.target.value })} disabled={!helpSubscription.day}
                        className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-remar disabled:opacity-50">
                        <option value="">To</option>
                        {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Delivery / collection preference</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {logisticsOptions.map((opt) => {
                        const on = (helpSubscription.logistics || []).includes(opt.value);
                        return (
                          <button key={opt.value} type="button" onClick={() => toggleLogistics(opt.value)} aria-pressed={on}
                            className={`text-xs font-medium py-2 px-2 rounded-lg border transition ${
                              on ? 'bg-green-50 border-remar remar-green' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Also notify by</label>
                    <ChannelRow eventKey="new_help" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
