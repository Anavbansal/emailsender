/* eslint-disable */
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import "./App.css";

const API = "https://emailsender-v8a4.onrender.com";

// ── Auth helpers ───────────────────────────────────────────────────────────────
function getToken()       { return localStorage.getItem("em_token"); }
function setToken(t)      { localStorage.setItem("em_token", t); }
function clearToken()     { localStorage.removeItem("em_token"); localStorage.removeItem("em_user"); }
function getUser()        { try { return JSON.parse(localStorage.getItem("em_user")||"null"); } catch { return null; } }
function setUser(u)       { localStorage.setItem("em_user", JSON.stringify(u)); }
// Axios interceptor — attach token to every request
axios.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers = { ...cfg.headers, Authorization: `Bearer ${t}` };
  return cfg;
});
const DRIVE_LINK = "https://drive.google.com/file/d/1LKc-w9Ggd5I1eZ3t7Wvm9psU-4ITxHxr/view?usp=sharing";

// ── HR Profile answers — edit these anytime ──────────────────────────────────
const HR_PROFILE_ANAV = {
  keySkills:        "Node.js, Angular, AWS, ExpressJS, TypeScript, CTI Integrations, ServiceNow, Chatbot Development",
  totalExp:         "4.7+ Years",
  relevantExp:      "4.7+ Years",
  currentCompany:   "NovelVox Pvt. Ltd.",
  reasonForChange:  "Personal and professional growth",
  noticePeriod:     "30 Days",
  currentCTC:       "₹9 LPA",
  offerInHand:      "No",
  expectedCTC:      "₹15 LPA",
  currentLocation:  "Faridabad, Haryana",
  preferredLocation:"PAN India",
};

const HR_PROFILE_PRIYAL = {
  keySkills:        "Digital Lending, Credit Risk Assessment, Product Implementation, GenAI Automation, Business Analysis, FinnOne, SLOS, SFDC, FICO, Jocata, Power BI, Advanced Excel",
  totalExp:         "2+ Years",
  relevantExp:      "2+ Years",
  currentCompany:   "Tata Capital Limited",
  reasonForChange:  "Personal and professional growth",
  noticePeriod:     "30 Days",
  currentCTC:       "",
  offerInHand:      "No",
  expectedCTC:      "",
  currentLocation:  "Mumbai, India",
  preferredLocation:"PAN India",
};

// Dynamic profile based on logged in user
const getHRProfile = () => {
  const user = getUser();
  return user?.username === "anav" ? HR_PROFILE_ANAV : HR_PROFILE_PRIYAL;
};
const HR_PROFILE = getHRProfile();

// Keywords that indicate HR is asking screening questions
const SCREENING_KEYWORDS = [
  "total experience", "years of experience", "current ctc", "expected ctc",
  "notice period", "current company", "reason for change", "offer in hand",
  "current location", "preferred location", "lwd", "last working day",
  "relevant experience", "ctc", "notice", "salary", "location", "joining",
  "current salary", "expected salary", "current organization"
];

function buildScreeningReply(hrName = "") {
  const profile = getHRProfile();
  const user    = getUser();
  const name    = user?.displayName || "Anav Bansal";
  const phone   = user?.username === "anav" ? "+91 7827855635" : "+91 7665941798";
  const email   = user?.username === "anav" ? "anavbansal06@gmail.com" : "priyalgoyal1702@gmail.com";
  const li      = user?.username === "anav" ? "linkedin.com/in/anavbansal-51b191162" : "linkedin.com/in/priyal--goyal/";
  const greeting = hrName ? `Hi ${hrName},` : "Hi,";
  return `${greeting}

Thank you for reaching out! Please find my details below:

📋 Candidate Profile — ${name}

• Key Skills             : ${profile.keySkills}
• Total Experience       : ${profile.totalExp}
• Relevant Experience    : ${profile.relevantExp}
• Current Company        : ${profile.currentCompany}
• Reason for Change      : ${profile.reasonForChange}
• Notice Period / LWD    : ${profile.noticePeriod}
• Current CTC            : ${profile.currentCTC}
• Offer in Hand          : ${profile.offerInHand || "No"}
• Expected CTC           : ${profile.expectedCTC}
• Current Location       : ${profile.currentLocation}
• Preferred Location     : ${profile.preferredLocation}

Looking forward to the next steps. Please feel free to reach out for any further information.

Best regards,
${name}
📞 ${phone} | ✉ ${email}
🔗 ${li}`;
}

function isScreeningEmail(subject = "", snippet = "") {
  const text = (subject + " " + snippet).toLowerCase();
  return SCREENING_KEYWORDS.some(kw => text.includes(kw));
}

const EMAIL_TEMPLATES_ANAV = [
  { id: "fullstack", name: "Full Stack", icon: "⚡", accent: "#2563eb",
    customNote: "I am excited to apply for this opportunity. My full-stack expertise in Node.js, ReactJS, and AWS Lambda makes me an ideal candidate for building scalable, production-ready applications." },
  { id: "cti",      name: "CTI Expert", icon: "📞", accent: "#7c3aed",
    customNote: "With 4.7+ years specializing in CTI/telephony integrations, I have architected enterprise-grade solutions across Avaya AACC, Genesys, Webex, and Amazon Connect." },
  { id: "formal",   name: "Formal",     icon: "🎯", accent: "#1d4ed8",
    customNote: "I am respectfully submitting my application for this position. I am confident that my technical background aligns closely with your requirements." },
  { id: "startup",  name: "Startup",    icon: "🚀", accent: "#059669",
    customNote: "I build fast, ship quality, and love environments where impact matters. My Node.js + AWS stack has powered real-time enterprise solutions." },
  { id: "crm",      name: "CRM Expert", icon: "🏆", accent: "#0d9488",
    customNote: "With 4.7+ years as a CRM Integration Expert, I specialize in ServiceNow (Flow Designer, IntegrationHub, Virtual Agent) and Freshdesk CTI." },
];

const EMAIL_TEMPLATES_PRIYAL = [
  { id: "finance",  name: "Finance Pro",    icon: "💼", accent: "#0d9488",
    customNote: "With 2+ years in digital lending and credit risk at Tata Capital, I bring expertise in credit underwriting, GenAI automation, and SLOS integration. I am excited to bring this experience to your organization." },
  { id: "credit",   name: "Credit Manager", icon: "📊", accent: "#2563eb",
    customNote: "As a Credit Manager with hands-on experience evaluating secured retail auto loan proposals, I excel at FOIR/LTV analysis, portfolio monitoring and cross-functional collaboration across credit, operations and technology teams." },
  { id: "formal",   name: "Formal",         icon: "🎯", accent: "#1d4ed8",
    customNote: "I am respectfully submitting my application for this position. I am confident that my background in digital lending and credit risk aligns closely with your requirements." },
  { id: "genai",    name: "GenAI Focus",    icon: "🤖", accent: "#7c3aed",
    customNote: "I have hands-on exposure to GenAI-based credit automation, SLOS integration and AI-driven workflow optimization — contributing to a 2.9% reduction in TAT at Tata Capital." },
];

const getEmailTemplates = () => {
  const user = getUser();
  return user?.username === "anav" ? EMAIL_TEMPLATES_ANAV : EMAIL_TEMPLATES_PRIYAL;
};
const EMAIL_TEMPLATES = getEmailTemplates();
const BACKEND_TEMPLATE_MAP = { fullstack: "fullstack", cti: "cti", formal: "formal", startup: "fullstack", crm: "crm", finance: "fullstack", credit: "formal", genai: "fullstack" };

const HEADER_THEMES = [
  { id: "blue",   label: "Blue",   color: "#2563eb" },
  { id: "purple", label: "Purple", color: "#7c3aed" },
  { id: "green",  label: "Green",  color: "#059669" },
  { id: "dark",   label: "Dark",   color: "#374151" },
  { id: "teal",   label: "Teal",   color: "#0d9488" },
  { id: "orange", label: "Orange", color: "#d97706" },
];

const DEFAULT_TEMPLATE_ANAV = {
  headerTheme: "blue",
  customIntro: "",
  highlights: [
    "4.7+ years · Node.js, AngularJS, ReactJS, Express.js",
    "AWS Lambda · DynamoDB · S3 · Amazon Connect",
    "10+ enterprise CTI integrations (Avaya, Genesys, Webex, Zoom)",
    "CRM: ServiceNow, Salesforce, Freshdesk, MS Dynamics, CDK Global",
    "AI-assisted: Claude, GitHub Copilot, ChatGPT",
  ],
};

const DEFAULT_TEMPLATE_PRIYAL = {
  headerTheme: "teal",
  customIntro: "",
  highlights: [
    "2+ Years · Digital Lending & Credit Risk · Tata Capital",
    "Credit Underwriting · FOIR/LTV Analysis · Portfolio Monitoring",
    "GenAI Automation · SLOS Integration · AI-driven Workflow Optimization",
    "Tools: FinnOne, SLOS, SFDC, FICO, Jocata, Power BI, Advanced Excel",
    "COO Achiever's Club Award — Tata Capital (Q1 FY26)",
  ],
};

const DEFAULT_TEMPLATE = getUser()?.username === "anav" ? DEFAULT_TEMPLATE_ANAV : DEFAULT_TEMPLATE_PRIYAL;


const MSG_TEMPLATES_PRIYAL = [
  {
    id: "finance1",
    label: "Finance — Casual",
    icon: "💼",
    color: "#0d9488",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

Hope you're doing well! I came across your profile and wanted to reach out.

I'm Priyal Goyal — a Finance Professional with 2+ years of experience in digital lending and credit risk at Tata Capital Limited. I specialize in credit underwriting, GenAI-based automation, and SLOS integration.

I'm currently exploring new opportunities and would love to connect with someone at ${c}. If there are any suitable openings or if you'd be open to a referral, I'd truly appreciate it!

Happy to share my resume — just let me know.

Thanks so much for your time!

Warm regards,
Priyal Goyal
📞 +91 7665941798 | ✉ priyalgoyal1702@gmail.com
🔗 linkedin.com/in/priyal--goyal/`;
    }
  },
  {
    id: "finance2",
    label: "Finance — Professional",
    icon: "📊",
    color: "#2563eb",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

I hope this message finds you well!

I'm Priyal Goyal, a Finance Professional with 2+ years of experience at Tata Capital Limited, where I work as a Credit Manager handling secured retail auto loan underwriting. I have exposure to GenAI automation, SLOS integration, and cross-functional collaboration across credit, operations and technology teams.

I'm currently evaluating new opportunities and ${c} has caught my attention. I'd be grateful if you could refer me or connect me with the right person on your team.

I'm happy to share my resume at your convenience.

Best regards,
Priyal Goyal
📞 +91 7665941798 | ✉ priyalgoyal1702@gmail.com
🔗 linkedin.com/in/priyal--goyal/`;
    }
  },
  {
    id: "genai",
    label: "GenAI Focus",
    icon: "🤖",
    color: "#7c3aed",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

Hope you're having a great week!

I'm Priyal Goyal — a Finance Professional with hands-on experience in GenAI-powered credit automation, SLOS integration, and AI-driven workflow optimization at Tata Capital Limited. I've contributed to a 2.9% reduction in TAT and improvements in credit quality.

I'm exploring new opportunities and would love to connect with someone at ${c}. If there are any suitable openings or if you'd be open to referring me, I'd truly appreciate it!

Thank you for your time!

Warm regards,
Priyal Goyal
📞 +91 7665941798 | ✉ priyalgoyal1702@gmail.com
🔗 linkedin.com/in/priyal--goyal/`;
    }
  },
];

const MSG_TEMPLATES_ANAV = [
  {
    id: "fullstack1",
    label: "Full Stack — Casual",
    icon: "💻",
    color: "#2563eb",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

Hope you're doing well! I came across your profile and wanted to reach out.

I'm Anav Bansal — a Senior Full Stack Developer with 4.7+ years of experience building production-grade applications using Node.js, Angular, React, AWS Lambda, and DynamoDB. I've worked extensively on enterprise CTI integrations and serverless architectures.

I'm currently exploring a job switch and would love to connect with someone at ${c}. If there are any openings that might be a good fit, or if you'd be open to a referral, I'd really appreciate it!

Even a quick pointer to the right team would mean a lot.

Thanks so much — looking forward to connecting!

Warm regards,
Anav Bansal
📞 +91 7827855635 | ✉ anavbansal06@gmail.com
🔗 linkedin.com/in/anavbansal-51b191162`;
    }
  },
  {
    id: "fullstack2",
    label: "Full Stack — Professional",
    icon: "🚀",
    color: "#7c3aed",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

I hope this message finds you well!

I'm Anav Bansal, a Senior Full Stack Developer with 4.7+ years of experience delivering scalable, end-to-end applications — Node.js, Angular, React, AWS, and enterprise CRM/CTI integrations across platforms like ServiceNow, Salesforce, and Freshdesk.

I'm at a stage in my career where I'm actively evaluating exciting new opportunities, and ${c} has caught my attention. I'd be grateful if you'd consider referring me, or simply connecting me with the right person on your team.

I'm happy to share my resume and portfolio at your convenience. Thank you for your time — it truly means a lot!

Best regards,
Anav Bansal
📞 +91 7827855635 | ✉ anavbansal06@gmail.com
🔗 linkedin.com/in/anavbansal-51b191162`;
    }
  },
  {
    id: "crm",
    label: "CRM / ServiceNow Expert",
    icon: "🏆",
    color: "#0d9488",
    build: (name, company) => {
      const n = (name || "there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},

Hope you're having a great week!

I'm Anav Bansal — a Senior CRM Integration Expert with 4.7+ years of specialization in ServiceNow (Flow Designer, IntegrationHub, Virtual Agent, Scripted REST APIs), Freshdesk, Salesforce, and Zendesk. I've published 3 enterprise marketplace apps and led CTI integrations for Fortune 500 contact centers.

I'm currently looking for a new challenge and exploring opportunities where I can make an impact with my CRM & ServiceNow expertise. If ${c} has any relevant openings or if you'd be open to referring me, I'd truly appreciate it!

Happy to send across my resume — just let me know.

Thank you so much for taking the time!

Warm regards,
Anav Bansal
📞 +91 7827855635 | ✉ anavbansal06@gmail.com
🔗 linkedin.com/in/anavbansal-51b191162`;
    }
  },
];

const getMsgTemplates = () => {
  const user = getUser();
  return user?.username === "anav" ? MSG_TEMPLATES_ANAV : MSG_TEMPLATES_PRIYAL;
};
const MSG_TEMPLATES = getMsgTemplates();

function loadCustomTemplate() {
  try { return JSON.parse(localStorage.getItem("customEmailTemplate") || "null") || DEFAULT_TEMPLATE; }
  catch { return DEFAULT_TEMPLATE; }
}


// Local datetime string for datetime-local input and API (no UTC conversion)
function toLocalDT(date) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-IN");
}

// Returns integer day count since timestamp (0 = today)
function daysSince(ts) {
  if (!ts || ts === 0) return null;
  const d = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return d < 0 ? 0 : d;
}

function DaysBadge({ ts }) {
  if (!ts || ts === 0) return null;
  const d = daysSince(ts);
  if (d === null) return null;
  // Don't show "Today" for old imported contacts — anything > 400 days is likely bad data
  if (d > 400) return null;
  const color = d === 0 ? "var(--green)" : d <= 3 ? "var(--green)" : d <= 7 ? "var(--amber)" : d <= 30 ? "var(--red)" : "#9ca3af";
  const label = d === 0 ? "Today"
    : d === 1 ? "1d ago"
    : d < 30  ? `${d}d ago`
    : d < 365 ? `${Math.floor(d/30)}mo ago`
    : `${Math.floor(d/365)}y ago`;
  return (
    <span className="days-badge" style={{ borderColor: color, color, fontSize: 11 }}>
      📅 {label}
    </span>
  );
}

