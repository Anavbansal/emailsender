/* eslint-disable */
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import "./App.css";

const API = "https://emailsender-v8a4.onrender.com";

// Global error handler — prevent white screen on unhandled promise rejections
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", e => {
    console.error("Unhandled promise rejection:", e.reason);
    e.preventDefault();
  });
}

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
  noticePeriod:     "Serving Notice Period",
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
  noticePeriod:     "Serving Notice Period",
  currentCTC:       "",
  offerInHand:      "No",
  expectedCTC:      "",
  currentLocation:  "Mumbai, India",
  preferredLocation:"PAN India",
};

// Dynamic profile based on logged in user
const getHRProfile = () => {
  const user = getUser();
  if (user?.username === "anav")   return HR_PROFILE_ANAV;
  if (user?.username === "priyal") return HR_PROFILE_PRIYAL;
  if (user?.username === "mohit") return {
    keySkills:        "Java, Spring Boot, Microservices, REST APIs, SQL, MySQL, CRM Integration, CTI Integration, Cisco Finesse, Salesforce, MS Dynamics 365, ServiceNow, HubSpot, Git, CI/CD",
    totalExp:         "4.8+ Years",
    relevantExp:      "4.8+ Years",
    currentCompany:   "NovelVox Pvt Ltd",
    reasonForChange:  "Personal and professional growth",
    noticePeriod:     "Serving Notice Period",
    currentCTC:       "",
    offerInHand:      "No",
    expectedCTC:      "",
    currentLocation:  "Gurugram, Haryana",
    preferredLocation:"PAN India",
  };
  // Dynamic profile for other users from their settings
  return {
    keySkills:        user?.keySkills        || "",
    totalExp:         user?.totalExp         || "",
    relevantExp:      user?.relevantExp      || "",
    currentCompany:   user?.currentCompany   || "",
    reasonForChange:  "Personal and professional growth",
    noticePeriod:     user?.noticePeriod     || "Serving Notice Period",
    currentCTC:       user?.currentCTC       || "",
    offerInHand:      "No",
    expectedCTC:      user?.expectedCTC      || "",
    currentLocation:  user?.currentLocation  || "",
    preferredLocation:user?.preferredLocation|| "PAN India",
  };
};
// getHRProfile() is computed dynamically via getHRProfile()

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

const EMAIL_TEMPLATES_MOHIT = [
  { id: "crm",     name: "CRM Specialist", icon: "🔗", accent: "#1d4ed8",
    customNote: "With 4.8+ years specializing in CRM & CTI integrations — MS Dynamics 365, ServiceNow, Salesforce, HubSpot, and Cisco Finesse — I have delivered 7+ enterprise solutions for Fortune 500 clients, resolved critical P1/P2 incidents, and earned 8 'Pat on the Back' awards at NovelVox PVT Ltd." },
  { id: "backend", name: "Backend Dev",    icon: "☕", accent: "#1e3a5f",
    customNote: "With 4.8+ years in Java, Spring Boot, Node.js, Microservices, and REST APIs, I specialize in scalable backend architectures and webhook-driven CRM/CTI integrations. I have independently delivered high-availability deployments for banking clients including Bank Albilad and J&K Bank." },
  { id: "java",    name: "Java Expert",    icon: "🚀", accent: "#0369a1",
    customNote: "As a Senior Java Developer with 4.8+ years in Spring Boot, Microservices, Apache Tomcat, and SQL, I have delivered enterprise-grade CTI solutions for Bank Albilad (MS Dynamics 365 + ServiceNow), J&K Bank (Salesforce + Cisco Finesse), and Misr Digital Innovation — including Apache Reverse Proxy and Tomcat Clustering deployments." },
  { id: "formal",  name: "Formal",         icon: "🎯", accent: "#1e40af",
    customNote: "With 4.8+ years of enterprise CRM and CTI integration experience across banking and contact center domains, I am confident my background aligns strongly with your requirements. I have earned 8 'Pat on the Back' awards and the Performance of the Year Award at NovelVox PVT Ltd." },
];

const getEmailTemplates = () => {
  const user = getUser();
  // Use saved templates if available (from Settings → Templates tab)
  if (user?.userTemplates?.length > 0) {
    return user.userTemplates.map(t => ({
      id: t.id, name: t.name, icon: t.icon || "⚡", accent: t.accent || "#2563eb",
      customNote: t.customNote || "",
    }));
  }
  if (user?.username === "anav")   return EMAIL_TEMPLATES_ANAV;
  if (user?.username === "priyal") return EMAIL_TEMPLATES_PRIYAL;
  if (user?.username === "mohit")  return EMAIL_TEMPLATES_MOHIT;
  return EMAIL_TEMPLATES_ANAV;
};
// getEmailTemplates() is computed dynamically via getEmailTemplates()
const BACKEND_TEMPLATE_MAP = {
  fullstack:"fullstack", cti:"cti", formal:"formal", startup:"fullstack",
  crm:"crm", finance:"finance", credit:"credit", genai:"genai",
  backend:"backend", java:"java",
};

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

// getDefaultTemplate() is computed dynamically
const getDefaultTemplate = () => getUser()?.username === "anav" ? DEFAULT_TEMPLATE_ANAV : DEFAULT_TEMPLATE_PRIYAL;


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

