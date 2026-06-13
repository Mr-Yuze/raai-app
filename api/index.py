from flask import Flask, render_template, request, jsonify, session
from groq import Groq
import os
import json
import re

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = os.environ.get("SECRET_KEY", "raai-academic-os-2024")

# ── Groq Client ────────────────────────────────────────
# Use a dummy key if missing to prevent Vercel 500 crash on startup
api_key = os.environ.get("GROQ_API_KEY")
if not api_key:
    api_key = "gsk_missing_api_key_please_set_in_vercel"
client = Groq(api_key=api_key)
MODEL  = "llama-3.3-70b-versatile"

# ── In-memory file store (per-session, within one request cycle) ───
# NOTE: On Vercel serverless, this is shared within the same instance
# for the lifetime of a request. File uploads work within a session.
file_contents = {}   # session_key -> text

# ── System Prompt ──────────────────────────────────────
def build_system_prompt(profile=None):
    if not profile:
        profile = {}
    name  = profile.get("name", "Student")
    dept  = profile.get("dept", "")
    year  = profile.get("year", "")
    cgpa  = profile.get("cgpa", "")
    weak  = ", ".join(profile.get("weak_areas", [])) or "none tracked yet"
    style = profile.get("learning_style", "balanced")

    return {
        "role": "system",
        "content": (
            f"You are Raai, an Academic AI Operating System built by Rahul. "
            f"You are NOT ChatGPT, Gemini, Claude, or any other AI. "
            f"You are Raai — a personalized academic intelligence system. "
            f"If anyone asks who made you, say: 'I was built by Rahul as an Academic AI OS.' "
            f"Never mention Anthropic, Meta, LLaMA, Ollama, Groq, or OpenAI. "
            f"\n\nStudent Profile:"
            f"\n- Name: {name}"
            f"\n- Department: {dept or 'Not set'}"
            f"\n- Year: {year or 'Not set'}"
            f"\n- CGPA: {cgpa or 'Not set'}"
            f"\n- Known weak areas: {weak}"
            f"\n- Learning style: {style}"
            f"\n\nTone & Personality:"
            f"\n- You're like a smart, warm senior friend who genuinely wants the student to succeed."
            f"\n- Sound natural and conversational — not robotic, not overly formal."
            f"\n- Use casual phrases like 'got it', 'makes sense', 'here's the thing', 'no worries', 'yeah' when they fit naturally."
            f"\n- Be encouraging and positive, especially when a student is struggling."
            f"\n- Keep responses concise and clear unless the topic genuinely needs depth."
            f"\n- For academic content, be thorough, structured, and exam-focused."
            f"\n- Tailor explanations to the student's department and year."
            f"\n- Use proper markdown: **bold** for key terms, ## for section headers, bullet points for lists."
            f"\n\nBoundaries:"
            f"\n- Never use profanity or offensive language under any circumstances."
            f"\n- Never generate harmful, sexual, violent, or inappropriate content."
            f"\n- If asked something inappropriate, politely decline and redirect to academics."
        )
    }

def ask_raai(messages, profile=None, max_tokens=2048, temperature=0.7):
    sys_prompt = build_system_prompt(profile)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[sys_prompt] + messages,
        max_tokens=max_tokens,
        temperature=temperature
    )
    return response.choices[0].message.content

# ── File reading ───────────────────────────────────────
def read_file(file):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext in [".txt", ".md"]:
        return file.read().decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        try:
            import pypdf
            from io import BytesIO
            reader = pypdf.PdfReader(BytesIO(file.read()))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            return f"PDF read error: {e}"
    elif ext == ".docx":
        try:
            from docx import Document
            from io import BytesIO
            doc = Document(BytesIO(file.read()))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            return f"DOCX read error: {e}"
    elif ext in [".py", ".js", ".html", ".css", ".json", ".csv", ".xml", ".java", ".c", ".cpp"]:
        return file.read().decode("utf-8", errors="ignore")
    return None

