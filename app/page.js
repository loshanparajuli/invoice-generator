import Link from "next/link";

export const metadata = {
  title: "fromSilicon Tools",
};

export default function HomePage() {
  return (
    <div className="home-wrap">
      <div className="home-page">
        <div className="letterhead">
          <div className="brand">
            <div className="brand-mark">
              <img src="/logo.png" alt="fromSilicon" width="64" height="64" />
            </div>
            <div>
              <div className="brand-name"><span className="light">from</span><span className="bold">Silicon</span></div>
              <div className="brand-tag">TECH &middot; MEDIA &middot; DISTRIBUTION</div>
            </div>
          </div>
          <div className="doc-id">
            <div className="doc-title">Tools</div>
          </div>
        </div>

        <p className="home-tagline">
          Internal tools for running the agency: invoicing, timesheets, and whatever
          comes next.
        </p>

        <div className="tool-grid">
          <Link href="/invoice" className="tool-card">
            <div>
              <div className="tool-card-title">Invoice Maker</div>
              <div className="tool-card-desc">Generate internal &amp; external invoices as a polished PDF.</div>
            </div>
            <div className="tool-card-arrow">&rarr;</div>
          </Link>

          <Link href="/timesheet" className="tool-card">
            <div>
              <div className="tool-card-title">Timesheet &amp; Client Sign-off</div>
              <div className="tool-card-desc">Log a shift, hand the phone to the client, get it signed and emailed.</div>
            </div>
            <div className="tool-card-arrow">&rarr;</div>
          </Link>
        </div>
      </div>
      <div className="powered-by">
        <a href="https://fromsilicon.com/?utm_source=invoice_maker&utm_medium=app&utm_campaign=powered_by" target="_blank" rel="noopener noreferrer">
          Powered by fromSilicon
        </a>
      </div>
    </div>
  );
}
