# MI — Mobile iPhone

This folder is where **mobile-redesigned** versions of pages land as they get fine-tuned for a phone screen (visually reviewed against an iPhone 15 Pro Max frame before being considered done).

Nothing in the live app (`client/src/App.jsx`) imports from this folder yet — today's app continues to run entirely from [`../DM`](../DM) ("Desktop Mac"), which holds the current, working pages unchanged. This is intentional: it's an internal working convention while the mobile redesign is in progress, not a live feature end users pick between. See `client/src/pages/DevPreview.jsx` (route `/dev-preview`) for the internal Mobile iPhone / Desktop Mac comparison tool.

**Workflow going forward:**
1. Pick a page from `DM/` to redesign for mobile.
2. Build the fine-tuned version here in `MI/`, same filename as its `DM/` counterpart.
3. Once it's reviewed and approved, `App.jsx` gets repointed to import that page from `MI/` instead of `DM/` — so the live app picks it up.
4. Repeat per page. `DevPreview.jsx`'s route list will start reflecting which pages have an MI version once any exist.

Until a page has an MI version, it's still just the DM one — nothing is missing or broken in the meantime.
