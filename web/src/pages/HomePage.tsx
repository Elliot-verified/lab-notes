import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Protocol, Run } from "../types";

export default function HomePage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.listProtocols(), api.listRuns()])
      .then(([p, r]) => {
        setProtocols(p);
        setRuns(r);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function start(protocolId: string) {
    try {
      const run = await api.createRun(protocolId);
      navigate(`/runs/${run.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <section>
        <h2>Protocols</h2>
        <div className="card-grid">
          {protocols.map((p) => (
            <div key={p.id} className="card">
              <div className="card-title">{p.name}</div>
              <div className="card-meta">v{p.version} · {p.steps.length} steps</div>
              <p className="card-desc">{p.description}</p>
              <button onClick={() => start(p.id)}>Start run</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Recent runs</h2>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
        <ul className="run-list">
          {runs.map((r) => (
            <li key={r.id}>
              <a href={`/runs/${r.id}`}>
                {r.name}{" "}
                <span className={`status status-${r.status}`}>{r.status}</span>
              </a>
              <span className="muted">
                {" "}— {new Date(r.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
