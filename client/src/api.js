import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
const token = localStorage.getItem('remar_token');
if (token) config.headers.Authorization = `Bearer ${token}`;
return config;
});

// Note: no blanket response interceptor here — plenty of requests fail
// silently on purpose (a draft-restore lookup with nothing saved yet, a
// background profile check, ForgotPassword's deliberately-hidden lookup
// error, ...) and shouldn't interrupt the user with a popup. Pages that
// want to surface a failure call showAppError(...) (see utils/errorBus.js
// and components/ErrorModal.jsx) from their own catch block instead — see
// helpers/apiErrorMessage below for pulling a readable message out of an
// axios error.
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
return err?.response?.data?.error || fallback;
}

export default api;
