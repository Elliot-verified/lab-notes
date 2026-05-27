import { Link, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">Lab Notes</Link>
        <span className="brand-sub">dynamic protocol checklists</span>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
