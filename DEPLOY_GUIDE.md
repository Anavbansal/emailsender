# 🚀 Complete Deployment Guide — Job Mailer

## 📁 What's in this package

```
deployment/
├── backend/              ← Your existing backend (just update API_URL)
├── frontend-src/         ← Your existing frontend src
├── frontend/vercel.json  ← Vercel config
├── render.yaml           ← Render auto-deploy config
├── mobile-app/           ← React Native (Expo) APK project
└── DEPLOY_GUIDE.md       ← This file
```

---

## PART 1 — Deploy Backend to Render (Free)

### Step 1: Push to GitHub
```bash
# In your job-mailer folder:
git init
git add .
git commit -m "initial commit"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/job-mailer.git
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to https://render.com → Sign up free
2. Click **"New" → "Web Service"**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Region:** Singapore (closest to India)
5. Click **"Advanced"** → Add Environment Variables:

| Key | Value |
|-----|-------|
| `GMAIL_USER` | anavbansal06@gmail.com |
| `GMAIL_PASS` | your_app_password |
| `GOOGLE_CLIENT_ID` | your_oauth_client_id |
| `GOOGLE_CLIENT_SECRET` | your_oauth_secret |
| `GOOGLE_REDIRECT_URI` | https://YOUR-APP.onrender.com/api/gmail/callback |
| `BASE_URL` | https://YOUR-APP.onrender.com |
| `GOOGLE_SHEET_ID` | your_sheet_id |

6. Click **Deploy**
7. Wait ~3 minutes. You'll get a URL like: `https://job-mailer-backend-xyz.onrender.com`

> ⚠️ Free tier sleeps after 15 min of inactivity. First request takes ~30s.

---

## PART 2 — Update Frontend API URL

Before deploying frontend, update this line in `frontend/src/App.js`:
```javascript
// Change this:
const API = "http://localhost:5000";

// To your Render URL:
const API = "https://job-mailer-backend-xyz.onrender.com";
```

---

## PART 3 — Deploy Frontend to Vercel (Free)

### Option A: Drag & Drop (Easiest)
1. Run `npm run build` in your frontend folder
2. Go to https://vercel.com → New Project
3. Drag the `build/` folder to Vercel
4. Done! You get a URL like: `https://job-mailer-xyz.vercel.app`

### Option B: GitHub Auto-Deploy
1. Go to https://vercel.com → Import Git Repository
2. Select your repo, set root directory to `frontend`
3. Vercel auto-detects Create React App
4. Add environment variable: `REACT_APP_API_URL` = your Render URL
5. Deploy!

---

## PART 4 — Build Android APK (Free with Expo)

### Step 1: Setup
```bash
# Install Expo CLI
npm install -g expo-cli eas-cli

# Navigate to mobile app
cd mobile-app
npm install

# Login to Expo (free account)
eas login
```

### Step 2: Update API URL
Edit `mobile-app/src/config.js`:
```javascript
export const API_URL = "https://your-render-app.onrender.com";
```

### Step 3: Configure EAS
```bash
eas build:configure
# This creates/updates eas.json
```

### Step 4: Build APK (Free!)
```bash
# Build APK (installable on any Android phone)
eas build --platform android --profile apk

# OR preview build (also APK, slightly faster)
eas build --platform android --profile preview
```

- Build takes ~10-15 minutes on Expo's free servers
- You'll get a download link for the `.apk` file
- **No Google Play account needed** — share APK directly!

### Step 5: Install on Phone
1. Download the `.apk` from the link EAS gives you
2. On your Android phone: Settings → Security → Allow Unknown Sources
3. Open the APK file on phone → Install
4. Done! App installed!

### Test Locally First (No Build Needed)
```bash
cd mobile-app
npm install
npx expo start
# Scan QR code with Expo Go app on your phone
```

---

## PART 5 — Update Google OAuth Redirect URI

After deployment, go to Google Cloud Console:
1. APIs & Services → Credentials → Your OAuth Client
2. Add to Authorized Redirect URIs:
   ```
   https://your-render-app.onrender.com/api/gmail/callback
   ```

---

## 🔥 Quick Summary

| What | Platform | Time | Cost |
|------|---------|------|------|
| Backend | Render | ~5 min | FREE |
| Frontend | Vercel | ~3 min | FREE |
| APK | Expo EAS | ~15 min | FREE |

**Total cost: ₹0** 🎉

---

## 🐛 Common Issues

**CORS Error after deployment:**
Add your Vercel URL to allowed origins in `backend/server.js`:
```javascript
app.use(cors({
  origin: ["https://your-app.vercel.app", "http://localhost:3000"]
}));
```

**Render sleeping:**
Use https://uptimerobot.com (free) to ping your backend every 5 minutes.

**APK not installing:**
Enable "Install from Unknown Sources" in Android settings.
