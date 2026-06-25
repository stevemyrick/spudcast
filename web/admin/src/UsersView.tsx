import { useEffect, useState } from "react";
import type { SessionInfo, User } from "@spudcast/shared";
import { api } from "./api.js";

/** Admin-only: create regular/admin users and remove them. */
export function UsersView({ session }: { session: SessionInfo }) {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setUsers(await api.listUsers());
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.createUser(username, password, role);
      setUsername("");
      setPassword("");
      setRole("user");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete user “${u.username}”? Their channels will be removed too.`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="panel">
      <h2>Users</h2>
      <p className="muted small">
        Regular users can create and edit only their own channels. Admins manage everything.
      </p>
      <form className="row" onSubmit={create}>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add user"}</button>
      </form>
      {msg && <p className="error small">{msg}</p>}

      <div className="list">
        {users.map((u) => (
          <div className="list-item" key={u.id}>
            <span className="badge">{u.role}</span>
            <span className="title">{u.username}</span>
            <span className="spacer" />
            {u.id === session.user?.id ? (
              <span className="muted small">you</span>
            ) : (
              <button className="ghost" onClick={() => remove(u)}>Delete</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
