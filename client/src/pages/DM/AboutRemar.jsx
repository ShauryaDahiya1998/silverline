// Settings > Legal > About Remar Schweiz — condensed, English version of
// remar.ch's "Wer wir sind" page (https://remar.ch/wer-wir-sind/), mirroring
// that page's own section structure (mission, team, transparency/annual
// reports, what we do, contact, quote, follow us) rather than a literal
// paragraph-for-paragraph translation. Read-only; same card/prose styling as
// PrivacyPolicy.jsx, with a Section sub-component matching that page's.
const TEAM = [
  { name: 'Paulo Oliveira', role: 'CEO', photo: '/team-paulo.jpg' },
  { name: 'Raul Grilo', role: 'Co-CEO Zürich', photo: '/team-raul.jpg' },
  { name: 'Daniel Barbosa', role: 'Co-CEO Basel', photo: '/team-daniel.jpg' },
  { name: 'Peter Hinz', role: 'Co-CEO Volketswil', photo: '/team-peter.jpg' },
  { name: 'Ruth Mendo', role: 'Manager of the Brockenhaus Wetzikon', photo: '/team-ruth.jpg' },
  { name: 'Dina Ablaieva', role: 'Fundraising & Partnerships Manager', photo: '/team-dina.jpg' },
];

const REPORTS = [
  { year: '2025', href: 'https://remar.ch/wp-content/uploads/2026/09/JAHRES-BERICHT-2025.pdf' },
  { year: '2024', href: 'https://remar.ch/wp-content/uploads/2026/09/REMAR_Jahresbericht_2024-3.pdf' },
  { year: '2023', href: 'https://remar.ch/wp-content/uploads/2026/09/REMAR_Jahresbericht_2023.pdf' },
];

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'http://www.facebook.com/RemarSchweiz' },
  { label: 'X (Twitter)', href: 'https://x.com/Remar_Schweiz' },
  { label: 'YouTube', href: 'http://www.youtube.com/watch?v=xxyf9uQZvfI' },
  { label: 'LinkedIn', href: 'http://www.linkedin.com/company/remar-schweiz' },
  { label: 'Instagram', href: 'https://www.instagram.com/remar_schweiz/' },
];

const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#579500] transition">
    {children}
  </a>
);

export default function AboutRemar() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-5">About Remar Schweiz</h1>

          <div className="text-sm text-gray-600 space-y-4 leading-relaxed">
            <Section title="Remar is a non-profit organization">
              <img
                src="/about-mission.jpg"
                alt="Remar volunteers"
                className="w-full h-36 object-cover rounded-xl mb-1"
              />
              <p>We are committed to giving hope and a future to people who are overlooked by society or have already been given up on. The rehabilitation of marginalized people — REMAR, for short — is the main goal of our activities. Many of our staff are former addicts who were freed from their addiction at Remar and now work to help others. Together with the people currently in recovery with us, we are involved in a range of further social projects in Switzerland and abroad.</p>
              <p><ExtLink href="https://remar.ch/soziale-projekte/">Learn more about our projects</ExtLink></p>
            </Section>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center text-center gap-1 rounded-2xl bg-remar-mid px-3 py-4">
                <p className="text-2xl font-bold text-white">80,000</p>
                <p className="text-xs font-medium text-white leading-tight">Volunteers globally</p>
              </div>
              <div className="flex flex-col items-center text-center gap-1 rounded-2xl bg-remar-mid px-3 py-4">
                <p className="text-2xl font-bold text-white">1,500</p>
                <p className="text-xs font-medium text-white leading-tight">Active projects</p>
              </div>
            </div>

            <Section title="Our team">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                {TEAM.map((member) => (
                  <div key={member.name} className="flex items-center gap-2.5">
                    <img
                      src={member.photo}
                      alt={member.name}
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-gray-100"
                    />
                    <div>
                      <p className="text-gray-700 font-medium leading-tight">{member.name}</p>
                      <p className="text-xs text-gray-400 leading-tight">{member.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Transparency — annual & financial reports">
              <p>Transparency builds trust. Our annual and financial reports from recent years give insight into our work, projects, and finances.</p>
              <div className="space-y-1">
                {REPORTS.map((r) => (
                  <p key={r.year}><ExtLink href={r.href}>Annual & financial report {r.year} (PDF)</ExtLink></p>
                ))}
              </div>
            </Section>

            <Section title="What we do">
              <p className="font-semibold text-gray-700">In Switzerland</p>
              <p><ExtLink href="https://remar.ch/suchthilfe/">Addiction support</ExtLink> · <ExtLink href="https://remar.ch/armutshilfe/">Poverty relief</ExtLink> · <ExtLink href="https://remar.ch/altersarmut/">Help for the elderly</ExtLink></p>
              <p className="font-semibold text-gray-700 pt-1">Worldwide</p>
              <p><ExtLink href="https://remar.ch/not-und-katastrophenhilfe/">Emergency & disaster relief</ExtLink> · <ExtLink href="https://remar.ch/entwicklungshilfe/">Development aid</ExtLink></p>
            </Section>

            <Section title="Contact">
              <p>Remar</p>
              <p>Motorenstrasse 6, 8623 Wetzikon, Switzerland</p>
              <p>Email: <ExtLink href="mailto:info@remar.ch">info@remar.ch</ExtLink></p>
              <p>Phone (CH): <ExtLink href="tel:+41582555580">+41 58 255 55 80</ExtLink></p>
            </Section>

            <Section title="In their words">
              <p className="italic">"We have learned to fly like birds and swim like fish, but we have not learned the simple art of living together as brothers."</p>
              <p className="text-xs text-gray-400">— Martin Luther King</p>
            </Section>

            <Section title="Follow us">
              <p>
                {SOCIAL_LINKS.map((s, i) => (
                  <span key={s.label}>
                    <ExtLink href={s.href}>{s.label}</ExtLink>
                    {i < SOCIAL_LINKS.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// Same titled-block pattern as PrivacyPolicy.jsx's Section — spacing over
// dividers, no bullets.
const Section = ({ title, children }) => (
  <div>
    <h2 className="text-sm font-bold remar-green mb-1.5">{title}</h2>
    <div className="space-y-2">{children}</div>
  </div>
);
