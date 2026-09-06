import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';

// Every bank account shown as a tab on the Donate page's Bank transfer
// method (see client's Donate.jsx and server/routes/bankAccounts.js). Admin
// can modify any field or delete an account outright, and add new ones —
// mirrors AdminAutoMatch.jsx's list/edit/delete/add pattern, but per-row
// there are six text fields instead of one free-text rule, so each row
// keeps its own local edit-draft object rather than a single string.
const FIELDS = [
  { key: 'label', label: 'Option name', placeholder: 'e.g. Switzerland Bank 1' },
  { key: 'account_holder', label: 'Account holder' },
  { key: 'bank_name', label: 'Bank name' },
  { key: 'iban', label: 'IBAN' },
  { key: 'bic', label: 'BIC / SWIFT' },
  { key: 'reference', label: 'Reference' },
];

const emptyDraft = () => ({ label: '', account_holder: '', bank_name: '', iban: '', bic: '', reference: 'Donation' });

function FieldInputs({ draft, onChange }) {
  return (
    <div className="space-y-2">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
          <input
            type="text"
            value={draft[f.key] || ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            placeholder={f.placeholder}
            className="w-full text-sm rounded-lg bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
      ))}
    </div>
  );
}

export default function AdminBankDetails() {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deletingBank, setDeletingBank] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [newDraft, setNewDraft] = useState(emptyDraft());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/bank-accounts').then(res => setBanks(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const startEdit = (bank) => {
    setError('');
    setEditingId(bank.id);
    setEditDraft({
      label: bank.label,
      account_holder: bank.account_holder,
      bank_name: bank.bank_name,
      iban: bank.iban,
      bic: bank.bic,
      reference: bank.reference,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft());
  };

  const handleSaveEdit = async (bank) => {
    if (FIELDS.some(f => f.key !== 'reference' && !editDraft[f.key]?.trim())) return;
    setError('');
    setSaving(true);
    try {
      const res = await api.put(`/bank-accounts/${bank.id}`, editDraft);
      setBanks(prev => prev.map(b => b.id === bank.id ? res.data : b));
      cancelEdit();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that change — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBank) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/bank-accounts/${deletingBank.id}`);
      setBanks(prev => prev.filter(b => b.id !== deletingBank.id));
      setDeletingBank(null);
    } catch (err) {
      setError('Could not delete that account — please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (FIELDS.some(f => f.key !== 'reference' && !newDraft[f.key]?.trim()) || adding) return;
    setError('');
    setAdding(true);
    try {
      const res = await api.post('/bank-accounts', newDraft);
      setBanks(prev => [...prev, res.data]);
      setNewDraft(emptyDraft());
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add that account — please try again.');
    } finally {
      setAdding(false);
    }
  };

  const canSaveEdit = !FIELDS.some(f => f.key !== 'reference' && !editDraft[f.key]?.trim());
  const canAdd = !FIELDS.some(f => f.key !== 'reference' && !newDraft[f.key]?.trim());

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Bank details" />

        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-1">Donate &gt; Bank transfer accounts</h2>
          <p className="text-xs text-gray-400 mb-4">Every account shown as a tab on the Donate page. Modify or delete an existing one, or add a new one below.</p>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : banks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No bank accounts yet — the Donate page's Bank transfer method will have nothing to show.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {banks.map((bank, i) => (
                <div key={bank.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-gray-400 w-5 pt-0.5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      {editingId === bank.id ? (
                        <div>
                          <FieldInputs draft={editDraft} onChange={(k, v) => setEditDraft(prev => ({ ...prev, [k]: v }))} />
                          <div className="flex justify-end gap-2 mt-2">
                            <button type="button" onClick={cancelEdit}
                              className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                              Cancel
                            </button>
                            <button type="button" onClick={() => handleSaveEdit(bank)} disabled={!canSaveEdit || saving}
                              className="text-xs font-medium text-white rounded-lg px-3 py-1.5 disabled:opacity-40 transition"
                              style={{ backgroundColor: '#579500' }}>
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{bank.label}</p>
                          <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                            <p>{bank.account_holder} · {bank.bank_name}</p>
                            <p className="break-all">IBAN {bank.iban}</p>
                            <p>BIC/SWIFT {bank.bic} · Reference {bank.reference}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {editingId !== bank.id && (
                    <div className="flex justify-end gap-3 mt-1.5 pl-7">
                      <button type="button" onClick={() => startEdit(bank)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 transition">
                        Modify
                      </button>
                      <button type="button" onClick={() => setDeletingBank(bank)}
                        className="text-xs font-medium text-red-500 hover:text-red-600 transition">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

          <form onSubmit={handleAdd} className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Add new bank account</p>
            <FieldInputs draft={newDraft} onChange={(k, v) => setNewDraft(prev => ({ ...prev, [k]: v }))} />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!canAdd || adding}
                className="text-sm font-medium text-white rounded-lg px-4 py-1.5 disabled:opacity-40 transition"
                style={{ backgroundColor: '#579500' }}
              >
                {adding ? 'Adding…' : 'Add account'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmModal
        open={!!deletingBank}
        title="Delete this bank account?"
        message="This removes it from the Donate page's Bank transfer options for good. This can't be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingBank(null)}
      />
    </div>
  );
}