const MSG_TEMPLATES_MOHIT = [
  {
    id: "backend1", label: "Backend — Casual", icon: "☕", color: "#1e3a5f",
    build: (name, company) => {
      const n = (name||"there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},\n\nHope you are doing well! I came across your profile and wanted to connect.\n\nI am Mohit Singh — a Senior Software Backend Engineer with 4.7+ years of experience in Java, Spring Boot, Microservices, and enterprise CRM/CTI integrations (MS Dynamics 365, ServiceNow, Salesforce, Cisco Finesse).\n\nI am currently exploring new opportunities and would love to connect with someone at ${c}. If there are any suitable openings or if you would be open to a referral, I would truly appreciate it!\n\nBest regards,\nMohit Singh\n📞 +91 7982092042 | ✉ mohit310ggn@gmail.com`;
    }
  },
  {
    id: "crm1", label: "CRM Specialist", icon: "🔗", color: "#2563eb",
    build: (name, company) => {
      const n = (name||"there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},\n\nI hope this message finds you well!\n\nI am Mohit Singh, a Senior Software Developer at NovelVox with 4.8+ years specializing in CRM/CTI integrations — MS Dynamics 365, ServiceNow, Salesforce, HubSpot, and Cisco Finesse. I have received 8 Pat on the Back awards and the Performance of the Year Award.\n\nI am exploring new opportunities and ${c} caught my attention. I would be grateful if you could refer me or connect me with the right person.\n\nBest regards,\nMohit Singh\n📞 +91 7982092042 | ✉ mohit310ggn@gmail.com`;
    }
  },
  {
    id: "java1", label: "Java Expert", icon: "🚀", color: "#0369a1",
    build: (name, company) => {
      const n = (name||"there").split(" ")[0];
      const c = company || "your organization";
      return `Hi ${n},\n\nI am Mohit Singh — a Senior Java Developer with 4.8+ years in Spring Boot, Microservices, REST APIs, SQL, and enterprise integrations. I have delivered end-to-end projects for banking clients like Bank Albilad, J&K Bank, and Misr Digital Innovation.\n\nI am exploring opportunities at ${c} and would love to connect. Happy to share my resume!\n\nBest regards,\nMohit Singh\n📞 +91 7982092042 | ✉ mohit310ggn@gmail.com`;
    }
  },
];

const getMsgTemplates = () => {
  const user = getUser();
  if (user?.username === "anav")   return MSG_TEMPLATES_ANAV;
  if (user?.username === "priyal") return MSG_TEMPLATES_PRIYAL;
  if (user?.username === "mohit")  return MSG_TEMPLATES_MOHIT;
  return MSG_TEMPLATES_ANAV;
};
// getMsgTemplates() is computed dynamically via getMsgTemplates()

function loadCustomTemplate() {
  try { return JSON.parse(localStorage.getItem("customEmailTemplate") || "null") || getDefaultTemplate(); }
  catch { return getDefaultTemplate(); }
}


// Local datetime string for datetime-local input and API (no UTC conversion)

// Default schedule time — tomorrow 10:00 AM IST
function defaultScheduleTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalDT(d);
}

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

// ─── Interview Tracker (localStorage based) ──────────────────────────────────
function useInterviews() {
  const [interviews, setInterviews] = useState(() => {
    try { return JSON.parse(localStorage.getItem("em_interviews") || "[]"); }
    catch { return []; }
  });
  const save = (arr) => { setInterviews(arr); localStorage.setItem("em_interviews", JSON.stringify(arr)); };
  const add  = (item) => save([...interviews, { ...item, id: Date.now() }]);
  const del  = (id)   => save(interviews.filter(i => i.id !== id));
  const upd  = (id, patch) => save(interviews.map(i => i.id === id ? { ...i, ...patch } : i));
  return { interviews, add, del, upd };
}

function InterviewTrackerWidget({ onNavigate }) {
  const { interviews, add, del, upd } = useInterviews();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ company:"", role:"", date:"", round:"HR", notes:"" });
  const handle = (k,v) => setForm(p => ({...p, [k]:v}));

  const upcoming = interviews
    .filter(i => i.date && new Date(i.date) >= new Date(Date.now() - 24*60*60*1000))
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);

  const ROUNDS = ["HR", "Technical", "System Design", "Managerial", "Final", "Offer"];
  const roundColor = { HR:"#0d9488", Technical:"#2563eb", "System Design":"#7c3aed", Managerial:"#d97706", Final:"#059669", Offer:"#dc2626" };

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"16px 20px", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14 }}>📅 Interview Tracker</span>
        <button className="btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "✕ Cancel" : "+ Add Interview"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background:"var(--surface-2,#f8fafc)", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <input className="form-input" style={{ fontSize:12 }} placeholder="Company" value={form.company} onChange={e=>handle("company",e.target.value)} />
            <input className="form-input" style={{ fontSize:12 }} placeholder="Role" value={form.role} onChange={e=>handle("role",e.target.value)} />
            <input className="form-input" type="datetime-local" style={{ fontSize:12 }} value={form.date} onChange={e=>handle("date",e.target.value)} />
            <select className="form-select" style={{ fontSize:12 }} value={form.round} onChange={e=>handle("round",e.target.value)}>
              {ROUNDS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <input className="form-input" style={{ fontSize:12 }} placeholder="Notes (optional)" value={form.notes} onChange={e=>handle("notes",e.target.value)} />
          <button className="btn-primary btn-sm" style={{ marginTop:8, fontSize:11 }}
            onClick={() => { if(form.company && form.date){ add(form); setForm({company:"",role:"",date:"",round:"HR",notes:""}); setShowAdd(false); }}}>
            Save Interview
          </button>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div style={{ fontSize:13, color:"var(--text-muted,#64748b)", textAlign:"center", padding:"8px 0" }}>
          No upcoming interviews. Keep applying! 💪
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {upcoming.map(iv => {
            const d = new Date(iv.date);
            const isToday = d.toDateString() === new Date().toDateString();
            const isTomorrow = d.toDateString() === new Date(Date.now()+86400000).toDateString();
            const label = isToday ? "TODAY" : isTomorrow ? "TOMORROW" : d.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
            return (
              <div key={iv.id} style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"8px 12px", borderRadius:8,
                background: isToday ? "#fef3c7" : "var(--surface-2,#f8fafc)",
                border: `1px solid ${isToday ? "#fde068" : "var(--border,#e2e8f0)"}`,
              }}>
                <div style={{ textAlign:"center", minWidth:44 }}>
                  <div style={{ fontSize:10, fontWeight:800, color: isToday ? "#d97706" : "var(--text-muted)" }}>{label}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>{d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{iv.company} <span style={{ fontSize:11, color:"var(--text-muted)" }}>· {iv.role}</span></div>
                  <span style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:99, background:(roundColor[iv.round]||"#6b7280")+"20", color:roundColor[iv.round]||"#6b7280" }}>
                    {iv.round} Round
                  </span>
                  {iv.notes && <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:6 }}>{iv.notes}</span>}
                </div>
                <button onClick={() => del(iv.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:"0 4px" }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashboardPage({ contacts, replies, scheduledJobs, onNavigate }) {
  const currentUser = getUser();

  // ── Gmail Health Alert ──────────────────────────────────────────────────────
  const [gmailAlert, setGmailAlert] = useState(null);
  useEffect(() => {
    axios.get(`${API}/api/gmail/alerts`).then(r => {
      if (r.data.success && r.data.alert) setGmailAlert(r.data.alert);
    }).catch(() => {});
  }, []);
  const dismissAlert = async () => {
    try { await axios.post(`${API}/api/gmail/alerts/clear`); } catch {}
    setGmailAlert(null);
  };
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


  const GmailAlert = () => !gmailAlert ? null : (
    <div style={{
      background:"linear-gradient(135deg,#fee2e2,#fef2f2)", border:"2px solid #fca5a5",
      borderRadius:12, padding:"14px 20px", marginBottom:16,
      display:"flex", alignItems:"center", gap:14, flexWrap:"wrap"
    }}>
      <div style={{ fontSize:28 }}>⚠️</div>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontWeight:800, fontSize:14, color:"#991b1b" }}>Gmail Connection Lost!</div>
        <div style={{ fontSize:12, color:"#7f1d1d", marginTop:2 }}>
          Scheduled emails failing ({gmailAlert.count}x): {gmailAlert.error}
        </div>
      </div>
      <a href={`${API}/api/gmail/auth?username=${currentUser?.username}`}
        target="_blank" rel="noreferrer"
        style={{ padding:"8px 18px", borderRadius:8, background:"#dc2626", color:"#fff", fontWeight:700, fontSize:13, textDecoration:"none" }}>
        🔗 Reconnect Gmail
      </a>
      <button onClick={dismissAlert} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#991b1b" }}>✕</button>
    </div>
  );

  return (
    <div className="page dashboard-page">
      <GmailAlert />
      {/* Welcome + health pill */}
      <div className="dash-welcome">
        <div>
          <h2 className="dash-welcome-title">Welcome back, {currentUser?.displayName?.split(" ")[0] || currentUser?.username} 👋</h2>
          <p className="dash-welcome-sub">Here's your job search at a glance</p>
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

      {/* Smart tip */}
      {(() => {
        const tip = followDue > 5
          ? { icon:"⚡", msg:`${followDue} follow-ups pending — bulk send them now!`, action:"contacts", btn:"Go to Contacts" }
          : replyCount === 0 && totalSent > 10
          ? { icon:"💡", msg:"No replies yet? Try personalizing your email subject line.", action:"ai", btn:"AI Intelligence" }
          : replyCount > 0
          ? { icon:"🎯", msg:`${replyCount} companies replied — follow up now while you're fresh!`, action:"inbox", btn:"Check Inbox" }
          : { icon:"🚀", msg:"Start strong — send 5 applications today to build momentum.", action:"send", btn:"Send Application" };
        return (
          <div style={{
            background:"linear-gradient(135deg,#fef3c7,#fffbeb)", border:"1px solid #fde68a",
            borderRadius:12, padding:"12px 16px", marginBottom:16,
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap"
          }}>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontSize:20 }}>{tip.icon}</span>
              <span style={{ fontSize:13, color:"#92400e", fontWeight:500 }}>{tip.msg}</span>
            </div>
            <button className="btn-ghost btn-sm"
              style={{ fontSize:12, color:"#d97706", borderColor:"#d97706", whiteSpace:"nowrap" }}
              onClick={() => onNavigate(tip.action)}>
              {tip.btn} →
            </button>
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
      <InterviewTrackerWidget onNavigate={onNavigate} />

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
                {c.replied       && <span className="badge" style={{ fontSize:10, background:"#d1fae5", color:"#065f46" }}>↩ Replied</span>}
                {c.opened && !c.replied && <span className="badge badge-opened" style={{ fontSize: 10 }}>👁 Opened</span>}
                {c.needsFollowUp && !c.replied && <span className="badge badge-reminder" style={{ fontSize: 10 }}>⏰ Due</span>}
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
    setTpl(getDefaultTemplate());
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
  const [schedTime, setSchedTime] = useState(() => defaultScheduleTime());
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
    company:           contact.company || "",  // empty = "your organization" in email
    role:              contact.role    || "",
    originalDate:      contact.lastSentAt ? new Date(contact.lastSentAt).toLocaleDateString("en-IN") : "",
    customNote:        "",
    originalMessageId: contact.lastMessageId || contact.originalMessageId || "",
    originalThreadId:  contact.lastThreadId  || contact.originalThreadId  || "",
    originalSubject:   contact.originalSubject || "",
  });
  const [mode, setMode]           = useState("now");
  const [scheduledTime, setSched] = useState(() => defaultScheduleTime());
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
        // Warn if already scheduled
        if (contact?.followupScheduled) {
          const ok = window.confirm(`⚠️ A follow-up for ${contact.company || contact.hrEmail} is already scheduled!\n\nSchedule another one anyway?`);
          if (!ok) { setLoading(false); return; }
        }
        const res = await axios.post(`${API}/api/schedule-email`, { ...form, type: "followup", scheduledTime });
        setStatus({ type: "success", text: res.data.message });
        // Mark contact as followup scheduled
        try {
          await axios.patch(`${API}/api/contact/update`, {
            hrEmail: form.hrEmail, followupScheduled: true
          });
        } catch {}
        onSent && onSent(form.hrEmail);
      } else {
        const res = await axios.post(`${API}/api/send-followup`, form);
        setStatus({ type: "success", text: res.data.message });
        onSent && onSent(form.hrEmail);
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
              <div style={{ position:"relative" }}>
                <input name="originalDate" type="text" value={form.originalDate} onChange={handle}
                  className="form-input" disabled={loading}
                  style={{ paddingRight: form.originalDate ? 28 : 12 }} />
                {form.originalDate && !loading && (
                  <button type="button" onClick={() => setForm(p=>({...p,originalDate:""}))}
                    style={{ position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16,lineHeight:1 }}>
                    ✕
                  </button>
                )}
              </div>
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

// ─── Interview Schedule Modal ─────────────────────────────────────────────────
function InterviewScheduleModal({ contact, onClose, onSaved, addToast }) {
  const ROUNDS = ["R1 Technical","R2 Technical","HR Round","Managerial","System Design","Final Round","Offer Discussion"];
  const [form,   setForm]   = useState({ interviewRound:"", interviewDate:"", priority:"Normal", callLog:"" });
  const [saving, setSaving] = useState(false);
  useLockBodyScroll();

  const save = async () => {
    if (!form.interviewDate) { addToast && addToast("❌ Please select date & time","error"); return; }
    setSaving(true);
    try {
      const r = await axios.post(`${API}/api/interviews`, {
        hrEmail: contact.hrEmail, hrName: contact.hrName||"",
        company: contact.company||"", role: contact.role||"",
        stage:"Interview", interviewRound: form.interviewRound,
        interviewDate: form.interviewDate, priority: form.priority, callLog: form.callLog,
      });
      addToast && addToast(r.data.calendarSynced ? "✅ Scheduled + synced to Google Calendar!" : "✅ Interview scheduled!");
      onSaved && onSaved(); onClose();
    } catch(e) { addToast && addToast("❌ "+(e.response?.data?.message||e.message),"error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="modal-header">
          <div className="modal-title-row"><span>🗓</span><h3 className="modal-title">Schedule Interview</h3></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-scroll">
          <div style={{background:"linear-gradient(135deg,#eff6ff,#f0fdf4)",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13}}>{contact.company||"Company"}</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{contact.hrEmail}{contact.hrName?` · ${contact.hrName}`:""}</div>
            {contact.role&&<div style={{fontSize:12,color:"var(--blue)",marginTop:2}}>📌 {contact.role}</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label" style={{fontSize:11}}>Round</label>
              <select className="form-select" style={{fontSize:13}} value={form.interviewRound} onChange={e=>setForm(p=>({...p,interviewRound:e.target.value}))}>
                <option value="">Select…</option>
                {ROUNDS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label" style={{fontSize:11}}>Priority</label>
              <select className="form-select" style={{fontSize:13}} value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                {["Low","Normal","High","Dream Company"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{marginTop:12}}>
            <label className="form-label" style={{fontSize:11}}>Date & Time <span style={{color:"#dc2626"}}>*</span></label>
            <input type="datetime-local" className="form-input" style={{fontSize:13}} value={form.interviewDate} onChange={e=>setForm(p=>({...p,interviewDate:e.target.value}))} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label" style={{fontSize:11}}>Notes <span style={{fontWeight:400,color:"var(--text-muted)"}}>(optional)</span></label>
            <textarea className="form-textarea" rows={3} style={{fontSize:13}} placeholder="Topics to prepare, dress code, link…" value={form.callLog} onChange={e=>setForm(p=>({...p,callLog:e.target.value}))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving} style={{background:"linear-gradient(135deg,#d97706,#f59e0b)"}}>
            {saving?"Saving…":"🗓 Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Update Modal ──────────────────────────────────────────────────────
function ManualUpdateModal({ contact, onClose, onSaved, addToast }) {
  const STAGES = ["Applied","Opened","Replied","Interview","Offer","Rejected","On Hold"];
  const [stage,    setStage]    = useState(contact?.stage || "Applied");
  const [notes,    setNotes]    = useState(contact?.notes || "");
  const [saving,   setSaving]   = useState(false);
  useLockBodyScroll();

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/contact/update`, {
        hrEmail: contact.hrEmail, stage, notes,
        ...(stage === "Replied" ? { replied: true } : {}),
      });
      addToast && addToast("✅ Contact updated!");
      onSaved && onSaved(); onClose();
    } catch(e) { addToast && addToast("❌ "+(e.response?.data?.message||e.message),"error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-form" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="modal-header">
          <div className="modal-title-row"><span>✏️</span><h3 className="modal-title">Update Contact</h3></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-scroll">
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13}}>
            <strong>{contact?.company||"—"}</strong>
            <span style={{color:"var(--text-muted)",marginLeft:8,fontSize:12}}>{contact?.hrEmail}</span>
          </div>
          <div className="form-group">
            <label className="form-label" style={{fontSize:11}}>Stage</label>
            <DropdownSelect value={stage} onChange={setStage} width="100%"
              options={STAGES.map(s=>({value:s,label:s}))} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label" style={{fontSize:11}}>Notes <span style={{fontWeight:400,color:"var(--text-muted)"}}>(optional)</span></label>
            <textarea className="form-textarea" rows={3} style={{fontSize:13}} placeholder="Add any notes about this contact…" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving?"Saving…":"💾 Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Shared UI Components ─────────────────────────────────────────────────────
function Pagination({ page, total, perPage, onChange }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  const range = [];
  let s = Math.max(1, page - 2), e = Math.min(totalPages, page + 2);
  if (page <= 3) e = Math.min(5, totalPages);
  if (page >= totalPages - 2) s = Math.max(1, totalPages - 4);
  for (let i = s; i <= e; i++) range.push(i);
  const btn = (label, pg, disabled) => (
    <button key={label} onClick={() => !disabled && onChange(pg)} disabled={disabled}
      style={{ minWidth:32, height:32, padding:"0 10px", borderRadius:6, border:"1px solid var(--border)",
        background:"var(--surface)", color: disabled?"var(--text-muted)":"var(--text-700,#374151)",
        cursor:disabled?"not-allowed":"pointer", fontSize:13, fontWeight:500, transition:"all 0.12s" }}>
      {label}
    </button>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"center", padding:"14px 0", flexWrap:"wrap" }}>
      {btn("«", 1, page===1)}
      {btn("‹", page-1, page===1)}
      {s > 1 && <span style={{ color:"var(--text-muted)", padding:"0 4px" }}>…</span>}
      {range.map(p => (
        <button key={p} onClick={() => onChange(p)}
          style={{ minWidth:32, height:32, padding:"0 10px", borderRadius:6, fontSize:13, fontWeight: p===page?700:400,
            border: p===page?"1.5px solid var(--blue)":"1px solid var(--border)",
            background: p===page?"var(--blue)":"var(--surface)",
            color: p===page?"#fff":"var(--text-700,#374151)", cursor:"pointer" }}>
          {p}
        </button>
      ))}
      {e < totalPages && <span style={{ color:"var(--text-muted)", padding:"0 4px" }}>…</span>}
      {btn("›", page+1, page===totalPages)}
      {btn("»", totalPages, page===totalPages)}
      <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:6 }}>{total.toLocaleString()} total</span>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder="Search...", width="100%", autoFocus=false }) {
  return (
    <div style={{ position:"relative", width, flexShrink:0 }}>
      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"var(--text-muted)", pointerEvents:"none" }}>🔍</span>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus}
        style={{ width:"100%", height:36, paddingLeft:32, paddingRight:value?32:10,
          borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)",
          color:"var(--text-700,#374151)", fontSize:13, boxSizing:"border-box",
          outline:"none", transition:"border-color 0.15s" }}
        onFocus={e => e.target.style.borderColor="var(--blue)"}
        onBlur={e => e.target.style.borderColor="var(--border)"} />
      {value && <button onClick={() => onChange("")}
        style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
          background:"none", border:"none", cursor:"pointer", fontSize:14, color:"var(--text-muted)", padding:2, lineHeight:1 }}>✕</button>}
    </div>
  );
}

function DropdownSelect({ value, onChange, options=[], placeholder, width="auto", size="md" }) {
  const h = size==="sm" ? 30 : 36;
  const fs = size==="sm" ? 12 : 13;
  return (
    <div style={{ position:"relative", width, flexShrink:0 }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ appearance:"none", WebkitAppearance:"none", MozAppearance:"none",
          width:"100%", height:h, paddingLeft:10, paddingRight:26,
          borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)",
          color: value?"var(--text-700,#374151)":"var(--text-muted)", fontSize:fs,
          cursor:"pointer", outline:"none", transition:"border-color 0.15s" }}
        onFocus={e => e.target.style.borderColor="var(--blue)"}
        onBlur={e => e.target.style.borderColor="var(--border)"}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
      <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
        pointerEvents:"none", fontSize:9, color:"var(--text-muted)", lineHeight:1 }}>▼</span>
    </div>
  );
}


// ─── Thread Modal — wraps ThreadView in a modal overlay ──────────────────────
function ThreadModal({ messageId, contact, onClose }) {
  useLockBodyScroll();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:700, maxHeight:"85vh", display:"flex", flexDirection:"column" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>💬</span>
            <div>
              <h3 className="modal-title">Email Thread</h3>
              {contact?.company && (
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                  {contact.company}{contact.hrEmail ? ` · ${contact.hrEmail}` : ""}
                </p>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"0 0 16px" }}>
          {messageId
            ? <ThreadView threadId={messageId} onBack={onClose} />
            : <div className="empty-state"><span className="empty-icon">💬</span><p>No thread ID available.</p></div>
          }
        </div>
      </div>
    </div>
  );
}

function HRContactsPage({ contacts, replies, fetchedAt, sheetError, onViewEmail, onFollowUp, onMessage, onRefresh, addToast, onViewThread, onManualUpdate }) {
  const [search,     setSearch]    = useState("");
  const [view,       setView]      = useState("list"); // "list" | "kanban"
  const [activeTab,  setActiveTab] = useState("all");  // filter tab
  const [clearing,   setClearing]  = useState(null);
  const [syncing,    setSyncing]   = useState(false);
  const [contactPage, setContactPage] = useState(1);
  const [perPage,     setPerPage]     = useState(25);
  const [sortBy,      setSortBy]      = useState("recent");
  const [companyFilter, setCompanyFilter] = useState("");
  useEffect(() => { setContactPage(1); }, [search, activeTab, sortBy, companyFilter]);
  const [syncResult, setSyncResult]= useState(null);
  const [bulkModal,  setBulkModal]  = useState(false);

  const [syncModal,  setSyncModal]  = useState(false);
  const [syncParams, setSyncParams] = useState({
    after: new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10),
    before: new Date().toISOString().slice(0,10),
    max: 100,
  });

  const syncGmailSent = async (params) => {
    setSyncing(true); setSyncResult(null); setSyncModal(false);
    try {
      const r = await axios.get(`${API}/api/sync-sent-emails`, {
        params: { after: params.after.replace(/-/g,"/"), before: params.before?.replace(/-/g,"/"), max: params.max },
        timeout: 120000,  // 2 min timeout
      });
      const { inserted, skipped, totalFetched } = r.data;
      setSyncResult({ inserted, skipped, totalFetched });
      addToast && addToast(`✅ Sync done! ${inserted} new, ${skipped} skipped.`);
      onRefresh();
    } catch (e) {
      if (e.code === "ECONNABORTED" || e.message?.includes("timeout"))
        addToast && addToast("⏱ Sync timed out — try with fewer emails (lower max)", "error");
      else
        addToast && addToast("❌ Sync failed: " + (e.response?.data?.message || e.message), "error");
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
    { key: "followup",           icon: "⏰", label: "Follow-up Due",       color: "#d97706" },
    { key: "followup_sent",      icon: "🔁", label: "Follow-up Sent",      color: "#7c3aed" },
    { key: "followup_scheduled", icon: "🗓", label: "Follow-up Scheduled", color: "#2563eb" },
    { key: "opened",        icon: "👁", label: "Opened",        color: "#0d9488" },
    { key: "thread",        icon: "🧵", label: "Has Thread",    color: "#6366f1" },
  ];

  // ── Company list for dropdown ──────────────────────────────────────────────
  const companyList = useMemo(() => {
    const s = new Set(contacts.map(c => c.company).filter(Boolean));
    return Array.from(s).sort();
  }, [contacts]);

  // ── Apply search + tab + company filter + sort ────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = contacts.filter(c => {
      const matchSearch = !q || c.company?.toLowerCase().includes(q)
        || c.hrEmail?.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q)
        || c.hrName?.toLowerCase().includes(q);
      const matchCompany = !companyFilter || c.company === companyFilter;
      const matchTab = (() => {
        if (activeTab === "all")                return true;
        if (activeTab === "replied")            return c.replied || replyEmails.has(c.hrEmail.toLowerCase());
        if (activeTab === "followup")           return c.needsFollowUp && !c.followupScheduled;
        if (activeTab === "followup_sent")      return c.followupSent;
        if (activeTab === "followup_scheduled") return c.followupScheduled && !c.followupSent;
        if (activeTab === "thread")             return !!c.lastMessageId;
        if (activeTab === "opened")             return c.opened;
        return true;
      })();
      return matchSearch && matchCompany && matchTab;
    });
    if (sortBy === "company") list = [...list].sort((a,b)=>(a.company||"").localeCompare(b.company||""));
    else if (sortBy === "opened")  list = [...list].sort((a,b)=>(b.opened?1:0)-(a.opened?1:0));
    else if (sortBy === "replied") list = [...list].sort((a,b)=>(b.replied?1:0)-(a.replied?1:0));
    else list = [...list].sort((a,b)=>new Date(b.lastSentAt||0)-new Date(a.lastSentAt||0));
    return list;
  }, [contacts, search, activeTab, replyEmails, companyFilter, sortBy]);

  const totalFiltered = filtered.length;
  const paginated = filtered.slice((contactPage-1)*perPage, contactPage*perPage);

  const reminders = contacts.filter(c => c.needsFollowUp);

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

      {/* ── Professional Toolbar: Search + Filters + Sort + Per-page ── */}
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
        <div style={{ flex:"1 1 200px", minWidth:160 }}>
          <SearchBar value={search} onChange={v=>{setSearch(v);setContactPage(1);}}
            placeholder="Search company, email, name, role…" width="100%" />
        </div>
        <DropdownSelect value={companyFilter} onChange={v=>{setCompanyFilter(v);setContactPage(1);}}
          placeholder="All Companies" width="160px"
          options={companyList.slice(0,150).map(c=>({value:c,label:c.length>22?c.slice(0,22)+"…":c}))} />
        <DropdownSelect value={sortBy} onChange={setSortBy} width="130px"
          options={[{value:"recent",label:"↓ Recent"},{value:"company",label:"A–Z Company"},{value:"opened",label:"👁 Opened"},{value:"replied",label:"↩ Replied"}]} />
        <DropdownSelect value={String(perPage)} onChange={v=>{setPerPage(Number(v));setContactPage(1);}} width="88px"
          options={[{value:"10",label:"10 / pg"},{value:"25",label:"25 / pg"},{value:"50",label:"50 / pg"},{value:"100",label:"100 / pg"}]} />
        {(search||companyFilter) && (
          <button onClick={()=>{setSearch("");setCompanyFilter("");}} className="btn-ghost btn-sm" style={{fontSize:11,whiteSpace:"nowrap"}}>✕ Clear</button>
        )}
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
            onClick={() => syncing ? null : setSyncModal(true)}
            disabled={syncing}
            title="Fetch sent emails from Gmail"
            style={{ background: "#0d9488", fontSize: 12 }}
          >
            {syncing ? <><span className="spinner" /> Syncing…</> : "📥 Sync Gmail"}
          </button>
          <button className="btn-ghost btn-sm" style={{ fontSize:12 }}
            title="Export contacts as CSV"
            onClick={() => {
              const rows = [
                ["Company","HR Email","HR Name","Role","Last Sent","Total Sent","Replied","Follow-up Due","Notes"],
                ...contacts.map(c => [
                  c.company, c.hrEmail, c.hrName, c.role,
                  c.lastSentAt > 0 ? new Date(c.lastSentAt).toLocaleDateString("en-IN") : "",
                  c.totalSent, c.replied ? "Yes" : "No",
                  c.needsFollowUp ? "Yes" : "No", c.notes || ""
                ])
              ];
              const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""')+'"').join(",")).join("\n");
              const blob = new Blob([csv], { type:"text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = `hr-contacts-${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
              addToast && addToast("CSV exported!");
            }}>
            📊 Export CSV
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
        <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, fontSize:12, color:"var(--text-muted)" }}>
          <span>Showing <strong>{Math.min((contactPage-1)*perPage+1,totalFiltered).toLocaleString()}</strong>–<strong>{Math.min(contactPage*perPage,totalFiltered).toLocaleString()}</strong> of <strong>{totalFiltered.toLocaleString()}</strong></span>
          {totalFiltered !== contacts.length && <span style={{color:"var(--blue)"}}>Filtered from {contacts.length.toLocaleString()} total</span>}
        </div>
        <div className="contacts-list">
          {paginated.map((c, i) => (
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
                  {/* Phone + Stage from MongoDB */}
                  {(() => {
                    const sc = { "Offer Received":"#059669","Final Round":"#7c3aed","Technical":"#2563eb","HR Round":"#0d9488","Shortlisted":"#d97706","Rejected":"#dc2626" };
                    return (<>
                      {c.phone && <a href={`tel:${c.phone}`} onClick={e=>e.stopPropagation()} style={{ marginLeft:6,fontSize:12,textDecoration:"none" }} title={c.phone}>📞</a>}
                      {c.stage && c.stage!=="Applied" && <span style={{ marginLeft:5,fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,background:(sc[c.stage]||"#6b7280")+"20",color:sc[c.stage]||"#6b7280" }}>{c.stage}</span>}
                      {c.priority==="Hot 🔥" && <span style={{ marginLeft:4,fontSize:12 }}>🔥</span>}
                      {c.interviewDate && new Date(c.interviewDate)>new Date() && <span style={{ marginLeft:5,fontSize:10,color:"#7c3aed",fontWeight:700 }}>📅 {new Date(c.interviewDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>}
                    </>);
                  })()}
                </p>

                {/* Row 3: Meta info chips */}
                <div className="contact-meta" style={{ flexWrap:"wrap", gap:4 }}>
                  {c.lastSentAt > 0 && (
                    <span style={{ fontSize:11, color:"var(--text-muted,#6b7280)" }}>
                      📤 {new Date(c.lastSentAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                    </span>
                  )}
                  {c.needsFollowUp && !c.replied && (
                    <span style={{ fontSize:11, color:"#d97706", fontWeight:700 }}>
                      · {Math.floor((Date.now()-c.lastSentAt)/(1000*60*60*24))}d no reply
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
        <Pagination page={contactPage} total={totalFiltered} perPage={perPage} onChange={setContactPage} />
        </>
      )}
    </div>

    {bulkModal && (
      <BulkFollowUpModal
        contacts={contacts}
        onClose={() => setBulkModal(false)}
        addToast={addToast}
      />
    )}

    {syncModal && (
      <div className="modal-overlay" onClick={() => setSyncModal(false)}>
        <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
          <div className="modal-header">
            <div className="modal-title-row">
              <span>📥</span>
              <h3 className="modal-title">Sync Gmail Sent</h3>
            </div>
            <button className="modal-close" onClick={() => setSyncModal(false)}>✕</button>
          </div>
          <div className="modal-scroll">
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

              {/* Date Range */}
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">📅 Date Range</label>

                {/* Quick presets */}
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  {[
                    { label:"Last 7d",   days:7   },
                    { label:"Last 30d",  days:30  },
                    { label:"Last 3mo",  days:90  },
                    { label:"Last 6mo",  days:180 },
                    { label:"This year", days:365 },
                  ].map(({ label, days }) => {
                    const from = new Date(Date.now()-days*24*60*60*1000).toISOString().slice(0,10);
                    const to   = new Date().toISOString().slice(0,10);
                    const active = syncParams.after === from && syncParams.before === to;
                    return (
                      <button key={days} type="button" className="chip"
                        style={{ fontSize:11, padding:"3px 10px",
                          background: active ? "var(--blue)" : undefined,
                          color: active ? "#fff" : undefined,
                          borderColor: active ? "var(--blue)" : undefined }}
                        onClick={() => setSyncParams(p => ({ ...p, after: from, before: to }))}>
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* From — To pickers */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", gap:8 }}>
                  <div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4, fontWeight:600 }}>FROM</div>
                    <input type="date" className="form-input" style={{ fontSize:13 }}
                      value={syncParams.after}
                      max={syncParams.before}
                      onChange={e => setSyncParams(p => ({ ...p, after: e.target.value }))} />
                  </div>
                  <div style={{ color:"var(--text-muted)", fontSize:18, paddingTop:20 }}>→</div>
                  <div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4, fontWeight:600 }}>TO</div>
                    <input type="date" className="form-input" style={{ fontSize:13 }}
                      value={syncParams.before}
                      min={syncParams.after}
                      max={new Date().toISOString().slice(0,10)}
                      onChange={e => setSyncParams(p => ({ ...p, before: e.target.value }))} />
                  </div>
                </div>

                {/* Days count */}
                {syncParams.after && syncParams.before && (
                  <div style={{ marginTop:6, fontSize:11, color:"var(--text-muted)", textAlign:"center" }}>
                    {Math.round((new Date(syncParams.before)-new Date(syncParams.after))/(1000*60*60*24))} days selected
                  </div>
                )}
              </div>

              {/* Max emails */}
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">
                  📊 Max emails to fetch
                  <span style={{ marginLeft:8, fontWeight:400, fontSize:11, color:"var(--text-muted)" }}>
                    (lower = faster)
                  </span>
                </label>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <input type="range" min={10} max={500} step={10}
                    value={syncParams.max}
                    onChange={e => setSyncParams(p => ({ ...p, max: +e.target.value }))}
                    style={{ flex:1 }} />
                  <span style={{ fontWeight:700, fontSize:15, minWidth:36, color:"var(--blue)" }}>
                    {syncParams.max}
                  </span>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  {[50, 100, 200, 500].map(n => (
                    <button key={n} type="button" className="chip"
                      style={{ fontSize:11, padding:"3px 10px",
                        background: syncParams.max===n ? "var(--blue)" : undefined,
                        color: syncParams.max===n ? "#fff" : undefined }}
                      onClick={() => setSyncParams(p => ({ ...p, max: n }))}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning for large fetch */}
              {syncParams.max > 200 && (
                <div style={{ background:"#fef9c3", border:"1px solid #fde047", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#713f12" }}>
                  ⚠️ Fetching {syncParams.max} emails may take 2-3 minutes. Start with 100 first.
                </div>
              )}

              <div style={{ fontSize:12, color:"var(--text-muted)", background:"var(--surface-2)", borderRadius:8, padding:"8px 12px" }}>
                📅 <strong>{syncParams.after}</strong> → <strong>{syncParams.before}</strong> · Max: <strong>{syncParams.max} emails</strong>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-ghost" onClick={() => setSyncModal(false)}>Cancel</button>
            <button className="btn-primary"
              style={{ background:"linear-gradient(135deg,#0d9488,#059669)" }}
              onClick={() => syncGmailSent(syncParams)}>
              📥 Start Sync
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}

// ─── Send Application Page ────────────────────────────────────────────────────
function SendApplicationPage({ onContactsRefresh, prefill, onPrefillConsumed, addToast, contacts = [] }) {
  const [form, setForm]           = useState({ hrEmail: "", hrName: "", company: "", role: "", customNote: "" });

  // ── AI Writer State ────────────────────────────────────────────────────────
  const [aiDrawer,    setAiDrawer]    = useState(false);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiTone,      setAiTone]      = useState("professional");
  const [aiKeyPoints, setAiKeyPoints] = useState("");
  const [aiSubjects,  setAiSubjects]  = useState([]);
  const [aiBody,      setAiBody]      = useState("");

  const generateAiEmail = async () => {
    setAiLoading(true); setAiBody(""); setAiSubjects([]);
    try {
      const [emailRes, subjectRes] = await Promise.all([
        axios.post(`${API}/api/ai/write-email`, {
          hrName: form.hrName, company: form.company,
          role: form.role, templateType: templateId,
          tone: aiTone, keyPoints: aiKeyPoints,
        }),
        axios.post(`${API}/api/ai/write-subject`, {
          hrName: form.hrName, company: form.company,
          role: form.role, templateType: templateId,
        }),
      ]);
      if (emailRes.data.success)   setAiBody(emailRes.data.emailBody);
      if (subjectRes.data.success) setAiSubjects(subjectRes.data.subjects || []);
    } catch(e) {
      console.error("AI error:", e.message);
    } finally { setAiLoading(false); }
  };

  const applyAiEmail = () => {
    if (aiBody) setForm(p => ({ ...p, customNote: aiBody }));
    setAiDrawer(false);
  };

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
  const [scheduledTime, setSched] = useState(() => defaultScheduleTime());
  const [autoSend, setAutoSend]   = useState(true);  // true = auto-send at time, false = email reminder only
  const [readReceipt, setRR]      = useState(false);
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);
  const [dupModal, setDupModal]   = useState(null);
  const [previewHtml, setPreview] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [customTpl, setCustomTpl] = useState(loadCustomTemplate);
  const pendingPayload = useRef(null);

  // Core autofill logic — shared between onChange and onPaste
  // Extract a readable first name from email prefix
  // e.g. divya.kg@... → "Divya", hr.recruiter@... → "Hr", priya_sharma@... → "Priya"
  const nameFromEmail = (email) => {
    const prefix = email.split("@")[0] || "";
    // Skip generic prefixes that aren't real names
    const generic = ["hr","recruiter","hiring","talent","careers","jobs","noreply","info",
      "contact","admin","recruitment","apply","team","hello","support","hrd"];
    const firstPart = prefix.split(/[._\-+]/)[0].toLowerCase();
    if (!firstPart || generic.includes(firstPart) || firstPart.length < 2) return "";
    // Only use if it looks like a name (letters only, not pure numbers)
    if (!/^[a-z]+$/.test(firstPart)) return "";
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  };

  const autofillFromEmail = (email) => {
    // ALWAYS reset name/company/role first, then fill from contacts or domain
    const updates = { hrName: "", company: "", role: "" };

    if (!email) return updates;

    const matched = contacts.find(c => c.hrEmail?.toLowerCase() === email.toLowerCase());
    if (matched) {
      // Exact contact match — fill all available fields
      if (matched.hrName)  updates.hrName  = matched.hrName;
      if (matched.company) updates.company = matched.company;
      if (matched.role)    updates.role    = matched.role;
    } else if (email.includes("@")) {
      // No contact match — derive company from domain + name from email prefix
      const domain = email.split("@")[1] || "";
      const generic = ["gmail.com","yahoo.com","hotmail.com","outlook.com","rediffmail.com",
        "naukri.com","linkedin.com","indeed.com","shine.com","monsterindia.com","iimjobs.com"];
      if (domain && !generic.includes(domain)) {
        const parts = domain.split(".");
        const co = parts[parts.length > 2 ? parts.length-2 : 0] || "";
        if (co) updates.company = co.charAt(0).toUpperCase() + co.slice(1).toLowerCase();
      }
      // Guess HR first name from email prefix (best-effort)
      const guessedName = nameFromEmail(email);
      if (guessedName) updates.hrName = guessedName;
    }
    return updates;
  };

  const handle = e => {
    const { name, value } = e.target;
    setForm(p => {
      const updated = { ...p, [name]: value };
      if (name === "hrEmail") {
        // Clear + re-autofill on every email change
        Object.assign(updated, autofillFromEmail(value));
      }
      return updated;
    });
    setStatus(null);
  };

  // Handle paste on email field
  const handleEmailPaste = e => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const email  = pasted.trim();
    if (!email) return;
    setTimeout(() => {
      setForm(p => ({ ...p, hrEmail: email, ...autofillFromEmail(email) }));
      setStatus(null);
    }, 0);
  };
  const buildPayload = useCallback(() => {
    const tpl = customTpl || getDefaultTemplate();
    return {
      ...form,
      templateType: BACKEND_TEMPLATE_MAP[templateId] || "fullstack",
      readReceipt,
      headerTheme: tpl.headerTheme || "blue",
      customIntro: tpl.customIntro || undefined,
      customHighlights: tpl.highlights?.length ? tpl.highlights : undefined,
    };
  }, [form, templateId, readReceipt, customTpl]);

  const doSend = useCallback(async (payload) => {
    setLoading(true); setStatus(null);
    try {
      if (mode === "schedule") {
        if (!scheduledTime) throw new Error("Choose a date and time.");
        const res = await axios.post(`${API}/api/schedule-email`, { ...payload, scheduledTime, autoSend });
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
  const activeTemplate = getEmailTemplates().find(t => t.id === templateId);

  const selectTemplate = (t) => {
    setTemplateId(t.id);
    setCustomTpl(null); // reset any custom overrides when switching template
  };

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
        {getEmailTemplates().map(t => (
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
      {customTpl && (customTpl.customIntro || customTpl.headerTheme !== "blue") && (
        <div className="custom-tpl-badge">
          🎨 Custom template active —
          <span style={{ color: HEADER_THEMES.find(h => h.id === customTpl?.headerTheme)?.color }}>
            {" "}{customTpl?.headerTheme} header
          </span>
          {customTpl?.customIntro && ", custom intro"}
          <button className="tpl-reset-link" onClick={() => {
            setCustomTpl(getDefaultTemplate());
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
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button type="button" onClick={() => setAutoSend(true)}
                style={{ flex:1, padding:"8px 12px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                  border: autoSend ? "1.5px solid #7c3aed" : "1px solid var(--border)",
                  background: autoSend ? "#7c3aed18" : "var(--surface)", color: autoSend ? "#7c3aed" : "var(--text-muted)" }}>
                ⚡ Auto-send at this time
              </button>
              <button type="button" onClick={() => setAutoSend(false)}
                style={{ flex:1, padding:"8px 12px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                  border: !autoSend ? "1.5px solid #d97706" : "1px solid var(--border)",
                  background: !autoSend ? "#d9770618" : "var(--surface)", color: !autoSend ? "#d97706" : "var(--text-muted)" }}>
                ✋ Just remind me, I'll send manually
              </button>
            </div>
            {autoSend && (
              <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:6 }}>
                ✅ If you already applied here before, it'll auto-pause and email you instead of sending again.
              </p>
            )}
            {!autoSend && (
              <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:6 }}>
                You'll get an email reminder at the scheduled time — go to Scheduled → Reminders tab and tap Send Now.
              </p>
            )}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="ap-email"><span className="lbadge">Required</span> HR / Recruiter Email</label>
            <input id="ap-email" name="hrEmail" type="email" value={form.hrEmail} onChange={handle} onPaste={handleEmailPaste}
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
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button type="button"
                onClick={() => setAiDrawer(true)}
                style={{
                  padding:"5px 12px", borderRadius:99, fontSize:11, fontWeight:700,
                  background:"linear-gradient(135deg,#7c3aed,#2563eb)",
                  color:"#fff", border:"none", cursor:"pointer"
                }}>
                ✨ AI Write
              </button>
              <button type="button" className="btn-preview" onClick={openPreview}>View Full Email ↗</button>
            </div>
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

  const [replyText, setReplyText] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [sent,      setSent]      = useState(false);
  const [profile,   setProfile]   = useState({ ...getHRProfile() });
  const [editProfile, setEditProfile] = useState(false);
  useLockBodyScroll();

  // ── Auto-generate AI reply on modal open ─────────────────────────────────
  useEffect(() => {
    generateReply();
  }, []);

  const generateReply = async () => {
    setAiLoading(true);
    const rUser  = getUser();
    const rName  = rUser?.displayName || "Anav Bansal";
    const rPhone = rUser?.phone || (rUser?.username === "anav" ? "+91 7827855635" : "+91 7665941798");
    const rEmail = rUser?.profileEmail || (rUser?.username === "anav" ? "anavbansal06@gmail.com" : "");
    const rLi    = rUser?.linkedinUrl  || (rUser?.username === "anav" ? "linkedin.com/in/anavbansal-51b191162" : "");
    const pf     = { ...getHRProfile(), ...profile };

    // Build the profile context string (all candidate details)
    const profileContext = `Candidate Name: ${rName}
Key Skills: ${pf.keySkills}
Total Experience: ${pf.totalExp}
Relevant Experience: ${pf.relevantExp}
Current Company: ${pf.currentCompany}
Notice Period / LWD: ${pf.noticePeriod}
Current CTC: ${pf.currentCTC}
Expected CTC: ${pf.expectedCTC}
Offer in Hand: ${pf.offerInHand || "No"}
Reason for Change: ${pf.reasonForChange}
Current Location: ${pf.currentLocation}
Preferred Location: ${pf.preferredLocation}
Contact: ${rPhone} | ${rEmail}
LinkedIn: ${rLi}`;

    // The actual HR email content for AI to analyze
    const hrEmailContent = `Subject: ${message.subject || ""}
From: ${hrName || fromEmail}
Body snippet: ${message.snippet || ""}`;

    try {
      const r = await axios.post(`${API}/api/ai/chat`, {
        tool: "screening",
        message: `Here is the HR email I received:

${hrEmailContent}

Here is my complete profile:

${profileContext}

Write a professional reply that ONLY answers what the HR specifically asked for. Do not dump all profile fields — only include the details relevant to their questions. If they asked for notice period and CTC, only give those. If they asked for skills and experience, only answer that. Address HR by name "${hrName || "there"}" and sign off as ${rName} with phone ${rPhone}. Keep it concise and professional. Plain text only, no markdown.`,
        history: [],
      });
      if (r.data.success && r.data.reply) {
        setReplyText(r.data.reply);
      } else {
        // Fallback to smart template if AI fails
        setReplyText(buildScreeningReply(hrName));
      }
    } catch {
      setReplyText(buildScreeningReply(hrName));
    } finally {
      setAiLoading(false);
    }
  };

  const send = async () => {
    if (!replyText.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${API}/api/gmail/reply`, {
        threadId:  message.threadId,
        messageId: message.id,
        to:        fromEmail,
        subject:   message.subject,
        body:      replyText,
      });
      setSent(true);
      addToast && addToast("✅ Reply sent!");
      setTimeout(onClose, 1500);
    } catch {
      addToast && addToast("❌ Failed to send", "error");
    } finally { setLoading(false); }
  };

  const profileFields = [
    { key: "keySkills",        label: "Key Skills",          wide: true },
    { key: "totalExp",         label: "Total Experience" },
    { key: "relevantExp",      label: "Relevant Experience" },
    { key: "currentCompany",   label: "Current Company" },
    { key: "reasonForChange",  label: "Reason for Change" },
    { key: "noticePeriod",     label: "Notice Period / LWD" },
    { key: "currentCTC",       label: "Current CTC" },
    { key: "offerInHand",      label: "Offer in Hand" },
    { key: "expectedCTC",      label: "Expected CTC" },
    { key: "currentLocation",  label: "Current Location" },
    { key: "preferredLocation",label: "Preferred Location" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span>✨</span>
            <div>
              <h3 className="modal-title">AI Screening Reply</h3>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                Replying to {hrName || fromEmail} · {message.subject?.slice(0,50)}
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-scroll" style={{ maxHeight:"70vh" }}>
          {/* HR Email Preview */}
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12 }}>
            <div style={{ fontWeight:700, color:"var(--text-700,#374151)", marginBottom:4 }}>📩 HR's Email</div>
            <div style={{ color:"var(--text-muted)", lineHeight:1.6 }}>{message.snippet || "(No preview available)"}</div>
          </div>

          {/* AI generating */}
          {aiLoading ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"var(--text-muted)" }}>
              <div style={{ fontSize:24, marginBottom:8 }}>✨</div>
              <div style={{ fontSize:13, fontWeight:600 }}>AI is reading their email and crafting a reply…</div>
              <div style={{ fontSize:11, marginTop:4 }}>Only answering what they actually asked</div>
            </div>
          ) : (
            <>
              {/* Generated reply */}
              <div className="form-group">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <label className="form-label" style={{ margin:0, fontSize:12 }}>Your Reply</label>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn-ghost btn-sm" style={{ fontSize:11 }}
                      onClick={() => setEditProfile(p => !p)}>
                      {editProfile ? "✕ Close Profile" : "✏️ Edit Profile"}
                    </button>
                    <button className="btn-ghost btn-sm" style={{ fontSize:11, color:"#7c3aed", borderColor:"#7c3aed" }}
                      onClick={generateReply} disabled={aiLoading}>
                      ✨ Regenerate
                    </button>
                  </div>
                </div>
                <textarea className="form-textarea" rows={12} style={{ fontSize:13, fontFamily:"inherit" }}
                  value={replyText} onChange={e => setReplyText(e.target.value)} />
              </div>

              {/* Profile editor (collapsible) */}
              {editProfile && (
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                  <div style={{ fontWeight:700, fontSize:12, marginBottom:10, color:"var(--blue)" }}>
                    ✏️ Edit Profile Details
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {profileFields.map(f => (
                      <div key={f.key} className="form-group" style={{ marginBottom:0, gridColumn: f.wide ? "1 / -1" : undefined }}>
                        <label className="form-label" style={{ fontSize:10 }}>{f.label}</label>
                        <input className="form-input" style={{ fontSize:12 }}
                          value={profile[f.key] || ""}
                          onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <button className="btn-primary btn-sm" style={{ marginTop:10 }} onClick={generateReply}>
                    ✨ Re-generate with updated profile
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={loading || aiLoading || sent || !replyText.trim()}>
            {sent ? "✅ Sent!" : loading ? "Sending…" : "📤 Send Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}


function InboxPage({ contacts = [], onFollowUp, addToast }) {
  const [activeTab,       setActiveTab]       = useState("inbox"); // "inbox" | "sent"
  const [messages,        setMessages]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingMore,     setLoadingMore]      = useState(false);
  const [searchQuery,     setSearchQuery]      = useState("");
  const [nextPageToken,   setNextPage]         = useState(null);
  const [activeThread,    setActiveThread]     = useState(null);
  const [screeningModal,  setScreeningModal]   = useState(null); // message to auto-reply
  const [interviewModal,  setInterviewModal]   = useState(null); // contact for interview scheduling

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

  const handleInterview = (m) => {
    const emailStr = activeTab === "sent" ? m.to : m.from;
    const email    = extractEmail(emailStr);
    const matched  = contacts.find(c => c.hrEmail.toLowerCase() === email.toLowerCase());
    setInterviewModal(matched || { hrEmail: email, hrName: displayName(emailStr), company: "", role: "" });
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
        <button type="button" className="btn-ghost btn-sm" title="Sync replies from Gmail to HR Contacts"
          style={{ color:"#059669", borderColor:"#059669", whiteSpace:"nowrap" }}
          onClick={async () => {
            try {
              const r = await axios.get(`${API}/api/resync-replies`);
              addToast && addToast(`✅ ${r.data.newReplies} new repl${r.data.newReplies===1?"y":"ies"} found`);
              if (r.data.newReplies > 0) window.location.reload();
            } catch(e) { addToast && addToast("❌ Sync failed: " + (e.response?.data?.message || e.message), "error"); }
          }}>↺ Sync Replies</button>
      </form>

      {/* Job keyword shortcuts — inbox only */}
      {!isSent && (
        <div style={{ marginBottom:14 }}>
          <DropdownSelect
            value=""
            onChange={v => { const kw = JOB_KEYWORDS.find(k => k.label === v); if (kw) applyKeyword(kw); }}
            placeholder="🔍 Quick filters..."
            width="220px"
            options={JOB_KEYWORDS.map(kw => ({ value: kw.label, label: kw.label }))}
          />
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
                    <button
                      className="btn-ghost btn-sm"
                      title="Schedule Interview"
                      style={{ fontSize:11, color:"#d97706", borderColor:"#d97706", whiteSpace:"nowrap" }}
                      onClick={e => { e.stopPropagation(); handleInterview(m); }}
                    >
                      🗓 Interview
                    </button>
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

      {/* Interview Schedule Modal */}
      {interviewModal && (
        <InterviewScheduleModal
          contact={interviewModal}
          onClose={() => setInterviewModal(null)}
          onSaved={() => {}}
          addToast={addToast}
        />
      )}
    </div>
  );
}

// ─── Messages Page (LinkedIn + WhatsApp generator, standalone) ───────────────
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
    }).catch(()=>{});
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
    }).catch(()=>{});
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
    {/* AI Writer Drawer */}
    {aiDrawer && (
      <div className="modal-overlay" onClick={() => setAiDrawer(false)}>
        <div className="modal-box modal-box-form" onClick={e => e.stopPropagation()} style={{ maxWidth:520 }}>
          <div className="modal-header">
            <div className="modal-title-row">
              <h3 className="modal-title">✨ AI Email Writer</h3>
            </div>
            <button className="modal-close" onClick={() => setAiDrawer(false)}>✕</button>
          </div>
          <div className="modal-scroll">
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:"linear-gradient(135deg,#7c3aed18,#2563eb18)", borderRadius:10, padding:"10px 14px", fontSize:12, color:"var(--text-muted)" }}>
                ✨ AI will write a personalized email based on your profile and the HR details above.
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Tone</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {["professional","confident","friendly","concise"].map(t => (
                    <button key={t} type="button" onClick={() => setAiTone(t)}
                      style={{ padding:"5px 14px", borderRadius:99, fontSize:12, fontWeight:600, cursor:"pointer", border:"1.5px solid",
                        borderColor:aiTone===t?"#7c3aed":"var(--border)", background:aiTone===t?"#7c3aed18":"var(--surface)", color:aiTone===t?"#7c3aed":"var(--text-muted)" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Key points <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:400 }}>(optional)</span></label>
                <textarea className="form-textarea" rows={2} style={{ fontSize:13 }}
                  placeholder="e.g. I built a similar product..." value={aiKeyPoints} onChange={e => setAiKeyPoints(e.target.value)} />
              </div>
              <button onClick={generateAiEmail} disabled={aiLoading}
                style={{ padding:"11px 20px", borderRadius:10, fontWeight:700, fontSize:14, background:"linear-gradient(135deg,#7c3aed,#2563eb)", color:"#fff", border:"none", cursor:aiLoading?"not-allowed":"pointer", opacity:aiLoading?0.7:1, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                {aiLoading ? <><span className="spinner"/> Generating…</> : "✨ Generate Email"}
              </button>
              {aiBody && (
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">✅ Generated Email <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:400 }}>(editable)</span></label>
                  <textarea rows={7} className="form-textarea" style={{ fontSize:13 }} value={aiBody} onChange={e => setAiBody(e.target.value)} />
                </div>
              )}
              {aiSubjects.length > 0 && (
                <div>
                  <label className="form-label">📌 Subject Suggestions</label>
                  {aiSubjects.map((s,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", border:"1px solid var(--border)", borderRadius:8, marginBottom:6, fontSize:13 }}>
                      <span style={{ flex:1 }}>{s}</span>
                      <button onClick={() => { navigator.clipboard?.writeText(s); }} style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, cursor:"pointer", fontSize:11, padding:"2px 8px", color:"var(--blue)", flexShrink:0 }}>Copy</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {aiBody && (
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setAiDrawer(false)}>Cancel</button>
              <button className="btn-primary" style={{ background:"linear-gradient(135deg,#7c3aed,#2563eb)" }} onClick={applyAiEmail}>✅ Use This Email</button>
            </div>
          )}
        </div>
      </div>
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
  const [msg,    setMsg]    = useState(() => getMsgTemplates()[0].build(connection.name, connection.company));
  const [copied, setCopied] = useState(false);
  useLockBodyScroll();

  const applyTemplate = (tplId) => {
    const tpl = getMsgTemplates().find(t => t.id === tplId);
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
            {getMsgTemplates().map(tpl => (
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
  const [liPage,  setLiPage]  = useState(1);
  const [liPer,   setLiPer]   = useState(24);
  const [liSort,  setLiSort]  = useState("recent");
  useEffect(() => { setLiPage(1); }, [search, filter, liSort]);

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

      {/* Filter chips + Sort + Per-page */}
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
        <div className="chip-row" style={{ margin:0, flex:1, flexWrap:"wrap" }}>
          {LI_FILTERS.map(f => (
            <button key={f.key} type="button"
              className={`chip ${filter === f.key ? "chip-active" : ""}`}
              onClick={() => { applyFilter(f.key); setLiPage(1); }}>{f.label}</button>
          ))}
        </div>
        <DropdownSelect value={liSort} onChange={setLiSort} width="130px" size="sm"
          options={[{value:"recent",label:"↓ Recent"},{value:"name",label:"A–Z Name"},{value:"company",label:"A–Z Co"}]} />
        <DropdownSelect value={String(liPer)} onChange={v=>{setLiPer(Number(v));setLiPage(1);}} width="82px" size="sm"
          options={[{value:"12",label:"12/pg"},{value:"24",label:"24/pg"},{value:"48",label:"48/pg"}]} />
      </div>
      {!loading && <p className="li-count" style={{marginBottom:6}}>
        {connections.length.toLocaleString()} connections · showing {Math.min((liPage-1)*liPer+1,connections.length)}–{Math.min(liPage*liPer,connections.length)}
      </p>}

      {/* Grid */}
      {connections.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔗</span>
          <p>{loading ? "Loading connections…" : "No connections found. Try a different search or filter."}</p>
        </div>
      ) : (<>
        <div className="li-grid">
          {[...connections].sort((a,b)=>liSort==="name"?(a.name||"").localeCompare(b.name||""):liSort==="company"?(a.company||"").localeCompare(b.company||""):0).slice((liPage-1)*liPer,liPage*liPer).map((c, i) => (
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
        <Pagination page={liPage} total={connections.length} perPage={liPer} onChange={setLiPage} />
      </>)}
    </div>

    {/* Modals */}
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
function ScheduledPage({ addToast }) {
  const [jobs,      setJobs]      = useState([]);
  const [now,       setNow]       = useState(Date.now());
  const [tab,       setTab]       = useState("pending");
  const [retrying,  setRetrying]  = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [sendingId,  setSendingId]  = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const countdown = (scheduledTime) => {
    const diff = new Date(scheduledTime + "+05:30").getTime() - now;
    if (diff <= 0) return "🔄 Due now";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `📅 ${Math.floor(h/24)}d ${h%24}h`;
    if (h > 0)  return `⏰ ${h}h ${m}m`;
    return `⏰ ${m}m`;
  };

  const fetchJobs = () => axios.get(`${API}/api/scheduled-emails`).then(r => setJobs(r.data.jobs || [])).catch(() => {});
  useEffect(() => { fetchJobs(); }, []);

  const remove = async id => {
    try {
      await axios.delete(`${API}/api/scheduled-emails/${id}`);
      setJobs(p => p.filter(j => j.jobId !== id));
    } catch(e) { addToast && addToast("❌ Failed to cancel: " + (e.response?.data?.message || e.message), "error"); }
  };

  const retryOne = async id => {
    setRetryingId(id);
    try {
      const r = await axios.post(`${API}/api/scheduled-emails/${id}/retry`);
      if (r.data.success) {
        addToast && addToast("✅ Email sent!");
        setJobs(p => p.filter(j => j.jobId !== id));
      }
    } catch(e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
      fetchJobs();
    } finally { setRetryingId(null); }
  };

  const sendNow = async id => {
    setSendingId(id);
    try {
      const r = await axios.post(`${API}/api/scheduled-emails/${id}/send-now`);
      if (r.data.success) {
        addToast && addToast("✅ " + r.data.message);
        setJobs(p => p.filter(j => j.jobId !== id));
      }
    } catch(e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
    } finally { setSendingId(null); }
  };

  const retryAllFailed = async () => {
    setRetrying(true);
    try {
      const r = await axios.post(`${API}/api/scheduled-emails/retry-all-failed`);
      if (r.data.success) {
        addToast && addToast(`✅ ${r.data.message}`);
        fetchJobs();
      }
    } catch(e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
    } finally { setRetrying(false); }
  };

  const pending = jobs.filter(j => j.status === "pending");
  const held    = jobs.filter(j => j.status === "held");
  const failed  = jobs.filter(j => j.status === "failed");

  const TABS = [
    { id:"pending", label:`🗓 Auto-send (${pending.length})` },
    { id:"held",    label:`✋ Reminders (${held.length})` },
    { id:"failed",  label:`⚠️ Failed (${failed.length})` },
  ];

  const list = tab === "pending" ? pending : tab === "held" ? held : failed;

  return (
    <div className="page">
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding:"7px 16px", borderRadius:99, fontSize:12, fontWeight:600, cursor:"pointer",
              border:"1.5px solid", borderColor: tab===t.id ? "var(--blue)" : "var(--border)",
              background: tab===t.id ? "var(--blue)" : "var(--surface)",
              color: tab===t.id ? "#fff" : "var(--text-muted)"
            }}>
            {t.label}
          </button>
        ))}
        {tab === "failed" && failed.length > 0 && (
          <button onClick={retryAllFailed} disabled={retrying}
            style={{
              marginLeft:"auto", padding:"7px 16px", borderRadius:99, fontSize:12, fontWeight:700, cursor:retrying?"not-allowed":"pointer",
              background:"linear-gradient(135deg,#059669,#10b981)", color:"#fff", border:"none", opacity:retrying?0.7:1
            }}>
            {retrying ? "Retrying..." : `🔄 Retry All Failed (${failed.length})`}
          </button>
        )}
      </div>

      {tab === "held" && held.length > 0 && (
        <div style={{ background:"#fef9c3", border:"1px solid #fde047", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#713f12" }}>
          ✋ <strong>Manual reminders</strong> are emails you chose to send yourself. <strong>Auto-paused</strong> ones were stopped because you'd already applied to that contact — review and tap <strong>Send Now</strong> if you still want to send, or delete.
        </div>
      )}

      {list.length === 0
        ? <div className="empty-state">
            <span className="empty-icon">{tab==="pending"?"🗓":tab==="held"?"✋":"✅"}</span>
            <p>{tab==="pending" ? "No emails set to auto-send." : tab==="held" ? "No manual reminders set." : "No failed emails — all good!"}</p>
          </div>
        : <div className="contacts-list">
            {list.map(job => (
              <div key={job.jobId} className="contact-card">
                <div className="contact-avatar" style={{ background: tab==="failed" ? "#dc2626" : tab==="held" ? (job.holdReason==="duplicate"?"#dc2626":"#d97706") : "#7c3aed" }}>
                  {tab==="failed" ? "⚠️" : tab==="held" ? (job.holdReason==="duplicate"?"⏸":"✋") : "🗓"}
                </div>
                <div className="contact-body">
                  <div className="contact-top">
                    <span className="contact-company">{job.emailData.company}</span>
                    <span className={`badge ${tab==="failed"?"badge-failed":"badge-scheduled"}`}
                      style={tab==="failed"?{background:"#fee2e2",color:"#991b1b"}
                        : tab==="held" && job.holdReason==="duplicate" ? {background:"#fee2e2",color:"#991b1b"}
                        : tab==="held" ? {background:"#fef3c7",color:"#92400e"} : {}}>
                      {tab==="failed" ? "Failed" : tab==="held" ? (job.holdReason==="duplicate"?"Auto-paused":"Manual") : "Auto-send"}
                    </span>
                  </div>
                  <p className="contact-email">{job.emailData.hrEmail}</p>
                  {tab==="held" && job.holdReason==="duplicate" && (
                    <p style={{ fontSize:11, color:"#dc2626", marginTop:2 }}>⏸ Already applied to this contact — paused to avoid a duplicate send</p>
                  )}
                  <div className="contact-meta">
                    {tab==="failed" ? (
                      <span style={{ color:"#dc2626", fontSize:12 }}>❌ {job.error || "Unknown error"}</span>
                    ) : (<>
                      <span>📅 {new Date(job.scheduledTime + "+05:30").toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" })}</span>
                      <span style={{ color: tab==="held" ? "#d97706" : "var(--blue)", fontWeight:600 }}>{countdown(job.scheduledTime)}</span>
                    </>)}
                  </div>
                </div>
                <div className="contact-actions">
                  {tab==="failed" && (
                    <button className="btn-ghost btn-sm" style={{ color:"#059669", marginRight:6 }}
                      onClick={() => retryOne(job.jobId)} disabled={retryingId===job.jobId}>
                      {retryingId===job.jobId ? "Sending..." : "🔄 Retry"}
                    </button>
                  )}
                  {tab==="held" && (
                    <button className="btn-primary btn-sm" style={{ marginRight:6, background:"linear-gradient(135deg,#d97706,#f59e0b)" }}
                      onClick={() => sendNow(job.jobId)} disabled={sendingId===job.jobId}>
                      {sendingId===job.jobId ? "Sending..." : "📤 Send Now"}
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => remove(job.jobId)}>
                    {tab==="failed" ? "🗑 Delete" : "Cancel"}
                  </button>
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
  const [form,     setForm]    = useState({ username:"", password:"" });
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${API}/api/auth/login`, {
        username: form.username,
        password: form.password,
      });
      setToken(res.data.token);
      setUser(res.data.user);
      onAuth(res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid username or password");
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
        <form onSubmit={submit}>

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

          <div style={{ marginBottom: 24 }}>
            <label style={{ color:"#94a3b8", fontSize:12, fontWeight:600, display:"block", marginBottom:6 }}>PASSWORD</label>
            <input name="password" type="password" value={form.password} onChange={handle}
              placeholder="••••••••" required
              style={{
                width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:14, boxSizing:"border-box",
                outline:"none"
              }} />
          </div>



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
            {loading ? "⏳ Please wait…" : "🔑 Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [authUser,      setAuthUser]      = useState(() => getUser());

  // On mount — verify token is still valid, refresh user data from server
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    axios.get(`${API}/api/auth/me`)
      .then(r => {
        if (r.data.success) {
          const u = { ...getUser(), ...r.data.user }; // merge — preserve existing fields
          setUser(u);
          setAuthUser(u);
        }
      })
      .catch(() => {
        // Token invalid — logout
        clearToken();
        setAuthUser(null);
      });
  }, []); // runs once on mount
  const [page,          setPage]          = useState("dashboard");
  const [contacts,      setContacts]      = useState([]);
  const [replies,       setReplies]       = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [fetchedAt,     setFetchedAt]     = useState(null);
  const [darkMode,      setDarkMode]      = useState(() => localStorage.getItem("darkMode") === "true");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  // Silent background DB resync — marks replied:true for all HR replies found
  // Runs once on login, then every 10 minutes quietly
  const resyncRepliesDB = useCallback(async () => {
    try { await axios.get(`${API}/api/resync-replies`); } catch {}
  }, []);

  const fetchScheduled = useCallback(async () => {
    try { const r = await axios.get(`${API}/api/scheduled-emails`); setScheduledJobs(r.data.jobs || []); } catch {}
  }, []);

  // Re-fetch ALL data when user logs in/changes
  useEffect(() => {
    if (!authUser) return; // not logged in yet
    fetchContacts();
    fetchReplies();
    fetchScheduled();
    // Run resync once on login silently — marks new replies in DB from Gmail
    setTimeout(() => resyncRepliesDB(), 3000);
  }, [authUser, fetchContacts, fetchReplies, fetchScheduled]);

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

  const isAdminView = !!(authUser?.isAdmin);

  const NAV_GROUPS = isAdminView
    ? [{ label: null, items: [
        { id: "admin",    icon: "🛡️", label: "Admin Panel" },
        { id: "settings", icon: "⚙️", label: "Settings" },
      ]}]
    : [
      { label: "Overview", items: [
        { id: "dashboard",  icon: "🏠", label: "Dashboard" },
        { id: "analytics",  icon: "📊", label: "Analytics" },
      ]},
      { label: "Outreach", items: [
        { id: "send",       icon: "✉️", label: "Send Application" },
        { id: "bulk",        icon: "⚡", label: "Bulk Send" },
        { id: "scheduled",   icon: "🗓️", label: "Scheduled",  badge: scheduledCount || null },
      ]},
      { label: "Pipeline", items: [
        { id: "contacts",    icon: "👥", label: "HR Contacts", badge: reminderCount || null },
        { id: "interviews",  icon: "🎤", label: "Interviews" },
      ]},
      { label: "Network", items: [
        { id: "linkedin",    icon: "🔗", label: "Connections" },
        { id: "prospect",    icon: "🎯", label: "Find HR Emails" },
        { id: "jobs",        icon: "🔍", label: "Find Jobs" },
      ]},
      { label: "Communication", items: [
        { id: "inbox",       icon: "📥", label: "Inbox",     badge: replyCount || null },
        { id: "ai",          icon: "✨", label: "AI Assistant" },
      ]},
      { label: "Account", items: [
        { id: "settings",   icon: "⚙️", label: "Settings" },
      ]},
    ];

  // Flat NAV for lookups (page title etc.)
  const NAV = NAV_GROUPS.flatMap(g => g.items);

  const [prefillSend, setPrefillSend] = React.useState(null);

  // ── Chrome extension handoff: read ?company=&role=&hrEmail=&hrName= from URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fromExtension") === "1") {
      const extData = {
        company: params.get("company")  || "",
        role:    params.get("role")     || "",
        hrEmail: params.get("hrEmail")  || "",
        hrName:  params.get("hrName")   || "",
      };
      if (extData.company || extData.hrEmail) {
        setPrefillSend(extData);
        setPage("send");
        // Clean the URL so a refresh doesn't re-trigger this
        window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      }
    }
  }, []);

  const navigate = id => { setPage(id); setSidebarOpen(false); };
  const goToSendPrefilled = (data) => { setPrefillSend(data); setPage("send"); setSidebarOpen(false); };

  // Sidebar mini stats
  const openedCount = contacts.filter(c => c.opened).length;

  // Show login page if not authenticated
  if (!authUser) {
    return <AuthPage onAuth={user => {
      setUser(user);        // save to localStorage including isAdmin
      setAuthUser(user);    // update React state
      // Clear any stale data from previous session
      setContacts([]);
      setReplies([]);
      setScheduledJobs([]);
    }} />;
  }

  const doLogout = () => {
    clearToken();
    localStorage.removeItem("em_user");
    setAuthUser(null);
    setContacts([]);
    setReplies([]);
    setScheduledJobs([]);
    setPage("dashboard");
  };

  const roleLabel = authUser?.username === "anav" ? "Senior Dev"
    : authUser?.username === "priyal" ? "Finance Pro"
    : (authUser?.displayName?.split(" ")[0] || "User");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>

        {/* ── Profile dropdown (click name to logout) ── */}
        <div className="sidebar-header" style={{ position:"relative" }}>
          <button
            onClick={() => setProfileMenuOpen(o => !o)}
            style={{
              width:"100%", display:"flex", alignItems:"center", gap:10,
              background:"none", border:"none", cursor:"pointer", padding:0, textAlign:"left"
            }}>
            <div className="sidebar-avatar">{(authUser?.displayName||"U").slice(0,2).toUpperCase()}</div>
            <div className="sidebar-brand" style={{ flex:1, minWidth:0 }}>
              <span className="sidebar-name" style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {authUser?.displayName || authUser?.username}
              </span>
              <span className="sidebar-role">{roleLabel}</span>
            </div>
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)", transform: profileMenuOpen?"rotate(180deg)":"none", transition:"transform 0.15s" }}>▼</span>
          </button>

          {profileMenuOpen && (
            <>
              <div onClick={() => setProfileMenuOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
              <div style={{
                position:"absolute", top:"calc(100% + 6px)", left:0, right:0, zIndex:50,
                background:"var(--surface-2,#1e293b)", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:10, boxShadow:"0 12px 30px rgba(0,0,0,0.4)", overflow:"hidden",
                animation:"modalPop 0.15s ease"
              }}>
                <button onClick={() => { navigate("settings"); setProfileMenuOpen(false); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    background:"none", border:"none", cursor:"pointer", color:"#e2e8f0", fontSize:13, textAlign:"left" }}>
                  ⚙️ Settings
                </button>
                <div style={{ height:1, background:"rgba(255,255,255,0.08)" }} />
                <button onClick={() => { doLogout(); setProfileMenuOpen(false); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    background:"none", border:"none", cursor:"pointer", color:"#f87171", fontSize:13, textAlign:"left" }}>
                  🚪 Logout
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Grouped Nav ── */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.label || "main"} style={{ marginBottom:4 }}>
              {group.label && (
                <div style={{
                  fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.32)",
                  textTransform:"uppercase", letterSpacing:"0.07em",
                  padding:"10px 16px 4px"
                }}>{group.label}</div>
              )}
              {group.items.map(n => (
                <button key={n.id} className={`nav-item ${page === n.id ? "nav-item-active" : ""}`} onClick={() => navigate(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  <span className="nav-label">{n.label}</span>
                  {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Mini stats ── */}
        <div className="sidebar-stats">
          <div className="sidebar-stat"><span className="ss-val">{contacts.length}</span><span className="ss-lbl">Applied</span></div>
          <div className="sidebar-stat"><span className="ss-val">{openedCount}</span><span className="ss-lbl">Opened</span></div>
          <div className="sidebar-stat"><span className="ss-val">{replyCount}</span><span className="ss-lbl">Replies</span></div>
        </div>

        <div className="sidebar-footer">
          <DarkModeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
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
                  : authUser?.username === "priyal"
                  ? "Finance Professional · Credit Manager · Digital Lending · GenAI"
                  : (authUser?.profileTitle || "Software Developer")}
              </span>
            </div>
          </div>
          <div className="header-links">
            {authUser?.username === "anav" ? (<>
              <a href="mailto:anavbansal06@gmail.com" className="plink">✉ anavbansal06@gmail.com</a>
              <a href="tel:+917827855635" className="plink">📞 +91 7827855635</a>
              <a href="https://linkedin.com/in/anavbansal-51b191162" target="_blank" rel="noreferrer" className="plink">🔗 LinkedIn</a>
              <a href={DRIVE_LINK} target="_blank" rel="noreferrer" className="plink plink-resume">📄 Resume</a>
            </>) : authUser?.username === "priyal" ? (<>
              <a href="mailto:priyalgoyal1702@gmail.com" className="plink">✉ priyalgoyal1702@gmail.com</a>
              <a href="tel:+917665941798" className="plink">📞 +91 7665941798</a>
              <a href="https://linkedin.com/in/priyal--goyal/" target="_blank" rel="noreferrer" className="plink">🔗 LinkedIn</a>
              <span className="plink plink-resume">📄 Resume</span>
            </>) : (<>
              {authUser?.profileEmail && <a href={`mailto:${authUser.profileEmail}`} className="plink">✉ {authUser.profileEmail}</a>}
              {authUser?.profilePhone && <a href={`tel:${authUser.profilePhone}`} className="plink">📞 {authUser.profilePhone}</a>}
              {authUser?.profileLinkedIn && <a href={`https://${authUser.profileLinkedIn}`} target="_blank" rel="noreferrer" className="plink">🔗 LinkedIn</a>}
              <span className="plink plink-resume">📄 Resume</span>
            </>)}
          </div>
          <DarkModeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
        </header>

        <main className="main-content">
          {page !== "ai" && (
            <div className="page-header">
              <h2 className="page-title">{NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}</h2>
            </div>
          )}

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
          {page === "send"      && <SendApplicationPage onContactsRefresh={fetchContacts} prefill={prefillSend} onPrefillConsumed={() => setPrefillSend(null)} addToast={addToast} contacts={contacts} />}
          {page === "linkedin"  && <LinkedInConnectionsPage onFillApply={goToSendPrefilled} addToast={addToast} />}
          {page === "inbox"     && <InboxPage contacts={contacts} onFollowUp={contact => setModal({ type: "followUp", contact })} addToast={addToast} />}

          {page === "prospect"  && <ProspectPage onFillApply={goToSendPrefilled} addToast={addToast} />}
          {page === "jobs"      && <FindJobsPage onFillApply={goToSendPrefilled} />}
          {page === "scheduled" && <ScheduledPage onRefresh={fetchScheduled} addToast={addToast} />}
          {page === "settings"   && <SettingsPage addToast={addToast} />}
          {page === "ai"         && <AIAssistantPage addToast={addToast} />}
          {page === "analytics"  && <AnalyticsPage />}

          {page === "interviews" && <InterviewsPage addToast={addToast} />}
          {page === "bulk"       && <BulkSendPage addToast={addToast} contacts={contacts} />}
          {page === "admin"      && authUser?.isAdmin && <AdminPage addToast={addToast} />}
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
      {modal?.type === "followUp"  && <FollowUpModal  contact={modal.contact} onClose={() => setModal(null)} onSent={(hrEmail) => {
              setModal(null);
              // Instantly remove from "Follow-up Due" list by marking followupSent
              setContacts(prev => prev.map(c =>
                c.hrEmail === hrEmail ? { ...c, followupSent: true, needsFollowUp: false } : c
              ));
              addToast("✅ Follow-up sent!");
              fetchContacts(); // background refresh
            }} />}

      <ToastContainer toasts={toasts} />
    </div>
  );
}


// ─── LinkedIn Connections Page ────────────────────────────────────────────────


// ─── Referral Message Modal ────────────────────────────────────────────────────


// ─── Add Connection Modal ──────────────────────────────────────────────────────
// ─── Scheduled Page ───────────────────────────────────────────────────────────


// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPage({ addToast }) {
  const [tab,       setTab]      = useState("users");
  const [users,     setUsers]    = useState([]);
  const [stats,     setStats]    = useState(null);
  const [loading,   setLoading]  = useState(false);
  const [showAdd,   setShowAdd]  = useState(false);
  const [editUser,  setEditUser] = useState(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [newUser,   setNewUser]  = useState({
    username:"", password:"", displayName:"", profileEmail:"",
    profilePhone:"", profileTitle:"", currentCompany:"", keySkills:"", totalExp:"", isAdmin:false
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [ur, sr] = await Promise.all([
        axios.get(`${API}/api/admin/users`),
        axios.get(`${API}/api/admin/stats`),
      ]);
      setUsers(ur.data.users || []);
      setStats(sr.data.stats || {});
    } catch(e) { addToast && addToast("❌ " + e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const createUser = async () => {
    if (!newUser.username || !newUser.password) return addToast && addToast("Username & password required", "error");
    try {
      await axios.post(`${API}/api/admin/users`, newUser);
      addToast && addToast("✅ User created!");
      setShowAdd(false);
      setNewUser({ username:"", password:"", displayName:"", profileEmail:"", profilePhone:"", profileTitle:"", currentCompany:"", keySkills:"", totalExp:"", isAdmin:false });
      fetchUsers();
    } catch(e) { addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error"); }
  };

  const deleteUser = async (id, name) => {
    if (!window.confirm(`Delete ${name}? This will also delete all their email logs.`)) return;
    try {
      await axios.delete(`${API}/api/admin/users/${id}`);
      addToast && addToast("✅ User deleted");
      fetchUsers();
    } catch(e) { addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error"); }
  };

  const uploadResume = async (userId, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("resume", file);
    try {
      await axios.post(`${API}/api/admin/users/${userId}/resume`, fd, { headers:{"Content-Type":"multipart/form-data"} });
      addToast && addToast("✅ Resume uploaded!");
      fetchUsers();
    } catch(e) { addToast && addToast("❌ Upload failed", "error"); }
  };

  const saveEdit = async () => {
    try {
      await axios.patch(`${API}/api/admin/users/${editUser._id}`, editUser);
      addToast && addToast("✅ User updated!");
      setEditUser(null);
      fetchUsers();
    } catch(e) { addToast && addToast("❌ Failed", "error"); }
  };

  const StatCard = ({ label, value, color="var(--blue)" }) => (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", textAlign:"center" }}>
      <div style={{ fontSize:28, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4 }}>{label}</div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Admin Panel</h2>
        <span style={{ fontSize:11, background:"#fef3c7", color:"#92400e", padding:"4px 10px", borderRadius:99, fontWeight:700 }}>
          ADMIN ONLY
        </span>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
          <StatCard label="Total Users"   value={stats.totalUsers}   color="var(--blue)"  />
          <StatCard label="Total Emails"  value={stats.totalEmails}  color="#7c3aed"      />
          <StatCard label="Today Emails"  value={stats.todayEmails}  color="#059669"      />
          <StatCard label="Reply Rate"    value={`${stats.replyRate}%`} color="#d97706"   />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["users","add"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:"7px 16px", borderRadius:99, fontSize:12, fontWeight:600, cursor:"pointer",
              border:"1.5px solid", borderColor: tab===t ? "var(--blue)" : "var(--border)",
              background: tab===t ? "var(--blue)" : "var(--surface)",
              color: tab===t ? "#fff" : "var(--text-muted)" }}>
            {t==="users" ? "👥 All Users" : "➕ Add User"}
          </button>
        ))}
      </div>

      {/* ── Users List ── */}
      {tab === "users" && (
        <div>
          {loading && <div style={{ textAlign:"center", padding:20, color:"var(--text-muted)" }}>Loading...</div>}
          <div style={{ marginBottom:12 }}>
            <SearchBar value={adminSearch} onChange={setAdminSearch} placeholder="Search users by name, username, email…" />
          </div>
          {users.filter(u => {
            const q = adminSearch.toLowerCase();
            return !q || u.username?.toLowerCase().includes(q)
              || u.displayName?.toLowerCase().includes(q)
              || u.profileEmail?.toLowerCase().includes(q);
          }).map(u => (
            <div key={u._id} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:12, padding:"14px 18px", marginBottom:10
            }}>
              {editUser?._id === u._id ? (
                /* Edit mode */
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                    {[
                      ["displayName","Display Name"],["profileEmail","Email"],
                      ["profilePhone","Phone"],["profileTitle","Title"],
                      ["currentCompany","Company"],["totalExp","Experience"],
                      ["keySkills","Key Skills"],
                    ].map(([k,l]) => (
                      <div key={k} className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label" style={{ fontSize:11 }}>{l}</label>
                        <input className="form-input" style={{ fontSize:12 }}
                          value={editUser[k]||""} onChange={e => setEditUser(p=>({...p,[k]:e.target.value}))} />
                      </div>
                    ))}
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Admin Access</label>
                      <select className="form-select" style={{ fontSize:12 }}
                        value={editUser.isAdmin?"yes":"no"}
                        onChange={e => setEditUser(p=>({...p,isAdmin:e.target.value==="yes"}))}>
                        <option value="no">No</option>
                        <option value="yes">Yes — Admin</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn-primary btn-sm" onClick={saveEdit}>💾 Save</button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditUser(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{
                    width:40, height:40, borderRadius:"50%", flexShrink:0,
                    background:"linear-gradient(135deg,#3b82f6,#7c3aed)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"#fff", fontWeight:800, fontSize:15
                  }}>
                    {(u.displayName||u.username).slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>
                      {u.displayName || u.username}
                      {u.isAdmin && <span style={{ marginLeft:6, fontSize:10, background:"#fef3c7", color:"#92400e", padding:"2px 8px", borderRadius:99, fontWeight:700 }}>ADMIN</span>}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                      @{u.username} · {u.profileEmail||"no email"}
                    </div>
                    <div style={{ fontSize:11, marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span style={{ color: u.hasGmail ? "#059669" : "#dc2626" }}>
                        {u.hasGmail ? "✅ Gmail" : "❌ No Gmail"}
                      </span>
                      <span style={{ color: u.hasResume ? "#059669" : "#6b7280" }}>
                        {u.hasResume ? "✅ Resume" : "📎 No Resume"}
                      </span>
                      {u.profileTitle && <span style={{ color:"var(--text-muted)" }}>{u.profileTitle}</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {/* Resume upload */}
                    <label style={{
                      padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
                      background:"#ede9fe", color:"#5b21b6", border:"1px solid #c4b5fd"
                    }}>
                      📎 Resume
                      <input type="file" accept=".pdf" style={{ display:"none" }}
                        onChange={e => uploadResume(u._id, e.target.files[0])} />
                    </label>
                    <button className="btn-ghost btn-sm" style={{ fontSize:11 }}
                      onClick={() => setEditUser({...u})}>✏️ Edit</button>
                    <button style={{
                      padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
                      background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5"
                    }} onClick={() => deleteUser(u._id, u.displayName||u.username)}>
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add User ── */}
      {tab === "add" && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
          <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700 }}>➕ Create New User</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            {[
              ["username","Username *","john_doe"],
              ["password","Password *","min 4 chars"],
              ["displayName","Display Name","John Doe"],
              ["profileEmail","Email","john@gmail.com"],
              ["profilePhone","Phone","+91 9876543210"],
              ["profileTitle","Title","Software Developer"],
              ["currentCompany","Company","TechCorp"],
              ["totalExp","Experience","2+ Years"],
            ].map(([k,l,ph]) => (
              <div key={k} className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label" style={{ fontSize:11 }}>{l}</label>
                <input className="form-input" style={{ fontSize:13 }}
                  placeholder={ph} value={newUser[k]||""}
                  onChange={e => setNewUser(p=>({...p,[k]:e.target.value}))} />
              </div>
            ))}
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label" style={{ fontSize:11 }}>Key Skills</label>
              <input className="form-input" style={{ fontSize:13 }}
                placeholder="Node.js, React, AWS..."
                value={newUser.keySkills||""}
                onChange={e => setNewUser(p=>({...p,keySkills:e.target.value}))} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label" style={{ fontSize:11 }}>Admin Access</label>
              <select className="form-select" style={{ fontSize:13 }}
                value={newUser.isAdmin?"yes":"no"}
                onChange={e => setNewUser(p=>({...p,isAdmin:e.target.value==="yes"}))}>
                <option value="no">No — Regular User</option>
                <option value="yes">Yes — Admin</option>
              </select>
            </div>
          </div>
          <div style={{ background:"#fef9c3", border:"1px solid #fde047", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#713f12" }}>
            💡 User ko register nahi karna hoga — directly login kar sakta hai username/password se.
            Invite code ki zarurat nahi.
          </div>
          <button className="btn-primary" onClick={createUser}>
            ✅ Create User
          </button>
        </div>
      )}
    </div>
  );
}

// --- Settings Page ---
function SettingsPage({ addToast }) {
  const currentUser = getUser();
  const [saving,    setSaving]    = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [np,        setNp]        = useState("");
  const [changing,  setChanging]  = useState(false);

  const [profile, setProfile] = useState({
    // Basic
    displayName:      currentUser?.displayName      || "",
    profileTitle:     currentUser?.profileTitle     || "",
    profilePhone:     currentUser?.profilePhone     || "",
    profileEmail:     currentUser?.profileEmail     || "",
    profileLinkedIn:  currentUser?.profileLinkedIn  || "",
    profileLocation:  currentUser?.profileLocation  || "",
    // Job details
    currentCompany:   currentUser?.currentCompany   || "",
    totalExp:         currentUser?.totalExp         || "",
    relevantExp:      currentUser?.relevantExp      || "",
    currentCTC:       currentUser?.currentCTC       || "",
    expectedCTC:      currentUser?.expectedCTC      || "",
    noticePeriod:     currentUser?.noticePeriod     || "",
    currentLocation:  currentUser?.currentLocation  || "",
    preferredLocation:currentUser?.preferredLocation|| "",
    // Skills & summary
    keySkills:        currentUser?.keySkills        || "",
    profileSummary:   currentUser?.profileSummary   || "",
    // Reason for change
    reasonForChange:  currentUser?.reasonForChange  || "Personal and professional growth",
    offerInHand:      currentUser?.offerInHand      || "No",
  });
  const handle = (k, v) => setProfile(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/auth/settings`, profile);
      setUser({ ...getUser(), ...profile });
      addToast && addToast("✅ Profile saved!");
    } catch (e) {
      addToast && addToast("❌ Failed: " + (e.response?.data?.message || e.message), "error");
    } finally { setSaving(false); }
  };

  const changePass = async () => {
    if (!np || np.length < 4) return;
    setChanging(true);
    try {
      await axios.post(`${API}/api/auth/change-password`, { newPassword: np });
      addToast && addToast("✅ Password changed!");
      setNp("");
    } catch(e) { addToast && addToast("❌ Failed", "error"); }
    finally { setChanging(false); }
  };

  const TABS = [
    { id:"profile",    label:"👤 Profile"    },
    { id:"job",        label:"💼 Job Details" },
    { id:"skills",     label:"🛠 Skills"     },
    { id:"templates",  label:"✉ Templates"  },
    { id:"account",    label:"🔐 Account"    },
  ];

  // ── Template Editor State ────────────────────────────────────────────────
  const DEFAULT_TEMPLATES_ANAV = [
    { id:"fullstack", name:"Full Stack",  icon:"⚡", accent:"#2563eb",
      subject:"Job Application — Anav Bansal",
      customNote:"I am excited to apply for this opportunity. My full-stack expertise in Node.js, ReactJS, and AWS Lambda makes me an ideal candidate for building scalable, production-ready applications.",
      highlights:["4.7+ years · Node.js, AngularJS, ReactJS, Express.js","AWS Lambda · DynamoDB · S3 · Amazon Connect","10+ enterprise CTI integrations (Avaya, Genesys, Webex, Zoom)","CRM: ServiceNow, Salesforce, Freshdesk, MS Dynamics"],
      resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
    { id:"cti", name:"CTI Expert", icon:"📞", accent:"#7c3aed",
      subject:"Job Application — Anav Bansal (CTI/Telephony Specialist)",
      customNote:"With 4.7+ years specializing in CTI/telephony integrations, I have architected enterprise-grade solutions across Avaya AACC, Genesys, Webex, and Amazon Connect.",
      highlights:["4.7+ years CTI/Telephony Integration Specialist","Avaya AACC/AES, Genesys Cloud, Webex, Amazon Connect","10+ enterprise contact center integrations","Node.js, AWS Lambda, REST APIs, WebSockets"],
      resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
    { id:"crm", name:"CRM Expert", icon:"🏆", accent:"#0d9488",
      subject:"Job Application — Anav Bansal (Senior CRM & ServiceNow Expert)",
      customNote:"With 4.7+ years as a CRM Integration Expert, I specialize in ServiceNow (Flow Designer, IntegrationHub, Virtual Agent) and Freshdesk CTI.",
      highlights:["4.7+ years CRM Integration Expert","ServiceNow: Flow Designer, IntegrationHub, Virtual Agent, Scripted REST","6+ enterprise CRM integrations (ServiceNow, Salesforce, Freshdesk, Zendesk)","3 marketplace apps published"],
      resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
    { id:"formal", name:"Formal", icon:"🎯", accent:"#1d4ed8",
      subject:"Job Application — Anav Bansal",
      customNote:"I am respectfully submitting my application for this position. I am confident that my technical background aligns closely with your requirements.",
      highlights:["4.7+ years Full Stack Development","Node.js, Angular, AWS — production-grade applications","10+ enterprise integrations delivered","ServiceNow, Salesforce, Freshdesk expertise"],
      resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
  ];

  const getDefaultTemplates = () => {
    const u = getUser();
    if (u?.username === "priyal") return [
      { id:"finance",  name:"Finance Pro",    icon:"💼", accent:"#0d9488", subject:"Job Application — Priyal Goyal", customNote:"With 2+ years in digital lending and credit risk at Tata Capital, I bring expertise in credit underwriting, GenAI automation, and SLOS integration.", highlights:["2+ Years · Digital Lending & Credit Risk · Tata Capital","Credit Underwriting · FOIR/LTV Analysis · Portfolio Monitoring","GenAI Automation · SLOS Integration · AI-driven Workflow Optimization","COO Achiever's Club Award — Tata Capital (Q1 FY26)"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"credit",   name:"Credit Manager", icon:"📊", accent:"#2563eb", subject:"Job Application — Priyal Goyal (Credit Manager)", customNote:"As a Credit Manager at Tata Capital, I evaluate secured retail auto loan proposals, manage 250+ cases/month, and lead cross-functional collaboration.", highlights:["Credit Underwriting Specialist · Tata Capital","FOIR/LTV Analysis · Delinquency Monitoring · Portfolio Quality","FinnOne · SLOS · SFDC · FICO · Jocata","COO Achiever's Club Award Q1 FY26"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"formal",   name:"Formal",         icon:"🎯", accent:"#1d4ed8", subject:"Job Application — Priyal Goyal", customNote:"I am respectfully submitting my application. With 2+ years in digital lending and credit risk, I am confident my background aligns with your requirements.", highlights:["2+ Years Digital Lending & Credit Risk","Tata Capital Limited — Credit Manager","GenAI Automation · SLOS Integration","PGDM Finance — Universal Ai University"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"genai",    name:"GenAI Focus",    icon:"🤖", accent:"#7c3aed", subject:"Job Application — Priyal Goyal (GenAI & Digital Lending)", customNote:"I have hands-on experience contributing to GenAI-powered credit automation platforms, SLOS integration, and AI-driven workflow optimization — contributing to a 2.9% reduction in TAT at Tata Capital.", highlights:["GenAI-powered Credit Automation Platform","SLOS Integration · Pan-India Rollout","AI Bot Integration — Jocata to FinnOne workflow automation","2.9% TAT reduction achieved"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
    ];
    if (u?.username === "mohit") return [
      { id:"backend", name:"Backend Dev",    icon:"☕", accent:"#1e3a5f", subject:"Job Application — Mohit Singh", customNote:"With 4.7+ years in Java, Spring Boot, Microservices and REST APIs, I specialize in building scalable backend applications and enterprise CRM/CTI integrations.", highlights:["4.7+ Years · Java, Spring Boot, Microservices, REST APIs","CRM/CTI: MS Dynamics 365, ServiceNow, Salesforce, HubSpot, Cisco Finesse","8 Pat on the Back Awards + Performance of the Year — NovelVox","P1/P2 Incident Management · Root Cause Analysis"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"crm",     name:"CRM Specialist", icon:"🔗", accent:"#2563eb", subject:"Job Application — Mohit Singh (CRM Integration Specialist)", customNote:"With 4.7+ years in enterprise CRM/CTI integrations — MS Dynamics 365, ServiceNow, Salesforce, HubSpot, and Cisco Finesse — I deliver high-performance solutions.", highlights:["Enterprise CRM: MS Dynamics 365, ServiceNow, Salesforce, HubSpot","CTI: Cisco Finesse, Avaya, Amazon Connect","Banking clients: Bank Albilad, J&K Bank, Misr Digital Innovation","8 Pat on Back Awards + Performance of the Year"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"java",    name:"Java Expert",    icon:"🚀", accent:"#0369a1", subject:"Job Application — Mohit Singh (Senior Java Developer)", customNote:"As a Senior Java Developer with Spring Boot and Microservices expertise, I have delivered enterprise-grade solutions for banking clients.", highlights:["Java · Spring Boot · Microservices · REST APIs · SQL","Hibernate · JPA · MySQL · CI/CD · Git","Banking: Bank Albilad, J&K Bank, Salesforce/Cisco Finesse","4.7+ Years NovelVox — End-to-end project ownership"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
      { id:"formal",  name:"Formal",         icon:"🎯", accent:"#1d4ed8", subject:"Job Application — Mohit Singh", customNote:"I am respectfully submitting my application. With 4.7+ years of enterprise software development experience, I am confident my background aligns with your requirements.", highlights:["4.7+ Years · Java, Spring Boot, Microservices","CRM/CTI Integration Specialist · NovelVox","Banking & Enterprise Clients · Fortune 500","Performance of the Year Award"], resumeType:"default", resumeDriveUrl:"", resumeFileName:"" },
    ];
    return DEFAULT_TEMPLATES_ANAV;
  };

  const [templates, setTemplates]   = useState(getDefaultTemplates());
  const [tplSaving, setTplSaving]   = useState(false);
  const [editIdx,   setEditIdx]     = useState(null); // which template is being edited
  const [uploading, setUploading]   = useState(false);

  // Load user's saved templates on mount — merge DB with defaults
  useEffect(() => {
    axios.get(`${API}/api/templates`)
      .then(r => {
        if (r.data.templates?.length > 0) {
          // Merge saved templates back — map by templateId/id
          const dbMap = {};
          r.data.templates.forEach(t => { dbMap[t.templateId || t.id] = t; });
          setTemplates(prev => prev.map(tpl => {
            const key = tpl.id || tpl.templateId;
            return dbMap[key] ? { ...tpl, ...dbMap[key], id: tpl.id } : tpl;
          }));
        }
      }).catch(() => {});
  }, []);

  const saveTemplates = async () => {
    setTplSaving(true);
    try {
      // Save each template individually to match backend schema
      for (const tpl of templates) {
        await axios.post(`${API}/api/templates`, {
          templateId:    tpl.id || tpl.templateId,
          name:          tpl.name,
          icon:          tpl.icon        || "⚡",
          accent:        tpl.accent      || "#2563eb",
          subject:       tpl.subject     || "",
          customNote:    tpl.customNote  || "",
          intro:         tpl.intro       || "",
          highlights:    tpl.highlights  || [],
          resumeUrl:     tpl.resumeUrl   || "",
          resumeFileName:tpl.resumeFileName || "",
        });
      }
      addToast && addToast("✅ Templates saved!");
    } catch(e) { addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error"); }
    finally { setTplSaving(false); }
  };

  const updateTpl = (idx, key, val) => setTemplates(prev =>
    prev.map((t,i) => i===idx ? {...t, [key]: val} : t)
  );

  const uploadResume = async (idx, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const r = await axios.post(`${API}/api/templates/upload-resume`, fd,
        { headers: {"Content-Type":"multipart/form-data"} });
      updateTpl(idx, "resumeUploadPath", r.data.path);
      updateTpl(idx, "resumeFileName",   r.data.filename);
      updateTpl(idx, "resumeType",       "upload");
      addToast && addToast("✅ Resume uploaded!");
    } catch(e) { addToast && addToast("❌ Upload failed", "error"); }
    finally { setUploading(false); }
  };

  const ICONS = ["⚡","📞","🏆","🎯","🚀","💼","📊","🤖","☕","🔗","💡","🌟"];
  const COLORS = ["#2563eb","#7c3aed","#0d9488","#1d4ed8","#059669","#dc2626","#d97706","#0369a1","#1e3a5f","#065f46"];

  const Section = ({ title, children }) => (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", marginBottom:14 }}>
      <div style={{ fontWeight:700, fontSize:13, color:"var(--blue)", marginBottom:14, paddingBottom:8, borderBottom:"1px solid var(--border)" }}>
        {title}
      </div>
      {children}
    </div>
  );

  const Field = ({ label, k, ph, type="text", full=false, area=false }) => (
    <div className="form-group" style={{ marginBottom:0, gridColumn: full?"1/-1":"auto" }}>
      <label className="form-label" style={{ fontSize:11 }}>{label}</label>
      {area
        ? <textarea className="form-textarea" rows={3} style={{ fontSize:13 }}
            placeholder={ph} value={profile[k]} onChange={e=>handle(k,e.target.value)} />
        : <input type={type} className="form-input" style={{ fontSize:13 }}
            placeholder={ph} value={profile[k]} onChange={e=>handle(k,e.target.value)} />
      }
    </div>
  );

  const SaveBtn = () => (
    <button className={`btn-primary ${saving?"loading":""}`}
      onClick={save} disabled={saving} style={{ marginTop:16 }}>
      {saving ? "Saving..." : "💾 Save Changes"}
    </button>
  );

  return (
    <div className="page">
      <div className="page-header"><h2 className="page-title">⚙️ Settings</h2></div>

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding:"7px 16px", borderRadius:99, border:"1.5px solid",
              borderColor: activeTab===t.id ? "var(--blue)" : "var(--border)",
              background: activeTab===t.id ? "var(--blue)" : "var(--surface)",
              color: activeTab===t.id ? "#fff" : "var(--text-500,#6b7280)",
              fontWeight:600, fontSize:12, cursor:"pointer"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Profile ── */}
      {activeTab === "profile" && (
        <div>
          <Section title="👤 Personal Info">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field k="displayName"     label="Full Name"        ph="Anav Bansal" full />
              <Field k="profileTitle"    label="Professional Title" ph="Senior Full Stack Developer" full />
              <Field k="profilePhone"    label="Phone"            ph="+91 7827855635" />
              <Field k="profileEmail"    label="Email"            ph="anavbansal06@gmail.com" />
              <Field k="profileLinkedIn" label="LinkedIn URL"     ph="linkedin.com/in/yourprofile" />
              <Field k="profileLocation" label="City, State"      ph="Faridabad, Haryana" />
            </div>
            <SaveBtn />
          </Section>

          <Section title="📝 Professional Summary">
            <p style={{ fontSize:11, color:"var(--text-muted)", marginBottom:10 }}>
              Used in screening replies and email body. Keep it 2-3 lines.
            </p>
            <Field k="profileSummary" label="Summary" area
              ph="Senior Full Stack Developer with 4.7+ years of experience in Node.js, AWS, and CTI integrations..." />
            <SaveBtn />
          </Section>
        </div>
      )}

      {/* ── Tab: Job Details ── */}
      {activeTab === "job" && (
        <div>
          <Section title="💼 Current Job">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field k="currentCompany"    label="Current Company"     ph="NovelVox Pvt Ltd" />
              <Field k="totalExp"          label="Total Experience"    ph="4.7+ Years" />
              <Field k="relevantExp"       label="Relevant Experience" ph="4.7+ Years" />
              <Field k="currentCTC"        label="Current CTC"         ph="₹9 LPA" />
              <Field k="expectedCTC"       label="Expected CTC"        ph="₹15 LPA" />
              <Field k="noticePeriod"      label="Notice Period"       ph="Serving Notice Period" />
              <Field k="currentLocation"   label="Current Location"    ph="Faridabad, Haryana" />
              <Field k="preferredLocation" label="Preferred Location"  ph="PAN India" />
            </div>
            <SaveBtn />
          </Section>

          <Section title="🔄 HR Screening Answers">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field k="reasonForChange" label="Reason for Change" ph="Personal and professional growth" />
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label" style={{ fontSize:11 }}>Offer in Hand</label>
                <select className="form-select" style={{ fontSize:13 }}
                  value={profile.offerInHand} onChange={e=>handle("offerInHand",e.target.value)}>
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </div>
            </div>
            <SaveBtn />
          </Section>
        </div>
      )}

      {/* ── Tab: Skills ── */}
      {activeTab === "skills" && (
        <div>
          <Section title="🛠 Key Skills">
            <p style={{ fontSize:11, color:"var(--text-muted)", marginBottom:10 }}>
              Used in email templates, screening replies, and custom notes. Comma separated.
            </p>
            <Field k="keySkills" label="Key Skills (comma separated)" area
              ph="Node.js, Angular, AWS Lambda, CTI Integrations, ServiceNow, REST APIs..." />
            <SaveBtn />
          </Section>

          {/* Live preview of how screening reply will look */}
          <Section title="👁 Screening Reply Preview">
            <div style={{ background:"var(--surface-2,#f8fafc)", borderRadius:8, padding:"14px 16px", fontFamily:"monospace", fontSize:12, lineHeight:1.9, whiteSpace:"pre-wrap", color:"var(--text-700,#374151)" }}>
{`Dear HR,

Thank you for reaching out! Please find my details below:

📋 Candidate Profile — ${profile.displayName || currentUser?.displayName || "Your Name"}

• Key Skills             : ${profile.keySkills || currentUser?.keySkills || "Your Skills"}
• Total Experience       : ${profile.totalExp || currentUser?.totalExp || "X Years"}
• Relevant Experience    : ${profile.relevantExp || currentUser?.relevantExp || "X Years"}
• Current Company        : ${profile.currentCompany || currentUser?.currentCompany || "Company"}
• Reason for Change      : ${profile.reasonForChange || "Personal and professional growth"}
• Notice Period / LWD    : ${profile.noticePeriod || currentUser?.noticePeriod || "Serving Notice Period"}
• Current CTC            : ${profile.currentCTC || currentUser?.currentCTC || "X LPA"}
• Offer in Hand          : ${profile.offerInHand || "No"}
• Expected CTC           : ${profile.expectedCTC || currentUser?.expectedCTC || "X LPA"}
• Current Location       : ${profile.currentLocation || currentUser?.currentLocation || "City"}
• Preferred Location     : ${profile.preferredLocation || currentUser?.preferredLocation || "PAN India"}

Best regards,
${profile.displayName || currentUser?.displayName || "Your Name"}`}
            </div>
          </Section>
        </div>
      )}

      {/* ── Tab: Templates ── */}
      {activeTab === "templates" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Email Templates ({templates.length}/4)</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                Edit text, highlights, and resume per template
              </div>
            </div>
            <button className={`btn-primary ${tplSaving?"loading":""}`}
              onClick={saveTemplates} disabled={tplSaving} style={{ fontSize:12 }}>
              {tplSaving ? "Saving..." : "💾 Save All"}
            </button>
          </div>

          {templates.map((tpl, idx) => (
            <div key={tpl.id} style={{
              background:"var(--surface)", border:`2px solid ${editIdx===idx ? tpl.accent : "var(--border)"}`,
              borderRadius:12, marginBottom:10, overflow:"hidden"
            }}>
              {/* Header */}
              <div style={{
                background: editIdx===idx ? tpl.accent+"18" : "var(--surface-2,#f8fafc)",
                padding:"12px 16px", display:"flex", alignItems:"center", gap:10, cursor:"pointer"
              }} onClick={() => setEditIdx(editIdx===idx ? null : idx)}>
                <span style={{ fontSize:20 }}>{tpl.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{tpl.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>
                    Resume: {tpl.resumeType==="drive" ? "🔗 Drive Link" : tpl.resumeType==="upload" ? "📎 Uploaded" : "📁 Default"}
                    {" · "}{tpl.highlights?.length || 0} highlights
                  </div>
                </div>
                <span style={{ color:"var(--text-muted)", fontSize:12 }}>{editIdx===idx ? "▲ Close" : "▼ Edit"}</span>
              </div>

              {/* Editor */}
              {editIdx === idx && (
                <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
                  {/* Name + Icon + Color */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"end" }}>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Template Name</label>
                      <input className="form-input" style={{ fontSize:13 }} value={tpl.name}
                        onChange={e => updateTpl(idx,"name",e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Icon</label>
                      <select className="form-select" style={{ fontSize:16, width:70 }}
                        value={tpl.icon} onChange={e => updateTpl(idx,"icon",e.target.value)}>
                        {ICONS.map(ic => <option key={ic}>{ic}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Color</label>
                      <input type="color" value={tpl.accent} onChange={e => updateTpl(idx,"accent",e.target.value)}
                        style={{ width:46, height:36, padding:2, borderRadius:8, border:"1px solid var(--border)", cursor:"pointer" }} />
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Email Subject</label>
                    <input className="form-input" style={{ fontSize:13 }} value={tpl.subject || ""}
                      onChange={e => updateTpl(idx,"subject",e.target.value)}
                      placeholder="Job Application — Your Name" />
                  </div>

                  {/* Custom Note */}
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Custom Note (1-2 lines)</label>
                    <textarea className="form-textarea" rows={2} style={{ fontSize:13 }} value={tpl.customNote || ""}
                      onChange={e => updateTpl(idx,"customNote",e.target.value)}
                      placeholder="Why you're a great fit for this role..." />
                  </div>

                  {/* Highlights */}
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Key Highlights (4 bullets)</label>
                    {(tpl.highlights || ["","","",""]).map((h, hi) => (
                      <input key={hi} className="form-input" style={{ fontSize:12, marginBottom:6 }}
                        placeholder={`Highlight ${hi+1}`} value={h}
                        onChange={e => {
                          const hs = [...(tpl.highlights||["","","",""])];
                          hs[hi] = e.target.value;
                          updateTpl(idx,"highlights",hs);
                        }} />
                    ))}
                  </div>

                  {/* Resume Section */}
                  <div style={{ background:"var(--surface-2,#f8fafc)", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontWeight:700, fontSize:12, marginBottom:10 }}>📎 Resume for this template</div>
                    <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                      {["default","drive","upload"].map(rt => (
                        <button key={rt} type="button"
                          style={{ padding:"5px 12px", borderRadius:99, fontSize:11, fontWeight:600,
                            border:`1.5px solid ${tpl.resumeType===rt ? tpl.accent : "var(--border)"}`,
                            background: tpl.resumeType===rt ? tpl.accent+"18" : "var(--surface)",
                            color: tpl.resumeType===rt ? tpl.accent : "var(--text-muted)", cursor:"pointer"
                          }}
                          onClick={() => updateTpl(idx,"resumeType",rt)}>
                          {rt==="default"?"📁 Default Resume":rt==="drive"?"🔗 Drive Link":"📤 Upload PDF"}
                        </button>
                      ))}
                    </div>

                    {tpl.resumeType === "drive" && (
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Google Drive Public Link</label>
                        <input className="form-input" style={{ fontSize:12 }}
                          placeholder="https://drive.google.com/file/d/xxxxx/view?usp=sharing"
                          value={tpl.resumeDriveUrl || ""}
                          onChange={e => updateTpl(idx,"resumeDriveUrl",e.target.value)} />
                        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>
                          Make sure file is set to "Anyone with link can view"
                        </div>
                      </div>
                    )}

                    {tpl.resumeType === "upload" && (
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Upload PDF Resume</label>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <input type="file" accept=".pdf" style={{ fontSize:12, flex:1 }}
                            onChange={e => uploadResume(idx, e.target.files[0])} />
                          {uploading && <span style={{ fontSize:12 }}>Uploading...</span>}
                        </div>
                        {tpl.resumeFileName && (
                          <div style={{ fontSize:11, color:"#059669", marginTop:4 }}>
                            ✅ {tpl.resumeFileName}
                          </div>
                        )}
                      </div>
                    )}

                    {tpl.resumeType === "default" && (
                      <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                        Uses the default resume based on template type (CTI→TelephonyExpert, CRM→CRMExpert, others→FullStack)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Account ── */}
      {activeTab === "account" && (
        <div>
          <Section title="🔐 Account Info">
            <div style={{ fontSize:13, lineHeight:2.2, marginBottom:12 }}>
              <div><strong>Username:</strong> <span style={{ color:"var(--text-muted)" }}>{currentUser?.username}</span></div>
              <div><strong>Display Name:</strong> <span style={{ color:"var(--text-muted)" }}>{currentUser?.displayName}</span></div>
              <div><strong>Email:</strong> <span style={{ color:"var(--text-muted)" }}>{currentUser?.profileEmail || currentUser?.gmailUser || "—"}</span></div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input type="password" className="form-input" style={{ fontSize:13, maxWidth:220 }}
                placeholder="New password (min 4 chars)" value={np} onChange={e=>setNp(e.target.value)} />
              <button className="btn-ghost btn-sm" onClick={changePass} disabled={changing || np.length < 4}>
                {changing ? "..." : "🔑 Change Password"}
              </button>
            </div>
          </Section>

          <Section title="📧 Gmail Connection">
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <div style={{
                background: currentUser?.hasGmail ? "#d1fae5" : "#fee2e2",
                color: currentUser?.hasGmail ? "#065f46" : "#991b1b",
                padding:"6px 14px", borderRadius:99, fontSize:13, fontWeight:600
              }}>
                {currentUser?.hasGmail ? "✅ Connected" : "❌ Not Connected"}
              </div>
              {currentUser?.gmailUser && (
                <span style={{ fontSize:13, color:"var(--text-muted)" }}>{currentUser.gmailUser}</span>
              )}
              <a href={`${API}/api/gmail/auth?username=${currentUser?.username}`}
                target="_blank" rel="noreferrer" className="btn-ghost btn-sm" style={{ fontSize:12 }}>
                🔄 {currentUser?.hasGmail ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
            </div>
          </Section>
        </div>
      )}

    </div>
  );
}

// ─── Template Manager Page ────────────────────────────────────────────────────
function TemplateManagerPage({ addToast }) {
  const [templates, setTemplates]   = useState([]);
  const [editing,   setEditing]     = useState(null); // template being edited
  const [saving,    setSaving]      = useState(false);
  const [loading,   setLoading]     = useState(true);

  const COLORS = ["#2563eb","#7c3aed","#0d9488","#dc2626","#d97706","#059669","#0369a1","#1e3a5f"];
  const ICONS  = ["⚡","🎯","🏆","📞","🚀","💼","🔗","☕","🤖","📊","💰","🌟"];

  const defaultTpl = () => ({
    templateId:    `custom_${Date.now()}`,
    name:          "New Template",
    icon:          "⚡",
    accent:        "#2563eb",
    headerTheme:   "blue",
    resumeUrl:     "",
    resumeFileName:"",
    subject:       "",
    customNote:    "",
    intro:         "",
    highlights:    ["", "", "", ""],
  });

  useEffect(() => {
    axios.get(`${API}/api/templates`)
      .then(r => setTemplates(r.data.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await axios.post(`${API}/api/templates`, {
        ...editing,
        highlights: editing.highlights.filter(h => h.trim()),
      });
      setTemplates(prev => {
        const idx = prev.findIndex(t => t.templateId === editing.templateId);
        if (idx >= 0) { const n=[...prev]; n[idx]=r.data.template; return n; }
        return [...prev, r.data.template];
      });
      addToast && addToast("✅ Template saved!");
      setEditing(null);
    } catch(e) { addToast && addToast("❌ " + e.message, "error"); }
    finally { setSaving(false); }
  };

  const del = async (templateId) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await axios.delete(`${API}/api/templates/${templateId}`);
      setTemplates(prev => prev.filter(t => t.templateId !== templateId));
      addToast && addToast("🗑 Deleted");
    } catch(e) { addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error"); }
  };

  const h = (k, v) => setEditing(p => ({ ...p, [k]: v }));
  const hHighlight = (i, v) => setEditing(p => {
    const hl = [...(p.highlights||[])]; hl[i]=v; return { ...p, highlights: hl };
  });

  if (loading) return <div className="page"><div className="page-header"><h2 className="page-title">📋 Templates</h2></div><div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>Loading...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">📋 Template Manager</h2>
        <button className="btn-primary btn-sm"
          onClick={() => setEditing(defaultTpl())}
          style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
          + New Template
        </button>
      </div>

      {/* Template list */}
      {!editing && (
        <div>
          {templates.length === 0 && (
            <div style={{ textAlign:"center", padding:48, color:"var(--text-muted)", background:"var(--surface)", borderRadius:14, border:"1px solid var(--border)" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontWeight:600, marginBottom:6 }}>No custom templates yet</div>
              <div style={{ fontSize:13, marginBottom:16 }}>Create your first template to override the defaults</div>
              <button className="btn-primary" onClick={() => setEditing(defaultTpl())}>+ Create Template</button>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {templates.map(t => (
              <div key={t.templateId} style={{
                background:"var(--surface)", border:"1px solid var(--border)",
                borderRadius:12, padding:"14px 18px",
                display:"flex", alignItems:"center", gap:14
              }}>
                {/* Color swatch */}
                <div style={{ width:42, height:42, borderRadius:10, background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                  {t.icon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>
                    ID: <code style={{ background:"var(--surface-2,#f8fafc)", padding:"1px 6px", borderRadius:4 }}>{t.templateId}</code>
                    {t.resumeFileName && <span style={{ marginLeft:8 }}>📎 {t.resumeFileName}</span>}
                    {t.highlights?.filter(Boolean).length > 0 && <span style={{ marginLeft:8 }}>✓ {t.highlights.filter(Boolean).length} highlights</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn-ghost btn-sm" style={{ fontSize:12 }}
                    onClick={() => setEditing({ ...t, highlights: [...(t.highlights||[]),"","","",""].slice(0,6) })}>
                    ✏️ Edit
                  </button>
                  <button className="btn-ghost btn-sm" style={{ fontSize:12, color:"#dc2626", borderColor:"#dc2626" }}
                    onClick={() => del(t.templateId)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div>
          <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center" }}>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>← Back</button>
            <span style={{ fontWeight:700, fontSize:15 }}>
              {editing.name || "New Template"}
            </span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Basic info */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"var(--blue)" }}>Basic Info</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>Template Name</label>
                  <input className="form-input" style={{ fontSize:13 }} placeholder="e.g. Full Stack Pro"
                    value={editing.name} onChange={e=>h("name",e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>Template ID (used in app)</label>
                  <input className="form-input" style={{ fontSize:13, fontFamily:"monospace" }}
                    placeholder="e.g. fullstack / crm / custom1"
                    value={editing.templateId} onChange={e=>h("templateId",e.target.value.toLowerCase().replace(/\s+/g,"_"))} />
                </div>
              </div>

              {/* Icon + Color */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>Icon</label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                    {ICONS.map(ic => (
                      <button key={ic} type="button"
                        onClick={() => h("icon", ic)}
                        style={{ width:34, height:34, borderRadius:8, border:`2px solid ${editing.icon===ic?"var(--blue)":"var(--border)"}`,
                          background: editing.icon===ic?"#eff6ff":"var(--surface)", fontSize:18, cursor:"pointer" }}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>Header Color</label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                    {COLORS.map(col => (
                      <button key={col} type="button"
                        onClick={() => h("accent", col)}
                        style={{ width:30, height:30, borderRadius:8, background:col, cursor:"pointer",
                          border:`3px solid ${editing.accent===col?"#fff":"transparent"}`,
                          boxShadow: editing.accent===col?`0 0 0 2px ${col}`:"none" }} />
                    ))}
                    <input type="color" value={editing.accent}
                      onChange={e=>h("accent",e.target.value)}
                      style={{ width:30, height:30, padding:2, border:"1px solid var(--border)", borderRadius:8, cursor:"pointer" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Resume */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"var(--blue)" }}>📎 Resume</div>
              <p style={{ fontSize:12, color:"var(--text-muted)", marginBottom:10 }}>
                Google Drive public link → Share → Anyone with link → Copy link
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>Resume URL (Google Drive public link)</label>
                  <input className="form-input" style={{ fontSize:12 }}
                    placeholder="https://drive.google.com/file/d/xxxx/view?usp=sharing"
                    value={editing.resumeUrl} onChange={e=>h("resumeUrl",e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label" style={{ fontSize:11 }}>File Name (shown in email)</label>
                  <input className="form-input" style={{ fontSize:12 }}
                    placeholder="Anav_Bansal_Resume.pdf"
                    value={editing.resumeFileName} onChange={e=>h("resumeFileName",e.target.value)} />
                </div>
              </div>
              {editing.resumeUrl && (
                <a href={editing.resumeUrl} target="_blank" rel="noreferrer"
                  className="btn-ghost btn-sm" style={{ marginTop:8, fontSize:11 }}>
                  👁 Preview Resume →
                </a>
              )}
            </div>

            {/* Email Content */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"var(--blue)" }}>✉ Email Content</div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize:11 }}>
                  Opening Intro Paragraph
                  <span style={{ fontWeight:400, color:"var(--text-muted)", marginLeft:6 }}>
                    (Appears after "Dear HR," — mention company/role naturally)
                  </span>
                </label>
                <textarea className="form-textarea" rows={3} style={{ fontSize:13 }}
                  placeholder={`I am writing to express my strong interest in joining [company]. With 4.7+ years of experience in...`}
                  value={editing.intro} onChange={e=>h("intro",e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize:11 }}>
                  Custom Note
                  <span style={{ fontWeight:400, color:"var(--text-muted)", marginLeft:6 }}>
                    (Short pitch — why you're the best fit)
                  </span>
                </label>
                <textarea className="form-textarea" rows={2} style={{ fontSize:13 }}
                  placeholder="With expertise in ServiceNow and Freshdesk CTI, I have delivered..."
                  value={editing.customNote} onChange={e=>h("customNote",e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label" style={{ fontSize:11 }}>
                  Key Highlights (shown as bullet points)
                </label>
                {(editing.highlights||[]).map((hl,i) => (
                  <div key={i} style={{ display:"flex", gap:6, marginBottom:6 }}>
                    <span style={{ color:"var(--text-muted)", paddingTop:8, fontSize:12, minWidth:16 }}>{i+1}.</span>
                    <input className="form-input" style={{ fontSize:13 }}
                      placeholder={`Highlight ${i+1} — e.g. 4.7+ years · Node.js, AWS Lambda`}
                      value={hl} onChange={e=>hHighlight(i,e.target.value)} />
                    <button type="button" onClick={() => {
                      const hl2=[...(editing.highlights||[])]; hl2.splice(i,1); h("highlights",hl2);
                    }} style={{ background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:18,padding:"0 4px" }}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost btn-sm" style={{ fontSize:11, marginTop:4 }}
                  onClick={() => h("highlights",[...(editing.highlights||[]),""])}>
                  + Add Highlight
                </button>
              </div>
            </div>

            {/* Preview */}
            <div style={{ background:"var(--surface)", border:`2px solid ${editing.accent}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ background:editing.accent, padding:"16px 20px" }}>
                <div style={{ color:"rgba(255,255,255,0.8)", fontSize:11, fontWeight:600, letterSpacing:1, textTransform:"uppercase" }}>
                  {editing.name}
                </div>
                <div style={{ color:"#fff", fontSize:18, fontWeight:700, marginTop:4 }}>
                  {getUser()?.displayName || "Your Name"}
                </div>
              </div>
              <div style={{ padding:"16px 20px" }}>
                <p style={{ fontSize:12, color:"#374151", marginBottom:8 }}>Dear Hiring Manager,</p>
                <p style={{ fontSize:12, color:"#374151", marginBottom:8, lineHeight:1.7 }}>
                  {editing.intro || "Your intro paragraph will appear here..."}
                </p>
                {editing.highlights?.filter(Boolean).length > 0 && (
                  <div style={{ background:"#f8fafc", borderLeft:`3px solid ${editing.accent}`, padding:"8px 12px", marginBottom:8 }}>
                    {editing.highlights.filter(Boolean).map((h,i) => (
                      <div key={i} style={{ fontSize:11, color:"#374151", marginBottom:3 }}>• {h}</div>
                    ))}
                  </div>
                )}
                {editing.resumeFileName && (
                  <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:6, padding:"6px 10px", fontSize:11 }}>
                    📎 {editing.resumeFileName}
                  </div>
                )}
              </div>
            </div>

            {/* Save / Cancel */}
            <div style={{ display:"flex", gap:10 }}>
              <button className={`btn-primary ${saving?"loading":""}`}
                onClick={save} disabled={saving}
                style={{ background:`linear-gradient(135deg,${editing.accent},${editing.accent}dd)` }}>
                {saving ? "Saving..." : "💾 Save Template"}
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Assistant Page ────────────────────────────────────────────────────────
function AIAssistantPage({ addToast }) {
  const [tool,     setTool]     = useState("email");
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const inputRef  = useRef(null);
  const bottomRef = useRef(null);

  const TOOLS = [
    { id:"email",     icon:"✉",  label:"Email Writer"       },
    { id:"followup",  icon:"🔁", label:"Follow-up"          },
    { id:"screening", icon:"💬", label:"Screening Reply"    },
    { id:"linkedin",  icon:"🔗", label:"LinkedIn Message"   },
    { id:"referral",  icon:"🤝", label:"Referral Message"   },
    { id:"ats",       icon:"📊", label:"ATS Score"          },
    { id:"interview", icon:"🎯", label:"Interview Prep"     },
    { id:"salary",    icon:"💰", label:"Salary Negotiation" },
    { id:"analyzejd", icon:"🔍", label:"Analyze JD"         },
  ];

  const PROMPTS = {
    email:     `✉ Email Writer ready! Tell me who you're applying to — e.g. "Write an email to Priya at Google for a Senior Developer role" — or just paste the job posting.`,
    followup:  `🔁 Follow-up Writer! Tell me which company, the role, and how many days since you applied.`,
    screening: `💬 Paste the HR's screening message and I'll write a reply using your profile.`,
    linkedin:  `🔗 LinkedIn Message! Tell me who you want to reach out to and why (referral, networking, etc).`,
    referral:  `🤝 Referral Message! Tell me the contact's name, company, role you want, and platform.`,
    ats:       `📊 ATS Score Checker! Paste the job description and I'll score your match.`,
    interview: `🎯 Interview Prep! Tell me the company, role, and round type.`,
    salary:    `💰 Salary Negotiation! Tell me your offer details and I'll help you negotiate.`,
    analyzejd: `🔍 JD Analyzer! Paste the job description and I'll break it down for you.`,
  };

  useEffect(() => {
    setMessages([{ role:"ai", text: PROMPTS[tool] }]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [tool]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  const renderMsg = (text) => {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={i} style={{ lineHeight:1.7 }}>
          {parts.map((p,j) => p.startsWith("**") && p.endsWith("**")
            ? <strong key={j}>{p.slice(2,-2)}</strong>
            : p
          )}
        </div>
      );
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newHistory = [...messages, { role:"user", text }];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      const r = await axios.post(`${API}/api/ai/chat`, {
        tool, message: text,
        history: newHistory.slice(-8).map(m => ({ role: m.role, text: m.text })),
      });

      if (r.data.success) {
        setMessages(prev => [...prev, { role:"ai", text: r.data.reply, copyText: r.data.reply }]);
      } else {
        throw new Error(r.data.message || "AI failed");
      }
    } catch(e) {
      setMessages(prev => [...prev, { role:"ai", text:"❌ " + (e.response?.data?.message || e.message), isError:true }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const copy = (text) => { navigator.clipboard?.writeText(text).catch(()=>{}); addToast && addToast("✅ Copied!"); };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 56px)", overflow:"hidden", padding:"0 20px" }}>
      {/* Compact top bar */}
      <div style={{ flexShrink:0, padding:"8px 0 6px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <span style={{ fontWeight:700, fontSize:15, background:"linear-gradient(135deg,#7c3aed,#2563eb)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>✨ AI Assistant</span>
          <span style={{ fontSize:10, background:"linear-gradient(135deg,#7c3aed,#2563eb)", color:"#fff", padding:"2px 8px", borderRadius:99, fontWeight:700 }}>Groq</span>
          <span style={{ fontSize:10, color:"var(--text-muted)", marginLeft:"auto" }}>Tell me naturally — I'll understand the details</span>
        </div>
        <div style={{ display:"flex", gap:5, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)}
              style={{
                padding:"4px 11px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer",
                border:"1.5px solid", whiteSpace:"nowrap", flexShrink:0,
                borderColor: tool===t.id ? "#7c3aed" : "var(--border)",
                background: tool===t.id ? "linear-gradient(135deg,#7c3aed,#2563eb)" : "var(--surface)",
                color: tool===t.id ? "#fff" : "var(--text-muted)",
              }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:12, padding:"4px 0 16px", minHeight:0 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start", gap:8, alignItems:"flex-start" }}>
            {m.role==="ai" && (
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#2563eb)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginTop:2 }}>✨</div>
            )}
            <div style={{
              maxWidth:"80%", padding:"10px 14px", borderRadius:12,
              borderTopLeftRadius: m.role==="ai"?4:12,
              borderTopRightRadius: m.role==="user"?4:12,
              background: m.role==="user" ? "linear-gradient(135deg,#7c3aed,#2563eb)" : m.isError ? "#fee2e2" : "var(--surface)",
              color: m.role==="user" ? "#fff" : m.isError ? "#991b1b" : "var(--text-700,#374151)",
              border: m.role==="ai" ? "1px solid var(--border)" : "none",
              fontSize:13, lineHeight:1.7,
            }}>
              {renderMsg(m.text)}
              {m.copyText && (
                <button onClick={() => copy(m.copyText)} style={{
                  marginTop:10, padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:600,
                  background:"rgba(124,58,237,0.1)", border:"1px solid rgba(124,58,237,0.3)",
                  cursor:"pointer", color:"#7c3aed", display:"block"
                }}>📋 Copy</button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#2563eb)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>✨</div>
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, borderTopLeftRadius:4, padding:"10px 14px" }}>
              <div style={{ display:"flex", gap:4 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#7c3aed",animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ flexShrink:0, borderTop:"1px solid var(--border)", paddingTop:12 }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <textarea
            ref={inputRef}
            rows={2}
            className="form-textarea"
            style={{ flex:1, fontSize:13, resize:"none", borderRadius:12 }}
            placeholder={tool==="ats"||tool==="analyzejd" ? "Paste job description here..." : "Type naturally — I'll figure out the details..."}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            style={{
              padding:"10px 18px", borderRadius:12, fontWeight:700, fontSize:14,
              background:"linear-gradient(135deg,#7c3aed,#2563eb)", color:"#fff",
              border:"none", cursor: loading||!input.trim() ? "not-allowed":"pointer",
              opacity: loading||!input.trim() ? 0.6:1, flexShrink:0
            }}>➤</button>
        </div>
        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6, textAlign:"center" }}>
          Enter to send • Shift+Enter for new line • Ask for corrections anytime
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
      `}</style>
    </div>
  );
}

function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/analytics/dashboard`)
      .then(r => { if (r.data.success) setData(r.data.data); })
      .catch(e => { console.error("Analytics error:", e.message); })
      .finally(() => setLoading(false));
  }, [period]);

  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const HOURS = Array.from({length:24}, (_,i) => i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i-12}pm`);

  const StatCard = ({ label, value, sub, color="#2563eb" }) => (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ fontSize:28, fontWeight:800, color }}>{value}</div>
      <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{sub}</div>}
    </div>
  );

  const Bar = ({ value, max, color="#2563eb", label }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
      <div style={{ width:30, fontSize:11, color:"var(--text-muted)", textAlign:"right", flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, background:"var(--surface-2,#f8fafc)", borderRadius:4, height:16, overflow:"hidden" }}>
        <div style={{ width:`${max>0?Math.round(value/max*100):0}%`, background:color, height:"100%", borderRadius:4, minWidth: value>0?4:0 }} />
      </div>
      <div style={{ width:24, fontSize:11, color:"var(--text-muted)", flexShrink:0 }}>{value}</div>
    </div>
  );

  if (loading) return <div className="page"><div style={{textAlign:"center",padding:60,color:"var(--text-muted)"}}>Loading analytics...</div></div>;
  if (!data)   return <div className="page"><div style={{textAlign:"center",padding:60,color:"var(--text-muted)"}}>No data yet</div></div>;

  const { summary, byDay, byHour, topCompanies, recentTrend } = data;
  const maxDay  = Math.max(...(byDay||[]).map(d=>d.count), 1);
  const maxHour = Math.max(...(byHour||[]).map(d=>d.count), 1);

  return (
    <div className="page">
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:20 }}>
        <StatCard label="Total Sent"    value={summary.totalSent}    color="#2563eb" />
        <StatCard label="Emails Opened" value={summary.totalOpened}  sub={`${summary.openRate}% open rate`}  color="#7c3aed" />
        <StatCard label="Replies"       value={summary.totalReplied} sub={`${summary.replyRate}% reply rate`} color="#059669" />
        <StatCard label="Follow-ups"    value={summary.totalFollowup} color="#d97706" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        {/* Best day to send */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>📅 Emails by Day of Week</div>
          {(byDay||[]).map(d => (
            <Bar key={d._id} label={DAYS[(d._id-1+7)%7]} value={d.count} max={maxDay} color="#2563eb" />
          ))}
          {byDay?.length > 0 && (() => {
            const best = byDay.reduce((a,b) => (b.replied/Math.max(b.count,1)) > (a.replied/Math.max(a.count,1)) ? b : a, byDay[0]);
            return <div style={{ fontSize:11, color:"#059669", marginTop:8 }}>✅ Best day: {DAYS[(best._id-1+7)%7]} ({Math.round(best.replied/Math.max(best.count,1)*100)}% reply rate)</div>;
          })()}
        </div>

        {/* Best hour */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>⏰ Best Hours to Send</div>
          {(byHour||[]).filter(h => h.count > 0).sort((a,b) => b.count - a.count).slice(0,8).map(h => (
            <Bar key={h._id} label={HOURS[h._id]} value={h.count} max={maxHour} color="#7c3aed" />
          ))}
        </div>
      </div>

      {/* Recent 30 day trend */}
      {recentTrend?.length > 0 && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>📈 Last 30 Days</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:80 }}>
            {recentTrend.map((d,i) => {
              const maxV = Math.max(...recentTrend.map(x=>x.sent), 1);
              const h = Math.round(d.sent/maxV*72);
              return (
                <div key={i} title={`${d._id}: ${d.sent} sent, ${d.replied} replied`} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{ width:"100%", height:h, background: d.replied>0?"#059669":"#2563eb", borderRadius:"3px 3px 0 0", minHeight:2 }} />
                  {i % 5 === 0 && <div style={{ fontSize:9, color:"var(--text-muted)", whiteSpace:"nowrap" }}>{d._id.slice(5)}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:16, marginTop:8, fontSize:11 }}>
            <span style={{ color:"#2563eb" }}>■ Sent</span>
            <span style={{ color:"#059669" }}>■ Got reply</span>
          </div>
        </div>
      )}

      {/* Top companies */}
      {topCompanies?.length > 0 && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>🏆 Companies that Replied</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {topCompanies.slice(0,8).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:20, fontSize:12, color:"var(--text-muted)", textAlign:"center" }}>{i+1}</div>
                <div style={{ flex:1, fontSize:13 }}>{c._id}</div>
                <div style={{ fontSize:12, color:"#059669", fontWeight:700 }}>{c.replies} replies</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline / Kanban Board ──────────────────────────────────────────────────
function InterviewsPage({ addToast }) {
  const [interviews, setInterviews] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState({});
  const [ivPage,     setIvPage]     = useState(1);
  const [ivSearch,   setIvSearch]   = useState("");
  const PER_PAGE = 10;

  const ROUNDS = ["R1 Technical","R2 Technical","HR Round","Managerial","System Design","Final Round","Offer Discussion"];
  const STAGES = ["Interview","Interview Scheduled","Offer","Selected","Rejected","On Hold"];

  const fetch2 = () => {
    setLoading(true);
    axios.get(`${API}/api/interviews`)
      .then(r => { if (r.data.success) setInterviews(r.data.interviews); })
      .catch(e => console.error("Interviews error:", e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetch2(); }, []);

  const save = async () => {
    try {
      const r = await axios.patch(`${API}/api/interviews/${editing}`, form);
      addToast && addToast(r.data.interview?.calendarEventId ? "✅ Saved + Calendar updated!" : "✅ Saved!");
      setEditing(null); setForm({});
      fetch2();
    } catch(e) { addToast && addToast("❌ Failed: " + (e.response?.data?.message || e.message), "error"); }
  };

  const deleteInterview = async (id, company) => {
    if (!window.confirm(`Delete interview for ${company}? This also removes it from Google Calendar.`)) return;
    try {
      await axios.delete(`${API}/api/interviews/${id}`);
      addToast && addToast("🗑 Interview deleted");
      fetch2();
    } catch(e) { addToast && addToast("❌ Failed to delete", "error"); }
  };

  const now = new Date();
  const filtered  = interviews.filter(i => {
    const q = ivSearch.toLowerCase();
    return !q || i.company?.toLowerCase().includes(q)
      || i.hrEmail?.toLowerCase().includes(q)
      || i.interviewRound?.toLowerCase().includes(q);
  });
  const upcoming  = filtered.filter(i => i.interviewDate && new Date(i.interviewDate) >= now)
    .sort((a,b) => new Date(a.interviewDate)-new Date(b.interviewDate));
  const past      = filtered.filter(i => !i.interviewDate || new Date(i.interviewDate) < now);
  const all       = [...upcoming, ...past];
  const paginated = all.slice((ivPage-1)*PER_PAGE, ivPage*PER_PAGE);

  const STAGE_COLORS = { Interview:"#d97706", "Interview Scheduled":"#2563eb", Offer:"#16a34a", Selected:"#059669", Rejected:"#dc2626", "On Hold":"#6b7280" };
  const PRIORITY_COLORS = { "Dream Company":"#7c3aed", High:"#dc2626", Normal:"#6b7280", Low:"#9ca3af" };

  if (loading) return (
    <div className="page">
      <div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🗓</div>
        Loading interviews…
      </div>
    </div>
  );

  return (
    <div className="page">
      {/* Upcoming banner */}
      {upcoming.length > 0 && (
        <div style={{
          background:"linear-gradient(135deg,#fef3c7,#fef9c3)",
          border:"1.5px solid #fde047", borderRadius:12,
          padding:"12px 18px", marginBottom:16
        }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#713f12", marginBottom:8 }}>
            🔔 Upcoming Interviews ({upcoming.length})
          </div>
          {upcoming.slice(0,3).map((i,idx) => (
            <div key={idx} style={{ fontSize:13, color:"#713f12", marginBottom:4, display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontSize:11, background:"#fde047", borderRadius:6, padding:"1px 8px", fontWeight:700 }}>
                {new Date(i.interviewDate).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}
              </span>
              <strong>{i.company}</strong>
              {i.interviewRound && <span style={{ fontSize:11, color:"#92400e" }}> — {i.interviewRound}</span>}
            </div>
          ))}
          {upcoming.length > 3 && <div style={{ fontSize:11, color:"#92400e", marginTop:4 }}>+{upcoming.length-3} more…</div>}
        </div>
      )}

      {interviews.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🗓</span>
          <p style={{ marginBottom:8, fontWeight:600 }}>No interviews scheduled yet</p>
          <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.8 }}>
            Go to <strong>Inbox</strong> → click <strong>🗓 Interview</strong> on any message to schedule one.<br/>
            Scheduled interviews sync automatically to your Google Calendar.
          </p>
        </div>
      ) : (<>
        {/* Search + count */}
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
          <div style={{ flex:1 }}>
            <SearchBar value={ivSearch} onChange={v=>{setIvSearch(v);setIvPage(1);}} placeholder="Search company, email, round…" />
          </div>
          <span style={{ fontSize:12, color:"var(--text-muted)", flexShrink:0 }}>
            {filtered.length} interview{filtered.length!==1?"s":""}
          </span>
        </div>

        {/* Interview cards */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {paginated.map(iv => (
            <div key={iv._id} style={{
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:12, padding:"14px 18px", transition:"box-shadow 0.15s"
            }}>
              {editing === String(iv._id) ? (
                /* ── Edit mode ── */
                <div>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"var(--blue)" }}>
                    ✏️ {iv.company} — {iv.hrEmail}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Stage</label>
                      <DropdownSelect value={form.stage||iv.stage||"Interview"}
                        onChange={v=>setForm(p=>({...p,stage:v}))}
                        options={STAGES.map(s=>({value:s,label:s}))} width="100%" />
                    </div>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Round</label>
                      <DropdownSelect value={form.interviewRound||iv.interviewRound||""}
                        onChange={v=>setForm(p=>({...p,interviewRound:v}))}
                        placeholder="Select round…"
                        options={ROUNDS.map(r=>({value:r,label:r}))} width="100%" />
                    </div>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Interview Date & Time</label>
                      <input type="datetime-local" className="form-input" style={{ fontSize:13 }}
                        value={form.interviewDate ? new Date(form.interviewDate).toISOString().slice(0,16) : iv.interviewDate ? new Date(iv.interviewDate).toISOString().slice(0,16) : ""}
                        onChange={e=>setForm(p=>({...p,interviewDate:e.target.value}))} />
                    </div>
                    <div className="form-group" style={{ marginBottom:0 }}>
                      <label className="form-label" style={{ fontSize:11 }}>Priority</label>
                      <DropdownSelect value={form.priority||iv.priority||"Normal"}
                        onChange={v=>setForm(p=>({...p,priority:v}))}
                        options={["Low","Normal","High","Dream Company"].map(p=>({value:p,label:p}))} width="100%" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom:10 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Notes / Feedback</label>
                    <textarea className="form-textarea" rows={3} style={{ fontSize:13 }}
                      placeholder="Topics covered, feedback, next steps…"
                      value={form.callLog!==undefined?form.callLog:(iv.callLog||"")}
                      onChange={e=>setForm(p=>({...p,callLog:e.target.value}))} />
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn-primary btn-sm" onClick={save}>💾 Save</button>
                    <button className="btn-ghost btn-sm" onClick={()=>{setEditing(null);setForm({});}}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  {/* Avatar */}
                  <div style={{
                    width:40, height:40, borderRadius:10, flexShrink:0,
                    background:`linear-gradient(135deg,${STAGE_COLORS[iv.stage]||"#2563eb"},${STAGE_COLORS[iv.stage]||"#7c3aed"}88)`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"#fff", fontWeight:800, fontSize:14
                  }}>
                    {(iv.company||"?").slice(0,2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                      <span style={{ fontWeight:700, fontSize:14 }}>{iv.company}</span>
                      {iv.stage && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                          background:`${STAGE_COLORS[iv.stage]||"#6b7280"}20`, color:STAGE_COLORS[iv.stage]||"#6b7280" }}>
                          {iv.stage}
                        </span>
                      )}
                      {iv.priority && iv.priority !== "Normal" && (
                        <span style={{ fontSize:10, fontWeight:700, color:PRIORITY_COLORS[iv.priority]||"#6b7280" }}>
                          {iv.priority==="Dream Company"?"⭐ Dream":"🔥 "+iv.priority}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>
                      {iv.hrEmail}
                      {iv.role && <span style={{ color:"var(--blue)", marginLeft:8 }}>· {iv.role}</span>}
                    </div>

                    <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:12 }}>
                      {iv.interviewRound && (
                        <span style={{ color:"#7c3aed", fontWeight:600 }}>🎯 {iv.interviewRound}</span>
                      )}
                      {iv.interviewDate ? (
                        <span style={{ color: new Date(iv.interviewDate) >= now ? "#d97706" : "var(--text-muted)", fontWeight: new Date(iv.interviewDate) >= now ? 600 : 400 }}>
                          📅 {new Date(iv.interviewDate).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}
                          {new Date(iv.interviewDate) >= now && ` (in ${Math.floor((new Date(iv.interviewDate)-now)/86400000)}d)`}
                        </span>
                      ) : (
                        <span style={{ color:"var(--text-muted)", fontSize:11 }}>📅 Date not set</span>
                      )}
                    </div>

                    {iv.callLog && (
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4, fontStyle:"italic",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:400 }}>
                        📝 {iv.callLog}
                      </div>
                    )}
                  </div>

                  {/* Edit + Delete */}
                  <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                    {iv.calendarEventId && (
                      <span style={{ fontSize:10, color:"#1a73e8", fontWeight:600, display:"flex", alignItems:"center", gap:3 }}>
                        📅 Synced
                      </span>
                    )}
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="btn-ghost btn-sm"
                        onClick={()=>{setEditing(String(iv._id)); setForm({});}}>
                        ✏️ Edit
                      </button>
                      <button className="btn-ghost btn-sm" style={{ color:"#dc2626", borderColor:"#dc2626" }}
                        onClick={()=>deleteInterview(iv._id, iv.company)}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <Pagination page={ivPage} total={filtered.length} perPage={PER_PAGE} onChange={setIvPage} />
      </>)}
    </div>
  );
}

function BulkSendPage({ addToast, contacts }) {
  const templates    = getEmailTemplates();
  const [selected,   setSelected]   = useState(new Set());
  const [templateId, setTemplateId] = useState(templates[0]?.id || "fullstack");
  const [customNote, setCustomNote] = useState("");
  const [useAI,      setUseAI]      = useState(false);
  const [sending,    setSending]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("not_applied");

  const filtered = (contacts || []).filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.company?.toLowerCase().includes(q) || c.hrEmail?.toLowerCase().includes(q) || c.hrName?.toLowerCase().includes(q);
    const matchFilter = filter === "all" ? true
      : filter === "not_applied" ? !c.sent
      : filter === "no_reply"    ? (c.sent && !c.replied)
      : filter === "opened"      ? c.opened
      : true;
    return matchSearch && matchFilter;
  });

  const toggle = email => setSelected(prev => {
    const next = new Set(prev);
    next.has(email) ? next.delete(email) : next.add(email);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.hrEmail)));
  };

  const send = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Send ${selected.size} emails? ${useAI ? "AI will personalize each one." : ""}`)) return;
    setSending(true); setResult(null);
    try {
      const toSend = filtered.filter(c => selected.has(c.hrEmail)).map(c => ({
        hrEmail: c.hrEmail, hrName: c.hrName, company: c.company, role: c.role
      }));
      const r = await axios.post(`${API}/api/bulk-send`, { contacts: toSend, templateType: templateId, customNote, useAI });
      setResult(r.data);
      addToast && addToast(`✅ ${r.data.sent} emails sent!`);
      setSelected(new Set());
    } catch(e) {
      addToast && addToast("❌ " + (e.response?.data?.message || e.message), "error");
    } finally { setSending(false); }
  };

  return (
    <div className="page">
      {/* Controls */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label" style={{ fontSize:11 }}>Template</label>
            <select className="form-select" style={{ fontSize:13 }} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>

        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label" style={{ fontSize:11 }}>Custom Note (optional — overridden by AI if enabled)</label>
          <textarea className="form-textarea" rows={2} style={{ fontSize:13 }}
            placeholder="I am interested in opportunities at your company..."
            value={customNote} onChange={e => setCustomNote(e.target.value)} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
            <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
            <span>✨ AI personalize each email (Groq)</span>
          </label>
          <button className={`btn-primary ${sending?"loading":""}`}
            onClick={send} disabled={sending || !selected.size}
            style={{ background:"linear-gradient(135deg,#7c3aed,#2563eb)", marginLeft:"auto" }}>
            {sending ? "Sending..." : `⚡ Send ${selected.size} Emails`}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ background:result.failed>0?"#fef3c7":"#d1fae5", border:`1px solid ${result.failed>0?"#fde047":"#6ee7b7"}`, borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
          ✅ <strong>{result.sent}</strong> sent
          {result.skipped>0 && <span style={{color:"#92400e"}}> · ⏭ {result.skipped} skipped (already applied)</span>}
          {result.failed>0 && <span style={{color:"#dc2626"}}> · ❌ {result.failed} failed</span>}
        </div>
      )}

      {/* Contact list */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ flex:"1 1 180px" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search company, email, name…" />
        </div>
        <DropdownSelect value={filter} onChange={v=>{setFilter(v);setSelected(new Set());}} width="155px"
          options={[{value:"not_applied",label:"Not Applied Yet"},{value:"no_reply",label:"Applied, No Reply"},{value:"opened",label:"Opened Email"},{value:"all",label:"All Contacts"}]} />
        <button className="btn-ghost btn-sm" onClick={toggleAll}>
          {selected.size === filtered.length ? "Deselect All" : `Select All (${filtered.length})`}
        </button>
        <span style={{ fontSize:12, color:"var(--text-muted)", marginLeft:"auto", flexShrink:0 }}>{selected.size} selected</span>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:"55vh", overflowY:"auto" }}>
        {filtered.slice(0, 200).map(c => (
          <div key={c.hrEmail} onClick={() => toggle(c.hrEmail)}
            style={{
              display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
              background: selected.has(c.hrEmail) ? "var(--blue-50,#eff6ff)" : "var(--surface)",
              border:`1px solid ${selected.has(c.hrEmail)?"#93c5fd":"var(--border)"}`,
              borderRadius:8, cursor:"pointer"
            }}>
            <input type="checkbox" checked={selected.has(c.hrEmail)} onChange={() => toggle(c.hrEmail)} onClick={e => e.stopPropagation()} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{c.company || "Unknown"}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{c.hrEmail} {c.hrName ? `· ${c.hrName}` : ""}</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {c.sent     && <span style={{ fontSize:10, background:"#dbeafe", color:"#1e40af", padding:"2px 6px", borderRadius:99 }}>Applied</span>}
              {c.opened   && <span style={{ fontSize:10, background:"#ede9fe", color:"#5b21b6", padding:"2px 6px", borderRadius:99 }}>Opened</span>}
              {c.replied  && <span style={{ fontSize:10, background:"#d1fae5", color:"#065f46", padding:"2px 6px", borderRadius:99 }}>Replied</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>No contacts found</div>}
      </div>
    </div>
  );
}

export default App;
