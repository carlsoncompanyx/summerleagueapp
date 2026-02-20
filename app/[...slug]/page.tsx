import Link from 'next/link';

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/${slug.join('/')}`;

  return (
    <main>
      <h1>Route Preview</h1>
      <p>
        The route <code>{path}</code> is not a dedicated screen yet.
      </p>
      <p>This catch-all page prevents hard 404s during preview while sections are being built.</p>
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
