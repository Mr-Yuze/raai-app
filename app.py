from flask import Flask, render_template, request, jsonify, session
from groq import Groq
import os
import uuid
import json
import re
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "raai-academic-os-2024")

# ── Groq Client ────────────────────────────────────────
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
MODEL  = "llama-3.3-70b-versatile"   # fast + smart on Groq free tier

# ── In-memory stores ───────────────────────────────────
all_chats     = {}   # uid -> { cid -> {title, messages, created} }
file_contents = {}   # uid_cid -> text 
user_profiles = {}   # uid -> { name, dept, year, cgpa, weak_areas, learning_style }

# ── System Prompt ──────────────────────────────────────
def build_system_prompt(uid):
    profile = user_profiles.get(uid, {})
    name    = profile.get("name", "Student")
    dept    = profile.get("dept", "")
    year    = profile.get("year", "")
    cgpa    = profile.get("cgpa", "")
    weak    = ", ".join(profile.get("weak_areas", [])) or "none tracked yet"
    style   = profile.get("learning_style", "balanced")

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
            f"\n\nYou ALWAYS:"
            f"\n- Address the student by name if known"
            f"\n- Give responses tailored to their dept and year"
            f"\n- Be friendly and casual like a smart senior friend"
            f"\n- Use 'bro', 'got you', 'no worries' naturally"
            f"\n- For academic questions, be thorough and exam-focused"
            f"\n- Remember their weak areas and give extra help there"
            f"\n- Format responses with proper markdown: **bold** for important terms, ## for section headers, * for bullet points"
            f"\n\nYou NEVER:"
            f"\n- Use profanity, swear words, or offensive language under any circumstances"
            f"\n- Generate harmful, sexual, violent, or inappropriate content"
            f"\n- If a user asks something inappropriate, politely decline and redirect to academics"
        )
    }

