// Simple page-title wrapper — the Remar logo now only appears on the Login
// page (per explicit request), so this just renders the title text.
export default function PageHeader({ title, className = 'mb-6', titleClassName = 'text-xl font-bold remar-green' }) {
  return (
    <div className={className}>
      <h1 className={titleClassName}>{title}</h1>
    </div>
  );
}
