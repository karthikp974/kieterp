export function PageHeader({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return (
    <header className="portal-page-header mb-8">
      <p className="portal-page-header-eyebrow text-sm font-semibold uppercase tracking-wide">{eyebrow}</p>
      <h1 className="portal-page-header-title mt-2 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="portal-page-header-desc mt-3 max-w-3xl text-sm leading-6">{description}</p>
    </header>
  );
}
