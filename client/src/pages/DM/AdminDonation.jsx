import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import { usePreferences } from '../../context/PreferencesContext';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatDate = (d) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const todayInputValue = () => new Date().toISOString().slice(0, 10);

// Admin Home > Services > Donation. Nothing today captures a donation
// automatically — Donate.jsx just shows bank-transfer details, no payment
// processor is wired up — so a helper pays REMAR directly (bank transfer
// etc.) and an admin logs it here once it's actually received. Two
// sections: every logged donation (Date / Helper ID / Amount), and a
// period-total picker below it (Lifetime, current year, and each month of
// the current year — both computed off today's date, so nothing needs
// updating by hand when a new year arrives).
export default function AdminDonation() {
  const { currency } = usePreferences();
  const [donations, setDonations] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showLogForm, setShowLogForm] = useState(false);
  const [helperId, setHelperId] = useState('');
  const [amount, setAmount] = useState('');
  const [donatedAt, setDonatedAt] = useState(todayInputValue());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState('');

  const now = new Date();
  const currentYear = now.getFullYear();
  const periodOptions = useMemo(() => {
    const opts = [{ value: 'lifetime', label: 'Lifetime' }, { value: `year:${currentYear}`, label: `${currentYear}` }];
    for (let m = 0; m < 12; m++) opts.push({ value: `month:${currentYear}-${m}`, label: `${MONTH_NAMES[m]} ${currentYear}` });
    return opts;
  }, [currentYear]);
  const [period, setPeriod] = useState('lifetime');

  const loadDonations = () => {
    api.get('/donations').then(res => setDonations(res.data)).catch(() => setDonations([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDonations();
    api.get('/helpers').then(res => setHelpers(res.data)).catch(() => setHelpers([]));
    // Clears the "new" highlight on this service's Admin Home tile — see
    // donations.js's /unseen (read on AdminHome) and /mark-seen (here).
    api.post('/donations/mark-seen').catch(() => {});
  }, []);

  const periodTotal = useMemo(() => {
    let rows = donations;
    if (period.startsWith('year:')) {
      const year = Number(period.slice(5));
      rows = donations.filter(d => new Date(d.donated_at).getFullYear() === year);
    } else if (period.startsWith('month:')) {
      const [year, month] = period.slice(6).split('-').map(Number);
      rows = donations.filter(d => {
        const dt = new Date(d.donated_at);
        return dt.getFullYear() === year && dt.getMonth() === month;
      });
    }
    return rows.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  }, [donations, period]);

  const handleLog = async (e) => {
    e.preventDefault();
    if (!helperId || !amount || Number(amount) <= 0) {
      setLogError('Choose a helper and enter an amount greater than 0.');
      return;
    }
    setLogging(true);
    setLogError('');
    try {
      await api.post('/donations', { helper_id: helperId, amount: Number(amount), donated_at: donatedAt });
      setHelperId('');
      setAmount('');
      setDonatedAt(todayInputValue());
      setShowLogForm(false);
      loadDonations();
    } catch (err) {
      setLogError(err.response?.data?.error || 'Could not log this donation — please try again.');
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Donation" />

        {/* Section 1 — every donation received from a helper. */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold remar-green text-sm">Donations</h2>
            <button type="button" onClick={() => setShowLogForm(s => !s)}
              className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition hover:opacity-90"
              style={{ backgroundColor: '#3a6b00' }}>
              {showLogForm ? 'Cancel' : '+ Log donation'}
            </button>
          </div>

          {showLogForm && (
            <form onSubmit={handleLog} className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
              {logError && <p className="text-xs text-red-600">{logError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Helper</label>
                  <select value={helperId} onChange={e => setHelperId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar">
                    <option value="">Choose a helper…</option>
                    {helpers.map(h => (
                      <option key={h.id} value={h.id}>{h.member_number} — {h.nickname || h.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Amount ({currency})</label>
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Date</label>
                  <input type="date" value={donatedAt} onChange={e => setDonatedAt(e.target.value)} max={todayInputValue()}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                </div>
              </div>
              <button type="submit" disabled={logging}
                className="text-sm font-semibold text-white px-5 py-2 rounded-full transition disabled:opacity-50" style={{ backgroundColor: '#3a6b00' }}>
                {logging ? 'Saving…' : 'Save donation'}
              </button>
            </form>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide bg-gray-50">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Helper ID</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount {currency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {donations.map(d => (
                    <tr key={d.id}>
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(d.donated_at)}</td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">{d.helper_member_number}</td>
                      <td className="px-4 py-2.5 text-gray-800 text-right">{Number(d.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                  {donations.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No donations logged yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2 — total for a selected time period. */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-4">Total donations</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar">
              {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-lg font-bold remar-green">{currency} {periodTotal.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