# ── Session key helper ─────────────────────────────────
def get_session_key():
    """Return a per-session+chat key for file storage."""
    if "session_id" not in session:
        import uuid
        session["session_id"] = str(uuid.uuid4())
    chat_id = request.json.get("chat_id", "default") if request.is_json else request.form.get("chat_id", "default")
    return f"{session['session_id']}_{chat_id}"

# ── Profanity Filter ───────────────────────────────────
BAD_WORDS = [
    "fuck","fucking","fucked","fucker","fucks","f*ck","f**k",
    "shit","shitting","shitted","bullshit","bs","s**t","sh*t",
    "bitch","bitches","bitching","b*tch",
    "ass","asshole","asshat","asses","a**hole",
    "damn","dammit","goddamn",
    "crap","cunt","c*nt",
    "dick","dicks","d*ck",
    "cock","c*ck",
    "pussy","p*ssy",
    "bastard","b*stard",
    "wtf","stfu","gtfo",
    "sex","porn","nude","nudes","naked","nsfw",
    "slut","wh*re","whore","h*e","hoe",
    "rape","kill yourself","kys","suicide","self harm",
]

def contains_bad_word(text):
    text_lower = text.lower()
    for word in BAD_WORDS:
        pattern = r'\b' + re.escape(word) + r'\b'
        if re.search(pattern, text_lower):
            return True
    return False

def censor_text(text):
    result = text
    for word in BAD_WORDS:
        pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
        stars = word[0] + '*' * (len(word) - 2) + word[-1] if len(word) > 2 else '*' * len(word)
        result = pattern.sub(stars, result)
    return result

# ══════════════════════════════════════════════════════
# ── ROUTES ────────────────────────────────────────────
# ══════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")

# ── Core Chat (STATELESS — client sends full history) ──
@app.route("/chat", methods=["POST"])
def chat():
    data     = request.json or {}
    msg      = data.get("message", "").strip()
    history  = data.get("messages", [])   # full history from localStorage
    profile  = data.get("profile", {})
    chat_id  = data.get("chat_id", "default")
    display_msg = data.get("display_message", msg)

    if not msg:
        return jsonify({"reply": "Say something bro!"})

    if contains_bad_word(msg):
        return jsonify({
            "reply": "⚠️ Hey bro, let's keep it clean! I'm here to help you study — please use respectful language 🙏",
        })

    # Attach uploaded file context if any
    file_key = f"{session.get('session_id','anon')}_{chat_id}"
    file_text = file_contents.get(file_key, "")
    if file_text:
        context = [
            {"role": "user",      "content": f"I have uploaded this document for reference:\n\n---\n{file_text[:4000]}\n---\nPlease use it to answer my questions."},
            {"role": "assistant", "content": "Got it bro! I've read the full document and I'm ready to help with anything about it."}
        ] + history + [{"role": "user", "content": msg}]
    else:
        context = history + [{"role": "user", "content": msg}]

    try:
        reply = ask_raai(context, profile)
        reply = censor_text(reply)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

# ── File upload ────────────────────────────────────────
@app.route("/upload", methods=["POST"])
def upload():
    if "session_id" not in session:
        import uuid
        session["session_id"] = str(uuid.uuid4())
    chat_id = request.form.get("chat_id", "default")
    file_key = f"{session['session_id']}_{chat_id}"
    try:
        if "file" not in request.files or request.files["file"].filename == "":
            return jsonify({"success": False, "message": "No file selected."})
        file    = request.files["file"]
        content = read_file(file)
        if content is None:
            return jsonify({"success": False, "message": "Unsupported file type."})
        file_contents[file_key] = content
        return jsonify({"success": True, "filename": file.filename, "word_count": len(content.split())})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/clear-file", methods=["POST"])
def clear_file():
    if "session_id" not in session:
        return jsonify({"success": True})
    data = request.json or {}
    chat_id = data.get("chat_id", "default")
    file_key = f"{session['session_id']}_{chat_id}"
    file_contents.pop(file_key, None)
    return jsonify({"success": True})

