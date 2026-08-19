import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';

const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Small pill switch for a rule's active/inactive state — green when on,
// grey when off, matching the app's remar-green brand color rather than a
// generic blue. Optimistic: flips instantly, then reconciles with the
// server's response (or reverts on error).
function ActiveSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ backgroundColor: checked ? '#579500' : '#d1d5db' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

// Auto-approve (Admin Home > Services, and Settings > My account) — a help
// item can only become Matched with an admin's sign-off, either manually
// from the Help page's Requests list, or automatically here, once a rule
// exists, is active, and fires (see PUT /assignments/:id/respond +
// GET /help/:id/counterpart's admin branch). Current Logic lists every rule
// on record, numbered in the order they were created, each with a switch to
// activate/deactivate it. A new rule can be typed into the box below the
// last one. The rule-evaluation engine itself isn't built yet — this page
// only manages the rule records.
//
// Modify and Delete per rule are intentionally restricted to the Settings >
// My account entry point (see Settings.jsx's `state: { manage: true }`) —
// reaching this same page from Admin Home > Services > Auto-approval stays
// view/toggle-only, no edit or delete affordance.
export default function AdminAutoMatch() {
  const location = useLocation();
  const canManage = !!location.state?.manage;
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRuleText, setNewRuleText] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auto-match-rules').then(res => setRules(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (rule, nextActive) => {
    setError('');
    setTogglingId(rule.id);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: nextActive } : r));
    try {
      await api.patch(`/auto-match-rules/${rule.id}`, { is_active: nextActive });
    } catch (err) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !nextActive } : r));
      setError('Could not update that rule — please try again.');
    } finally {
      setTogglingId(null);
    }
  };

  const startEdit = (rule) => {
    setError('');
    setEditingId(rule.id);
    setEditText(rule.logic);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = async (rule) => {
    const text = editText.trim();
    if (!text) return;
    setError('');
    setSaving(true);
    try {
      const res = await api.put(`/auto-match-rules/${rule.id}`, { logic: text });
      setRules(prev => prev.map(r => r.id === rule.id ? res.data : r));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      setError('Could not save that change — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/auto-match-rules/${deletingRule.id}`);
      setRules(prev => prev.filter(r => r.id !== deletingRule.id));
      setDeletingRule(null);
    } catch (err) {
      setError('Could not delete that rule — please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    const text = newRuleText.trim();
    if (!text || adding) return;
    setError('');
    setAdding(true);
    try {
      const res = await api.post('/auto-match-rules', { logic: text });
      setRules(prev => [...prev, res.data]);
      setNewRuleText('');
    } catch (err) {
      setError('Could not add that rule — please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Auto-approval" />

        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-1">Current Logic</h2>
          <p className="text-xs text-gray-400 mb-4">Rules that let a match get auto-approved without a manual admin review. Switch a rule off to pause it without losing its history.</p>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No auto-approval logic yet — every match currently needs manual admin approval.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rules.map((r, i) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-gray-400 w-5 pt-0.5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                        <span>{formatDate(r.created_at)}</span>
                        <span>·</span>
                        <span>{r.applied_count} applied</span>
                      </div>

                      {canManage && editingId === r.id ? (
                        <div>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            className="w-full text-sm rounded-lg bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-200 resize-none"
                          />
                          <div className="flex justify-end gap-2 mt-1.5">
                            <button type="button" onClick={cancelEdit}
                              className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                              Cancel
                            </button>
                            <button type="button" onClick={() => handleSaveEdit(r)} disabled={!editText.trim() || saving}
                              className="text-xs font-medium text-white rounded-lg px-3 py-1.5 disabled:opacity-40 transition"
                              style={{ backgroundColor: '#579500' }}>
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-sm ${r.is_active ? 'text-gray-700' : 'text-gray-400'}`}>{r.logic}</p>
                      )}
                    </div>
                    {(!canManage || editingId !== r.id) && (
                      <div className="flex items-center gap-3 shrink-0 pt-0.5">
                        <ActiveSwitch
                          checked={!!r.is_active}
                          disabled={togglingId === r.id}
                          onChange={(next) => handleToggle(r, next)}
                        />
                      </div>
                    )}
                  </div>
                  {canManage && editingId !== r.id && (
                    <div className="flex justify-end gap-3 mt-1.5 pl-7">
                      <button type="button" onClick={() => startEdit(r)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 transition">
                        Modify
                      </button>
                      <button type="button" onClick={() => setDeletingRule(r)}
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

          {/* Sits directly below the last rule — where a new one gets typed
              in and added to the bottom of the list above. */}
          <form onSubmit={handleAddRule} className="mt-4 pt-4 border-t border-gray-100">
            <label htmlFor="new-rule-text" className="block text-xs font-medium text-gray-500 mb-1.5">Add new rule</label>
            <textarea
              id="new-rule-text"
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              placeholder="Describe the condition under which a match should be auto-approved…"
              rows={2}
              className="w-full text-sm rounded-lg bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-200 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!newRuleText.trim() || adding}
                className="text-sm font-medium text-white rounded-lg px-4 py-1.5 disabled:opacity-40 transition"
                style={{ backgroundColor: '#579500' }}
              >
                {adding ? 'Adding…' : 'Add rule'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmModal
        open={!!deletingRule}
        title="Delete this rule?"
        message="This removes it and its applied-count history for good. This can't be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingRule(null)}
      />
    </div>
  );
}
