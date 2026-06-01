import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Eye, EyeOff, FlaskConical, KeyRound, X } from "lucide-react";
import { settings } from "./api";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <button
          className="icon-btn header-settings"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <KeyRound size={16} />
        </button>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(settings.getApiKey());
  const [reveal, setReveal] = useState(false);

  function save() {
    settings.setApiKey(key.trim());
    onClose();
  }

  return (
    <div className="slash-backdrop" onClick={onClose}>
      <div
        className="slash-popover settings-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="settings-body">
          <label className="settings-label">
            Anthropic API key
            <span className="muted small">
              Stored only in your browser (localStorage). Sent with each
              Suggest-edits request and never persisted server-side.
            </span>
          </label>
          <div className="settings-row">
            <input
              type={reveal ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
            <button
              className="icon-btn"
              onClick={() => setReveal((r) => !r)}
              title={reveal ? "Hide" : "Reveal"}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Get a key at{" "}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            . Uses claude-sonnet-4-6 for suggestions.
          </p>
          <div className="settings-actions">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