# ── Helper: get file text ──────────────────────────────
def get_file_text(chat_id="default"):
    file_key = f"{session.get('session_id','anon')}_{chat_id}"
    return file_contents.get(file_key, "")

# ── Academic Tools ─────────────────────────────────────
@app.route("/academic/get-topic", methods=["POST"])
def get_topic():
    data = request.json or {}
    chat_id = data.get("chat_id", "default")
    text = get_file_text(chat_id)
    if not text:
        return jsonify({"topic": "general university subject"})
    try:
        topic = ask_raai([{"role": "user", "content": f"In 5-10 words, what is the main subject/topic of this document? Reply with ONLY the topic name, nothing else.\n\n{text[:1000]}"}], max_tokens=50)
        return jsonify({"topic": topic.strip()})
    except:
        return jsonify({"topic": "the uploaded subject"})

@app.route("/academic/exam-questions", methods=["POST"])
def exam_questions():
    data   = request.json or {}
    chat_id = data.get("chat_id", "default")
    text   = get_file_text(chat_id)
    qtype  = data.get("type", "2mark")
    profile = data.get("profile", {})

    if not text:
        return jsonify({"reply": "⚠️ Upload a document first bro!"})

    prompts = {
        "2mark": f"You are an exam question generator. From the following document, generate 10 important 2-mark questions with answers that are likely to appear in exams. Use **bold** for question numbers and section headers. Format clearly with Q1, Q2...\n\n{text[:4000]}",
        "16mark": f"""You are a university exam expert. From the document below, generate exactly 5 important 16-mark exam questions with COMPLETE model answers.

FORMAT for each question (strictly follow this):

## Question [N]: [Question title]

**Q: [Full question statement — write it as it would appear in an exam paper]**

### Answer:

**Introduction:** [2-3 lines introducing the concept]

**[Main point 1 heading]:**
[Detailed explanation — at least 4-5 lines]

**[Main point 2 heading]:**
[Detailed explanation — at least 4-5 lines]

**[Main point 3 heading]:**
[Detailed explanation — at least 4-5 lines]

**Conclusion:** [2-3 lines summarizing the answer]

---

Each answer MUST be at least 400 words. Do NOT write short answers.

Document:
{text[:5000]}""",
        "viva": f"You are a viva examiner. Generate 15 viva voce questions from this document with expected answers. Use **bold** for question numbers. Make them tricky but fair.\n\n{text[:4000]}",
        "predictions": f"You are an expert in predicting exam questions. Analyze this document and predict the TOP 10 most likely exam questions. Use **bold** for question numbers and explain why each is important.\n\n{text[:4000]}",
        "flashcards": f"""Generate exactly 10 flashcards from the document. Use EXACTLY this format for each card:

CARD1
Q: [Write a clear exam question about a key concept]
A: [Write a complete answer in 2-3 sentences]
TAG: [2-3 word topic label]

CARD2
Q: [Question]
A: [Answer]
TAG: [topic]

(continue for all 10 cards)

Rules:
- Each Q must be a proper question ending with ?
- Each A must be 2-3 sentences, complete and informative
- Cover 10 DIFFERENT topics from the document

Document:
{text[:4000]}""",
        "roadmap": f"""Create a detailed semester study roadmap from this document. Use EXACTLY this format:

WEEK 1-2: [Week title]
TOPICS: [topic1] | [topic2] | [topic3]
GOAL: [One sentence learning goal]
RESOURCES: [resource1] | [resource2]
DIFFICULTY: [Easy/Medium/Hard]
TIP: [One practical study tip]

Continue for at least 6-8 week blocks covering all major topics.

Document:
{text[:4000]}""",
    }

    prompt      = prompts.get(qtype, prompts["2mark"])
    token_limit = 4096 if qtype == "16mark" else 2048
    temp        = 0.95 if qtype == "flashcards" else 0.7

    try:
        reply = ask_raai([{"role": "user", "content": prompt}], profile, max_tokens=token_limit, temperature=temp)

        if qtype == "flashcards":
            cards = []
            blocks = re.split(r'CARD\d+', reply, flags=re.IGNORECASE)
            for block in blocks:
                block = block.strip()
                if not block:
                    continue
                q_match = re.search(r'Q:\s*(.+?)(?=\nA:|\Z)', block, re.IGNORECASE | re.DOTALL)
                a_match = re.search(r'A:\s*(.+?)(?=\nTAG:|\Z)', block, re.IGNORECASE | re.DOTALL)
                t_match = re.search(r'TAG:\s*(.+?)(?=\n|\Z)', block, re.IGNORECASE)

                front = q_match.group(1).strip() if q_match else ""
                back  = a_match.group(1).strip() if a_match else ""
                tag   = t_match.group(1).strip() if t_match else "Concept"

                front = ' '.join(front.split())
                back  = ' '.join(back.split())
                tag   = ' '.join(tag.split())

                if front and back and len(front) > 5 and len(back) > 10:
                    cards.append({"front": front, "back": back, "tag": tag})

            if len(cards) < 3:
                cards = []
                lines = reply.split('\n')
                current = {}
                for line in lines:
                    line = line.strip()
                    if re.match(r'^Q:', line, re.IGNORECASE):
                        if current.get('front') and current.get('back'):
                            cards.append({"front": current['front'], "back": current['back'], "tag": current.get('tag','Concept')})
                        current = {'front': re.sub(r'^Q:\s*', '', line, flags=re.IGNORECASE).strip()}
                    elif re.match(r'^A:', line, re.IGNORECASE) and current.get('front'):
                        current['back'] = re.sub(r'^A:\s*', '', line, flags=re.IGNORECASE).strip()
                    elif re.match(r'^TAG:', line, re.IGNORECASE):
                        current['tag'] = re.sub(r'^TAG:\s*', '', line, flags=re.IGNORECASE).strip()
                    elif current.get('back') and line and not re.match(r'^CARD\d+', line, re.IGNORECASE):
                        current['back'] += ' ' + line
                if current.get('front') and current.get('back'):
                    cards.append({"front": current['front'], "back": current['back'], "tag": current.get('tag','Concept')})

            while len(cards) < 10:
                cards.append({"front": "What is a key concept from this document?", "back": "Please re-generate flashcards for more questions.", "tag": "General"})
            cards = cards[:10]
            return jsonify({"reply": json.dumps(cards)})

        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/academic/code-analyze", methods=["POST"])
