// Read-only "Terms and Conditions" popup — opened from the mandatory
// acceptance checkbox on both registration forms (HelperRegister.jsx /
// BeneficiaryRegister.jsx). Plain placeholder legal text for now (REMAR can
// swap this copy in later); the important part is the click-to-read
// mechanism and the Close button, same modal pattern used elsewhere in the
// app (e.g. the registration Preview popup).
export default function TermsModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2200] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold remar-green">Terms and Conditions</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="text-sm text-gray-600 space-y-3 leading-relaxed">
          <p>By registering with REMAR, you agree to provide accurate information about yourself and to keep your profile up to date.</p>
          <p>REMAR connects helpers and beneficiaries directly. REMAR is not a party to any exchange of goods, services, or money arranged through the app, and does not guarantee the conduct, reliability, or suitability of any other member.</p>
          <p>Any personal information you provide is used only to operate the app — matching help requests and offers, showing your profile to other members as configured in your settings, and contacting you about your account. It is not sold or shared with third parties beyond what's needed to run the service.</p>
          <p>You are responsible for your own safety when meeting or exchanging help with other members. REMAR recommends meeting in public places where practical and using the in-app chat for all initial communication.</p>
          <p>You may request deletion of your account and associated data at any time from Settings.</p>
          <p>REMAR may update these terms from time to time; continued use of the app after an update constitutes acceptance of the revised terms.</p>
        </div>
        <button type="button" onClick={onClose}
          className="w-full mt-5 bg-remar text-white py-2 rounded-lg font-semibold text-sm hover:bg-remar transition">
          Close
        </button>
      </div>
    </div>
  );
}
