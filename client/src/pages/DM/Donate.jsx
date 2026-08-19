import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext';

// Bank transfer details for donations — placeholders until the real
// account details are provided; just replace the values below.
const BANK_DETAILS = [
  { label: 'Account holder', value: '[Account holder name]' },
  { label: 'Bank name', value: '[Bank name]' },
  { label: 'IBAN', value: '[IBAN]' },
  { label: 'BIC / SWIFT', value: '[BIC / SWIFT]' },
  { label: 'Reference', value: 'REMAR Schweiz donation' },
];

const AMOUNT_MIN = 10;
const AMOUNT_STEP = 10;
const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

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
        <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
      </div>
      <button type="button" onClick={handleCopy}
        className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function Donate() {
  const navigate = useNavigate();
  const { currency } = usePreferences();
  const [amount, setAmount] = useState(50);
  const [amountInput, setAmountInput] = useState('50');
  const [method, setMethod] = useState('bank');

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
              <div className="bg-gray-50 rounded-xl px-4">
                {BANK_DETAILS.map((row) => (
                  <CopyRow key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Please transfer {currency} {amount} using the reference above.
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
    </div>
  );
}