def code_analyze():
    data    = request.json or {}
    code    = data.get("code", "").strip()
    mode    = data.get("mode", "explain")
    profile = data.get("profile", {})

    if not code:
        return jsonify({"reply": "⚠️ Paste some code first bro!"})

    prompts = {
        "explain":    f"Explain this code line by line in simple terms. Use **bold** for important terms and ## for section headers:\n\n```\n{code}\n```",
        "optimize":   f"Review this code and suggest optimizations. Show the improved version. Use ## for sections and **bold** for key points:\n\n```\n{code}\n```",
        "complexity": f"""Analyze the time and space complexity. Use EXACTLY this format:

OVERALL_TIME: O(?)
OVERALL_SPACE: O(?)
RATING: [Excellent/Good/Fair/Poor]
SUMMARY: [one sentence about overall complexity]

BEST: O(?) | WHEN: [when this occurs]
AVERAGE: O(?) | WHEN: [when this occurs]
WORST: O(?) | WHEN: [when this occurs]

FUNC: [function name] | TIME: O(?) | SPACE: O(?) | WHY: [reason]

LOOP: [describe loop] | DEPTH: [1/2/3] | COMPLEXITY: O(?) | LINE: [line reference]

BOTTLENECK: [what is the performance bottleneck]

OPTIMIZE: [specific optimization tip]
OPTIMIZE: [another tip]

Code:
```
{code}
```""",
        "review": f"""You are a senior software engineer doing a STRICT code review.

Use EXACTLY this format:

LANG: [language]
SCORE: [0-100]
LEVEL: [Beginner/Intermediate/Advanced]
SUMMARY: [2 sentences about what this code does and overall quality]

METRIC: Correctness | [score /25] | [one line verdict]
METRIC: Code Quality | [score /20] | [one line verdict]
METRIC: Security | [score /20] | [one line verdict]
METRIC: Performance | [score /20] | [one line verdict]
METRIC: Readability | [score /15] | [one line verdict]

BUG: [describe bug] | [Critical/Major/Minor]

FIX: [specific fix]

PLATFORM: LeetCode | [Easy/Medium/Hard] | [what skills this demonstrates]
PLATFORM: HackerRank | [star rating 1-5] | [which domain]
PLATFORM: CodeChef | [rating range] | [div level]

IMPROVE: [specific improvement]
IMPROVE: [another improvement]

VERDICT: [final 2-sentence verdict]

Code:
```
{code}
```""",
        "viva": f"Generate 10 viva questions a professor might ask about this code, with expected answers. Use **Q1:**, **Q2:** etc:\n\n```\n{code}\n```"
    }

    prompt = prompts.get(mode, prompts["explain"])
    try:
        reply = ask_raai([{"role": "user", "content": prompt}], profile, max_tokens=3000)
        return jsonify({"reply": reply, "mode": mode})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/academic/cgpa-planner", methods=["POST"])
