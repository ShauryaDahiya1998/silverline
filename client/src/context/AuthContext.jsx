import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
const [user, setUser] = useState(() => {
const stored = localStorage.getItem('remar_user');
return stored ? JSON.parse(stored) : null;
});
const [token, setToken] = useState(() => localStorage.getItem('remar_token') || null);
// Whether the helper/beneficiary profile row backing this session has been
// confirmed to exist. Starts false for helper/beneficiary so protected
// routes wait (rather than flashing Home/Profile) until the check below
// resolves; true immediately for admin (no volunteers/beneficiaries row to
// check) and for logged-out visitors (irrelevant until they log in).
const [profileReady, setProfileReady] = useState(() => {
const stored = localStorage.getItem('remar_user');
if (!stored) return false;
try {
const parsed = JSON.parse(stored);
return parsed.role !== 'helper' && parsed.role !== 'beneficiary';
} catch {
return false;
}
});

const login = (userData, authToken) => {
setUser(userData);
setToken(authToken);
localStorage.setItem('remar_user', JSON.stringify(userData));
localStorage.setItem('remar_token', authToken);
};

const logout = () => {
setUser(null);
setToken(null);
setProfileReady(false);
localStorage.removeItem('remar_user');
localStorage.removeItem('remar_token');
};

// A helper/beneficiary user/token pair can exist without a matching
// helpers/beneficiaries row if registration was interrupted after the
// account was created but before the profile itself was saved (e.g. the
// "profile" POST failing partway through). That half-registered state used
// to surface as "Profile could not be found" on the Profile page or dummy
// placeholder data on Home. Instead: verify the profile exists once per
// session, and if it doesn't, treat this as not really logged in — sign
// out and let ProtectedRoute send them back to the login screen. A
// successful login is only ever meaningful once this check passes.
useEffect(() => {
if (!user || !token) { setProfileReady(false); return; }
if (user.role !== 'helper' && user.role !== 'beneficiary') { setProfileReady(true); return; }
let cancelled = false;
setProfileReady(false);
const endpoint = user.role === 'helper' ? '/helpers/me' : '/beneficiaries/me';
api.get(endpoint)
.then(() => { if (!cancelled) setProfileReady(true); })
.catch(err => {
if (cancelled) return;
if (err.response?.status === 404) {
// No profile row — registration never actually completed. Force
// out to the login screen rather than showing a broken Home/Profile.
logout();
} else {
// Any other error (network blip, 5xx, ...) shouldn't sign the
// person out — let the check pass and let the page's own fetch
// surface that error normally.
setProfileReady(true);
}
});
return () => { cancelled = true; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id, token]);

return (
<AuthContext.Provider value={{ user, token, login, logout, profileReady }}>
{children}
</AuthContext.Provider>
);
};

export const useAuth = () => useContext(AuthContext);
