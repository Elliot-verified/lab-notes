import { Link, Outlet } from "react-router-dom";
import { FlaskConical } from "lucide-react";

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">
          <span className="brand-icon">
            <FlaskConical size={16} strokeWidth={2.25} />
          </span>
          Lab Notes
        </Link>
        <span className="brand-sub">dynamic protocol checklists</span>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