def cgpa_planner():
    data    = request.json or {}
    profile = data.get("profile", {})
    current = data.get("current_cgpa", "")
    target  = data.get("target_cgpa", "")
    credits = data.get("remaining_credits", "")
    subject_details = data.get("subject_details", [])
    req_pct = data.get("req_grade_pct", "")

    subj_block = "\n".join([f"- {s['name']}: {s['credits']} credits, {s['priority']} priority" for s in subject_details]) if subject_details else data.get("subjects", "")

    prompt = (
        f"You are a strict academic coach. A student must go from CGPA {current} to {target}.\n"
        f"Total upcoming credits: {credits}. Required min score: {req_pct}%.\n\n"
        f"Their subjects:\n{subj_block}\n\n"
        f"Use EXACTLY this format:\n\n"
        f"SUMMARY: [2 direct sentences about what it takes to go from {current} to {target}]\n\n"
        f"STAT: GPA Gap | {float(target)-float(current):.2f} points to close\n"
        f"STAT: Total Credits | {credits} credits\n"
        f"STAT: Min Score Needed | {req_pct}% in every exam\n"
        f"STAT: Daily Study Hours | [specific hours needed]\n\n"
    )
    for s in subject_details:
        hrs = "3+ hrs/day" if s['priority']=='High' else ("2 hrs/day" if s['priority']=='Medium' else "1 hr/day")
        prompt += f"SUBJECT: {s['name']} | {req_pct}% target | {s['priority']} | {hrs} | [2-3 specific study actions]\n"
    prompt += (
        f"\nSCHEDULE: Monday | [subjects] | [hours] | [specific task]\n"
        f"SCHEDULE: Tuesday | [subjects] | [hours] | [specific task]\n"
        f"SCHEDULE: Wednesday | [subjects] | [hours] | [specific task]\n"
        f"SCHEDULE: Thursday | [subjects] | [hours] | [specific task]\n"
        f"SCHEDULE: Friday | [subjects] | [hours] | [specific task]\n"
        f"SCHEDULE: Saturday | [ALL subjects revision] | [hours] | [Mock test + weak area review]\n"
        f"SCHEDULE: Sunday | [Rest + planning] | [2h] | [Plan next week]\n\n"
        f"STRATEGY: [title] | [1 specific actionable tactic]\n"
        f"STRATEGY: [title] | [1 specific tactic]\n"
        f"STRATEGY: [title] | [1 specific tactic]\n\n"
        f"MOTIVATION: [2-3 direct and energizing sentences]\n"
    )
    try:
        reply = ask_raai([{"role": "user", "content": prompt}], profile, max_tokens=2048)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/academic/attendance", methods=["POST"])
