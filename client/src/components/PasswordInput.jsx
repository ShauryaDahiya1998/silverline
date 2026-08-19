import { useState } from 'react';

// Shared password `<input>` with a show/hide toggle (eye / eye-slash icon)
// docked inside the field. Used on registration (Helper/Beneficiary) and
// Change password (Helper/Beneficiary/Admin all share ChangePassword.jsx).
// Accepts the same props a plain <input type="password"> would (value,
// onChange, placeholder, required, minLength, className, etc.) and just
// swaps the input's type between 'password' and 'text'.
export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5" style={{ width: 18, height: 18 }}>
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5.5 0-9.5-4-11-8 .78-2.2 2.14-4.1 3.88-5.56M9.9 4.24A10.4 10.4 0 0 1 12 4c5.5 0 9.5 4 11 8-.58 1.65-1.5 3.15-2.68 4.4" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
