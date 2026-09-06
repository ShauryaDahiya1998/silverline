import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext';
import api from '../../api';

const AMOUNT_MIN = 10;
const AMOUNT_STEP = 10;
const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

// "Your donations go towards" gallery, shown above the amount section —
// four causes REMAR SOS funds, each backed by one of the supplied field
// photos (cropped from the source montage).
const DONATION_CAUSES = [
  { key: 'poverty', label: 'Poverty relief', image: '/donate-poverty.jpg' },
  { key: 'disaster', label: 'Emergency & disaster relief', image: '/donate-disaster.jpg' },
  { key: 'development', label: 'Development aid', image: '/donate-development.jpg' },
  { key: 'addiction', label: 'Addiction support', image: '/donate-addiction.jpg' },
];

// Debit/credit card and PayPal are shown as real options since REMAR will
// want to offer them, but no payment processor (Stripe, PayPal, etc.) is
// wired up yet — selecting one says so honestly instead of pretending to
// take a payment that goes nowhere. Bank transfer is the only method that
// actually works today, so it's the default.
const PAYMENT_METHODS = [
  { key: 'bank', label: 'Bank transfer', live: true },
  { key: 'debit', label: 'Debit card', live: false },
  { key: 'credit', label: 'Credit card', live: false },
  { key: 'paypal', label: 'PayPal', live: false },
];

// Double-window "copy" icon (lucide-style) — shown instead of a text label
// per request. Swaps to a checkmark for 1.5s after a successful copy as the
// only feedback, since there's no text to change to "Copied" anymore.
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // value is still visible on screen to copy manually either way.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 font-medium break-all">{value}</p>
      </div>
      <button type="button" onClick={handleCopy} aria-label={`Copy ${label}`}
        className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border transition ${
          copied ? 'border-remar remar-green' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
        }`}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

// Popup opened by tapping a bank tab — full detail set for that one bank,
// each row copyable via CopyRow. Same modal shell/z-index family as
// TermsModal.jsx (z-[2200], max-h-[80vh] scroll) since this is reached from
// the same Settings-adjacent surface. `bank` is a raw row from GET
// /bank-accounts (see server/routes/bankAccounts.js) — built into a
// {label, value} row list here rather than expecting the server to shape it,
// so this stays a straight display of whatever admin-editable fields exist.
function BankDetailsModal({ bank, onClose }) {
  if (!bank) return null;
  const rows = [
    { label: 'Account holder', value: bank.account_holder },
    { label: 'Bank name', value: bank.bank_name },
    { label: 'IBAN', value: bank.iban },
    { label: 'BIC / SWIFT', value: bank.bic },
    { label: 'Reference', value: bank.reference },
  ];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2200] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800">{bank.label}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="bg-gray-50 rounded-xl px-4">
          {rows.map((row) => (
            <CopyRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Donate() {
  const navigate = useNavigate();
  const { currency } = usePreferences();
  const [amount, setAmount] = useState(50);
  const [amountInput, setAmountInput] = useState('50');
  const [method, setMethod] = useState('bank');
  const [openBank, setOpenBank] = useState(null);
  const [banks, setBanks] = useState([]);

  // Admin-editable (Settings > My account > Bank details) — fetched fresh
  // each time this page loads rather than hardcoded, so an admin adding,
  // renaming, or deleting an account shows up immediately without a client
  // rebuild. See server/routes/bankAccounts.js.
  useEffect(() => {
    api.get('/bank-accounts').then(res => setBanks(res.data)).catch(() => {});
  }, []);

  const clampAmount = (raw) => {
    const n = Math.round((Number(raw) || 0) / AMOUNT_STEP) * AMOUNT_STEP;
    return Math.max(AMOUNT_MIN, n);
  };

  const selectQuickAmount = (a) => {
    setAmount(a);
    setAmountInput(String(a));
  };

  const commitCustomAmount = () => {
    const clamped = clampAmount(amountInput);
    setAmount(clamped);
    setAmountInput(String(clamped));
  };

  const selectedMethod = PAYMENT_METHODS.find(m => m.key === method);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Donate</h1>
          <p className="text-sm text-gray-500 mb-5">
            REMAR Schweiz runs entirely on volunteer time and donations. Thank you for supporting the work.
          </p>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your donations go towards</p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {DONATION_CAUSES.map(cause => (
              <div key={cause.key} className="relative rounded-xl overflow-hidden h-24">
                <img src={cause.image} alt={cause.label} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute bottom-1.5 left-2 right-2 text-[11px] font-semibold text-white leading-tight">{cause.label}</span>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount ({currency})</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {QUICK_AMOUNTS.map(a => (
              <button key={a} type="button" onClick={() => selectQuickAmount(a)}
                className={`text-sm font-semibold py-2 rounded-lg border transition ${
                  amount === a ? 'text-white' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
                style={amount === a ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : undefined}>
                {currency} {a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm text-gray-500 flex-shrink-0">Custom amount:</span>
            <input type="number" min={AMOUNT_MIN} step={AMOUNT_STEP} value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              onBlur={commitCustomAmount}
              className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
          </div>
          <p className="text-xs text-gray-400 mb-5">Minimum {currency} 10, in steps of {currency} 10.</p>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment method</p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {PAYMENT_METHODS.map(m => (
              <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                className={`text-sm font-semibold py-2.5 rounded-lg border transition ${
                  method === m.key ? 'text-white' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
                style={method === m.key ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : undefined}>
                {m.label}
              </button>
            ))}
          </div>

          {selectedMethod?.live ? (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select bank account</p>
              <div className="grid grid-cols-2 gap-2">
                {banks.map((bank) => (
                  <button key={bank.id} type="button" onClick={() => setOpenBank(bank)}
                    className="text-sm font-semibold py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
                    {bank.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Please transfer {currency} {amount} using the reference shown for your chosen bank.
              </p>
            </>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-sm text-gray-700">
                {selectedMethod?.label} isn't connected yet. For now, please donate {currency} {amount} via bank transfer above, or reach out via{' '}
                <button type="button" onClick={() => navigate('/support/contact')} className="underline font-medium hover:text-[#579500] transition">Contact us</button> and we'll arrange it.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            Questions about donating? Reach out via{' '}
            <button type="button" onClick={() => navigate('/support/contact')} className="underline hover:text-[#579500] transition">Contact us</button>.
          </p>
        </div>
      </div>

      <BankDetailsModal bank={openBank} onClose={() => setOpenBank(null)} />
    </div>
  );
}