def attendance_risk():
    data      = request.json or {}
    profile   = data.get("profile", {})
    total     = int(data.get("total_classes", 0))
    attended  = int(data.get("attended", 0))
    remaining = int(data.get("remaining", 0))

    if total == 0:
        return jsonify({"reply": "Enter valid class numbers bro!"})

    current_pct = (attended / total) * 100
    needed      = max(0, int((0.75 * (total + remaining)) - attended))
    can_miss    = max(0, int(attended - 0.75 * (total + remaining)))

    if current_pct >= 75:
        status = "✅ SAFE"
        msg    = f"You can still miss {can_miss} more classes and stay above 75%."
    elif current_pct >= 65:
        status = "⚠️ BORDERLINE"
        msg    = f"Attend at least {needed} of the next {remaining} classes to reach 75%."
    else:
        status = "🚨 DANGER"
        msg    = f"You need {needed} out of {remaining} remaining classes to reach 75%."

    prompt = (
        f"A student has {current_pct:.1f}% attendance ({attended}/{total} classes). "
        f"They have {remaining} classes remaining. Required: 75%. "
        f"Status: {status}. {msg} "
        f"Give a brief, friendly, motivating advice message. Use **bold** for key numbers."
    )
    try:
        advice = ask_raai([{"role": "user", "content": prompt}], profile)
        return jsonify({"reply": advice, "current_pct": round(current_pct, 1), "status": status, "needed": needed, "can_miss": can_miss, "msg": msg})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/summarize", methods=["POST"])
def summarize():
    data    = request.json or {}
    chat_id = data.get("chat_id", "default")
    profile = data.get("profile", {})
    text    = get_file_text(chat_id)
    if not text:
        return jsonify({"reply": "⚠️ No file loaded! Upload a file first bro."})
    try:
        reply = ask_raai([{"role": "user", "content": f"Summarize this document clearly and concisely. Use ## for section headers and **bold** for key points:\n\n{text[:4000]}"}], profile)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/translate", methods=["POST"])
def translate():
    data     = request.get_json(silent=True) or {}
    chat_id  = data.get("chat_id", "default")
    profile  = data.get("profile", {})
    language = data.get("language", "").strip()
    text     = get_file_text(chat_id)
    if not text:
        return jsonify({"reply": "⚠️ No file loaded! Upload a file first bro."})
    if not language:
        return jsonify({"reply": "⚠️ Type a language first."})
    try:
        chunk_size = 3000
        chunks = [text[i:i+chunk_size] for i in range(0, min(len(text), 12000), chunk_size)]
        translated_parts = []
        for chunk in chunks:
            part = ask_raai([{"role": "user", "content": f"Translate the following text to {language}. Only provide the translation, nothing else:\n\n{chunk}"}], profile)
            translated_parts.append(part)
        return jsonify({"reply": "\n\n".join(translated_parts)})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

