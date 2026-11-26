# Glinax / Cerkyl

An AI admissions assistant for Ghanaian SHS graduates. Students chat with
**Cerkyl** about university programmes, cut-off points and requirements,
take a career/interest assessment, and buy university application forms
(vouchers) through Paystack.

## Architecture

| Service | Stack | Local port | Hosting |
|---|---|---|---|
| [`frontend/`](frontend/) | React + TypeScript, Vite, Tailwind, Zustand | 5173 | Vercel |
| [`backend/`](backend/) | Node.js + Express 5, MongoDB driver, Socket.io | 5000 | Render |
| [`ai-rag-service/`](ai-rag-service/) | Python FastAPI, Groq LLM, Tesseract OCR | 8000 | Render |

Third-party services: MongoDB Atlas, Groq, Brevo (email), Paystack
(payments), SerpAPI (optional web search).

**A chat message:** browser → `POST /api/chat/send` (backend) → loads the
last 20 messages and the student's saved assessment → `POST /respond`
(AI service) → keyword search over the university knowledge base, plus a
web search when local data isn't a confident match or the question is
time-sensitive → Groq → the backend saves both messages and generates
the conversation title in the background.

The frontend is a static SPA: API calls go straight from the browser to
the Render backend, so debug API problems in the Render logs and the
browser's Network tab, not on Vercel.

**Where the AI's knowledge lives:** the university data is the
`GHANA_UNIVERSITIES_KNOWLEDGE` dictionary inside
[`ai-rag-service/main.py`](ai-rag-service/main.py). The `.txt` files in
that folder are placeholders. Edit the dictionary to change what the bot
knows. (The `universities_knowledge` MongoDB collection is a one-time
seed copy and is not used for answers.)

## Running locally

Requirements: Node 20+, Python 3.12, a MongoDB Atlas cluster and a Groq
API key. Tesseract is optional (only for OCR on uploaded images).

1. Create the env files from the examples and fill them in:
   [`backend/.env.example`](backend/.env.example),
   [`ai-rag-service/.env.example`](ai-rag-service/.env.example),
   [`frontend/.env.example`](frontend/.env.example).
   `JWT_SECRET`, `MONGODB_URI`, `DB_NAME` and (when set) `INTERNAL_API_KEY`
   must match between the backend and the AI service.
2. Install and start each service in its own terminal:

```powershell
# AI service (port 8000)
cd ai-rag-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py

# Backend (port 5000)
cd backend
npm install
npm run dev

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

3. Open http://localhost:5173 and sign up with a Gmail address.

### Skipping email verification locally

Set `DEV_SKIP_EMAIL=true` in `backend/.env`. Verification codes are then
printed in the backend terminal instead of being emailed, and the signup
page finishes signup without the code step. It is ignored whenever
`NODE_ENV=production`, so make sure Render has `NODE_ENV=production`.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `querySrv ECONNREFUSED` on MongoDB | Node can't resolve the `+srv` DNS record. Use the standard `mongodb://host1,host2,host3/...` connection string (see `backend/.env.example`). |
| Backend takes minutes to start on Windows | Antivirus scanning `node_modules`. Add a Windows Defender exclusion for the repo folder. |
| Verification email never arrives | `FROM_EMAIL` must be a verified Brevo sender. Check Brevo's transactional logs. |
| Vercel deploy "did nothing" | The build failed (`tsc -b` treats unused imports as errors) and Vercel kept the old deployment. Check the build log. |
| First chat after idle returns a fallback answer | Render free-tier cold start exceeded the backend's 30s AI timeout. Retry. |
