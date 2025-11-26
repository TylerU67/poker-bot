import React, { useEffect, useState } from "react";
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "./firebase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
    });
    return () => unsub();
  }, []);

  if (loadingUser) return <div className="center">Loading...</div>;

  if (!user) return <AuthScreen />;

  return <ChatScreen user={user} />;
}

// ============ Auth UI ============

function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setErr(error.message);
    }
  };

  return (
    <div className="auth-container">
      <h1>Poker Bot</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="error">{err}</div>}
        <button type="submit">
          {isRegister ? "Create Account" : "Log In"}
        </button>
      </form>
      <button
        className="link-button"
        onClick={() => setIsRegister((x) => !x)}
      >
        {isRegister
          ? "Already have an account? Log in"
          : "No account? Register"}
      </button>
    </div>
  );
}

// ============ Chat + Sessions ============

function ChatScreen({ user }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [hand, setHand] = useState("AsKs");
  const [stage, setStage] = useState("preflop");
  const [style, setStyle] = useState("tight");
  const [numPlayers, setNumPlayers] = useState(6);
  const [board, setBoard] = useState(""); // e.g. "AhKdQs"
  const [potSize, setPotSize] = useState("");
  const [toCall, setToCall] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [user.uid]);

  async function loadSessions() {
    setLoadingSessions(true);
    const qSessions = query(
      collection(db, "sessions"),
      where("userId", "==", user.uid)
    );
    const snap = await getDocs(qSessions);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setSessions(list);
    setLoadingSessions(false);

    if (list.length > 0 && !selectedSession) {
      setSelectedSession(list[0]);
      loadMessages(list[0].id);
    }
  }

  async function loadMessages(sessionId) {
    const qMsgs = query(
      collection(db, "sessions", sessionId, "messages"),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(qMsgs);
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setMessages(msgs);
  }

  async function handleNewSession() {
    const docRef = await addDoc(collection(db, "sessions"), {
      userId: user.uid,
      createdAt: serverTimestamp(),
      title: `Session ${new Date().toLocaleString()}`
    });
    const newSession = {
      id: docRef.id,
      userId: user.uid,
      title: `Session ${new Date().toLocaleString()}`
    };
    setSessions((prev) => [newSession, ...prev]);
    setSelectedSession(newSession);
    setMessages([]);
  }

  async function handleSend() {
    if (!selectedSession) {
      alert("Create or select a session first.");
      return;
    }
    setSending(true);
    try {
      const userText = `Hand: ${hand}, Stage: ${stage}, Style: ${style}, Players: ${numPlayers}, Board: ${board}, Pot: ${potSize}, To Call: ${toCall}`;

      // Save user message
      await addDoc(
        collection(db, "sessions", selectedSession.id, "messages"),
        {
          role: "user",
          text: userText,
          createdAt: serverTimestamp()
        }
      );

      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: "user", text: userText }
      ]);

      const idToken = await user.getIdToken();

      const resp = await fetch(`${API_BASE_URL}/api/poker/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          hand,
          stage,
          style,
          numPlayers: Number(numPlayers),
          board,
          potSize: Number(potSize) || 0,
          toCall: Number(toCall) || 0
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Server error");
      }

      const botText = `Action: ${data.bestAction.toUpperCase()} (confidence ${(data.confidence * 100).toFixed(
        0
      )}%)\n` +
        `Probabilities: ${data.breakdown
          .map(
            (b) =>
              `${b.action}: ${(b.probability * 100).toFixed(0)}%`
          )
          .join(" | ")}\n` +
        `Reasoning: ${data.explanation}`;

      await addDoc(
        collection(db, "sessions", selectedSession.id, "messages"),
        {
          role: "bot",
          text: botText,
          createdAt: serverTimestamp()
        }
      );

      setMessages((prev) => [
        ...prev,
        { id: `local-bot-${Date.now()}`, role: "bot", text: botText }
      ]);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleSelectSession(s) {
    setSelectedSession(s);
    await loadMessages(s.id);
  }

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <div className="app-container">
      <header className="topbar">
        <div>Poker Bot</div>
        <div className="topbar-right">
          <span>{user.email}</span>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h3>Sessions</h3>
            <button onClick={handleNewSession}>+ New</button>
          </div>
          {loadingSessions ? (
            <div>Loading...</div>
          ) : sessions.length === 0 ? (
            <div>No sessions yet.</div>
          ) : (
            <ul className="session-list">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={
                    selectedSession && selectedSession.id === s.id
                      ? "session-item selected"
                      : "session-item"
                  }
                  onClick={() => handleSelectSession(s)}
                >
                  {s.title}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="chat-area">
          <div className="poker-input">
            <h3>Current Hand</h3>
            <div className="form-row">
              <label>Hand (e.g. AsKs)</label>
              <input
                value={hand}
                onChange={(e) => setHand(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                <option value="preflop">Preflop</option>
                <option value="flop">Flop</option>
                <option value="turn">Turn</option>
                <option value="river">River</option>
              </select>
            </div>
            <div className="form-row">
              <label>Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              >
                <option value="tight">Tight</option>
                <option value="loose">Loose</option>
                <option value="aggressive">Aggressive</option>
                <option value="passive">Passive</option>
              </select>
            </div>
            <div className="form-row">
              <label>Number of players</label>
              <input
                type="number"
                value={numPlayers}
                onChange={(e) => setNumPlayers(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Board (e.g. AhKdQs)</label>
              <input
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Pot size</label>
              <input
                type="number"
                value={potSize}
                onChange={(e) => setPotSize(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Amount to call</label>
              <input
                type="number"
                value={toCall}
                onChange={(e) => setToCall(e.target.value)}
              />
            </div>
            <button onClick={handleSend} disabled={sending}>
              {sending ? "Thinking..." : "Ask Poker Bot"}
            </button>
          </div>

          <div className="messages">
            <h3>Chat</h3>
            {selectedSession ? (
              messages.length === 0 ? (
                <div className="empty">No messages yet.</div>
              ) : (
                <div className="messages-list">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.role === "user"
                          ? "message user-message"
                          : "message bot-message"
                      }
                    >
                      <div className="message-role">
                        {m.role === "user" ? "You" : "Bot"}
                      </div>
                      <pre className="message-text">{m.text}</pre>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="empty">
                Create or select a session to start.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

