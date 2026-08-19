// Shared non-persisted demo rows so "Help ongoing" / "Help history" always
// have a few clickable examples before any real help exists yet. Used by
// Dashboard.jsx, HelpOngoingList.jsx, HelpHistoryList.jsx, HelpStatus.jsx
// and HelpHistory.jsx — keep ids and shapes in sync across all of them.

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const NOW_ISO = new Date().toISOString();

// "List row" shape — same shape Dashboard's normalize() produces from
// GET /help/mine, used directly by Home's tables and the two full-list pages.
// Emptied out on request — Help ongoing now shows only real help items. Kept
// as an (empty) array rather than removed outright so every place that
// spreads it (Dashboard.jsx, HelpOngoingList.jsx, NewHelp.jsx's Help ID
// offset) keeps working unchanged if demo rows are ever wanted back here.
export const DUMMY_OPEN_ITEMS = [];

// Emptied out on request, same as DUMMY_OPEN_ITEMS above — Help history now
// shows only real help items.
export const DUMMY_HISTORY_ITEMS = [];

// "Help item" shape (matches the GET /help/:id API response) — used by HelpStatus.jsx.
export const DUMMY_HELPS = {
  'demo': { id: 'demo', title: 'Broccoli', description: '2 Kg, organic, freshly picked', category: 'Food', sub_category: 'Vegetable', status: 'assigned', scheduled_date: inDays(2), created_at: NOW_ISO },
  'demo-2': { id: 'demo-2', title: 'Rice', description: '5 Kg, basmati', category: 'Food', sub_category: 'Grocery', status: 'pending', scheduled_date: inDays(5), created_at: NOW_ISO },
  'demo-3': { id: 'demo-3', title: 'Blanket', description: 'Queen size, warm', category: 'Clothes', sub_category: 'Clothes', status: 'confirmed', scheduled_date: inDays(1), created_at: NOW_ISO },
};

// Extra detail fields for HelpHistory.jsx, keyed by helpRowId — merged onto
// the matching DUMMY_HISTORY_ITEMS row when viewing its detail page.
export const DUMMY_HISTORY_EXTRA = {
  'demo-history': { category: 'Clothes', description: 'Blue, size M, gently used', counterpartName: 'Demo counterpart' },
  'demo-history-2': { category: 'Food', description: 'Fresh loaf, whole wheat', counterpartName: 'Demo counterpart' },
  'demo-history-3': { category: 'Clothes', description: 'Winter jacket, size L', counterpartName: 'Demo counterpart' },
};
