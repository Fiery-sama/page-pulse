// ─── Footer Component ───────────────────────────────────────────────────────
// Contains the required visible credit line for the Digital Heroes evaluation.

export default function Footer() {
  return (
    <footer className="app-footer">
      <p className="footer-credit">
        Built for{' '}
        <a
          href="https://digitalheroesco.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Digital Heroes Training Task
        </a>
      </p>
      <p className="footer-meta">
        Page Pulse v1.0.0 · Node.js + Express + React + Vitest
      </p>
    </footer>
  );
}
