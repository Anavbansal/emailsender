# 📬 Email Sender App

A full-stack email sending application built with React (frontend) + Node.js/Express/Nodemailer (backend).

---

## 📁 Project Structure

```
email-sender-app/
├── backend/
│   ├── .env          ← Gmail credentials (edit this!)
│   ├── package.json
│   └── server.js     ← Express + Nodemailer API
└── frontend/
    ├── package.json
    └── src/
        ├── App.js    ← React UI
        ├── App.css   ← Styling
        └── index.js  ← Entry point
```

---

## ⚙️ Setup & Installation

### 1. Configure Gmail App Password

> ⚠️ You CANNOT use your regular Gmail password. You must use a Google **App Password**.

**Steps to generate one:**
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Navigate to **Security** → enable **2-Step Verification** if not done
3. Go to **Security** → **App passwords**
4. Choose App: **Mail** → Device: **Other** → Click **Generate**
5. Copy the 16-character password shown

### 2. Update `.env`

Edit `backend/.env`:

```env
GMAIL_USER=your_actual_email@gmail.com
GMAIL_PASS=abcd efgh ijkl mnop   # ← paste your 16-char App Password (spaces OK)
PORT=5000
```

---

## 🚀 Running the App

### Backend (Terminal 1)

```bash
cd backend
npm install
npm start
# → Server running on http://localhost:5000
# → ✅ Gmail transporter is ready to send emails.
```

### Frontend (Terminal 2)

```bash
cd frontend
npm install
npm start
# → React app opens on http://localhost:3000
```

---

## 🔌 API Reference

### `POST /api/send-email`

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Hello!",
  "message": "This is the email body."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email successfully sent to recipient@example.com!",
  "messageId": "<...@gmail.com>"
}
```

**Error Responses:**
- `400` — Missing or invalid fields
- `500` — Gmail send failure

---

## 🛡️ Security Notes

- Never commit your `.env` file to version control. Add it to `.gitignore`.
- App Passwords are revocable — if compromised, generate a new one from your Google Account.
- For production, consider adding rate limiting (`express-rate-limit`) and request sanitization.
