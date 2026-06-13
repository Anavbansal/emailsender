# 🚀 Job Mailer App — Complete Setup Guide

## Prerequisites
- GitHub account
- Node.js installed (v18+)
- Gmail account

---

## Step 1 — Fork the Repository

1. Go to `https://github.com/Anavbansal/emailsender`
2. Click **Fork** (top right)
3. Fork to your own GitHub account

---

## Step 2 — MongoDB Atlas Setup

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → **Sign Up** (free)
2. Create a new **Free Cluster** (M0 tier)
3. **Database Access** → Add User → Username + Password → note these down
4. **Network Access** → Add IP → `0.0.0.0/0` (allow all)
5. **Connect** → **Drivers** → Copy connection string:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/jobmailer
   ```

---

## Step 3 — Google Cloud Console (Gmail OAuth)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. **Create New Project** → Give it a name
3. **APIs & Services** → **Enable APIs** → Search `Gmail API` → Enable
4. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://YOUR-RENDER-URL.onrender.com/api/gmail/callback`
5. Copy **Client ID** and **Client Secret**
6. **OAuth consent screen** → Add your Gmail as **Test User**

---

## Step 4 — Render (Backend)

1. Go to [render.com](https://render.com) → **Sign Up**
2. **New** → **Web Service** → Connect GitHub → Select your forked repo
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free

4. **Environment Variables** — Add these:
   ```
   MONGODB_URI        = mongodb+srv://...  (from Step 2)
   JWT_SECRET         = any_random_secret_string_here
   INVITE_CODE        = your_invite_code
   OWNER_USERNAME     = your_username
   GOOGLE_CLIENT_ID   = (from Step 3)
   GOOGLE_CLIENT_SECRET = (from Step 3)
   GOOGLE_REDIRECT_URI = https://YOUR-RENDER-URL.onrender.com/api/gmail/callback
   GMAIL_USER         = youremail@gmail.com
   ```

5. Click **Deploy** → Wait for `Service is live 🎉`
6. Note your Render URL: `https://xxxx.onrender.com`

---

## Step 5 — Gmail Connect (Get Refresh Token)

1. Open this URL in browser (after Render deploy):
   ```
   https://YOUR-RENDER-URL.onrender.com/api/gmail/auth?username=YOUR_USERNAME
   ```
2. Login with your Gmail → Allow all permissions
3. You'll see: **"Gmail Connected!"** ✅

---

## Step 6 — Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **Sign Up**
2. **New Project** → Import your forked GitHub repo
3. Settings:
   - **Root Directory:** `frontend-src`
   - **Framework:** Create React App
4. **Environment Variables:**
   ```
   REACT_APP_API_URL = https://YOUR-RENDER-URL.onrender.com
   ```
5. Click **Deploy** → Wait for build
6. Note your Vercel URL: `https://xxxx.vercel.app`

---

## Step 7 — Update Render CORS

Add one more env var in Render:
```
FRONTEND_URL = https://YOUR-VERCEL-URL.vercel.app
```
Then **Manual Deploy** on Render.

---

## Step 8 — Register Your Account

1. Open your Vercel URL
2. Click **Register**
3. Fill:
   - Username, Password
   - **Invite Code:** (whatever you set in Step 4)
4. Login ✅

---

## Step 9 — Initialize Your Profile

Run this in terminal (replace values):
```bash
curl -X POST "https://YOUR-RENDER-URL.onrender.com/api/auth/init-priyal" \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_JWT_SECRET"}'
```

---

## Step 10 — Add Your Resume PDFs

Upload your resume PDFs to the `backend/` folder in your GitHub repo:
- `Your_Name_Resume.pdf`

Then in Render → Shell:
```bash
ls backend/*.pdf
```
Confirm files are there ✅

---

## ✅ Done! Your app is live.

### Summary of URLs:
| Service | URL |
|---------|-----|
| Frontend | `https://xxxx.vercel.app` |
| Backend | `https://xxxx.onrender.com` |
| MongoDB | Atlas Dashboard |

---

## 🆘 Common Issues

| Problem | Fix |
|---------|-----|
| Gmail not connecting | Add your email as Test User in Google Console |
| CORS error | Check FRONTEND_URL env var in Render |
| MongoDB error | Check IP whitelist → 0.0.0.0/0 |
| Build failed | Check Root Directory in Vercel = `frontend-src` |
| 401 errors | JWT_SECRET must match in all routes |

---

## 📞 Need Help?
Contact: Anav Bansal — anavbansal06@gmail.com
