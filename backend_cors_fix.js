// ADD THIS to your backend/server.js to fix CORS after deployment
// Replace: app.use(cors());
// With:

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      "http://localhost:3000",
      "https://your-app.vercel.app",        // ← replace with your Vercel URL
      "https://your-app-xyz.vercel.app",     // ← Vercel preview URLs
      /\.vercel\.app$/,                       // ← all vercel subdomains
      /\.render\.com$/,                       // ← render subdomains
    ];
    if (!origin) return callback(null, true); // allow server-to-server
    const isAllowed = allowed.some(p => 
      typeof p === "string" ? p === origin : p.test(origin)
    );
    callback(isAllowed ? null : new Error("CORS blocked"), isAllowed);
  },
  credentials: true,
}));
