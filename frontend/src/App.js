import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "http://localhost:5000/api/send-email";
const SENT_URL = "http://localhost:5000/api/sent-emails";

function App() {
  const [activeView, setActiveView] = useState("compose");
  const [formData, setFormData] = useState({ to: "", subject: "", message: "" });
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sentEmails, setSentEmails] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  const fetchSentEmails = useCallback(async () => {
    setSheetLoading(true);
    try {
      const res = await axios.get(SENT_URL);
      setSentEmails(res.data);
    } catch {
      setSentEmails([]);
    } finally {
      setSheetLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === "sent") fetchSentEmails();
  }, [activeView, fetchSentEmails]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status) setStatus(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const response = await axios.post(API_URL, formData);
      setStatus({ type: "success", text: response.data.message });
      setFormData({ to: "", subject: "", message: "" });
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || "Something went wrong. Please try again.";
      setStatus({ type: "error", text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const isFormValid =
    formData.to.trim() && formData.subject.trim() && formData.message.trim();

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    }) + " · " + d.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="app-wrapper">
      <div className="bg-blob blob-1" aria-hidden="true" />
      <div className="bg-blob blob-2" aria-hidden="true" />

      <div className="dashboard">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <span className="logo-icon">✉</span>
            <span className="logo-text">MailDash</span>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeView === "compose" ? "active" : ""}`}
              onClick={() => setActiveView("compose")}
            >
              <span className="nav-icon">✏️</span>
              <span>Compose</span>
            </button>
            <button className="nav-item" disabled>
              <span className="nav-icon">📥</span>
              <span>Inbox</span>
            </button>
            <button
              className={`nav-item ${activeView === "sent" ? "active" : ""}`}
              onClick={() => setActiveView("sent")}
            >
              <span className="nav-icon">📤</span>
              <span>Sent</span>
              {sentEmails.length > 0 && activeView !== "sent" && (
                <span className="nav-badge">{sentEmails.length}</span>
              )}
            </button>
            <button className="nav-item" disabled>
              <span className="nav-icon">📄</span>
              <span>Drafts</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="user-badge">
              <div className="avatar">U</div>
              <div className="user-info">
                <span className="user-name">Your Account</span>
                <span className="user-role">Gmail · Connected</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="main-content">
          {activeView === "compose" ? (
            <>
              <header className="main-header">
                <div className="header-left">
                  <h1 className="page-title">Compose Email</h1>
                  <p className="page-subtitle">Send a new message via your Gmail account</p>
                </div>
                <div className="header-badge">
                  <span className="status-dot" />
                  Server Connected
                </div>
              </header>

              <div className="compose-card">
                <form onSubmit={handleSubmit} className="compose-form" noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="to">
                      <span className="label-icon">To</span>
                      Recipient's Email
                    </label>
                    <div className="input-wrapper">
                      <span className="input-prefix">@</span>
                      <input
                        id="to" type="email" name="to"
                        value={formData.to} onChange={handleChange}
                        placeholder="recipient@example.com"
                        className="form-input" required disabled={loading}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="subject">
                      <span className="label-icon">Re</span>
                      Subject
                    </label>
                    <input
                      id="subject" type="text" name="subject"
                      value={formData.subject} onChange={handleChange}
                      placeholder="What's this about?"
                      className="form-input" required disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="message">
                      <span className="label-icon">Msg</span>
                      Message
                    </label>
                    <textarea
                      id="message" name="message"
                      value={formData.message} onChange={handleChange}
                      placeholder="Write your message here..."
                      className="form-textarea" rows={7} required disabled={loading}
                    />
                    <span className="char-count">{formData.message.length} characters</span>
                  </div>

                  {status && (
                    <div className={`alert alert-${status.type}`} role="alert" aria-live="polite">
                      <span className="alert-icon">{status.type === "success" ? "✓" : "✕"}</span>
                      <span className="alert-text">{status.text}</span>
                    </div>
                  )}

                  <div className="form-footer">
                    <button
                      type="submit"
                      className={`submit-btn ${loading ? "loading" : ""}`}
                      disabled={loading || !isFormValid}
                    >
                      {loading ? (
                        <><span className="spinner" aria-hidden="true" />Sending…</>
                      ) : (
                        <><span className="btn-icon">↑</span>Send Email</>
                      )}
                    </button>
                    <button
                      type="button" className="clear-btn"
                      onClick={() => { setFormData({ to: "", subject: "", message: "" }); setStatus(null); }}
                      disabled={loading}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>

              <div className="tips-card">
                <h3 className="tips-title">💡 Quick Tips</h3>
                <ul className="tips-list">
                  <li>Make sure your <strong>.env</strong> file has a valid Gmail App Password.</li>
                  <li>The backend must be running on <code>localhost:5000</code>.</li>
                  <li>Use Google App Passwords — not your regular Gmail password.</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <header className="main-header">
                <div className="header-left">
                  <h1 className="page-title">HR Contacts Sheet</h1>
                  <p className="page-subtitle">Sabhi bheje gaye emails ka record</p>
                </div>
                <div className="sheet-header-right">
                  <span className="sheet-count">{sentEmails.length} emails</span>
                  <button className="refresh-btn" onClick={fetchSentEmails} disabled={sheetLoading}>
                    {sheetLoading ? <span className="spinner sm-spinner" /> : "↻ Refresh"}
                  </button>
                </div>
              </header>

              <div className="sheet-card">
                {sheetLoading ? (
                  <div className="sheet-empty">
                    <span className="spinner" style={{ width: 24, height: 24 }} />
                    <p>Loading...</p>
                  </div>
                ) : sentEmails.length === 0 ? (
                  <div className="sheet-empty">
                    <span className="empty-icon">📭</span>
                    <p>Abhi tak koi email nahi bheja gaya.</p>
                    <button className="nav-switch-btn" onClick={() => setActiveView("compose")}>
                      Compose karo
                    </button>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Recipient (To)</th>
                          <th>Subject</th>
                          <th>Date &amp; Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sentEmails.map((email, i) => (
                          <tr key={email.id || i}>
                            <td className="col-num">{i + 1}</td>
                            <td className="col-to">{email.to}</td>
                            <td className="col-subject">{email.subject}</td>
                            <td className="col-date">{formatDate(email.sentAt)}</td>
                            <td className="col-status">
                              <span className={`status-pill status-${email.status?.toLowerCase()}`}>
                                {email.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