function getInitials(name, email) {
  if (name) return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (email || "HR")[0].toUpperCase();
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function useLockBodyScroll() {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
}

// ─── Dark Mode Toggle ─────────────────────────────────────────────────────────
function DarkModeToggle({ dark, onToggle }) {
  return (
    <button className={`dmtoggle${dark ? " dmtoggle-on" : ""}`} onClick={onToggle} title="Toggle dark mode">
      {dark ? "🌙" : "☀️"}
    </button>
  );
}

// ─── Toast Notification System ────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = "blue", onClick }) {
  return (
    <div className={`stat-card stat-${color}${onClick ? " stat-clickable" : ""}`} onClick={onClick}>
      <div className="stat-icon-wrap">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
function DashboardPage({ contacts, replies, scheduledJobs, onNavigate }) {
  const currentUser = getUser();
  const followDue = contacts.filter(c => c.needsFollowUp).length;
  const totalSent   = contacts.reduce((s, c) => s + (c.totalSent || 1), 0);
  const openedCount = contacts.filter(c => c.opened).length;
  const replyCount  = replies.length;
  const scheduled   = scheduledJobs.filter(j => j.status === "pending").length;
  const openRate    = contacts.length > 0 ? Math.round(openedCount / contacts.length * 100) : 0;
  const replyRate   = contacts.length > 0 ? Math.round(replyCount  / contacts.length * 100) : 0;

  const health = Math.min(100, Math.round(
    (Math.min(contacts.length, 30) / 30) * 40 +
    openRate  * 0.3 +
    replyRate * 0.3
  ));
  const healthLabel = health >= 70 ? "Strong 🔥" : health >= 40 ? "Building 📈" : "Getting started 🚀";
  const healthColor = health >= 70 ? "var(--green)" : health >= 40 ? "var(--amber)" : "var(--blue)";

  const recent = [...contacts].sort((a, b) => b.lastSentAt - a.lastSentAt).slice(0, 6);

  const QUICK = [
    { icon: "✉",  label: "Send Application", id: "send",     cls: "qb-blue"   },
    { icon: "📥", label: "Check Inbox",        id: "inbox",    cls: "qb-purple" },
    { icon: "🎯", label: "Find HR Emails",     id: "prospect", cls: "qb-green"  },
    { icon: "🔍", label: "Find Jobs",           id: "jobs",     cls: "qb-amber"  },
  ];

  return (
    <div className="page dashboard-page">
      {/* Welcome + health pill */}
      <div className="dash-welcome">
        <div>
          <h2 className="dash-welcome-title">Welcome back, {currentUser?.displayName?.split(" ")[0] || currentUser?.username} 👋</h2>
          <p className="dash-welcome-sub">{currentUser?.username === "anav" ? "Here's your job search at a glance" : "Here's your career search at a glance"}</p>
        </div>
        <div className="health-pill" style={{ borderColor: healthColor, color: healthColor }}>
          <span className="health-dot" style={{ background: healthColor }} />
          {healthLabel}
        </div>
      </div>

      {/* Progress bar */}
      <div className="health-bar-wrap">
        <div className="health-bar-track">
          <div className="health-bar-fill" style={{ width: `${Math.max(health, 4)}%`, background: healthColor }} />
        </div>
        <span className="health-bar-label">Job search health · {health}/100</span>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <StatCard icon="📤" label="Applications Sent"  value={totalSent}
          sub={totalSent > 0 ? `${contacts.length} companies` : "Start applying!"}
          color="blue"   onClick={() => onNavigate("contacts")} />
        <StatCard icon="👁" label="Emails Opened"       value={openedCount}
          sub={`${openRate}% open rate`}  color="purple" />
        <StatCard icon="↩" label="Replies Received"    value={replyCount}
          sub={replyRate > 0 ? `${replyRate}% reply rate` : "Keep following up!"}
          color="green"  onClick={() => onNavigate("inbox")} />
        <StatCard icon="⏰" label="Follow-up Due"       value={followDue}
          sub={followDue > 0 ? "Action needed!" : "All caught up ✓"}
          color="amber"  onClick={() => onNavigate("contacts")} />
        <StatCard icon="🗓" label="Scheduled"           value={scheduled}
          sub={scheduled > 0 ? "Queued to send" : "None scheduled"}
          color="blue"   onClick={() => onNavigate("scheduled")} />
        <StatCard icon="🏆" label="Response Rate"
          value={totalSent > 0 ? `${replyRate}%` : "—"}
          sub={replyRate >= 10 ? "Great! 🔥" : replyRate > 0 ? "Keep going 💪" : "Aim for 10%+"}
          color="purple" onClick={() => onNavigate("contacts")} />
      </div>

      {/* Weekly goal tracker */}
      {(() => {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const thisWeek = contacts.filter(c => c.lastSentAt > weekAgo).length;
        const weekGoal = 20;
        const pct = Math.min(100, Math.round(thisWeek / weekGoal * 100));
        const color = pct >= 100 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--blue)";
        return (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 14
          }}>
            <span style={{ fontSize: 22 }}>📅</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Weekly Goal: {thisWeek}/{weekGoal} applications</span>
                <span style={{ fontSize: 12, color, fontWeight: 700 }}>{pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 1s ease" }} />
              </div>
            </div>
            {pct >= 100 && <span style={{ fontSize: 20 }}>🎉</span>}
          </div>
        );
      })()}

      {/* Quick actions */}
      <div className="dash-section-title">Quick Actions</div>
      <div className="quick-actions-grid">
        {QUICK.map(q => (
          <button key={q.id} className={`quick-btn ${q.cls}`} onClick={() => onNavigate(q.id)}>
            <span className="quick-icon">{q.icon}</span>
            <span className="quick-label">{q.label}</span>
          </button>
        ))}
      </div>

      {/* Recent activity */}
      <div className="dash-section-title">Recent Applications</div>
      {recent.length === 0 ? (
        <div className="dash-empty">
          <span className="dash-empty-icon">📭</span>
          <p>No applications yet. Send your first application!</p>
          <button className="btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => onNavigate("send")}>
            ✉ Send Application
          </button>
        </div>
      ) : (
        <div className="activity-feed">
          {recent.map((c, i) => (
            <div key={i} className="activity-row">
              <div className="activity-avatar">{getInitials(c.hrName, c.hrEmail)}</div>
              <div className="activity-body">
                <span className="activity-company">{c.company}</span>
                {c.role && <span className="activity-role">{c.role}</span>}
                <span className="activity-email">{c.hrEmail}</span>
              </div>
              <div className="activity-right">
                <DaysBadge ts={c.lastSentAt} />
                {c.opened        && <span className="badge badge-opened"   style={{ fontSize: 10 }}>👁 Opened</span>}
                {c.needsFollowUp && <span className="badge badge-reminder" style={{ fontSize: 10 }}>⏰ Follow-up</span>}
              </div>
            </div>
          ))}
          <button className="activity-view-all" onClick={() => onNavigate("contacts")}>
            View all contacts →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Email Body Modal ─────────────────────────────────────────────────────────
function EmailBodyModal({ trackingId, onClose }) {
  const [html, setHtml]       = useState("");
  const [loading, setLoading] = useState(true);
  useLockBodyScroll();

  useEffect(() => {
    if (!trackingId) return;
    axios.get(`${API}/api/emails/${trackingId}`)
      .then(r => setHtml(r.data.html || ""))
      .catch(() => setHtml(`<div style="padding:32px;font-family:sans-serif;color:#374151;">
        <p style="font-size:16px;font-weight:700;margin-bottom:8px;">⚠️ Email not found</p>
        <p style="font-size:14px;color:#6b7280;">Make sure the backend is running at localhost:5000.</p>
      </div>`))
      .finally(() => setLoading(false));
  }, [trackingId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row"><span>📧</span><h3 className="modal-title">Sent Email Body</h3></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading
            ? <div className="modal-loading"><span className="spinner spinner-dark" /> Loading…</div>
            : <iframe srcDoc={html} className="email-iframe" title="Email Preview" sandbox="allow-same-origin" />}
        </div>
      </div>
    </div>
  );
}

// ─── Template Editor Modal ────────────────────────────────────────────────────
function TemplateEditorModal({ templateType, onClose, onSave }) {
  const [tpl, setTpl]           = useState(() => loadCustomTemplate());
  const [previewHtml, setPreview] = useState("");
  const [previewLoading, setPL] = useState(false);
  const [saved, setSaved]       = useState(false);
  useLockBodyScroll();

  const debouncedTpl = useDebounce(tpl, 600);

  useEffect(() => {
    setPL(true);
    axios.post(`${API}/api/preview-email`, {
      hrName: "Priya Sharma", company: "Your Company", role: "Senior Full Stack Developer",
      customNote: "I am very excited about this opportunity.",
      templateType: BACKEND_TEMPLATE_MAP[templateType] || "fullstack",
      customIntro:  debouncedTpl.customIntro || undefined,
      customHighlights: debouncedTpl.highlights.length ? debouncedTpl.highlights : undefined,
      headerTheme: debouncedTpl.headerTheme,
    })
      .then(r => setPreview(r.data.html || ""))
      .catch(() => {})
      .finally(() => setPL(false));
  }, [debouncedTpl, templateType]);

  const setHighlight = (idx, val) => setTpl(p => ({
    ...p, highlights: p.highlights.map((h, i) => i === idx ? val : h),
  }));
  const removeHighlight = (idx) => setTpl(p => ({
    ...p, highlights: p.highlights.filter((_, i) => i !== idx),
  }));
  const addHighlight = () => setTpl(p => ({ ...p, highlights: [...p.highlights, ""] }));

  const save = () => {
    localStorage.setItem("customEmailTemplate", JSON.stringify(tpl));
    onSave(tpl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    setTpl(DEFAULT_TEMPLATE);
    localStorage.removeItem("customEmailTemplate");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-editor" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row"><span>🎨</span><h3 className="modal-title">Visual Template Editor</h3><span className="modal-hint">Changes apply to all sent emails</span></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="editor-body">
          {/* ── Left: controls ── */}
          <div className="editor-left">
            <div className="form-group">
              <label className="form-label">Header Colour Theme</label>
              <div className="color-swatches">
                {HEADER_THEMES.map(th => (
                  <button key={th.id} title={th.label}
                    className={`color-swatch ${tpl.headerTheme === th.id ? "swatch-active" : ""}`}
                    style={{ background: th.color }}
                    onClick={() => setTpl(p => ({ ...p, headerTheme: th.id }))}>
                    {tpl.headerTheme === th.id && <span className="swatch-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Introduction Paragraph
                <span className="label-hint">Leave blank to use the default</span>
              </label>
              <textarea
                className="form-textarea"
                rows={5}
                placeholder="e.g. I am writing to express my strong interest in joining…"
                value={tpl.customIntro}
                onChange={e => setTpl(p => ({ ...p, customIntro: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Highlights / Bullet Points</label>
              <div className="hl-list">
                {tpl.highlights.map((h, i) => (
                  <div key={i} className="hl-row">
                    <span className="hl-bullet">•</span>
                    <input className="form-input hl-input" value={h}
                      onChange={e => setHighlight(i, e.target.value)}
                      placeholder="Add a highlight…" />
                    <button className="hl-remove" onClick={() => removeHighlight(i)}>✕</button>
                  </div>
                ))}
              </div>
              <button className="btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={addHighlight}>
                + Add Highlight
              </button>
            </div>

            <div className="editor-footer-btns">
              <button className="btn-ghost btn-sm" onClick={reset}>↺ Reset Default</button>
              <button className={`btn-primary btn-sm ${saved ? "btn-copied" : ""}`} onClick={save}>
                {saved ? "✓ Saved!" : "💾 Save Template"}
              </button>
            </div>
          </div>

          {/* ── Right: live preview ── */}
          <div className="editor-right">
            <div className="editor-preview-label">
              Live Preview {previewLoading && <span className="preview-loading-dot" />}
            </div>
            <iframe
              srcDoc={previewHtml || "<p style='padding:24px;color:#6b7280;font-family:sans-serif;'>Loading preview…</p>"}
              className="editor-iframe"
              title="Template Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Follow-up Modal ──────────────────────────────────────────────────────────

// ─── Bulk Follow-up Scheduler ─────────────────────────────────────────────────
function BulkFollowUpModal({ contacts, onClose, addToast }) {
  // Only show contacts that are due for followup or haven't been followed up
  const eligible = contacts.filter(c =>
    !c.replied && c.lastSentAt > 0 &&
    (Date.now() - c.lastSentAt) > 2 * 24 * 60 * 60 * 1000  // sent > 2 days ago
  ).slice(0, 50);

  const [selected,  setSelected]  = useState(() => new Set(eligible.filter(c => c.needsFollowUp).map(c => c.hrEmail)));
  const [schedTime, setSchedTime] = useState("");
  const [interval,  setInterval2] = useState(5);   // minutes between each email
  const [sending,   setSending]   = useState(false);
  const [progress,  setProgress]  = useState({ done: 0, total: 0, errors: [] });
  const [done,      setDone]      = useState(false);
  useLockBodyScroll();

  const toggle = (email) => setSelected(prev => {
    const next = new Set(prev);
    next.has(email) ? next.delete(email) : next.add(email);
    return next;
  });
  const toggleAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map(c => c.hrEmail)));
  };

  const send = async () => {
    if (selected.size === 0) return addToast && addToast("Select at least one contact", "error");
    const targets = eligible.filter(c => selected.has(c.hrEmail));
    setSending(true);
    setProgress({ done: 0, total: targets.length, errors: [] });

    const errors = [];
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      setProgress(p => ({ ...p, done: i }));
      try {
        const payload = {
          hrEmail:           c.hrEmail,
          hrName:            c.hrName && !c.hrName.includes("@") ? c.hrName : "",
          company:           c.company || "",
          role:              c.role    || "",
          originalMessageId: c.lastMessageId  || "",
          originalThreadId:  c.lastThreadId   || "",
          originalDate:      c.lastSentAt > 0 ? new Date(c.lastSentAt).toLocaleDateString("en-IN") : "",
        };

        if (schedTime) {
          // Schedule with staggered time — each email interval mins apart
          const baseTime = new Date(schedTime);
          baseTime.setMinutes(baseTime.getMinutes() + i * interval);
          await axios.post(`${API}/api/schedule-email`, {
            ...payload, type: "followup",
            scheduledTime: toLocalDT(baseTime),   // local time — no UTC shift
          });
        } else {
          // Send now with small delay between each
          await axios.post(`${API}/api/send-followup`, payload);
          if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        errors.push(`${c.hrEmail}: ${e.response?.data?.message || e.message}`);
      }
    }

    setProgress({ done: targets.length, total: targets.length, errors });
    setSending(false);
    setDone(true);
    const msg = schedTime
      ? `✅ ${targets.length - errors.length} followups scheduled!`
      : `✅ ${targets.length - errors.length} followups sent!`;
    addToast && addToast(msg);
  };

  const minDateTime = toLocalDT(Date.now() + 5 * 60000);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form modal-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>📅</span>
            <h3 className="modal-title">Bulk Follow-up Scheduler</h3>
            <span className="modal-hint" style={{ background:"#ede9fe", color:"#5b21b6" }}>
              {selected.size} selected · {eligible.length} eligible
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll" style={{ maxHeight: 520 }}>
          {done ? (
            <div style={{ padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {progress.errors.length === 0 ? "🎉" : "⚠️"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                {progress.done - progress.errors.length} of {progress.total} {schedTime ? "scheduled" : "sent"}!
              </div>
              {progress.errors.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  {progress.errors.length} failed:<br />
                  {progress.errors.map((e,i) => <div key={i}>{e}</div>)}
                </div>
              )}
              <button className="btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              {/* Schedule options */}
              <div style={{
                background: "var(--surface-2,#f8fafc)", borderRadius: 12,
                padding: "14px 16px", marginBottom: 16,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12
              }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    📅 Schedule Time <span style={{ fontWeight:400, fontSize:11 }}>(leave blank = send now)</span>
                  </label>
                  <input type="datetime-local" className="form-input"
                    min={minDateTime} value={schedTime}
                    onChange={e => setSchedTime(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    ⏱ Gap between emails <span style={{ fontWeight:400, fontSize:11 }}>(minutes)</span>
                  </label>
                  <select className="form-select" value={interval} onChange={e => setInterval2(+e.target.value)}>
                    {[1,2,3,5,10,15,20,30].map(v => (
                      <option key={v} value={v}>{v} min{v>1?"s":""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress bar when sending */}
              {sending && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:12 }}>
                    <span>Sending… {progress.done}/{progress.total}</span>
                    <span>{Math.round((progress.done/progress.total)*100)}%</span>
                  </div>
                  <div style={{ height:8, borderRadius:99, background:"var(--border)", overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:99,
                      background:"linear-gradient(90deg,#7c3aed,#a855f7)",
                      width:`${(progress.done/progress.total)*100}%`,
                      transition:"width 0.3s ease"
                    }} />
                  </div>
                </div>
              )}

              {/* Select all */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <button type="button" className="chip" onClick={toggleAll} style={{ fontSize:12 }}>
                  {selected.size === eligible.length ? "☑ Deselect All" : "☐ Select All Due"}
                </button>
                <span style={{ fontSize:11, color:"var(--text-muted,#6b7280)" }}>
                  {eligible.length} contacts eligible (sent 2+ days ago, no reply)
                </span>
              </div>

              {/* Contact list */}
              {eligible.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">✅</span>
                  <p>No contacts due for follow-up right now!</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {eligible.map(c => (
                    <div key={c.hrEmail}
                      onClick={() => toggle(c.hrEmail)}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"10px 12px", borderRadius:10, cursor:"pointer",
                        border:`1.5px solid ${selected.has(c.hrEmail) ? "#7c3aed" : "var(--border,#e2e8f0)"}`,
                        background: selected.has(c.hrEmail)
                          ? "linear-gradient(135deg,#faf5ff,#ede9fe)"
                          : "var(--surface,#fff)",
                        transition:"all 0.15s ease",
                      }}>
                      {/* Checkbox */}
                      <div style={{
                        width:18, height:18, borderRadius:5, flexShrink:0,
                        border:`2px solid ${selected.has(c.hrEmail) ? "#7c3aed" : "#d1d5db"}`,
                        background: selected.has(c.hrEmail) ? "#7c3aed" : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        {selected.has(c.hrEmail) && <span style={{ color:"#fff", fontSize:11, fontWeight:800 }}>✓</span>}
                      </div>

                      {/* Avatar */}
                      <div style={{
                        width:32, height:32, borderRadius:"50%", flexShrink:0,
                        background:"linear-gradient(135deg,#7c3aed,#a855f7)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:800, color:"#fff"
                      }}>
                        {getInitials(c.hrName, c.hrEmail)}
                      </div>

                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>
                          {c.company || "—"}
                          {c.hrName && !c.hrName.includes("@") && (
                            <span style={{ fontWeight:400, color:"var(--text-muted,#6b7280)", marginLeft:6, fontSize:12 }}>
                              · {c.hrName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:"var(--text-muted,#6b7280)", marginTop:1 }}>
                          {c.hrEmail}
                        </div>
                      </div>

                      {/* Days since */}
                      <div style={{ fontSize:11, color: c.needsFollowUp ? "#d97706" : "#6b7280", fontWeight:600, flexShrink:0 }}>
                        {c.lastSentAt > 0 ? `${Math.floor((Date.now()-c.lastSentAt)/(1000*60*60*24))}d ago` : ""}
                        {c.needsFollowUp && <span style={{ marginLeft:4 }}>⏰</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="modal-footer">
            <button className="btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
            <button
              className={`btn-primary ${sending ? "loading" : ""}`}
              onClick={send}
              disabled={sending || selected.size === 0}
              style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)", minWidth:180 }}>
              {sending
                ? <><span className="spinner" /> Sending {progress.done}/{progress.total}…</>
                : schedTime
                  ? `📅 Schedule ${selected.size} Follow-up${selected.size>1?"s":""}`
                  : `🚀 Send ${selected.size} Follow-up${selected.size>1?"s":""} Now`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FollowUpModal({ contact, onClose, onSent }) {
  // hrName: strip email if somehow it got stored as name
  const cleanName = (name, email) => {
    if (!name) return "";
    if (name.trim().toLowerCase() === (email||"").trim().toLowerCase()) return "";
    if (name.includes("@")) return "";
    return name.trim();
  };

  const [form, setForm] = useState({
    hrEmail:           contact.hrEmail || "",
    hrName:            cleanName(contact.hrName, contact.hrEmail),
    company:           contact.company || "",
    role:              contact.role    || "",
    originalDate:      contact.lastSentAt ? new Date(contact.lastSentAt).toLocaleDateString("en-IN") : "",
    customNote:        "",
    originalMessageId: contact.lastMessageId || contact.originalMessageId || "",
    originalThreadId:  contact.lastThreadId  || contact.originalThreadId  || "",
    originalSubject:   contact.originalSubject || "",
  });
  const [mode, setMode]           = useState("now");
  const [scheduledTime, setSched] = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);
  useLockBodyScroll();

  const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true); setStatus(null);
    try {
      if (mode === "schedule") {
        if (!scheduledTime) throw new Error("Choose a date and time.");
        const res = await axios.post(`${API}/api/schedule-email`, { ...form, type: "followup", scheduledTime });
        setStatus({ type: "success", text: res.data.message });
      } else {
        const res = await axios.post(`${API}/api/send-followup`, form);
        setStatus({ type: "success", text: res.data.message });
        onSent && onSent();
      }
    } catch (err) {
      setStatus({ type: "error", text: err.response?.data?.message || "Failed." });
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>🔁</span><h3 className="modal-title">Send Follow-up</h3>
            <span className="modal-hint" style={{ background:"#ede9fe", color:"#5b21b6" }}>
              {contact.company || contact.hrEmail}
              {form.hrName && <span> · {form.hrName}</span>}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-scroll">
          <form onSubmit={submit} className="modal-form" noValidate>
            <div className="form-group">
              <label className="form-label">Delivery</label>
              <div className="chip-row">
                <button type="button" className={`chip ${mode === "now" ? "chip-active" : ""}`} onClick={() => setMode("now")}>⚡ Send Now</button>
                <button type="button" className={`chip ${mode === "schedule" ? "chip-active" : ""}`} onClick={() => setMode("schedule")}>🗓 Schedule</button>
              </div>
            </div>
            {mode === "schedule" && (
              <div className="form-group">
                <label className="form-label" htmlFor="fu-sched"><span className="lbadge">Required</span> Date &amp; Time</label>
                <input id="fu-sched" type="datetime-local"
                  min={toLocalDT(Date.now() + 60000)}
                  value={scheduledTime} onChange={e => setSched(e.target.value)} className="form-input" />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label"><span className="lbadge">Required</span> HR Email</label>
                <input name="hrEmail" type="email" value={form.hrEmail} onChange={handle} className="form-input" required disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label"><span className="lbadge lbadge-opt">Optional</span> HR Name</label>
                <input name="hrName" type="text" value={form.hrName} onChange={handle} className="form-input" disabled={loading} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label"><span className="lbadge">Required</span> Company</label>
                <input name="company" type="text" value={form.company} onChange={handle} className="form-input" required disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label"><span className="lbadge lbadge-opt">Optional</span> Role</label>
                <input name="role" type="text" value={form.role} onChange={handle} className="form-input" disabled={loading} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label"><span className="lbadge lbadge-opt">Optional</span> Original Application Date</label>
              <input name="originalDate" type="text" value={form.originalDate} onChange={handle} className="form-input" disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label"><span className="lbadge lbadge-opt">Optional</span> Custom Note</label>
              <textarea name="customNote" value={form.customNote} onChange={handle}
                placeholder="Add a personalised follow-up line…" className="form-textarea" rows={3} disabled={loading} />
            </div>
            {status && (
              <div className={`alert alert-${status.type}`}>
                <span className="alert-icon">{status.type === "success" ? "✓" : "✕"}</span>
                <span>{status.text}</span>
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn-followup ${loading ? "loading" : ""}`}
                disabled={loading || !form.hrEmail || !form.company}>
                {loading ? <><span className="spinner" /> Sending…</> : <><span className="btn-arrow">↑</span> {mode === "schedule" ? "Schedule Follow-up" : "Send Follow-up"}</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Duplicate Warning Modal ──────────────────────────────────────────────────
function DuplicateWarningModal({ info, onClose, onConfirm }) {
  useLockBodyScroll();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row"><span>⚠️</span><h3 className="modal-title">Already Contacted</h3></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-pad">
          <p className="dup-text">You already sent an application email to</p>
          <p className="dup-email">{info.hrEmail}</p>
          {info.lastCompany && <p className="dup-company">at <strong>{info.lastCompany}</strong></p>}
          <div className="dup-date-box">
            <span>📅</span>
            <span>{new Date(info.lastSentAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}</span>
          </div>
          <p className="dup-question">Do you want to send another application email anyway?</p>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm}>Send Anyway</button>
        </div>
      </div>
    </div>
  );
}

// ─── HR Contacts Page ─────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: "applied",  label: "Applied",       icon: "📤", color: "#2563eb" },
  { key: "opened",   label: "Opened",        icon: "👁", color: "#7c3aed" },
  { key: "followup", label: "Follow-up Due", icon: "⏰", color: "#d97706" },
  { key: "replied",  label: "Replied",       icon: "↩", color: "#059669" },
];

function HRContactsPage({ contacts, replies, fetchedAt, sheetError, onViewEmail, onFollowUp, onMessage, onRefresh, addToast, onViewThread, onManualUpdate }) {
  const [search,     setSearch]    = useState("");
  const [view,       setView]      = useState("list"); // "list" | "kanban"
  const [activeTab,  setActiveTab] = useState("all");  // filter tab
  const [clearing,   setClearing]  = useState(null);
  const [syncing,    setSyncing]   = useState(false);
  const [syncResult, setSyncResult]= useState(null);
  const [bulkModal,  setBulkModal]  = useState(false);

  const syncGmailSent = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await axios.get(`${API}/api/sync-sent-emails`, {
        params: { after: "2026/05/28", max: 500 }
      });
      const { inserted, skipped, totalFetched } = r.data;
      setSyncResult({ inserted, skipped, totalFetched });
      addToast && addToast(`✅ Gmail sync done! ${inserted} new contacts saved.`);
      onRefresh();
    } catch (e) {
      addToast && addToast("❌ Gmail sync failed: " + (e.response?.data?.message || e.message), "error");
    } finally { setSyncing(false); }
  };

  const replyEmails = new Set((replies || []).map(r => r.fromEmail.toLowerCase()));

  const getStage = (c) => {
    if (c.replied || replyEmails.has(c.hrEmail.toLowerCase())) return "replied";
    if (c.opened)         return "opened";
    if (c.needsFollowUp)  return "followup";
    if (c.followupSent)   return "followup_sent";
    return "applied";
  };

  // ── Filter counts ──────────────────────────────────────────────────────────
  const counts = {
    all:           contacts.length,
    replied:       contacts.filter(c => c.replied || replyEmails.has(c.hrEmail.toLowerCase())).length,
    followup:      contacts.filter(c => c.needsFollowUp).length,
    followup_sent: contacts.filter(c => c.followupSent && !c.replied).length,
    thread:        contacts.filter(c => c.lastMessageId).length,
    opened:        contacts.filter(c => c.opened).length,
  };

  // ── Filter tabs definition ─────────────────────────────────────────────────
  const FILTER_TABS = [
    { key: "all",           icon: "👥", label: "All",           color: "#2563eb" },
    { key: "replied",       icon: "↩",  label: "Replied",       color: "#059669" },
    { key: "followup",      icon: "⏰", label: "Follow-up Due", color: "#d97706" },
    { key: "followup_sent", icon: "🔁", label: "Follow-up Sent",color: "#7c3aed" },
    { key: "opened",        icon: "👁", label: "Opened",        color: "#0d9488" },
    { key: "thread",        icon: "🧵", label: "Has Thread",    color: "#6366f1" },
  ];

  // ── Apply search + tab filter ──────────────────────────────────────────────
  const searchFiltered = contacts.filter(c =>
    !search ||
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.hrEmail?.toLowerCase().includes(search.toLowerCase()) ||
    c.role?.toLowerCase().includes(search.toLowerCase()) ||
    c.hrName?.toLowerCase().includes(search.toLowerCase())
  );

  const filtered = searchFiltered.filter(c => {
    if (activeTab === "all")           return true;
    if (activeTab === "replied")       return c.replied || replyEmails.has(c.hrEmail.toLowerCase());
    if (activeTab === "followup")      return c.needsFollowUp;
    if (activeTab === "followup_sent") return c.followupSent;
    if (activeTab === "thread")        return !!c.lastMessageId;
    if (activeTab === "opened")        return c.opened;
    return true;
  });

  const reminders = searchFiltered.filter(c => c.needsFollowUp);

  const clearOpened = async (trackingId) => {
    if (!trackingId) return;
    setClearing(trackingId);
    try {
      await axios.post(`${API}/api/track/reset/${trackingId}`);
      onRefresh();
    } catch {}
    finally { setClearing(null); }
  };

  function statusBadge(c) {
    if (replyEmails.has(c.hrEmail.toLowerCase()) || c.replied)
      return <span className="badge badge-reply">↩ Replied</span>;
    if (c.opened)
      return (
        <span className="badge badge-opened" title={`Opened ${relativeTime(c.openedAt)}`}>
          👁 Opened
          <button className="badge-clear-btn" title="Mark as not opened"
            onClick={e => { e.stopPropagation(); clearOpened(c.lastTrackingId); }}
            disabled={clearing === c.lastTrackingId}>
            {clearing === c.lastTrackingId ? "…" : "✕"}
          </button>
        </span>
      );
    if (c.needsFollowUp) return <span className="badge badge-reminder">⏰ Follow-up Due</span>;
    return <span className="badge badge-sent">📤 Sent</span>;
  }

  return (<>
    <div className="page">
      {sheetError && contacts.length === 0 && (
        <div className="sheet-error-banner">
          <span>⚠️</span>
          <div>
            <strong>Google Sheet not syncing:</strong> {sheetError}
            <div className="sheet-error-hint">
              Open <code>https://emailsender-v8a4.onrender.com/api/sheets/debug</code> to diagnose. Once fixed, click ↻ Refresh.
            </div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onRefresh}>↻ Refresh</button>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="reminder-banner">
          <span className="reminder-icon">🔔</span>
          <span><strong>{reminders.length} contact{reminders.length > 1 ? "s" : ""}</strong> sent 3+ days ago with no follow-up.</span>
        </div>
      )}

      {/* ── Filter Tabs ── */}
      <div className="contact-filter-tabs">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            className={`cft-btn ${activeTab === tab.key ? "cft-active" : ""}`}
            style={activeTab === tab.key ? { "--tab-color": tab.color } : {}}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="cft-icon">{tab.icon}</span>
            <span className="cft-label">{tab.label}</span>
            {counts[tab.key] > 0 && (
              <span className="cft-count" style={activeTab === tab.key ? { background: tab.color } : {}}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="page-toolbar">
        <div className="search-bar-wrap search-bar-inline">
          <span className="search-icon">🔍</span>
          <input className="search-input" type="text" placeholder="Search by company, email, role…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>
        <div className="toolbar-right">
          {/* View toggle */}
          <div className="view-toggle">
            <button className={`view-btn ${view === "list"   ? "view-btn-active" : ""}`} onClick={() => setView("list")}>   ☰ List</button>
            <button className={`view-btn ${view === "kanban" ? "view-btn-active" : ""}`} onClick={() => setView("kanban")}>▦ Pipeline</button>
          </div>
          {fetchedAt && <span className="fetched-at">↻ {relativeTime(fetchedAt)}</span>}
          <button className="btn-ghost btn-sm" onClick={onRefresh}>↻ Refresh</button>
          <button
            className={`btn-primary btn-sm ${syncing ? "loading" : ""}`}
            onClick={syncGmailSent}
            disabled={syncing}
            title="Fetch new sent emails from Gmail, detect replies, save thread history"
            style={{ background: "#0d9488", fontSize: 12 }}
          >
            {syncing ? <><span className="spinner" /> Syncing…</> : "📥 Sync Gmail Sent"}
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => setBulkModal(true)}
            style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)", fontSize:12 }}
            title="Send follow-up to multiple contacts at once">
            📅 Bulk Follow-up
          </button>
          {syncResult && (
            <span style={{ fontSize: 11, color: "var(--text-muted,#64748b)" }}>
              {syncResult.inserted} new · {syncResult.totalFetched} fetched
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <p>{search ? `No results for "${search}"` : "No applications yet. Go to Send Application to get started."}</p>
        </div>
      ) : view === "kanban" ? (
        /* ── Kanban pipeline view ── */
        <div className="kanban-board">
          {PIPELINE_STAGES.map(stage => {
            const cards = filtered.filter(c => getStage(c) === stage.key);
            return (
              <div key={stage.key} className="kanban-col">
                <div className="kanban-col-head" style={{ borderTopColor: stage.color }}>
                  <span style={{ color: stage.color }}>{stage.icon} {stage.label}</span>
                  <span className="kanban-count" style={{ background: stage.color }}>{cards.length}</span>
                </div>
                <div className="kanban-cards">
                  {cards.length === 0
                    ? <div className="kanban-empty">No contacts here</div>
                    : cards.map((c, i) => (
                      <div key={i} className="kanban-card">
                        <div className="kanban-card-top">
                          <div className="kanban-avatar">{getInitials(c.hrName, c.hrEmail)}</div>
                          <div>
                            <div className="kanban-company">{c.company}</div>
                            {c.role && <div className="kanban-role">{c.role}</div>}
                          </div>
                        </div>
                        <div className="kanban-email">{c.hrEmail}</div>
                        <div className="kanban-meta"><DaysBadge ts={c.lastSentAt} /></div>
                        <div className="kanban-actions">
                          <button className="btn-ghost btn-sm" onClick={() => onViewEmail(c.lastTrackingId)} disabled={!c.lastTrackingId} title="View email">📧</button>
                          <button className="btn-followup btn-sm" onClick={() => onFollowUp({ ...c, originalMessageId: c.lastMessageId || "" })} title="Follow up">🔁 Follow-up</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List view ── */
        <div className="contacts-list">
          {filtered.map((c, i) => (
            <div key={i} className={`contact-card ${c.needsFollowUp ? "contact-card-reminder" : ""} ${c.replied ? "contact-card-replied" : ""}`}>
              {/* Avatar + Status dot */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div className="contact-avatar" style={{
                  background: c.replied ? "linear-gradient(135deg,#0d9488,#059669)"
                    : c.opened ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
                    : c.needsFollowUp ? "linear-gradient(135deg,#d97706,#f59e0b)"
                    : "linear-gradient(135deg,#2563eb,#4f46e5)"
                }}>
                  {getInitials(c.hrName, c.hrEmail)}
                </div>
                {c.replied && (
                  <span style={{
                    position:"absolute", bottom:-2, right:-2,
                    background:"#0d9488", color:"#fff",
                    borderRadius:"50%", width:16, height:16,
                    fontSize:9, display:"flex", alignItems:"center", justifyContent:"center",
                    border:"2px solid var(--card-bg,#fff)"
                  }}>✓</span>
                )}
              </div>

              {/* Main content */}
              <div className="contact-body" style={{ flex: 1, minWidth: 0 }}>
                {/* Row 1: Company + Role + Status badges */}
                <div className="contact-top" style={{ flexWrap: "wrap", gap: 4 }}>
                  <span className="contact-company">{c.company || "—"}</span>
                  {c.role && <span className="contact-role">{c.role}</span>}
                  {statusBadge(c)}
                  {c.lastSentAt > 0 && <DaysBadge ts={c.lastSentAt} />}
                </div>

                {/* Row 2: Email + Name */}
                <p className="contact-email" style={{ marginBottom: 4 }}>
                  <a href={`mailto:${c.hrEmail}`} style={{ color:"inherit", textDecoration:"none" }}
                    onClick={e => e.stopPropagation()}>
                    {c.hrEmail}
                  </a>
                  {c.hrName && <span className="contact-hrname"> · {c.hrName}</span>}
                </p>

                {/* Row 3: Meta info chips */}
                <div className="contact-meta" style={{ flexWrap:"wrap", gap:4 }}>
                  {c.lastSentAt > 0 && (
                    <span style={{ fontSize:11, color:"var(--text-muted,#6b7280)" }}>
                      📤 {new Date(c.lastSentAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                    </span>
                  )}
                  {c.totalSent > 1 && <span>✉ {c.totalSent} emails</span>}
                  {c.followupCount > 0 && (
                    <span style={{ color:"#7c3aed", fontWeight:600, fontSize:11 }}
                      title="Follow-up email sent"
                      onClick={() => onViewThread(c)} >
                      🔁 followup sent {c.lastSentAt > 0 ? relativeTime(c.lastSentAt) : ""}
                    </span>
                  )}
                  {c.opened && c.openedAt && <span>👁 opened {relativeTime(c.openedAt)}</span>}
                  {c.replied && c.repliedAt && (
                    <span style={{ color:"#0d9488", fontWeight:600, fontSize:11 }}>
                      ↩ replied {relativeTime(c.repliedAt)}
                    </span>
                  )}
                  {c.notes && (
                    <span title={c.notes} style={{ color:"var(--text-muted,#6b7280)", fontStyle:"italic" }}>
                      📝 {c.notes.length > 35 ? c.notes.slice(0,35)+"…" : c.notes}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons — vertical stack */}
              <div className="contact-actions" style={{ flexDirection:"column", gap:4, minWidth:90 }}>
                {/* Primary action based on status */}
                {c.replied ? (
                  <button className="btn-followup btn-sm"
                    style={{ background:"#0d9488", fontSize:11 }}
                    onClick={() => onFollowUp({ ...c, originalMessageId: c.lastMessageId || "", originalThreadId: c.lastThreadId || "" })}>
                    ↩ Reply Back
                  </button>
                ) : c.needsFollowUp ? (
                  <button className="btn-followup btn-sm"
                    style={{ background:"#d97706", fontSize:11 }}
                    onClick={() => onFollowUp({ ...c, originalMessageId: c.lastMessageId || "", originalThreadId: c.lastThreadId || "" })}>
                    ⏰ Follow-up!
                  </button>
                ) : (
                  <button className="btn-followup btn-sm" style={{ fontSize:11 }}
                    onClick={() => onFollowUp({ ...c, originalMessageId: c.lastMessageId || "", originalThreadId: c.lastThreadId || "" })}>
                    🔁 Follow-up
                  </button>
                )}

                {/* Thread button — shows reply count / status */}
                {c.lastMessageId && (
                  <button className="btn-ghost btn-sm"
                    style={{ fontSize:11, color: c.replied ? "#0d9488" : undefined, fontWeight: c.replied ? 600 : 400 }}
                    onClick={() => onViewThread(c)}
                    title="View full conversation thread">
                    🧵 {c.replied ? "View Reply" : "Thread"}
                  </button>
                )}

                {/* Secondary actions */}
                <div style={{ display:"flex", gap:3 }}>
                  {c.lastTrackingId && (
                    <button className="btn-ghost btn-sm" style={{ fontSize:10, padding:"2px 6px" }}
                      onClick={() => onViewEmail(c.lastTrackingId)} title="View sent email">
                      📧
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" style={{ fontSize:10, padding:"2px 6px" }}
                    onClick={() => onMessage(c)} title="Generate message">
                    💬
                  </button>
                  <button className="btn-ghost btn-sm"
                    style={{ fontSize:10, padding:"2px 6px", color: "#6366f1" }}
                    onClick={() => onManualUpdate(c)}
                    title="Manually update — mark replied, add notes">
                    ✏️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {bulkModal && (
      <BulkFollowUpModal
        contacts={contacts}
        onClose={() => setBulkModal(false)}
        addToast={addToast}
      />
    )}
  </>
  );
}

// ─── Send Application Page ────────────────────────────────────────────────────
function SendApplicationPage({ onContactsRefresh, prefill, onPrefillConsumed }) {
  const [form, setForm]           = useState({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" });

  // Apply prefill from Prospect / Find Jobs page
  useEffect(() => {
    if (!prefill) return;
    setForm(p => ({
      ...p,
      hrEmail:  prefill.hrEmail  || p.hrEmail,
      hrName:   prefill.hrName   || p.hrName,
      company:  prefill.company  || p.company,
      role:     prefill.role     || p.role,
    }));
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);
  const [templateId, setTemplateId] = useState("fullstack");
  const [mode, setMode]           = useState("now");
  const [scheduledTime, setSched] = useState("");
  const [readReceipt, setRR]      = useState(false);
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);
  const [dupModal, setDupModal]   = useState(null);
  const [previewHtml, setPreview] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [customTpl, setCustomTpl] = useState(loadCustomTemplate);
  const pendingPayload = useRef(null);

  const handle = e => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setStatus(null); };

  const selectTemplate = t => {
    setTemplateId(t.id);
    setForm(p => ({ ...p, customNote: t.customNote }));
  };

  const buildPayload = useCallback(() => ({
    ...form,
    templateType: BACKEND_TEMPLATE_MAP[templateId] || "fullstack",
    readReceipt,
    headerTheme: customTpl.headerTheme,
    customIntro: customTpl.customIntro || undefined,
    customHighlights: customTpl.highlights.length ? customTpl.highlights : undefined,
  }), [form, templateId, readReceipt, customTpl]);

  const doSend = useCallback(async (payload) => {
    setLoading(true); setStatus(null);
    try {
      if (mode === "schedule") {
        if (!scheduledTime) throw new Error("Choose a date and time.");
        const res = await axios.post(`${API}/api/schedule-email`, { ...payload, scheduledTime });
        setStatus({ type: "success", text: res.data.message });
      } else {
        const res = await axios.post(`${API}/api/send-application`, payload);
        if (res.data.isDuplicate) {
          setDupModal({ hrEmail: payload.hrEmail, lastSentAt: res.data.lastSentAt, lastCompany: res.data.lastCompany });
          pendingPayload.current = payload;
          setLoading(false);
          return;
        }
        setStatus({ type: "success", text: res.data.message });
        setForm({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" });
        setSched("");
        onContactsRefresh();
      }
    } catch (err) {
      setStatus({ type: "error", text: err.response?.data?.message || "Failed." });
    } finally { setLoading(false); }
  }, [mode, scheduledTime, onContactsRefresh]);

  const submit = e => { e.preventDefault(); doSend(buildPayload()); };
  const confirmDup = () => { setDupModal(null); if (pendingPayload.current) doSend({ ...pendingPayload.current, force: true }); };

  const openPreview = async () => {
    try {
      const res = await axios.post(`${API}/api/preview-email`, buildPayload());
      setPreview(res.data.html);
    } catch {}
  };

  const valid = form.hrEmail && form.company;
  const activeTemplate = EMAIL_TEMPLATES.find(t => t.id === templateId);

  return (
    <div className="page">
      {dupModal && <DuplicateWarningModal info={dupModal} onClose={() => setDupModal(null)} onConfirm={confirmDup} />}
      {previewHtml && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row"><span>📧</span><h3 className="modal-title">Email Preview</h3></div>
              <button className="modal-close" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="modal-body">
              <iframe srcDoc={previewHtml} className="email-iframe" title="Preview" sandbox="allow-same-origin" />
            </div>
          </div>
        </div>
      )}
      {showEditor && (
        <TemplateEditorModal
          templateType={templateId}
          onClose={() => setShowEditor(false)}
          onSave={saved => { setCustomTpl(saved); setShowEditor(false); }}
        />
      )}

      <div className="page-toolbar" style={{ justifyContent: "space-between" }}>
        <span className="page-section-title">Email Template</span>
        <button className="btn-ghost btn-sm" onClick={() => setShowEditor(true)}>🎨 Edit Template</button>
      </div>

      <div className="template-grid">
        {EMAIL_TEMPLATES.map(t => (
          <button key={t.id} type="button"
            className={`template-card ${templateId === t.id ? "template-card-active" : ""}`}
            style={templateId === t.id ? { borderColor: t.accent } : {}}
            onClick={() => selectTemplate(t)}>
            <span className="tcard-icon">{t.icon}</span>
            <span className="tcard-name">{t.name}</span>
          </button>
        ))}
      </div>

      {/* Custom template indicator */}
      {(customTpl.customIntro || customTpl.headerTheme !== "blue") && (
        <div className="custom-tpl-badge">
          🎨 Custom template active —
          <span style={{ color: HEADER_THEMES.find(h => h.id === customTpl.headerTheme)?.color }}>
            {" "}{customTpl.headerTheme} header
          </span>
          {customTpl.customIntro && ", custom intro"}
          <button className="tpl-reset-link" onClick={() => {
            setCustomTpl(DEFAULT_TEMPLATE);
            localStorage.removeItem("customEmailTemplate");
          }}>Reset</button>
        </div>
      )}

      <form onSubmit={submit} noValidate className="app-form">
        <div className="form-group">
          <label className="form-label">Delivery Mode</label>
          <div className="chip-row">
            <button type="button" className={`chip ${mode === "now" ? "chip-active" : ""}`} onClick={() => setMode("now")}>⚡ Send Now</button>
            <button type="button" className={`chip ${mode === "schedule" ? "chip-active" : ""}`} onClick={() => setMode("schedule")}>🗓 Schedule</button>
          </div>
        </div>
        {mode === "schedule" && (
          <div className="form-group">
            <label className="form-label" htmlFor="ap-sched"><span className="lbadge">Required</span> Date &amp; Time</label>
            <input id="ap-sched" type="datetime-local" min={toLocalDT(Date.now() + 60000)}
              value={scheduledTime} onChange={e => setSched(e.target.value)} className="form-input" />
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="ap-email"><span className="lbadge">Required</span> HR / Recruiter Email</label>
            <input id="ap-email" name="hrEmail" type="email" value={form.hrEmail} onChange={handle}
              placeholder="recruiter@company.com" className="form-input" required disabled={loading} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ap-name"><span className="lbadge lbadge-opt">Optional</span> HR Name</label>
            <input id="ap-name" name="hrName" type="text" value={form.hrName} onChange={handle}
              placeholder="e.g. Priya Sharma" className="form-input" disabled={loading} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="ap-company"><span className="lbadge">Required</span> Company Name</label>
            <input id="ap-company" name="company" type="text" value={form.company} onChange={handle}
              placeholder="e.g. Google, Infosys" className="form-input" required disabled={loading} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ap-role"><span className="lbadge lbadge-opt">Optional</span> Role</label>
            <input id="ap-role" name="role" type="text" value={form.role} onChange={handle}
              placeholder="e.g. Senior Full Stack Developer" className="form-input" disabled={loading} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ap-note">
            <span className="lbadge lbadge-opt">Optional</span> Custom Note
            <span className="label-hint">Auto-filled from template · editable</span>
          </label>
          <textarea id="ap-note" name="customNote" value={form.customNote} onChange={handle}
            className="form-textarea" rows={3} disabled={loading} />
        </div>
        <label className="toggle-label">
          <span className="toggle-switch-wrap">
            <input type="checkbox" checked={readReceipt} onChange={e => setRR(e.target.checked)} className="toggle-checkbox" />
            <span className="toggle-switch" />
          </span>
          <span className="toggle-text">Request Read Receipt</span>
        </label>
        <div className="preview-card">
          <div className="preview-card-header">
            <p className="preview-title">📧 Preview</p>
            <button type="button" className="btn-preview" onClick={openPreview}>View Full Email ↗</button>
          </div>
          <p className="preview-subject"><strong>Subject:</strong> {(() => {
              const u = getUser();
              const n = u?.displayName || "Anav Bansal";
              return form.role ? `Application for ${form.role} Position — ${n}` : `Job Application — ${n}`;
            })()}</p>
          <p className="preview-line"><strong>To:</strong> {form.hrEmail || "—"}{form.hrName && ` (${form.hrName})`}</p>
          <p className="preview-line"><strong>Template:</strong> <span style={{ color: activeTemplate?.accent }}>{activeTemplate?.icon} {activeTemplate?.name}</span></p>
        </div>
        {status && (
          <div className={`alert alert-${status.type}`}>
            <span className="alert-icon">{status.type === "success" ? "✓" : "✕"}</span>
            <span>{status.text}</span>
          </div>
        )}
        <div className="form-footer">
          <button type="submit" className={`btn-primary ${loading ? "loading" : ""}`} disabled={loading || !valid}>
            {loading ? <><span className="spinner" /> Sending…</> : <><span className="btn-arrow">↑</span> {mode === "schedule" ? "Schedule Email" : "Send Application"}</>}
          </button>
          <button type="button" className="btn-ghost" disabled={loading}
            onClick={() => { setForm({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" }); setStatus(null); }}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Job-related keyword shortcuts for inbox search ──────────────────────────
const JOB_KEYWORDS = [
  { label: "Job Opportunity", q: '"job opportunity"' },
  { label: "Naukri",          q: "from:naukri.com OR from:mailer.naukri.com" },
  { label: "LinkedIn",        q: "from:linkedin.com OR from:jobalerts-noreply@linkedin.com" },
  { label: "Interview",       q: "interview" },
  { label: "Offer Letter",    q: '"offer letter" OR "job offer"' },
  { label: "Shortlisted",     q: "shortlisted OR shortlist" },
  { label: "Application",     q: '"job application" OR "applied"' },
  { label: "Recruiter",       q: "recruiter OR hiring" },
];

// ─── Thread View ──────────────────────────────────────────────────────────────
function ThreadView({ threadId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [subject,  setSubject]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);   // message id that is expanded
  const [replying, setReplying] = useState(false);
  const [replyBody,setReplyBody]= useState("");
  const [sending,  setSending]  = useState(false);
  const [sendStatus, setSendStatus] = useState(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/gmail/thread/${threadId}`)
      .then(r => {
        const msgs = r.data.messages || [];
        setMessages(msgs);
        setSubject(r.data.subject || msgs[0]?.subject || "");
        // Auto-expand last message
        if (msgs.length) setExpanded(msgs[msgs.length - 1].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [threadId]);

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true); setSendStatus(null);
    try {
      const last = messages[messages.length - 1];
      await axios.post(`${API}/api/gmail/reply`, {
        threadId,
        messageId: last?.msgId || last?.id,
        to: last?.from || "",
        subject,
        body: replyBody,
      });
      setSendStatus({ type: "success", text: "Reply sent!" });
      setReplyBody("");
      setReplying(false);
      // Reload thread
      const r = await axios.get(`${API}/api/gmail/thread/${threadId}`);
      setMessages(r.data.messages || []);
    } catch (e) {
      setSendStatus({ type: "error", text: e.response?.data?.message || "Failed to send." });
    } finally { setSending(false); }
  };

  if (loading) return <div className="thread-loading"><span className="spinner spinner-dark" /> Loading thread…</div>;

  return (
    <div className="thread-wrap">
      {/* Header */}
      <div className="thread-header">
        <button className="thread-back" onClick={onBack}>← Back</button>
        <div className="thread-subject">{subject || "(No Subject)"}</div>
        <span className="thread-count">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Messages */}
      <div className="thread-messages">
        {messages.map((msg, i) => {
          const isOpen = expanded === msg.id;
          const senderName = msg.from.replace(/<[^>]+>/, "").trim() || msg.from;
          return (
            <div key={msg.id} className={`thread-msg ${isOpen ? "thread-msg-open" : ""} ${!msg.isRead ? "thread-msg-unread" : ""}`}>
              <div className="thread-msg-header" onClick={() => setExpanded(isOpen ? null : msg.id)}>
                <div className="thread-msg-avatar">{senderName[0]?.toUpperCase() || "?"}</div>
                <div className="thread-msg-meta">
                  <span className="thread-msg-from">{senderName}</span>
                  {!msg.isRead && <span className="badge badge-sent" style={{ fontSize: 9 }}>Unread</span>}
                </div>
                <span className="thread-msg-date">{msg.date ? new Date(msg.date).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                <span className="thread-msg-chevron">{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className="thread-msg-body">
                  {msg.body
                    ? <iframe srcDoc={msg.body} className="thread-iframe" title={`msg-${msg.id}`} sandbox="allow-same-origin" />
                    : <p className="thread-msg-snippet">{msg.snippet}</p>
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reply area */}
      <div className="thread-reply-area">
        {!replying ? (
          <button className="btn-primary btn-sm thread-reply-btn" onClick={() => setReplying(true)}>
            ↩ Reply
          </button>
        ) : (
          <div className="thread-compose">
            <div className="thread-compose-to">
              To: <strong>{messages[messages.length - 1]?.from || ""}</strong>
            </div>
            <textarea
              className="form-textarea thread-compose-body"
              rows={5}
              placeholder="Write your reply…"
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              autoFocus
            />
            {sendStatus && (
              <div className={`alert alert-${sendStatus.type}`}>
                <span className="alert-icon">{sendStatus.type === "success" ? "✓" : "✕"}</span>
                <span>{sendStatus.text}</span>
              </div>
            )}
            <div className="form-footer">
              <button className={`btn-primary btn-sm ${sending ? "loading" : ""}`} onClick={sendReply} disabled={sending || !replyBody.trim()}>
                {sending ? <><span className="spinner" /> Sending…</> : "↩ Send Reply"}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => { setReplying(false); setReplyBody(""); setSendStatus(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Screening Reply Modal ─────────────────────────────────────────────────────
function ScreeningReplyModal({ message, contacts, onClose, addToast }) {
  const extractEmail = (str = "") => { const m = str.match(/<(.+?)>/); return m ? m[1] : str.trim(); };
  const displayName  = (str = "") => str.replace(/<[^>]+>/, "").trim() || str;

  const fromEmail = extractEmail(message.from);
  const fromName  = displayName(message.from);
  const matched   = contacts.find(c => c.hrEmail.toLowerCase() === fromEmail.toLowerCase());
  const hrName    = matched?.hrName || fromName || "";

  const [replyText, setReplyText] = useState(() => buildScreeningReply(hrName));
  const [loading,   setLoading]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [profile, setProfile] = useState({ ...HR_PROFILE });
  useLockBodyScroll();

  const handleProfileChange = (k, v) => setProfile(p => ({ ...p, [k]: v }));

  const regenerate = () => {
    // rebuild with current profile values
    const greeting = hrName ? `Hi ${hrName},` : "Hi,";
    const rUser  = getUser();
    const rName  = rUser?.displayName || "Anav Bansal";
    const rPhone = rUser?.username === "anav" ? "+91 7827855635" : "+91 7665941798";
    const rEmail = rUser?.username === "anav" ? "anavbansal06@gmail.com" : "priyalgoyal1702@gmail.com";
    const rLi    = rUser?.username === "anav" ? "linkedin.com/in/anavbansal-51b191162" : "linkedin.com/in/priyal--goyal/";
    const txt = `${greeting}

Thank you for reaching out! Please find my details below:

📋 Candidate Profile — ${rName}

• Key Skills             : ${profile.keySkills}
• Total Experience       : ${profile.totalExp}
• Relevant Experience    : ${profile.relevantExp}
• Current Company        : ${profile.currentCompany}
• Reason for Change      : ${profile.reasonForChange}
• Notice Period / LWD    : ${profile.noticePeriod}
• Current CTC            : ${profile.currentCTC}
• Offer in Hand          : ${profile.offerInHand || "No"}
• Expected CTC           : ${profile.expectedCTC}
• Current Location       : ${profile.currentLocation}
• Preferred Location     : ${profile.preferredLocation}

Looking forward to the next steps. Please feel free to reach out for any further information.

Best regards,
${rName}
📞 ${rPhone} | ✉ ${rEmail}
🔗 ${rLi}`;
    setReplyText(txt);
    setEditProfile(false);
  };

  const send = async () => {
    setLoading(true);
    try {
      // Use direct Gmail reply for screening — plain text, same thread, no "Follow-Up" header
      await axios.post(`${API}/api/gmail/reply`, {
        threadId:  message.threadId,
        messageId: message.id,
        to:        fromEmail,
        subject:   message.subject,
        body:      replyText,
      });
      setSent(true);
      addToast && addToast("✅ Screening reply sent!");
      setTimeout(onClose, 1500);
    } catch (e) {
      addToast && addToast("❌ Failed to send reply", "error");
    } finally { setLoading(false); }
  };

  const profileFields = [
    { key: "keySkills",       label: "Key Skills",          wide: true },
    { key: "totalExp",        label: "Total Experience" },
    { key: "relevantExp",     label: "Relevant Experience" },
    { key: "currentCompany",  label: "Current Company" },
    { key: "reasonForChange", label: "Reason for Change" },
    { key: "noticePeriod",    label: "Notice Period / LWD" },
    { key: "currentCTC",      label: "Current CTC" },
    { key: "offerInHand",     label: "Offer in Hand" },
    { key: "expectedCTC",     label: "Expected CTC" },
    { key: "currentLocation", label: "Current Location" },
    { key: "preferredLocation", label: "Preferred Location" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form modal-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>🤖</span>
            <h3 className="modal-title">Auto HR Screening Reply</h3>
            <span className="modal-hint" style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>
              📧 Replying to {fromName || fromEmail}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll">
          {/* Toggle: Edit Profile */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button
              className={`chip ${editProfile ? "chip-active" : ""}`}
              onClick={() => setEditProfile(p => !p)}
              type="button"
            >
              ✏️ {editProfile ? "Hide Profile Editor" : "Edit Profile Values"}
            </button>
            {editProfile && (
              <button className="chip chip-active" onClick={regenerate} type="button">
                🔄 Regenerate Reply
              </button>
            )}
          </div>

          {/* Profile editor */}
          {editProfile && (
            <div style={{
              background: "var(--bg-secondary, #f8fafc)", border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 10, padding: "16px", marginBottom: 14
            }}>
              <p style={{ fontSize: 12, color: "var(--text-muted, #64748b)", marginBottom: 10, fontWeight: 600 }}>
                📋 Edit your profile — changes reflect in the reply below
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {profileFields.map(f => (
                  <div key={f.key} className="form-group"
                    style={{ marginBottom: 0, gridColumn: f.wide ? "1 / -1" : undefined }}>
                    <label className="form-label" style={{ fontSize: 11 }}>{f.label}</label>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      value={profile[f.key] || ""}
                      onChange={e => handleProfileChange(f.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reply preview / editor */}
          <div className="form-group">
            <label className="form-label">
              📝 Reply Text — <span style={{ color: "var(--text-muted,#64748b)", fontWeight: 400 }}>Edit if needed before sending</span>
            </label>
            <textarea
              className="form-textarea"
              rows={18}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 }}
            />
          </div>

          {sent && (
            <div className="alert alert-success">
              <span className="alert-icon">✓</span>
              <span>Reply sent successfully in the same thread!</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={`btn-followup ${loading ? "loading" : ""}`}
            onClick={send}
            disabled={loading || sent}
          >
            {loading ? <><span className="spinner" /> Sending…</> : sent ? "✓ Sent!" : <><span className="btn-arrow">↑</span> Send Reply in Thread</>}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Thread Modal — full conversation history ─────────────────────────────────
function ThreadModal({ messageId, contact, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  useLockBodyScroll();

  useEffect(() => {
    if (!messageId) { setLoading(false); return; }
    axios.get(`${API}/api/thread/${messageId}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => { setError(e.response?.data?.message || e.message); setLoading(false); });
  }, [messageId]);

  const fmt = (dateStr) => {
    if (!dateStr) return "";
    try { return new Date(dateStr).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return dateStr; }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form modal-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>🧵</span>
            <h3 className="modal-title">Thread History</h3>
            <span className="modal-hint">{contact?.company || ""} · {contact?.hrEmail || ""}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll" style={{ maxHeight: 520 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted,#64748b)" }}>
              <span className="spinner" /> Loading thread…
            </div>
          )}
          {error && (
            <div className="alert alert-error"><span className="alert-icon">✕</span>{error}</div>
          )}
          {!loading && !error && data && (
            <>
              {/* Thread summary */}
              <div style={{
                background: "var(--bg-secondary,#f8fafc)", borderRadius: 8,
                padding: "12px 16px", marginBottom: 16,
                display: "flex", gap: 16, flexWrap: "wrap",
              }}>
                <span><strong>Subject:</strong> {data.subject || "—"}</span>
                <span><strong>Messages:</strong> {data.conversation?.length || 0}</span>
                {data.replied && (
                  <span style={{ color: "#0d9488", fontWeight: 600 }}>
                    ✅ HR Replied {data.repliedAt ? `· ${fmt(data.repliedAt)}` : ""}
                  </span>
                )}
                {!data.replied && (
                  <span style={{ color: "var(--text-muted,#64748b)" }}>⏳ No reply yet</span>
                )}
              </div>

              {/* Messages */}
              {(data.conversation || []).length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p>No conversation history found.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.conversation.map((msg, i) => (
                    <div key={i} style={{
                      borderRadius: 10,
                      padding: "12px 16px",
                      background: msg.isReply
                        ? "linear-gradient(135deg,#f0fdfa,#ccfbf1)"
                        : msg.isMine
                          ? "var(--bg-secondary,#f8fafc)"
                          : "var(--card-bg,#fff)",
                      border: msg.isReply
                        ? "1px solid #0d9488"
                        : "1px solid var(--border,#e2e8f0)",
                      marginLeft: msg.isMine ? 20 : 0,
                      marginRight: msg.isReply ? 0 : (msg.isMine ? 0 : 20),
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: msg.isReply ? "#0d9488" : "var(--text,#111)" }}>
                          {msg.isReply ? "↩ " : msg.isMine ? "📤 You" : ""}
                          {msg.from?.replace(/<[^>]+>/, "").trim() || msg.fromEmail}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted,#64748b)" }}>{fmt(msg.date)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text,#374151)", lineHeight: 1.6 }}>
                        {msg.body || msg.snippet || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          {data?.threadId && (
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${data.threadId}`}
              target="_blank" rel="noreferrer"
              className="btn-primary"
              style={{ textDecoration: "none", fontSize: 13 }}
            >
              📬 Open in Gmail →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Manual Contact Update Modal ──────────────────────────────────────────────
function ManualUpdateModal({ contact, onClose, onSaved, addToast }) {
  const [form, setForm] = useState({
    replied:     contact.replied     || false,
    repliedAt:   contact.repliedAt   ? new Date(contact.repliedAt).toISOString().slice(0,16) : new Date().toISOString().slice(0,16),
    replyNote:   contact.replySnippet|| "",
    notes:       contact.notes       || "",
    followupSent:contact.followupSent|| false,
  });
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  useLockBodyScroll();

  const handle = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/api/contact/update`, {
        hrEmail:     contact.hrEmail,
        replied:     form.replied,
        repliedAt:   form.replied ? form.repliedAt : null,
        replyNote:   form.replyNote,
        notes:       form.notes,
        followupSent:form.followupSent,
      });
      setSaved(true);
      addToast && addToast(`✅ ${contact.company || contact.hrEmail} updated!`);
      setTimeout(() => { onSaved && onSaved(); onClose(); }, 800);
    } catch (e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>✏️</span>
            <h3 className="modal-title">Update Contact</h3>
            <span className="modal-hint">{contact.company || contact.hrEmail}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll">
          {/* Replied toggle */}
          <div style={{
            background: form.replied ? "linear-gradient(135deg,#f0fdfa,#ccfbf1)" : "var(--surface-2,#f8fafc)",
            border: `1.5px solid ${form.replied ? "#0d9488" : "var(--border,#e2e8f0)"}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 14,
            transition: "all 0.2s ease"
          }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
              <div
                onClick={() => handle("replied", !form.replied)}
                style={{
                  width: 44, height: 24, borderRadius: 99,
                  background: form.replied ? "#0d9488" : "var(--border,#e2e8f0)",
                  position: "relative", transition: "all 0.2s ease", cursor: "pointer", flexShrink: 0
                }}
              >
                <div style={{
                  position:"absolute", top: 3, left: form.replied ? 22 : 3,
                  width: 18, height: 18, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: form.replied ? "#0d9488" : "var(--text-900,#111)" }}>
                  {form.replied ? "✅ Marked as Replied" : "Mark as Replied"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-500,#6b7280)", marginTop: 2 }}>
                  Phone call, LinkedIn, WhatsApp — any channel
                </div>
              </div>
            </label>
          </div>

          {/* Reply date — only when replied */}
          {form.replied && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Reply Date & Time</label>
              <input
                type="datetime-local"
                className="form-input"
                value={form.repliedAt}
                onChange={e => handle("repliedAt", e.target.value)}
              />
            </div>
          )}

          {/* Reply note */}
          {form.replied && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Reply Summary <span className="lbadge lbadge-opt">Optional</span></label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Called on phone, said resume looks good, interview next week…"
                value={form.replyNote}
                onChange={e => handle("replyNote", e.target.value)}
              />
            </div>
          )}

          {/* Follow-up sent toggle */}
          <div style={{
            background: "var(--surface-2,#f8fafc)",
            border: "1.5px solid var(--border,#e2e8f0)",
            borderRadius: 12, padding: "12px 16px", marginBottom: 12
          }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
              <div
                onClick={() => handle("followupSent", !form.followupSent)}
                style={{
                  width: 44, height: 24, borderRadius: 99,
                  background: form.followupSent ? "#7c3aed" : "var(--border,#e2e8f0)",
                  position: "relative", transition: "all 0.2s ease", cursor: "pointer", flexShrink: 0
                }}
              >
                <div style={{
                  position:"absolute", top: 3, left: form.followupSent ? 22 : 3,
                  width: 18, height: 18, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: form.followupSent ? "#7c3aed" : "var(--text-700,#374151)" }}>
                  🔁 Follow-up Sent
                </div>
                <div style={{ fontSize: 11, color: "var(--text-500,#6b7280)", marginTop: 1 }}>
                  Mark if follow-up was sent manually or via other channel
                </div>
              </div>
            </label>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">📝 Notes <span className="lbadge lbadge-opt">Optional</span></label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Interview scheduled, salary discussed, referral given…"
              value={form.notes}
              onChange={e => handle("notes", e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={`btn-primary ${loading ? "loading" : ""}`}
            onClick={submit}
            disabled={loading || saved}
          >
            {loading ? <><span className="spinner" /> Saving…</> : saved ? "✓ Saved!" : "💾 Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inbox Page ───────────────────────────────────────────────────────────────
function InboxPage({ contacts = [], onFollowUp, addToast }) {
  const [activeTab,       setActiveTab]       = useState("inbox"); // "inbox" | "sent"
  const [messages,        setMessages]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingMore,     setLoadingMore]      = useState(false);
  const [searchQuery,     setSearchQuery]      = useState("");
  const [nextPageToken,   setNextPage]         = useState(null);
  const [activeThread,    setActiveThread]     = useState(null);
  const [screeningModal,  setScreeningModal]   = useState(null); // message to auto-reply

  const baseQ = (tab) => tab === "sent" ? "in:sent" : "in:inbox";

  const doFetch = useCallback(async (q, pageToken, append) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setMessages([]); setNextPage(null); }
    try {
      const params = { q: q || baseQ(activeTab), max: 30 };
      if (pageToken) params.pageToken = pageToken;
      const r = await axios.get(`${API}/api/gmail/inbox`, { params });
      const msgs = r.data.messages || [];
      setNextPage(r.data.nextPageToken || null);
      if (append) setMessages(prev => [...prev, ...msgs]);
      else        setMessages(msgs);
    } catch {}
    finally {
      if (append) setLoadingMore(false);
      else        setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearchQuery("");
    setNextPage(null);
    doFetch(baseQ(activeTab));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const search = (e) => { e.preventDefault(); doFetch(searchQuery || baseQ(activeTab)); };
  const applyKeyword = (kw) => { setSearchQuery(kw.q); doFetch(kw.q); };
  const loadMore = () => { if (nextPageToken) doFetch(searchQuery || baseQ(activeTab), nextPageToken, true); };

  // Extract plain email address from "Name <email>" format
  const extractEmail = (str = "") => { const m = str.match(/<(.+?)>/); return m ? m[1] : str.trim(); };
  const displayName  = (str = "") => str.replace(/<[^>]+>/, "").trim() || str;

  const handleFollowUp = (m) => {
    const emailStr = activeTab === "sent" ? m.to : m.from;
    const email    = extractEmail(emailStr);
    const matched  = contacts.find(c => c.hrEmail.toLowerCase() === email.toLowerCase());
    onFollowUp(matched || { hrEmail: email, hrName: displayName(emailStr), company: "", role: "" });
  };

  // Screening reply modal
  if (screeningModal) {
    return (
      <ScreeningReplyModal
        message={screeningModal}
        contacts={contacts}
        onClose={() => setScreeningModal(null)}
        addToast={addToast}
      />
    );
  }

  // Thread view replaces the list
  if (activeThread) {
    return (
      <div className="page">
        <ThreadView threadId={activeThread} onBack={() => setActiveThread(null)} />
      </div>
    );
  }

  const isSent = activeTab === "sent";

  return (
    <div className="page">
      {/* Inbox / Sent tabs */}
      <div className="inbox-tab-bar">
        <button className={`inbox-tab-btn ${!isSent ? "inbox-tab-active" : ""}`} onClick={() => setActiveTab("inbox")}>
          📥 Inbox
        </button>
        <button className={`inbox-tab-btn ${isSent ? "inbox-tab-active" : ""}`} onClick={() => setActiveTab("sent")}>
          📤 Sent
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={search} className="inbox-search-form">
        <div className="search-bar-wrap" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder={isSent ? "Search sent… e.g. to:hr@company.com subject:application" : "Search Gmail… e.g. from:naukri.com OR subject:interview"}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="search-clear" onClick={() => { setSearchQuery(""); doFetch(baseQ(activeTab)); }}>✕</button>
          )}
        </div>
        <button type="submit" className="btn-primary btn-sm" disabled={loading}>{loading ? "…" : "Search"}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => window.location.href = `${API}/api/gmail/auth`}>Connect Gmail</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => doFetch(searchQuery || baseQ(activeTab))} disabled={loading}>↻</button>
      </form>

      {/* Job keyword shortcuts — inbox only */}
      {!isSent && (
        <div className="keyword-shortcuts">
          <span className="keyword-label">Quick filters:</span>
          {JOB_KEYWORDS.map(kw => (
            <button key={kw.label} className="keyword-chip" onClick={() => applyKeyword(kw)}>{kw.label}</button>
          ))}
        </div>
      )}

      {/* Email list */}
      {messages.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{isSent ? "📤" : "📥"}</span>
          <p>{loading ? "Loading…" : `No ${isSent ? "sent" : ""} messages found. Connect Gmail or try a different search.`}</p>
        </div>
      ) : (
        <>
          <div className="inbox-list">
            {messages.map((m, i) => {
              const name = isSent ? displayName(m.to) : displayName(m.from);
              return (
                <div key={i} className={`inbox-row ${!m.isRead && !isSent ? "inbox-row-unread" : ""}`} style={{ position: "relative" }}>
                  <div className="inbox-row-avatar" onClick={() => setActiveThread(m.threadId)}>
                    {(name || "?")[0].toUpperCase()}
                  </div>
                  <div className="inbox-row-body" onClick={() => setActiveThread(m.threadId)}>
                    <div className="inbox-row-top">
                      <span className="inbox-row-from">{isSent ? `To: ${name}` : name}</span>
                      <span className="inbox-row-date">{m.date ? new Date(m.date).toLocaleDateString("en-IN") : ""}</span>
                    </div>
                    <p className="inbox-row-subject">{m.subject}</p>
                    <p className="inbox-row-snippet">{m.snippet}</p>
                  </div>
                  <div className="inbox-row-actions" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {!isSent && isScreeningEmail(m.subject, m.snippet) && (
                      <button
                        className="btn-primary btn-sm"
                        title="Auto-fill HR screening answers"
                        style={{ background: "#0d9488", fontSize: 11, whiteSpace: "nowrap" }}
                        onClick={e => { e.stopPropagation(); setScreeningModal(m); }}
                      >
                        🤖 Auto Reply
                      </button>
                    )}
                    {onFollowUp && (
                      <button
                        className="btn-followup btn-sm"
                        title="Send follow-up"
                        onClick={e => { e.stopPropagation(); handleFollowUp(m); }}
                      >
                        🔁 Follow Up
                      </button>
                    )}
                  </div>
                  {!m.isRead && !isSent && <span className="inbox-unread-dot" />}
                  {!isSent && isScreeningEmail(m.subject, m.snippet) && (
                    <span style={{
                      position: "absolute", top: 6, left: 6,
                      background: "#0d9488", color: "#fff",
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      letterSpacing: "0.5px", textTransform: "uppercase"
                    }}>🤖 Screening</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load more / pagination */}
          <div className="inbox-footer">
            <span className="inbox-count">{messages.length} message{messages.length !== 1 ? "s" : ""} loaded</span>
            {nextPageToken && (
              <button className="btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <><span className="spinner" /> Loading…</> : "Load More ↓"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Messages Page (LinkedIn + WhatsApp generator, standalone) ───────────────
function MessagesPage({ contacts }) {
  const [selectedContact, setSelectedContact] = useState(null);
  const [manualName,    setManualName]    = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualRole,    setManualRole]    = useState("");
  const [tab, setTab]   = useState("linkedin");
  const [copied, setCopied] = useState(false);

  const name    = selectedContact ? (selectedContact.hrName || "Hiring Manager") : (manualName || "Hiring Manager");
  const company = selectedContact ? (selectedContact.company || "your company")   : (manualCompany || "your company");
  const role    = selectedContact ? (selectedContact.role    || "the open position") : (manualRole || "the open position");

  const buildMsg = useCallback((t) => {
    const _u   = getUser();
    const _n   = _u?.displayName || "Anav Bansal";
    const _p   = _u?.username === "anav" ? "+91 7827855635" : "+91 7665941798";
    const _e   = _u?.username === "anav" ? "anavbansal06@gmail.com" : "priyalgoyal1702@gmail.com";
    const _l   = _u?.username === "anav" ? "linkedin.com/in/anavbansal-51b191162" : "linkedin.com/in/priyal--goyal/";
    const _exp = _u?.username === "anav" ? "4.7+ years as a Full Stack Developer" : "2+ years in Digital Lending & Credit Risk";
    if (t === "linkedin")
      return `Hi ${name},\n\nI recently applied for the ${role} position at ${company} and wanted to connect personally.\n\nI'm ${_n} with ${_exp}. I'd love to discuss how I can contribute to ${company}!\n\nBest regards,\n${_n}\n📞 ${_p}\n📧 ${_e}`;
    return `Hello ${name},\n\nI'm ${_n} with ${_exp}. I've applied for the *${role}* role at *${company}* and wanted to follow up personally.\n\nI'd love to discuss the opportunity at your convenience!\n\n📞 ${_p}\n📧 ${_e}\n🔗 ${_l}`;
  }, [name, company, role]);

  const [editedMsg, setEditedMsg] = useState(() => buildMsg("linkedin"));
  useEffect(() => setEditedMsg(buildMsg(tab)), [tab, buildMsg]);

  const copy = () => {
    navigator.clipboard.writeText(editedMsg).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="page">
      {/* Contact picker */}
      <div className="msg-page-picker">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Pick from HR Contacts</label>
          <select className="form-input form-select"
            value={selectedContact ? selectedContact.hrEmail : ""}
            onChange={e => {
              const c = contacts.find(x => x.hrEmail === e.target.value) || null;
              setSelectedContact(c);
            }}>
            <option value="">— Enter manually below —</option>
            {contacts.map((c, i) => (
              <option key={i} value={c.hrEmail}>{c.company} · {c.hrEmail}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedContact && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">HR Name</label>
            <input className="form-input" placeholder="Priya Sharma" value={manualName} onChange={e => setManualName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Company</label>
            <input className="form-input" placeholder="Google" value={manualCompany} onChange={e => setManualCompany(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <input className="form-input" placeholder="Senior Full Stack Developer" value={manualRole} onChange={e => setManualRole(e.target.value)} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="msg-tabs">
        <button className={`msg-tab ${tab === "linkedin" ? "msg-tab-active" : ""}`} onClick={() => setTab("linkedin")}>🔗 LinkedIn DM</button>
        <button className={`msg-tab ${tab === "whatsapp" ? "msg-tab-active whatsapp-active" : ""}`} onClick={() => setTab("whatsapp")}>💚 WhatsApp</button>
      </div>

      <div className="msg-char-count">{editedMsg.length} characters</div>
      <textarea className="msg-textarea" value={editedMsg} onChange={e => setEditedMsg(e.target.value)} rows={14} spellCheck={false} />

      <div className="msg-actions">
        <button className={`btn-primary btn-sm ${copied ? "btn-copied" : ""}`} onClick={copy}>
          {copied ? "✓ Copied!" : "📋 Copy Message"}
        </button>
        {tab === "whatsapp" ? (
          <button className="btn-whatsapp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(editedMsg)}`, "_blank")}>
            💚 Open in WhatsApp
          </button>
        ) : (
          <button className="btn-linkedin" onClick={() => window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name} ${company}`)}`, "_blank")}>
            🔗 Find on LinkedIn
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setEditedMsg(buildMsg(tab))}>↺ Reset</button>
      </div>
    </div>
  );
}

// ─── Find Jobs Page (with advanced filters) ──────────────────────────────────
const DATE_OPTIONS = [
  { label: "Any time", value: "0" },
  { label: "Today",    value: "1" },
  { label: "3 Days",   value: "3" },
  { label: "1 Week",   value: "7" },
  { label: "1 Month",  value: "30" },
];
const JOB_TYPE_OPTIONS = [
  { label: "Any type",   value: "any" },
  { label: "Full-time",  value: "Full_Time" },
  { label: "Part-time",  value: "Part_Time" },
  { label: "Contract",   value: "Contract" },
  { label: "Internship", value: "Internship" },
];

function FindJobsPage({ onFillApply }) {
  const [keywords, setKw]         = useState("Node.js Developer");
  const [location, setLoc]        = useState("India");
  const [datePosted, setDate]     = useState("0");
  const [employment, setEmp]      = useState("any");
  const [showFilters, setShowF]   = useState(false);
  const [jobs, setJobs]           = useState([]);
  const [searchLinks, setLinks]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [totalCount, setTotal]    = useState(0);

  const search = async e => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/jobs/search`, {
        params: { keywords, location, datePosted, employment },
      });
      setJobs(res.data.jobs || []);
      setLinks(res.data.searchLinks || null);
      setTotal(res.data.totalCount || 0);
      setSearched(true);
    } finally { setLoading(false); }
  };

  return (
    <div className="page">
      <form onSubmit={search} className="app-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="jKw">Keywords / Role</label>
            <input id="jKw" type="text" className="form-input" value={keywords}
              onChange={e => setKw(e.target.value)} placeholder="e.g. CTI Developer, Avaya, Node.js" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="jLoc">Location</label>
            <input id="jLoc" type="text" className="form-input" value={location}
              onChange={e => setLoc(e.target.value)} placeholder="India, Bangalore, Remote" />
          </div>
        </div>

        {/* Advanced filter toggle */}
        <button type="button" className="filter-toggle" onClick={() => setShowF(f => !f)}>
          ⚙ Filters {showFilters ? "▲" : "▼"}
          {(datePosted !== "0" || employment !== "any") && <span className="filter-active-dot" />}
        </button>

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-group">
              <span className="filter-label">📅 Date Posted</span>
              <div className="chip-row">
                {DATE_OPTIONS.map(o => (
                  <button key={o.value} type="button"
                    className={`chip ${datePosted === o.value ? "chip-active" : ""}`}
                    onClick={() => setDate(o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">💼 Job Type</span>
              <div className="chip-row">
                {JOB_TYPE_OPTIONS.map(o => (
                  <button key={o.value} type="button"
                    className={`chip ${employment === o.value ? "chip-active" : ""}`}
                    onClick={() => setEmp(o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="form-footer">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <><span className="spinner" /> Searching…</> : "🔍 Search Jobs"}
          </button>
          {(datePosted !== "0" || employment !== "any") && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setDate("0"); setEmp("any"); }}>
              ✕ Clear filters
            </button>
          )}
        </div>
      </form>

      {/* Portal links */}
      {searchLinks && (
        <div className="portal-box">
          <p className="preview-title">Search on Job Portals</p>
          <div className="portal-links">
            <a href={searchLinks.naukri}    target="_blank" rel="noreferrer" className="portal-btn portal-naukri">Naukri.com ↗</a>
            <a href={searchLinks.indeed}    target="_blank" rel="noreferrer" className="portal-btn portal-indeed">Indeed India ↗</a>
            <a href={searchLinks.linkedin}  target="_blank" rel="noreferrer" className="portal-btn portal-linkedin">LinkedIn ↗</a>
            <a href={searchLinks.glassdoor} target="_blank" rel="noreferrer" className="portal-btn portal-glassdoor">Glassdoor ↗</a>
            <a href={searchLinks.instahyre} target="_blank" rel="noreferrer" className="portal-btn portal-instahyre">Instahyre ↗</a>
          </div>
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <>
          <p className="jobs-count">{totalCount > jobs.length ? `Showing ${jobs.length} of ${totalCount.toLocaleString()}` : `${jobs.length}`} jobs</p>
          <div className="contacts-list">
            {jobs.map((job, i) => (
              <div key={i} className="contact-card">
                <div className="contact-avatar" style={{ background: "#059669" }}>💼</div>
                <div className="contact-body">
                  <div className="contact-top">
                    <span className="contact-company">{job.title}</span>
                    {job.salary && <span className="badge badge-opened">{job.salary}</span>}
                    {job.type   && <span className="badge badge-muted">{job.type}</span>}
                  </div>
                  <p className="contact-email">{job.company}{job.location && ` · 📍 ${job.location}`}</p>
                  {job.snippet && <p className="contact-meta-text">{job.snippet.replace(/<[^>]+>/g, "").slice(0, 130)}…</p>}
                  <div className="contact-meta">
                    {job.updated && <span>📅 {new Date(job.updated).toLocaleDateString("en-IN")}</span>}
                  </div>
                </div>
                <div className="contact-actions">
                  <button className="btn-ghost btn-sm" onClick={() => onFillApply({ company: job.company, role: job.title })}>✉ Apply</button>
                  <a href={job.link} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Open ↗</a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {searched && jobs.length === 0 && (
        <div className="empty-state"><span className="empty-icon">🔍</span><p>No listings found. Try different keywords or use the portal links above.</p></div>
      )}
    </div>
  );
}

// ─── Schedule Apply Modal (from Prospect/Referral page) ──────────────────────
function ScheduleApplyModal({ data, onClose, onSendNow }) {
  const [mode, setMode]               = useState("now");
  const [scheduledTime, setSched]     = useState("");
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState(null);
  useLockBodyScroll();

  const submit = async () => {
    if (mode === "now") { onSendNow(data); return; }
    if (!scheduledTime) { setStatus({ type: "error", text: "Choose a date and time." }); return; }
    setLoading(true); setStatus(null);
    try {
      const res = await axios.post(`${API}/api/schedule-email`, {
        hrEmail: data.hrEmail, hrName: data.hrName || "",
        company: data.company, role: data.role || "",
        scheduledTime, templateType: "fullstack",
      });
      setStatus({ type: "success", text: res.data.message });
    } catch (e) {
      setStatus({ type: "error", text: e.response?.data?.message || "Failed to schedule." });
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>✉</span>
            <h3 className="modal-title">Apply to {data.company}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-pad">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>{data.hrEmail}</p>
          <div className="form-group">
            <label className="form-label">Delivery</label>
            <div className="chip-row">
              <button type="button" className={`chip ${mode === "now" ? "chip-active" : ""}`} onClick={() => setMode("now")}>⚡ Send Now</button>
              <button type="button" className={`chip ${mode === "schedule" ? "chip-active" : ""}`} onClick={() => setMode("schedule")}>🗓 Schedule</button>
            </div>
          </div>
          {mode === "schedule" && (
            <div className="form-group">
              <label className="form-label">Date &amp; Time</label>
              <input type="datetime-local"
                min={toLocalDT(Date.now() + 60000)}
                value={scheduledTime} onChange={e => setSched(e.target.value)} className="form-input" />
            </div>
          )}
          {status && (
            <div className={`alert alert-${status.type}`}>
              <span className="alert-icon">{status.type === "success" ? "✓" : "✕"}</span>
              <span>{status.text}</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}
            disabled={loading || status?.type === "success"}>
            {loading
              ? <><span className="spinner" /> Scheduling…</>
              : mode === "schedule" ? "🗓 Schedule Email" : "→ Go to Send Form"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Prospect Page (find HR emails by company) ────────────────────────────────
function guessDomain(companyName) {
  if (!companyName) return "";
  return companyName
    .toLowerCase()
    .replace(/\b(pvt|ltd|inc|corp|llc|private|limited|technologies|solutions|systems|india|global|group|services|it|tech|innovations?|consulting|infotech)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim() + ".com";
}

function ProspectPage({ onFillApply }) {
  const [company,    setCompany]  = useState("");
  const [domain,     setDomain]   = useState("");
  const [filter,     setFilter]   = useState("hr");
  const [results,    setResults]  = useState(null); // null = not searched yet
  const [loading,    setLoading]  = useState(false);
  const [copiedIdx,  setCopied]   = useState(null);
  const [schedModal, setSchedModal] = useState(null); // data for ScheduleApplyModal

  const handleCompanyChange = (val) => {
    setCompany(val);
    setDomain(guessDomain(val));
  };

  const search = async e => {
    e.preventDefault();
    if (!company && !domain) return;
    setLoading(true); setResults(null);
    try {
      const res = await axios.get(`${API}/api/prospect`, {
        params: { company, domain, filter },
      });
      setResults(res.data);
    } catch (err) {
      setResults({ success: false, emails: [], message: err.response?.data?.message || "Request failed." });
    } finally { setLoading(false); }
  };

  const copyEmail = (email, idx) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(idx); setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="page">
      <form onSubmit={search} className="app-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="pr-company">
              Company Name <span className="label-hint">e.g. Infosys, TCS, Google India</span>
            </label>
            <input id="pr-company" type="text" className="form-input" value={company}
              onChange={e => handleCompanyChange(e.target.value)}
              placeholder="e.g. Infosys" required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pr-domain">
              Company Domain <span className="label-hint">auto-guessed · edit if wrong</span>
            </label>
            <input id="pr-domain" type="text" className="form-input" value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="e.g. infosys.com" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Filter by Role</label>
          <div className="chip-row">
            {[
              { value: "hr",  label: "HR / Recruiter only" },
              { value: "all", label: "All employees" },
            ].map(o => (
              <button key={o.value} type="button"
                className={`chip ${filter === o.value ? "chip-active" : ""}`}
                onClick={() => setFilter(o.value)}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="form-footer">
          <button type="submit" className="btn-primary" disabled={loading || !company}>
            {loading ? <><span className="spinner" /> Searching…</> : "🔎 Find Contacts"}
          </button>
        </div>
      </form>

      {/* No Hunter key — show info box */}
      {results?.noKey && (
        <div className="prospect-nokey">
          <p className="nokey-title">🔑 Hunter.io API key needed</p>
          <p className="nokey-text">
            Get a free key at <strong>hunter.io/api-keys</strong> (25 searches/month, no credit card).
            Add it to <code>backend/.env</code> as <code>HUNTER_API_KEY=your_key</code> then restart the backend.
          </p>
          <a href={results.linkedinUrl} target="_blank" rel="noreferrer" className="btn-linkedin" style={{ marginTop: 12, display: "inline-flex" }}>
            🔗 Search on LinkedIn instead ↗
          </a>
        </div>
      )}

      {/* Results */}
      {results && !results.noKey && (
        <>
          <div className="prospect-meta">
            <span className="prospect-org">{results.organization || company}</span>
            {results.domain && <span className="prospect-domain">{results.domain}</span>}
            {results.pattern && (
              <span className="prospect-pattern" title="Email pattern used by this company">
                📋 Pattern: <code>{results.pattern}</code>
              </span>
            )}
            <span className="prospect-count">{results.emails?.length || 0} contacts found</span>
            <a href={results.linkedinUrl} target="_blank" rel="noreferrer" className="prospect-li-link">
              🔗 Search LinkedIn ↗
            </a>
          </div>

          {results.emails?.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <p>No contacts found for <strong>{domain || company}</strong>.</p>
              <p className="empty-hint">Try editing the domain (e.g. use the exact company website domain).</p>
            </div>
          ) : (
            <div className="prospect-list">
              {results.emails.map((e, i) => (
                <div key={i} className="prospect-card">
                  <div className="prospect-avatar">{e.name[0]?.toUpperCase() || "?"}</div>
                  <div className="prospect-body">
                    <div className="prospect-name">{e.name}</div>
                    {e.position && <div className="prospect-position">{e.position}</div>}
                    <div className="prospect-email-row">
                      <span className="prospect-email">{e.email}</span>
                      {e.confidence > 0 && (
                        <span className={`confidence-badge ${e.confidence >= 80 ? "conf-high" : e.confidence >= 50 ? "conf-med" : "conf-low"}`}>
                          {e.confidence}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="prospect-actions">
                    <button className={`btn-ghost btn-sm ${copiedIdx === i ? "btn-copied" : ""}`}
                      onClick={() => copyEmail(e.email, i)}>
                      {copiedIdx === i ? "✓ Copied" : "📋 Copy"}
                    </button>
                    {e.linkedin && (
                      <a href={e.linkedin} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">🔗 LinkedIn</a>
                    )}
                    <button className="btn-primary btn-sm"
                      onClick={() => setSchedModal({ hrEmail: e.email, hrName: e.name, company: results.organization || company, role: "" })}>
                      ✉ Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {schedModal && (
        <ScheduleApplyModal
          data={schedModal}
          onClose={() => setSchedModal(null)}
          onSendNow={(d) => { setSchedModal(null); onFillApply(d); }}
        />
      )}
    </div>
  );
}

// ─── Referral Page ────────────────────────────────────────────────────────────
const REFERRAL_STATUSES = ["Not Contacted", "Message Sent", "Agreed to Refer", "Referred", "No Response"];
const STATUS_COLORS = {
  "Not Contacted": "var(--text-400)",
  "Message Sent":  "var(--blue)",
  "Agreed to Refer": "var(--amber)",
  "Referred":      "var(--green)",
  "No Response":   "var(--red)",
};
const RELATION_OPTIONS = ["Ex-Colleague", "Friend", "LinkedIn Connection", "College Friend", "Other"];

function ReferralPage({ addToast }) {
  // ── Form state
  const [name,     setName]     = useState("");
  const [company,  setCompany]  = useState("");
  const [role,     setRole]     = useState("");
  const [relation, setRelation] = useState("Ex-Colleague");
  const [tab,      setTab]      = useState("linkedin");
  const [copied,   setCopied]   = useState(false);

  // ── Schedule state
  const [schedMode,  setSchedMode]  = useState("now");
  const [schedTime,  setSchedTime]  = useState("");
  const [scheduling, setScheduling] = useState(false);

  // ── Tracker (localStorage)
  const [referrals, setReferrals] = useState(() => {
    try { return JSON.parse(localStorage.getItem("referrals") || "[]"); } catch { return []; }
  });
  const saveReferrals = (list) => { setReferrals(list); localStorage.setItem("referrals", JSON.stringify(list)); };

  // ── Message builders
  const linkedinMsg = `Hi ${name || "Name"},

Hope you're doing well! I saw that ${company || "your company"} has an opening for ${role || "a relevant position"} and I'm really excited about it.

I have 4.7+ years of experience as a Senior Full Stack Developer with expertise in:
• Node.js, ReactJS, AngularJS, AWS Lambda
• CTI Integrations: Avaya, Genesys, Webex, Amazon Connect
• CRM: ServiceNow, Salesforce, Freshdesk, MS Dynamics

Given our connection as ${relation.toLowerCase()}s, I was hoping you could refer me for this role. It would genuinely mean a lot!

📎 Resume: https://drive.google.com/file/d/1LKc-w9Ggd5I1eZ3t7Wvm9psU-4ITxHxr/view?usp=sharing

Thank you so much in advance! 🙏

Best regards,
Anav Bansal
📞 +91 7827855635 | anavbansal06@gmail.com`;

  const whatsappMsg = `Hi ${name || "Name"}! 👋

Kya haal hai? Hope sab badhiya chal raha hai!

Maine dekha ki *${company || "tumhari company"}* mein *${role || "ek role"}* ka opening hai aur main bahut interested hun apply karne ke liye.

Kya tum mujhe refer kar sakte ho? Tumhare jaise *${relation.toLowerCase()}* ka referral bahut valuable hoga! 🙏

*Meri profile:*
• 4.7+ years — Node.js, ReactJS, AWS Lambda
• CTI Expert: Avaya, Genesys, Webex, Amazon Connect
• CRM: ServiceNow, Salesforce, Freshdesk

📄 *Resume:* https://drive.google.com/file/d/1LKc-w9Ggd5I1eZ3t7Wvm9psU-4ITxHxr/view?usp=sharing

Bahut helpful hoga agar refer kar sako! 😊`;

  const currentMsg = tab === "linkedin" ? linkedinMsg : whatsappMsg;

  const [editedMsg, setEditedMsg] = useState(linkedinMsg);
  useEffect(() => setEditedMsg(currentMsg), [tab, name, company, role, relation]);

  const copy = () => {
    navigator.clipboard.writeText(editedMsg).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      addToast && addToast("Message copied!");
    });
  };

  // ── Add to tracker
  const addToTracker = () => {
    if (!name || !company) { addToast && addToast("Name aur Company required hai!", "error"); return; }
    const already = referrals.find(r => r.name === name && r.company === company);
    if (already) { addToast && addToast("Yeh contact already tracker mein hai!", "error"); return; }
    const entry = { id: Date.now(), name, company, role, relation, status: "Message Sent", addedAt: Date.now(), scheduledAt: null };
    saveReferrals([entry, ...referrals]);
    addToast && addToast(`${name} tracker mein add ho gaya!`);
  };

  // ── Schedule follow-up
  const scheduleFollowup = async () => {
    if (!name || !company) { addToast && addToast("Name aur Company required!", "error"); return; }
    if (!schedTime) { addToast && addToast("Date & time choose karo!", "error"); return; }
    setScheduling(true);
    try {
      await axios.post(`${API}/api/schedule-email`, {
        hrEmail: `referral-${Date.now()}@placeholder.com`,
        hrName: name, company, role,
        scheduledTime: schedTime, type: "referral",
        customNote: `Referral follow-up to ${name} at ${company}`,
      });
      addToast && addToast(`Follow-up scheduled for ${new Date(schedTime).toLocaleString("en-IN")}`);
      setSchedMode("now"); setSchedTime("");
    } catch (e) {
      addToast && addToast("Schedule failed!", "error");
    } finally { setScheduling(false); }
  };

  const updateStatus = (id, status) => {
    saveReferrals(referrals.map(r => r.id === id ? { ...r, status } : r));
  };
  const deleteReferral = (id) => {
    saveReferrals(referrals.filter(r => r.id !== id));
    addToast && addToast("Removed from tracker");
  };

  return (
    <div className="page">
      {/* ── Contact form ── */}
      <div className="ref-form-card">
        <h3 className="ref-section-title">🤝 Referral Request Generator</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Contact Name</label>
            <input className="form-input" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Their Company</label>
            <input className="form-input" placeholder="Google, Microsoft…" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Role You Want</label>
            <input className="form-input" placeholder="Senior Full Stack Developer" value={role} onChange={e => setRole(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Your Relation</label>
            <select className="form-input form-select" value={relation} onChange={e => setRelation(e.target.value)}>
              {RELATION_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Message tabs ── */}
      <div className="msg-tabs">
        <button className={`msg-tab ${tab === "linkedin" ? "msg-tab-active" : ""}`} onClick={() => setTab("linkedin")}>🔗 LinkedIn DM</button>
        <button className={`msg-tab ${tab === "whatsapp" ? "msg-tab-active whatsapp-active" : ""}`} onClick={() => setTab("whatsapp")}>💚 WhatsApp</button>
      </div>

      <div className="msg-char-count">{editedMsg.length} characters</div>
      <textarea className="msg-textarea" rows={14} value={editedMsg} onChange={e => setEditedMsg(e.target.value)} spellCheck={false} />

      {/* ── Actions ── */}
      <div className="ref-actions-row">
        <button className={`btn-primary btn-sm ${copied ? "btn-copied" : ""}`} onClick={copy}>
          {copied ? "✓ Copied!" : "📋 Copy Message"}
        </button>
        {tab === "whatsapp" ? (
          <button className="btn-whatsapp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(editedMsg)}`, "_blank")}>
            💚 Open in WhatsApp
          </button>
        ) : (
          <button className="btn-linkedin" onClick={() => window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name} ${company}`)}`, "_blank")}>
            🔗 Find on LinkedIn ↗
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setEditedMsg(currentMsg)}>↺ Reset</button>
        <button className="btn-primary btn-sm" style={{ background: "var(--green)" }} onClick={addToTracker}>
          + Add to Tracker
        </button>
      </div>

      {/* ── Schedule follow-up ── */}
      <div className="ref-schedule-box">
        <div className="ref-section-title" style={{ marginBottom: 12 }}>🗓 Schedule Follow-up Reminder</div>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button type="button" className={`chip ${schedMode === "now" ? "chip-active" : ""}`} onClick={() => setSchedMode("now")}>No Reminder</button>
          <button type="button" className={`chip ${schedMode === "schedule" ? "chip-active" : ""}`} onClick={() => setSchedMode("schedule")}>🗓 Set Reminder</button>
        </div>
        {schedMode === "schedule" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="datetime-local" className="form-input" style={{ maxWidth: 240 }}
              min={toLocalDT(Date.now() + 60000)}
              value={schedTime} onChange={e => setSchedTime(e.target.value)} />
            <button className="btn-primary btn-sm" onClick={scheduleFollowup} disabled={scheduling || !schedTime}>
              {scheduling ? <><span className="spinner" /> Scheduling…</> : "Schedule Follow-up"}
            </button>
          </div>
        )}
      </div>

      {/* ── Referral Tracker ── */}
      {referrals.length > 0 && (
        <>
          <div className="ref-section-title" style={{ marginTop: 8 }}>📋 Referral Tracker ({referrals.length})</div>
          <div className="ref-tracker">
            {referrals.map(r => (
              <div key={r.id} className="ref-card">
                <div className="ref-card-avatar">{getInitials(r.name, "")}</div>
                <div className="ref-card-body">
                  <div className="ref-card-top">
                    <span className="ref-card-name">{r.name}</span>
                    <span className="ref-card-company">{r.company}</span>
                    {r.role && <span className="contact-role">{r.role}</span>}
                  </div>
                  <div className="ref-card-meta">
                    <span className="ref-relation">{r.relation}</span>
                    <DaysBadge ts={r.addedAt} />
                  </div>
                </div>
                <div className="ref-card-right">
                  <select
                    className="ref-status-select"
                    style={{ color: STATUS_COLORS[r.status] }}
                    value={r.status}
                    onChange={e => updateStatus(r.id, e.target.value)}>
                    {REFERRAL_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button className="btn-ghost btn-sm" onClick={() => deleteReferral(r.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── LinkedIn Connections Page ────────────────────────────────────────────────
const LI_FILTERS = [
  { key: "all",     label: "All"           },
  { key: "hr",      label: "HR / Recruiter" },
  { key: "notsent", label: "Not Sent"       },
  { key: "sent",    label: "Applied ✓"      },
  { key: "replied", label: "Replied ✓"      },
];


// ─── Referral Message Modal ────────────────────────────────────────────────────


function ReferralMessageModal({ connection, onClose, addToast }) {
  const [activeTemplate, setActiveTemplate] = useState("fullstack1");
  const [msg,    setMsg]    = useState(() => MSG_TEMPLATES[0].build(connection.name, connection.company));
  const [copied, setCopied] = useState(false);
  useLockBodyScroll();

  const applyTemplate = (tplId) => {
    const tpl = MSG_TEMPLATES.find(t => t.id === tplId);
    if (tpl) { setActiveTemplate(tplId); setMsg(tpl.build(connection.name, connection.company)); setCopied(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      addToast && addToast("✅ Message copied! Paste on LinkedIn.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = msg; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const openLinkedIn = () => {
    if (connection.url) window.open(connection.url, "_blank");
    else addToast && addToast("No LinkedIn URL for this connection", "error");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>💬</span>
            <h3 className="modal-title">Referral Message</h3>
            <span className="modal-hint" style={{ background:"#e0f2fe", color:"#0369a1" }}>
              🏢 {connection.company || "—"} · {(connection.name||"").split(" ")[0]}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll">
          {/* Tips */}
          <div style={{
            background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)",
            border:"1px solid #bae6fd", borderRadius:10,
            padding:"10px 14px", marginBottom:14, fontSize:12, color:"#0369a1"
          }}>
            💡 <strong>Tip:</strong> Copy → Open LinkedIn → Go to {(connection.name||"their")} profile → Message → Paste
          </div>

          {/* Template selector */}
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {MSG_TEMPLATES.map(tpl => (
              <button key={tpl.id} type="button"
                onClick={() => applyTemplate(tpl.id)}
                style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding:"6px 12px", borderRadius:99, fontSize:12, fontWeight:600,
                  border: `1.5px solid ${activeTemplate === tpl.id ? tpl.color : "var(--border,#e2e8f0)"}`,
                  background: activeTemplate === tpl.id
                    ? `color-mix(in srgb, ${tpl.color} 12%, transparent)`
                    : "var(--surface,#fff)",
                  color: activeTemplate === tpl.id ? tpl.color : "var(--text-500,#6b7280)",
                  cursor:"pointer", transition:"all 0.15s ease",
                  boxShadow: activeTemplate === tpl.id ? `0 2px 8px ${tpl.color}30` : "none",
                }}>
                {tpl.icon} {tpl.label}
              </button>
            ))}
          </div>

          {/* Editable message */}
          <div className="form-group">
            <label className="form-label" style={{ display:"flex", justifyContent:"space-between" }}>
              <span>📝 Message — edit if needed</span>
              <span style={{ fontSize:11, color:"var(--text-muted,#64748b)", fontWeight:400 }}>
                {msg.length} chars
              </span>
            </label>
            <textarea
              className="form-textarea"
              rows={14}
              value={msg}
              onChange={e => setMsg(e.target.value)}
              style={{ fontFamily:"inherit", fontSize:13, lineHeight:1.7 }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          {connection.url && (
            <button className="btn-ghost" onClick={openLinkedIn} style={{ color:"#0077b5", borderColor:"#0077b5" }}>
              🔗 Open Profile
            </button>
          )}
          <button
            className="btn-primary"
            onClick={copy}
            style={{ background: copied ? "linear-gradient(135deg,#059669,#10b981)" : undefined, minWidth:140 }}
          >
            {copied ? "✅ Copied!" : "📋 Copy Message"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Add Connection Modal ──────────────────────────────────────────────────────
function AddConnectionModal({ onClose, onAdded, addToast }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "", position: "",
    email: "", url: "", connectedOn: new Date().toLocaleDateString("en-IN"),
  });
  const [loading, setSaving] = useState(false);
  useLockBodyScroll();

  const handle = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.firstName && !form.lastName)
      return addToast && addToast("Name required", "error");
    setSaving(true);
    try {
      await axios.post(`${API}/api/linkedin/add-connection`, form);
      addToast && addToast(`✅ ${form.firstName} ${form.lastName} added!`);
      onAdded && onAdded();
      onClose();
    } catch (e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
    } finally { setSaving(false); }
  };

  const fields = [
    [{ key:"firstName", label:"First Name *", ph:"Radmila", half:true },
     { key:"lastName",  label:"Last Name",    ph:"Neykova", half:true }],
    [{ key:"company",   label:"Company",      ph:"Wiser Technology", half:true },
     { key:"position",  label:"Position",     ph:"Talent Manager", half:true }],
    [{ key:"email",     label:"Email",        ph:"radmila@example.com", half:true },
     { key:"url",       label:"LinkedIn URL", ph:"https://linkedin.com/in/...", half:true }],
    [{ key:"connectedOn", label:"Connected On", ph:"19 May 2026", half:true }],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()} style={{ maxWidth:500 }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>➕</span>
            <h3 className="modal-title">Add Connection</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll">
          {fields.map((row, ri) => (
            <div key={ri} style={{ display:"grid", gridTemplateColumns: row.length > 1 ? "1fr 1fr" : "1fr", gap:10, marginBottom:10 }}>
              {row.map(f => (
                <div key={f.key} className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>{f.label}</label>
                  <input className="form-input" style={{ fontSize:13 }}
                    placeholder={f.ph}
                    value={form[f.key]}
                    onChange={e => handle(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn-primary ${loading ? "loading" : ""}`}
            onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Adding…</> : "➕ Add Connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkedInConnectionsPage({ onFillApply, addToast }) {
  const [connections, setConnections] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [total,       setTotal]       = useState(0);
  const [updating,    setUpdating]    = useState({});
  const [refModal,       setRefModal]       = useState(null);
  const [ignoring,       setIgnoring]       = useState({});
  const [addConnModal,   setAddConnModal]   = useState(false);

  const fetchConnections = useCallback(async (q, f) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/linkedin/connections`, {
        params: { q: q || undefined, filter: f || "all" },
      });
      setConnections(r.data.connections || []);
      setTotal(r.data.total || 0);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || "Failed to load connections";
      addToast && addToast(msg, "error");
      console.error("LinkedIn connections error:", msg);
    } finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { fetchConnections("", "all"); }, [fetchConnections]);

  const doSearch = (e) => { e.preventDefault(); fetchConnections(search, filter); };
  const applyFilter = (f) => { setFilter(f); fetchConnections(search, f); };

  const toggle = async (conn, field) => {
    const key = `${conn.rowIndex}-${field}`;
    setUpdating(p => ({ ...p, [key]: true }));
    const newVal = !conn[field];
    try {
      await axios.post(`${API}/api/linkedin/update-connection`, {
        rowIndex: conn.rowIndex, field, value: newVal,
      });
      setConnections(prev => prev.map(c =>
        c.rowIndex === conn.rowIndex ? { ...c, [field]: newVal } : c
      ));
      addToast && addToast(`${field === "sent" ? "Applied" : "Replied"} status updated!`);
    } catch {
      addToast && addToast("Update failed", "error");
    } finally { setUpdating(p => ({ ...p, [key]: false })); }
  };

  const ignore = async (conn) => {
    setIgnoring(p => ({ ...p, [conn.rowIndex]: true }));
    try {
      await axios.post(`${API}/api/linkedin/ignore-connection`, { rowIndex: conn.rowIndex });
      setConnections(prev => prev.filter(c => c.rowIndex !== conn.rowIndex));
      addToast && addToast(`🚫 ${conn.name || "Contact"} ignored and removed.`);
    } catch {
      addToast && addToast("Failed to ignore contact", "error");
    } finally { setIgnoring(p => ({ ...p, [conn.rowIndex]: false })); }
  };

  // Stats from ALL connections (not filtered)
  const hrCount      = connections.filter(c => /\b(hr|recruit|talent|hiring|people|staffing|acquisition)\b/i.test(c.position)).length;
  const sentCount    = connections.filter(c => c.sent).length;
  const repliedCount = connections.filter(c => c.replied).length;

  const initials = (c) => {
    const n = c.name || "?";
    return n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };
  const avatarColor = (c) => {
    const colors = ["#2563eb","#7c3aed","#059669","#d97706","#dc2626","#0d9488"];
    let h = 0; for (const ch of (c.company || c.name || "")) h = (h * 31 + ch.charCodeAt(0)) % colors.length;
    return colors[Math.abs(h)];
  };

  return (
    <>
    <div className="page">
      {/* Stats row */}
      <div className="li-stats-row">
        <div className="li-stat"><span className="li-stat-val">{total}</span><span className="li-stat-lbl">Shown</span></div>
        <div className="li-stat"><span className="li-stat-val" style={{ color: "var(--purple)" }}>{hrCount}</span><span className="li-stat-lbl">HR/Recruiter</span></div>
        <div className="li-stat"><span className="li-stat-val" style={{ color: "var(--blue)" }}>{sentCount}</span><span className="li-stat-lbl">Applied</span></div>
        <div className="li-stat"><span className="li-stat-val" style={{ color: "var(--green)" }}>{repliedCount}</span><span className="li-stat-lbl">Replied</span></div>
      </div>

      {/* Toolbar: Search + Add */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
        <button className="btn-primary btn-sm"
          style={{ whiteSpace:"nowrap", gap:5, display:"flex", alignItems:"center" }}
          onClick={() => setAddConnModal(true)}>
          ➕ Add Connection
        </button>
      </div>

      {/* Search */}
      <form onSubmit={doSearch} className="li-search-row">
        <div className="search-bar-wrap" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input className="search-input" type="text" placeholder="Search name, company, position, email…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button type="button" className="search-clear" onClick={() => { setSearch(""); fetchConnections("", filter); }}>✕</button>}
        </div>
        <button type="submit" className="btn-primary btn-sm" disabled={loading}>{loading ? "…" : "Search"}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => fetchConnections(search, filter)} disabled={loading}>↻</button>
      </form>

      {/* Filter chips */}
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {LI_FILTERS.map(f => (
          <button key={f.key} type="button"
            className={`chip ${filter === f.key ? "chip-active" : ""}`}
            onClick={() => applyFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {/* Connection count */}
      {!loading && <p className="li-count">{connections.length} connection{connections.length !== 1 ? "s" : ""}</p>}

      {/* Grid */}
      {connections.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔗</span>
          <p>{loading ? "Loading connections…" : "No connections found. Try a different search or filter."}</p>
        </div>
      ) : (
        <div className="li-grid">
          {connections.map((c, i) => (
            <div key={i} className={`li-card ${c.sent ? "li-card-sent" : ""} ${c.replied ? "li-card-replied" : ""}`}>
              {/* Avatar */}
              <div className="li-avatar" style={{ background: avatarColor(c) }}>{initials(c)}</div>

              {/* Body */}
              <div className="li-body">
                <div className="li-name">{c.name || "—"}</div>
                {c.position && <div className="li-position">{c.position}</div>}
                {c.company  && <div className="li-company">🏢 {c.company}</div>}
                {c.email    && <div className="li-email">✉ {c.email}</div>}
                <div className="li-meta">
                  {c.connectedOn && <span>🔗 Connected {c.connectedOn}</span>}
                </div>

                {/* Sent / Replied toggles */}
                <div className="li-toggles">
                  <button
                    className={`li-toggle-btn ${c.sent ? "li-toggle-on" : ""}`}
                    disabled={updating[`${c.rowIndex}-sent`]}
                    onClick={() => toggle(c, "sent")}
                    title="Mark as Applied"
                  >
                    {updating[`${c.rowIndex}-sent`] ? "…" : c.sent ? "✓ Applied" : "Mark Applied"}
                  </button>
                  <button
                    className={`li-toggle-btn ${c.replied ? "li-toggle-replied" : ""}`}
                    disabled={updating[`${c.rowIndex}-replied`]}
                    onClick={() => toggle(c, "replied")}
                    title="Mark as Replied"
                  >
                    {updating[`${c.rowIndex}-replied`] ? "…" : c.replied ? "↩ Replied" : "Mark Replied"}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="li-actions" style={{ flexDirection:"column", gap:5, alignItems:"stretch" }}>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" className="btn-linkedin btn-sm"
                    title="Open LinkedIn profile" style={{ textAlign:"center" }}>
                    🔗 Profile
                  </a>
                )}
                <button
                  className="btn-primary btn-sm"
                  title="Generate referral message to copy-paste on LinkedIn"
                  style={{ background:"linear-gradient(135deg,#0077b5,#005f8f)", fontSize:11 }}
                  onClick={() => setRefModal(c)}>
                  💬 Message
                </button>
                <button
                  className="btn-ghost btn-sm"
                  title="Ignore — remove from list"
                  style={{ fontSize:10, color:"var(--text-400,#9ca3af)", borderColor:"transparent" }}
                  disabled={ignoring[c.rowIndex]}
                  onClick={() => ignore(c)}>
                  {ignoring[c.rowIndex] ? "…" : "🚫 Ignore"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Modals rendered outside page div to avoid overflow clipping */}
    {refModal && (
      <ReferralMessageModal
        connection={refModal}
        onClose={() => setRefModal(null)}
        addToast={addToast}
      />
    )}
    {addConnModal && (
      <AddConnectionModal
        onClose={() => setAddConnModal(false)}
        onAdded={() => fetchConnections(search, filter)}
        addToast={addToast}
      />
    )}
    </>
  );
}

// ─── Scheduled Page ───────────────────────────────────────────────────────────
function ScheduledPage() {
  const [jobs, setJobs]   = useState([]);
  const [now,  setNow]    = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000); // update every 30s
    return () => clearInterval(t);
  }, []);

  const countdown = (scheduledTime) => {
    const diff = new Date(scheduledTime + "+05:30").getTime() - now;
    if (diff <= 0) return "🔄 Sending soon...";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `📅 ${Math.floor(h/24)}d ${h%24}h`;
    if (h > 0)  return `⏰ ${h}h ${m}m`;
    return `⏰ ${m}m`;
  };
  useEffect(() => { axios.get(`${API}/api/scheduled-emails`).then(r => setJobs(r.data.jobs || [])).catch(() => {}); }, []);
  const remove = async id => { await axios.delete(`${API}/api/scheduled-emails/${id}`); setJobs(p => p.filter(j => j.jobId !== id)); };
  const pending = jobs.filter(j => j.status === "pending");
  return (
    <div className="page">
      {pending.length === 0
        ? <div className="empty-state"><span className="empty-icon">🗓</span><p>No scheduled emails.</p></div>
        : <div className="contacts-list">
            {pending.map(job => (
              <div key={job.jobId} className="contact-card">
                <div className="contact-avatar" style={{ background: "#7c3aed" }}>🗓</div>
                <div className="contact-body">
                  <div className="contact-top">
                    <span className="contact-company">{job.emailData.company}</span>
                    <span className="badge badge-scheduled">Scheduled</span>
                  </div>
                  <p className="contact-email">{job.emailData.hrEmail}</p>
                  <div className="contact-meta">
                    <span>📅 {new Date(job.scheduledTime + "+05:30").toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" })}</span>
                    <span style={{ color:"var(--blue)", fontWeight:600 }}>{countdown(job.scheduledTime)}</span>
                  </div>
                </div>
                <div className="contact-actions">
                  <button className="btn-ghost btn-sm" onClick={() => remove(job.jobId)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ═══════════════════════════════ MAIN APP ════════════════════════════════════

// ─── Login / Register Page ────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [tab,      setTab]     = useState("login");
  const [form,     setForm]    = useState({ username:"", password:"", displayName:"", inviteCode:"" });
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await axios.post(`${API}${endpoint}`, form);
      setToken(res.data.token);
      setUser(res.data.user);
      onAuth(res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      padding:16
    }}>
      <div style={{
        width:"100%", maxWidth:400,
        background:"rgba(255,255,255,0.05)", backdropFilter:"blur(20px)",
        border:"1px solid rgba(255,255,255,0.1)", borderRadius:20,
        padding:40, boxShadow:"0 32px 80px rgba(0,0,0,0.4)"
      }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{
            width:56, height:56, borderRadius:16, margin:"0 auto 12px",
            background:"linear-gradient(135deg,#3b82f6,#7c3aed)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:28, boxShadow:"0 8px 24px rgba(59,130,246,0.4)"
          }}>✉️</div>
          <h1 style={{ color:"#fff", fontSize:24, fontWeight:800, margin:0 }}>Email Sender</h1>
          <p style={{ color:"#94a3b8", fontSize:13, margin:"6px 0 0" }}>Job Hunt Automation</p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display:"flex", background:"rgba(0,0,0,0.3)", borderRadius:10,
          padding:4, marginBottom:24
        }}>
          {["login","register"].map(t => (
            <button key={t} type="button"
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex:1, padding:"8px 0", borderRadius:8, border:"none",
                fontWeight:600, fontSize:13, cursor:"pointer", transition:"all 0.2s",
                background: tab===t ? "rgba(255,255,255,0.1)" : "transparent",
                color: tab===t ? "#fff" : "#64748b",
              }}>
              {t === "login" ? "🔑 Login" : "✨ Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {tab === "register" && (
            <div style={{ marginBottom:14 }}>
              <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>DISPLAY NAME</label>
              <input name="displayName" value={form.displayName} onChange={handle}
                placeholder="Anav Bansal" required
                style={{
                  width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:14, boxSizing:"border-box",
                  outline:"none"
                }} />
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>USERNAME</label>
            <input name="username" value={form.username} onChange={handle}
              placeholder="anav" required autoFocus
              style={{
                width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:14, boxSizing:"border-box",
                outline:"none"
              }} />
          </div>

          <div style={{ marginBottom: tab==="register" ? 14 : 24 }}>
            <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>PASSWORD</label>
            <input name="password" type="password" value={form.password} onChange={handle}
              placeholder="••••••••" required
              style={{
                width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:14, boxSizing:"border-box",
                outline:"none"
              }} />
          </div>

          {tab === "register" && (
            <div style={{ marginBottom:24 }}>
              <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>INVITE CODE</label>
              <input name="inviteCode" value={form.inviteCode} onChange={handle}
                placeholder="Ask Anav for the code" required
                style={{
                  width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:14, boxSizing:"border-box",
                  outline:"none"
                }} />
            </div>
          )}

          {error && (
            <div style={{
              background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)",
              borderRadius:8, padding:"10px 14px", marginBottom:16,
              color:"#fca5a5", fontSize:13
            }}>❌ {error}</div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width:"100%", padding:"12px 0", borderRadius:10, border:"none",
              background:"linear-gradient(135deg,#2563eb,#7c3aed)", color:"#fff",
              fontWeight:700, fontSize:15, cursor:"pointer", transition:"all 0.2s",
              boxShadow:"0 4px 16px rgba(37,99,235,0.4)",
              opacity: loading ? 0.7 : 1
            }}>
            {loading ? "⏳ Please wait…" : tab==="login" ? "🔑 Login" : "✨ Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [authUser,      setAuthUser]      = useState(() => getUser());
  const [page,          setPage]          = useState("dashboard");
  const [contacts,      setContacts]      = useState([]);
  const [replies,       setReplies]       = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [fetchedAt,     setFetchedAt]     = useState(null);
  const [darkMode,      setDarkMode]      = useState(() => localStorage.getItem("darkMode") === "true");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [modal,         setModal]         = useState(null);
  const [threadModal,       setThreadModal]       = useState(null);
  const [manualUpdateModal, setManualUpdateModal] = useState(null); // { contact }
  const [sheetError,    setSheetError]    = useState(null);
  const [toasts,        setToasts]        = useState([]);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3800);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  const fetchContacts = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/api/contacts`);
      setContacts(r.data.contacts || []);
      setFetchedAt(r.data.fetchedAt || Date.now());
      setSheetError(r.data.sheetError || null);
    } catch {}
  }, []);

  const fetchReplies = useCallback(async () => {
    try { const r = await axios.get(`${API}/api/gmail/replies`); setReplies(r.data.replies || []); } catch {}
  }, []);

  const fetchScheduled = useCallback(async () => {
    try { const r = await axios.get(`${API}/api/scheduled-emails`); setScheduledJobs(r.data.jobs || []); } catch {}
  }, []);

  useEffect(() => { fetchContacts(); fetchReplies(); fetchScheduled(); }, [fetchContacts, fetchReplies, fetchScheduled]);

  // ── Auto-poll replies every 2 minutes + notify on new replies ───────────────
  const prevReplyCountRef = React.useRef(0);
  useEffect(() => {
    // Request notification permission on load
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const poll = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/api/gmail/replies`);
        const newReplies = r.data.replies || [];
        setReplies(newReplies);

        // Notify if new replies came in since last poll
        const prev = prevReplyCountRef.current;
        if (newReplies.length > prev && prev > 0) {
          const diff = newReplies.length - prev;
          // Browser notification
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("📬 New HR Reply!", {
              body: `${diff} new reply${diff > 1 ? "s" : ""} in your inbox`,
              icon: "/favicon.ico",
              tag: "hr-reply",
            });
          }
          addToast(`📬 ${diff} new HR repl${diff > 1 ? "ies" : "y"} received!`, "success");
        }
        prevReplyCountRef.current = newReplies.length;
      } catch {}
    }, 2 * 60 * 1000); // every 2 minutes

    return () => clearInterval(poll);
  }, [addToast, fetchReplies]);

  // ── Follow-up reminders toast on load ─────────────────────────────────────
  const reminderShownRef = React.useRef(false);
  useEffect(() => {
    if (reminderShownRef.current) return;
    const due = contacts.filter(c => c.needsFollowUp);
    if (due.length > 0) {
      reminderShownRef.current = true;
      addToast(`⏰ ${due.length} follow-up${due.length > 1 ? "s" : ""} due today!`, "success");
    }
  }, [contacts, addToast]);

  const reminderCount  = contacts.filter(c => c.needsFollowUp).length;
  const replyCount     = replies.length;
  const scheduledCount = scheduledJobs.filter(j => j.status === "pending").length;

  const NAV = [
    { id: "dashboard",   icon: "🏠", label: "Dashboard" },
    { id: "contacts",    icon: "👥", label: "HR Contacts",      badge: reminderCount  || null },
    { id: "send",        icon: "✉",  label: "Send Application" },
    { id: "linkedin",    icon: "🔗", label: "Connections" },
    { id: "referral",    icon: "🤝", label: "Referral" },
    { id: "prospect",    icon: "🎯", label: "Find HR Emails" },
    { id: "inbox",       icon: "📥", label: "Inbox",            badge: replyCount     || null },
    { id: "messages",    icon: "💬", label: "Messages" },
    { id: "jobs",        icon: "🔍", label: "Find Jobs" },
    { id: "scheduled",   icon: "🗓", label: "Scheduled",        badge: scheduledCount || null },
  ];

  const [prefillSend, setPrefillSend] = React.useState(null);

  const navigate = id => { setPage(id); setSidebarOpen(false); };
  const goToSendPrefilled = (data) => { setPrefillSend(data); setPage("send"); setSidebarOpen(false); };

  // Sidebar mini stats
  const openedCount = contacts.filter(c => c.opened).length;

  // Show login page if not authenticated
  if (!authUser) {
    return <AuthPage onAuth={user => { setAuthUser(user); }} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-avatar">{(authUser?.displayName||"U").slice(0,2).toUpperCase()}</div>
          <div className="sidebar-brand">
            <span className="sidebar-name">{authUser?.displayName || authUser?.username}</span>
            <span className="sidebar-role">{authUser?.username === "anav" ? "Senior Dev" : "Finance Pro"}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button key={n.id} className={`nav-item ${page === n.id ? "nav-item-active" : ""}`} onClick={() => navigate(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        {/* Mini stats in sidebar */}
        <div className="sidebar-stats">
          <div className="sidebar-stat"><span className="ss-val">{contacts.length}</span><span className="ss-lbl">Applied</span></div>
          <div className="sidebar-stat"><span className="ss-val">{openedCount}</span><span className="ss-lbl">Opened</span></div>
          <div className="sidebar-stat"><span className="ss-val">{replyCount}</span><span className="ss-lbl">Replies</span></div>
        </div>
        <div className="sidebar-footer">
          <DarkModeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
          <button
            onClick={() => { clearToken(); setAuthUser(null); }}
            style={{
              background:"transparent", border:"none", cursor:"pointer",
              color:"#64748b", fontSize:12, padding:"6px 8px", borderRadius:8,
              display:"flex", alignItems:"center", gap:6, width:"100%",
              transition:"all 0.2s"
            }}
            title="Logout">
            🚪 <span style={{ fontSize:11 }}>{authUser?.displayName || authUser?.username || "Logout"}</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="main-wrap">
        <header className="top-header">
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <div className="header-user">
            <div className="header-avatar" style={{
              background: authUser?.username === "anav"
                ? "linear-gradient(135deg,#3b82f6,#7c3aed)"
                : "linear-gradient(135deg,#0d9488,#059669)"
            }}>
              {(authUser?.displayName || "U").slice(0,2).toUpperCase()}
            </div>
            <div className="header-info">
              <span className="header-name">{authUser?.displayName || authUser?.username}</span>
              <span className="header-title">
                {authUser?.username === "anav"
                  ? "Senior Software Developer · CTI/Telephony Specialist · Node.js · AWS"
                  : "Finance Professional · Credit Manager · Digital Lending · GenAI"}
              </span>
            </div>
          </div>
          <div className="header-links">
            {authUser?.username === "anav" ? (<>
              <a href="mailto:anavbansal06@gmail.com" className="plink">✉ anavbansal06@gmail.com</a>
              <a href="tel:+917827855635" className="plink">📞 +91 7827855635</a>
              <a href="https://linkedin.com/in/anavbansal-51b191162" target="_blank" rel="noreferrer" className="plink">🔗 LinkedIn</a>
              <a href={DRIVE_LINK} target="_blank" rel="noreferrer" className="plink plink-resume">📄 Resume</a>
            </>) : (<>
              <a href="mailto:priyalgoyal1702@gmail.com" className="plink">✉ priyalgoyal1702@gmail.com</a>
              <a href="tel:+917665941798" className="plink">📞 +91 7665941798</a>
              <a href="https://linkedin.com/in/priyal--goyal/" target="_blank" rel="noreferrer" className="plink">🔗 LinkedIn</a>
              <span className="plink plink-resume">📄 Resume</span>
            </>)}
          </div>
          <DarkModeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
        </header>

        <main className="main-content">
          <div className="page-header">
            <h2 className="page-title">{NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}</h2>
          </div>

          {page === "dashboard" && (
            <DashboardPage
              contacts={contacts}
              replies={replies}
              scheduledJobs={scheduledJobs}
              onNavigate={navigate}
            />
          )}
          {page === "contacts" && (
            <HRContactsPage
              contacts={contacts}
              replies={replies}
              fetchedAt={fetchedAt}
              sheetError={sheetError}
              onViewEmail={trackingId => setModal({ type: "emailBody", trackingId })}
              onFollowUp={contact  => setModal({ type: "followUp",  contact })}
              onMessage={contact   => { navigate("messages"); }}
              onRefresh={() => { fetchContacts(); fetchReplies(); }}
              addToast={addToast}
              onViewThread={contact => setThreadModal({ contact })}
              onManualUpdate={contact => setManualUpdateModal({ contact })}
            />
          )}
          {page === "send"      && <SendApplicationPage onContactsRefresh={fetchContacts} prefill={prefillSend} onPrefillConsumed={() => setPrefillSend(null)} addToast={addToast} />}
          {page === "linkedin"  && <LinkedInConnectionsPage onFillApply={goToSendPrefilled} addToast={addToast} />}
          {page === "referral"  && <ReferralPage addToast={addToast} />}
          {page === "inbox"     && <InboxPage contacts={contacts} onFollowUp={contact => setModal({ type: "followUp", contact })} addToast={addToast} />}
          {page === "messages"  && <MessagesPage contacts={contacts} />}
          {page === "prospect"  && <ProspectPage onFillApply={goToSendPrefilled} addToast={addToast} />}
          {page === "jobs"      && <FindJobsPage onFillApply={goToSendPrefilled} />}
          {page === "scheduled" && <ScheduledPage onRefresh={fetchScheduled} />}
          {page === "settings"   && <SettingsPage addToast={addToast} />}
        </main>
      </div>

      {modal?.type === "emailBody" && <EmailBodyModal trackingId={modal.trackingId} onClose={() => setModal(null)} />}
      {threadModal && <ThreadModal messageId={threadModal.contact?.lastMessageId} contact={threadModal.contact} onClose={() => setThreadModal(null)} />}
      {manualUpdateModal && (
        <ManualUpdateModal
          contact={manualUpdateModal.contact}
          onClose={() => setManualUpdateModal(null)}
          onSaved={() => { setManualUpdateModal(null); fetchContacts(); }}
          addToast={addToast}
        />
      )}
      {modal?.type === "followUp"  && <FollowUpModal  contact={modal.contact} onClose={() => setModal(null)} onSent={() => { setModal(null); fetchContacts(); addToast("Follow-up sent!"); }} />}

      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default App;

// --- Settings Page ---
function SettingsPage({ addToast }) {
  const currentUser = getUser();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    displayName: currentUser?.displayName || "",
    totalExp: "", currentCTC: "", expectedCTC: "",
    noticePeriod: "", currentLocation: "", preferredLocation: "",
  });
  const handle = (k, v) => setProfile(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/auth/settings`, profile);
      setUser({ ...getUser(), ...profile });
      addToast && addToast("Settings saved!");
    } catch (e) {
      addToast && addToast("Failed: " + (e.response?.data?.message || e.message), "error");
    } finally { setSaving(false); }
  };

  const fields = [
    { key: "displayName",       label: "Display Name",       ph: "Anav Bansal" },
    { key: "totalExp",          label: "Total Experience",   ph: "4.7+ Years" },
    { key: "currentCTC",        label: "Current CTC",        ph: "9 LPA" },
    { key: "expectedCTC",       label: "Expected CTC",       ph: "15 LPA" },
    { key: "noticePeriod",      label: "Notice Period",      ph: "30 Days" },
    { key: "currentLocation",   label: "Current Location",   ph: "Faridabad, Haryana" },
    { key: "preferredLocation", label: "Preferred Location", ph: "PAN India" },
  ];

  return (
    <div className="page">
      <div className="page-header"><h2 className="page-title">Settings</h2></div>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700 }}>Profile & Screening Answers</h3>
        <p style={{ fontSize:12, color:"var(--text-muted,#64748b)", marginBottom:16 }}>
          These values auto-fill in HR screening reply and emails.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {fields.map(f => (
            <div key={f.key} className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label" style={{ fontSize:11 }}>{f.label}</label>
              <input className="form-input" style={{ fontSize:13 }}
                placeholder={f.ph} value={profile[f.key]}
                onChange={e => handle(f.key, e.target.value)} />
            </div>
          ))}
        </div>
        <button className={`btn-primary ${saving ? "loading" : ""}`}
          style={{ marginTop:16 }} onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
        <h3 style={{ margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Gmail Connection</h3>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{
            background: currentUser?.hasGmail ? "#d1fae5" : "#fee2e2",
            color: currentUser?.hasGmail ? "#065f46" : "#991b1b",
            padding:"6px 14px", borderRadius:99, fontSize:13, fontWeight:600
          }}>
            {currentUser?.hasGmail ? "Connected" : "Not Connected"}
          </div>
          {currentUser?.gmailUser && (
            <span style={{ fontSize:13, color:"var(--text-muted)" }}>{currentUser.gmailUser}</span>
          )}
          <a href={`${API}/api/gmail/auth?username=${currentUser?.username}`}
            target="_blank" rel="noreferrer" className="btn-ghost btn-sm" style={{ fontSize:12 }}>
            {currentUser?.hasGmail ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        </div>
      </div>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
        <h3 style={{ margin:"0 0 12px", fontSize:15, fontWeight:700 }}>Account</h3>
        <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:2 }}>
          <div><strong>Username:</strong> {currentUser?.username}</div>
          <div><strong>Display Name:</strong> {currentUser?.displayName}</div>
        </div>
      </div>
    </div>
  );
}