def ask_raai(messages, uid=None, max_tokens=2048, temperature=0.7):
    sys_prompt = build_system_prompt(uid) if uid else {
        "role": "system",
        "content": "You are Raai, an Academic AI built by Rahul. Be friendly, casual and helpful. Use markdown formatting."
    }
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
            import fitz
            doc = fitz.open(stream=file.read(), filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
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

# ── Session helpers ────────────────────────────────────
def get_uid():
    if "uid" not in session:
        session["uid"] = str(uuid.uuid4())
    return session["uid"]

def get_user_chats(uid):
    if uid not in all_chats:
        all_chats[uid] = {}
    return all_chats[uid]

def create_new_chat(uid):
    chats = get_user_chats(uid)
    cid   = str(uuid.uuid4())
    chats[cid] = {
        "title":    "New Chat",
        "messages": [],
        "created":  datetime.now().strftime("%b %d, %H:%M")
    }
    session["active_chat"] = cid
    return cid, chats[cid]

def get_active_chat(uid):
    chats = get_user_chats(uid)
    cid   = session.get("active_chat")
    if cid and cid in chats:
        return cid, chats[cid]
    return create_new_chat(uid)

# ══════════════════════════════════════════════════════
# ── ROUTES ────────────────────────────────────────────
# ══════════════════════════════════════════════════════

@app.route("/")
def index():
    uid = get_uid()
    create_new_chat(uid)
    return render_template("index.html")

# ── Profile ────────────────────────────────────────────
@app.route("/profile", methods=["GET"])
def get_profile():
    uid = get_uid()
    return jsonify(user_profiles.get(uid, {}))

@app.route("/profile", methods=["POST"])
def save_profile():
    uid  = get_uid()
    data = request.json or {}
    if uid not in user_profiles:
        user_profiles[uid] = {"weak_areas": [], "mood_history": []}
    user_profiles[uid].update({
        "name":           data.get("name", ""),
        "dept":           data.get("dept", ""),
        "year":           data.get("year", ""),
        "cgpa":           data.get("cgpa", ""),
        "learning_style": data.get("learning_style", "balanced"),
    })
    return jsonify({"success": True})

# ── Chat history ───────────────────────────────────────
@app.route("/chats", methods=["GET"])
def get_chats():
    uid    = get_uid()
    chats  = get_user_chats(uid)
    active = session.get("active_chat")
    if not chats:
        active, _ = create_new_chat(uid)
    result = []
    for cid, chat in chats.items():
        msgs = [m for m in chat["messages"] if m["role"] != "system"]
        result.append({
            "id":      cid,
            "title":   chat["title"],
            "created": chat["created"],
            "active":  cid == active,
            "preview": msgs[-1]["content"][:45] + "..." if msgs else "No messages yet"
        })
    result.sort(key=lambda x: x["created"], reverse=True)
    return jsonify({"chats": result, "active": active})

@app.route("/chats/new", methods=["POST"])
def new_chat():
    uid = get_uid()
    cid, _ = create_new_chat(uid)
    return jsonify({"success": True, "chat_id": cid})

@app.route("/chats/switch", methods=["POST"])
def switch_chat():
    uid   = get_uid()
    cid   = request.json.get("chat_id")
    chats = get_user_chats(uid)
    if cid in chats:
        session["active_chat"] = cid
        chat = chats[cid]
        msgs = [m for m in chat["messages"] if m["role"] != "system"]
        return jsonify({"success": True, "messages": msgs, "title": chat["title"]})
    return jsonify({"success": False})

@app.route("/chats/delete", methods=["POST"])
def delete_chat():
    uid   = get_uid()
    cid   = request.json.get("chat_id")
    chats = get_user_chats(uid)
    if cid in chats:
        del chats[cid]
        file_contents.pop(f"{uid}_{cid}", None)
        if chats:
            new_active = list(chats.keys())[-1]
            session["active_chat"] = new_active
        else:
            new_active, _ = create_new_chat(uid)
        return jsonify({"success": True, "new_active": session.get("active_chat")})
    return jsonify({"success": False})

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

# ── Core Chat ──────────────────────────────────────────
@app.route("/chat", methods=["POST"])
def chat():
    uid  = get_uid()
    data = request.json or {}
    msg  = data.get("message", "").strip()
    display_msg = data.get("display_message", msg)

    if not msg:
        return jsonify({"reply": "Say something bro!"})

    if contains_bad_word(msg):
        return jsonify({
            "reply": "⚠️ Hey bro, let's keep it clean! I'm here to help you study — please use respectful language 🙏",
            "title": None
        })

    cid, chat_data = get_active_chat(uid)
    history = chat_data["messages"]
    history.append({"role": "user", "content": msg})

    if len(history) == 1:
        chat_data["title"] = (display_msg or msg)[:32] + ("..." if len(display_msg or msg) > 32 else "")

    file_text = file_contents.get(f"{uid}_{cid}", "")
    if file_text:
        context = [
            {"role": "user",      "content": f"I have uploaded this document for reference:\n\n---\n{file_text[:4000]}\n---\nPlease use it to answer my questions."},
            {"role": "assistant", "content": "Got it bro! I've read the full document and I'm ready to help with anything about it."}
        ] + history
    else:
        context = history

    try:
        reply = ask_raai(context, uid)
        reply = censor_text(reply)
        history.append({"role": "assistant", "content": reply})

        weak_keywords = ["don't understand", "confused", "hard", "difficult", "struggling", "not getting"]
        if any(kw in msg.lower() for kw in weak_keywords):
            profile = user_profiles.setdefault(uid, {"weak_areas": [], "mood_history": []})
            topic = msg[:40]
            if topic not in profile.get("weak_areas", []):
                profile.setdefault("weak_areas", []).append(topic)

        return jsonify({"reply": reply, "title": chat_data["title"]})
    except Exception as e:
        history.pop()
        return jsonify({"reply": f"❌ Error: {e}"})

# ── Save academic note ─────────────────────────────────
@app.route("/chat/save-note", methods=["POST"])
def save_note():
    uid  = get_uid()
    data = request.json or {}
    content = data.get("content", "").strip()
    if not content:
        return jsonify({"success": False})

    cid, chat_data = get_active_chat(uid)
    history = chat_data["messages"]
    history.append({"role": "assistant", "content": f"[Academic Tool Result]\n{content}"})

    if chat_data["title"] == "New Chat":
        chat_data["title"] = "Academic: " + content[:28] + "..."

    return jsonify({"success": True})

# ── File upload ────────────────────────────────────────
@app.route("/upload", methods=["POST"])
def upload():
    uid = get_uid()
    cid, _ = get_active_chat(uid)
    try:
        if "file" not in request.files or request.files["file"].filename == "":
            return jsonify({"success": False, "message": "No file selected."})
        file    = request.files["file"]
        content = read_file(file)
        if content is None:
            return jsonify({"success": False, "message": "Unsupported file type."})
        file_contents[f"{uid}_{cid}"] = content
        return jsonify({"success": True, "filename": file.filename, "word_count": len(content.split())})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# ── Academic Tools ─────────────────────────────────────
@app.route("/academic/get-topic", methods=["POST"])
def get_topic():
    uid = get_uid()
    cid, _ = get_active_chat(uid)
    text = file_contents.get(f"{uid}_{cid}", "")
    if not text:
        return jsonify({"topic": "general university subject"})
    try:
        topic = ask_raai([{"role": "user", "content": f"In 5-10 words, what is the main subject/topic of this document? Reply with ONLY the topic name, nothing else.\n\n{text[:1000]}"}], uid, max_tokens=50)
        return jsonify({"topic": topic.strip()})
    except:
        return jsonify({"topic": "the uploaded subject"})

@app.route("/academic/exam-questions", methods=["POST"])
def exam_questions():
    uid   = get_uid()
    cid, _ = get_active_chat(uid)
    text  = file_contents.get(f"{uid}_{cid}", "")
    qtype = request.json.get("type", "2mark")

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

    prompt     = prompts.get(qtype, prompts["2mark"])
    token_limit = 4096 if qtype == "16mark" else 2048
    temp        = 0.95 if qtype == "flashcards" else 0.7

    try:
        reply = ask_raai([{"role": "user", "content": prompt}], uid, max_tokens=token_limit, temperature=temp)

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
    uid  = get_uid()
    code = request.json.get("code", "").strip()
    mode = request.json.get("mode", "explain")

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
        reply = ask_raai([{"role": "user", "content": prompt}], uid, max_tokens=3000)
        return jsonify({"reply": reply, "mode": mode})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/academic/cgpa-planner", methods=["POST"])
def cgpa_planner():
    uid  = get_uid()
    data = request.json or {}
    current  = data.get("current_cgpa", "")
    target   = data.get("target_cgpa", "")
    credits  = data.get("remaining_credits", "")
    subject_details = data.get("subject_details", [])
    req_pct  = data.get("req_grade_pct", "")

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

    prompt += (+-      
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
+
    try:
        reply = ask_raai([{"role": "user", "content": prompt}], uid, max_tokens=2048)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/academic/attendance", methods=["POST"])
def attendance_risk():
    uid  = get_uid()
    data = request.json or {}
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
        advice = ask_raai([{"role": "user", "content": prompt}], uid)
        return jsonify({"reply": advice, "current_pct": round(current_pct, 1), "status": status, "needed": needed, "can_miss": can_miss, "msg": msg})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/summarize", methods=["POST"])
def summarize():
    uid = get_uid()
    cid, _ = get_active_chat(uid)
    text = file_contents.get(f"{uid}_{cid}", "")
    if not text:
        return jsonify({"reply": "⚠️ No file loaded! Upload a file first bro."})
    try:
        reply = ask_raai([{"role": "user", "content": f"Summarize this document clearly and concisely. Use ## for section headers and **bold** for key points:\n\n{text[:4000]}"}], uid)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/translate", methods=["POST"])
def translate():
    uid = get_uid()
    cid, _ = get_active_chat(uid)
    text = file_contents.get(f"{uid}_{cid}", "")
    language = ""
    try:
        data = request.get_json(silent=True)
        if data:
            language = data.get("language", "").strip()
    except Exception:
        pass
    if not text:
        return jsonify({"reply": "⚠️ No file loaded! Upload a file first bro."})
    if not language:
        return jsonify({"reply": "⚠️ Type a language first."})
    try:
        chunk_size = 3000
        chunks = [text[i:i+chunk_size] for i in range(0, min(len(text), 12000), chunk_size)]
        translated_parts = []
        for chunk in chunks:
            part = ask_raai([{"role": "user", "content": f"Translate the following text to {language}. Only provide the translation, nothing else:\n\n{chunk}"}], uid)
            translated_parts.append(part)
        return jsonify({"reply": "\n\n".join(translated_parts)})
    except Exception as e:
        return jsonify({"reply": f"❌ Error: {e}"})

@app.route("/clear-file", methods=["POST"])
def clear_file():
    uid = get_uid()
    cid, _ = get_active_chat(uid)
    file_contents.pop(f"{uid}_{cid}", None)
    return jsonify({"success": True})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"⚡ Raai Academic OS running at http://localhost:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