# ── Question Paper Generator ───────────────────────────
@app.route("/academic/generate-qp", methods=["POST"])
def generate_qp():
    data    = request.json or {}
    chat_id = data.get("chat_id", "default")
    profile = data.get("profile", {})
    text    = get_file_text(chat_id)
    subject = data.get("subject", "").strip()
    dept    = data.get("dept", "").strip()
    exam    = data.get("exam", "End Semester Examination")
    year    = data.get("year", "")

    if not text:
        return jsonify({"reply": "⚠️ Upload a document first to generate a question paper!"})

    prompt = f"""You are a university professor creating an official question paper.

Subject: {subject or 'from the document'}
Department: {dept or 'Engineering'}
Exam: {exam}
Year/Sem: {year or 'Final Year'}

Generate a complete question paper for 100 marks using the document content.

Use EXACTLY this format:

QP_SUBJECT: {subject or 'Subject Name'}
QP_DEPT: {dept or 'Department'}
QP_EXAM: {exam}
QP_YEAR: {year or 'Final Year'}
QP_DURATION: 3 Hours
QP_MAX_MARKS: 100

PART_A_TITLE: PART A — 2 Mark Questions (10 × 2 = 20 Marks)
PART_A_INSTRUCTIONS: Answer ALL questions.

2M_Q1: [Question 1]
2M_Q2: [Question 2]
2M_Q3: [Question 3]
2M_Q4: [Question 4]
2M_Q5: [Question 5]
2M_Q6: [Question 6]
2M_Q7: [Question 7]
2M_Q8: [Question 8]
2M_Q9: [Question 9]
2M_Q10: [Question 10]

PART_B_TITLE: PART B — 16 Mark Questions (5 × 16 = 80 Marks)
PART_B_INSTRUCTIONS: Answer ALL questions. Each question has two parts (a) and (b), each carrying 8 marks.

16M_Q1A: [Question 1a - 8 marks]
16M_Q1B: [Question 1b - 8 marks]
16M_Q2A: [Question 2a - 8 marks]
16M_Q2B: [Question 2b - 8 marks]
16M_Q3A: [Question 3a - 8 marks]
16M_Q3B: [Question 3b - 8 marks]
16M_Q4A: [Question 4a - 8 marks]
16M_Q4B: [Question 4b - 8 marks]
16M_Q5A: [Question 5a - 8 marks]
16M_Q5B: [Question 5b - 8 marks]

Make questions from: {text[:4000]}"""

    try:
        reply = ask_raai([{"role": "user", "content": prompt}], profile, max_tokens=3000, temperature=0.7)
        # Store QP in file_contents so answer key can use it
        file_contents[f"{session.get('session_id','anon')}_{chat_id}_qp"] = reply
        return jsonify({"reply": reply, "success": True})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}", "success": False})

# ── Answer Key Generator ───────────────────────────────
@app.route("/academic/answer-key", methods=["POST"])
def answer_key():
    data    = request.json or {}
    chat_id = data.get("chat_id", "default")
    profile = data.get("profile", {})
    text    = get_file_text(chat_id)
    qp_text = file_contents.get(f"{session.get('session_id','anon')}_{chat_id}_qp", "")

    if not qp_text:
        return jsonify({"reply": "⚠️ Generate a Question Paper first using the QP Generator, then come back for the answer key!"})

    prompt = f"""You are a professor providing a complete answer key for this question paper.

QUESTION PAPER:
{qp_text}

REFERENCE MATERIAL:
{text[:3000] if text else 'Use general knowledge'}

Provide COMPLETE answers for ALL questions. Use EXACTLY this format:

AK_PART_A: PART A — Answer Key (2 Mark Questions)

AK_2M_Q1: [Question number and full answer in 2-3 sentences]
AK_2M_Q2: [Answer]
AK_2M_Q3: [Answer]
AK_2M_Q4: [Answer]
AK_2M_Q5: [Answer]
AK_2M_Q6: [Answer]
AK_2M_Q7: [Answer]
AK_2M_Q8: [Answer]
AK_2M_Q9: [Answer]
AK_2M_Q10: [Answer]

AK_PART_B: PART B — Answer Key (16 Mark Questions)

AK_16M_Q1A: [Detailed answer for Q1a — at least 200 words with points/diagrams described]
AK_16M_Q1B: [Detailed answer for Q1b]
AK_16M_Q2A: [Detailed answer]
AK_16M_Q2B: [Detailed answer]
AK_16M_Q3A: [Detailed answer]
AK_16M_Q3B: [Detailed answer]
AK_16M_Q4A: [Detailed answer]
AK_16M_Q4B: [Detailed answer]
AK_16M_Q5A: [Detailed answer]
AK_16M_Q5B: [Detailed answer]"""

    try:
        reply = ask_raai([{"role": "user", "content": prompt}], profile, max_tokens=4000, temperature=0.6)
        return jsonify({"reply": reply, "success": True})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}", "success": False})

# ── Entry point ────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Raai Academic OS running at http://localhost:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
