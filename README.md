# ⚡ Raai Academic OS — Railway Deployment Guide

## What Changed (Ollama → Groq)
- `ollama.chat(...)` replaced with `groq.chat.completions.create(...)`
- Model: `llama3-70b-8192` (same LLaMA 3, but runs on Groq's cloud)
- `num_predict` → `max_tokens` (Groq parameter name)
- Added `PORT` env var support for Railway

---

## 🚀 Deploy to Railway (Step by Step)

### Step 1 — Get your Groq API Key
1. Go to https://console.groq.com
2. Sign up / Log in
3. Click **API Keys** → **Create API Key**
4. Copy it (starts with `gsk_...`)

### Step 2 — Put your HTML file in place
Copy your `index.html` into the `templates/` folder.
The file should be at: `templates/index.html`

### Step 3 — Push to GitHub
```bash
git init
git add .
git commit -m "Raai Academic OS - Railway deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/raai-app.git
git push -u origin main
```

### Step 4 — Deploy on Railway
1. Go to https://railway.app
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. Railway will auto-detect Python and start building

### Step 5 — Add your Groq API Key
1. In Railway dashboard, click your project
2. Go to **Variables** tab
3. Add these environment variables:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | `gsk_your_key_here` |
| `SECRET_KEY` | `any-random-string-here` |

4. Railway will auto-redeploy after you save

### Step 6 — Get your live URL
- Railway gives you a URL like: `https://raai-app-production.up.railway.app`
- Share it with anyone — it runs 24/7! 🎉

---

## 📁 File Structure
```
raai-railway/
├── app.py              ← Main Flask app (Groq-powered)
├── requirements.txt    ← Python dependencies
├── Procfile            ← Tells Railway how to start
├── railway.json        ← Railway config
├── .gitignore
├── README.md
└── templates/
    └── index.html      ← Your frontend (copy here!)
```

---

## 💡 Notes
- **Free tier**: Groq free tier = 14,400 requests/day. More than enough!
- **Memory**: Chat history resets if Railway restarts the server (free tier). 
  To persist data, you can add a Railway Postgres DB later.
- **Logs**: Railway dashboard → Deployments → View logs (for debugging)
