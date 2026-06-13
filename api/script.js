
// ── State ─────────────────────────────────────────────
let activeChatId = null;
let lastAcademicResult = "";

const messagesEl  = document.getElementById("messages");
const inputEl     = document.getElementById("chatInput");
const typingEl    = document.getElementById("typingEl");
const fileBadge   = document.getElementById("fileBadge");
const progressBar = document.getElementById("progressBar");
const uploadZone  = document.getElementById("uploadZone");
const fileInput   = document.getElementById("fileInput");
const chatListEl  = document.getElementById("chatList");
const curTitleEl  = document.getElementById("curTitle");

// ── localStorage Chat Store ────────────────────────────
const LS_CHATS   = 'raai_chats';
const LS_ACTIVE  = 'raai_active_chat';
const LS_PROFILE = 'raai_profile';

function lsGetChats() {
  try { return JSON.parse(localStorage.getItem(LS_CHATS) || '[]'); } catch(e) { return []; }
}
function lsSaveChats(chats) {
  localStorage.setItem(LS_CHATS, JSON.stringify(chats));
}
function lsGetProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE) || '{}'); } catch(e) { return {}; }
}
function lsGetActive() {
  return localStorage.getItem(LS_ACTIVE) || null;
}
function lsSetActive(cid) {
  localStorage.setItem(LS_ACTIVE, cid);
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function nowStr() {
  const d = new Date();
  return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}

// ── Init ──────────────────────────────────────────────
function init() {
  let chats = lsGetChats();
  // Create first chat if none exist
  if (!chats.length) {
    const cid = genId();
    chats = [{ id: cid, title: 'New Chat', created: nowStr(), messages: [] }];
    lsSaveChats(chats);
    lsSetActive(cid);
  }
  let activeId = lsGetActive();
  if (!activeId || !chats.find(c => c.id === activeId)) {
    activeId = chats[0].id;
    lsSetActive(activeId);
  }
  activeChatId = activeId;
  refreshChats();
  // Load messages of active chat
  const activeChat = chats.find(c => c.id === activeId);
  if (activeChat && activeChat.messages.length) {
    if (curTitleEl) curTitleEl.textContent = activeChat.title;
    activeChat.messages.forEach(m => addMessage(m.role === 'user' ? 'user' : 'bot', m.content, false));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    messagesEl.innerHTML = showWelcome();
    if (curTitleEl) curTitleEl.textContent = 'New Chat';
  }
}

// ── Page switching ─────────────────────────────────────
function switchPage(p) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  document.getElementById(`page-${p}`).classList.add("active");
  document.querySelectorAll(".tb-tab").forEach(el => el.classList.remove("active"));
  const tabEl = document.getElementById(`tab-${p}`);
  if (tabEl) tabEl.classList.add("active");
  document.getElementById("chatTopbar").style.display = p === "chat" ? "" : "none";
  // mobile
  document.querySelectorAll(".mob-tab").forEach(el => el.classList.remove("active"));
  const mEl = document.getElementById(`mob-${p}`);
  if (mEl) mEl.classList.add("active");
}

// ── Chat History (localStorage) ────────────────────────
function refreshChats() {
  const chats   = lsGetChats();
  const activeId = lsGetActive();
  chatListEl.innerHTML = "";
  // Sort newest first
  [...chats].reverse().forEach(chat => {
    const msgs    = chat.messages || [];
    const preview = msgs.length ? msgs[msgs.length-1].content.slice(0,45)+'...' : 'No messages yet';
    chatListEl.appendChild(makeChatItem({
      id: chat.id, title: chat.title, preview,
      active: chat.id === activeId
    }));
  });
}

function makeChatItem(chat) {
  const el = document.createElement("div");
  el.className = `ci${chat.active ? " active" : ""}`;
  el.dataset.id = chat.id;
  el.innerHTML = `
    <div class="ci-icon">${chat.active ? "⚡" : "💬"}</div>
    <div class="ci-body">
      <div class="ci-title">${esc(chat.title)}</div>
      <div class="ci-preview">${esc(chat.preview)}</div>
    </div>
    <button class="ci-del" onclick="deleteChat('${chat.id}',event)">✕</button>
  `;
  el.addEventListener("click", () => switchChat(chat.id));
  return el;
}

function newChat() {
  const cid   = genId();
  const chats = lsGetChats();
  chats.push({ id: cid, title: 'New Chat', created: nowStr(), messages: [] });
  lsSaveChats(chats);
  lsSetActive(cid);
  activeChatId = cid;
  refreshChats();
  messagesEl.innerHTML = showWelcome();
  if (curTitleEl) curTitleEl.textContent = "New Chat";
  lastAcademicResult = "";
  clearAcademicOutput();
  switchPage("chat");
}

function switchChat(cid) {
  if (cid === activeChatId) return;
  lsSetActive(cid);
  activeChatId = cid;
  refreshChats();
  const chats = lsGetChats();
  const chat  = chats.find(c => c.id === cid);
  if (!chat) return;
  if (curTitleEl) curTitleEl.textContent = chat.title;
  messagesEl.innerHTML = "";
  lastAcademicResult = "";
  clearAcademicOutput();
  if (!chat.messages || !chat.messages.length) {
    messagesEl.innerHTML = showWelcome();
  } else {
    chat.messages.forEach(m => addMessage(m.role === 'user' ? 'user' : 'bot', m.content, false));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function deleteChat(cid, e) {
  e.stopPropagation();
  if (!confirm("Delete this chat?")) return;
  let chats = lsGetChats();
  chats = chats.filter(c => c.id !== cid);
  if (!chats.length) {
    const ncid = genId();
    chats = [{ id: ncid, title: 'New Chat', created: nowStr(), messages: [] }];
    lsSaveChats(chats);
    lsSetActive(ncid);
    activeChatId = ncid;
  } else {
    lsSaveChats(chats);
    const newActive = chats[chats.length - 1].id;
    lsSetActive(newActive);
    activeChatId = newActive;
  }
  refreshChats();
  const activeChat = lsGetChats().find(c => c.id === activeChatId);
  messagesEl.innerHTML = "";
  if (activeChat && activeChat.messages.length) {
    if (curTitleEl) curTitleEl.textContent = activeChat.title;
    activeChat.messages.forEach(m => addMessage(m.role === 'user' ? 'user' : 'bot', m.content, false));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    messagesEl.innerHTML = showWelcome();
    if (curTitleEl) curTitleEl.textContent = 'New Chat';
  }
}

function clearAcademicOutput() {
  const out = document.getElementById("academicOutput");
  const bar = document.getElementById("academicDoubtBar");
  if (out) { out.className = "ac-output"; out.innerHTML = ""; }
  if (bar) bar.classList.remove("visible");
}

function showWelcome() {
  return `<div class="welcome" id="welcomeScreen">
    <div class="zeus-avatar">⚡</div>
    <h2>Hey! I'm Raai ⚡</h2>
    <p>Start typing, upload a document, or pick an Academic Tool!</p>
    <div class="welcome-chips">
      <span class="chip">💬 Chat</span><span class="chip">📄 Summarize</span>
      <span class="chip">🎓 Exam Prep</span><span class="chip">💻 Code Lab</span>
    </div>
  </div>`;
}

// ── Markdown renderer ──────────────────────────────────
function renderMarkdown(raw) {
  if (!raw) return '';
  const lines = raw.split('\n');
  let html = '';
  let inCode = false;
  let codeBuffer = '';
  let inList = false;
  let listItems = '';
  let listOrdered = false;

  function flushList() {
    if (!inList) return;
    const tag = listOrdered ? 'ol' : 'ul';
    html += `<${tag} class="md-list">${listItems}</${tag}>`;
    listItems = ''; inList = false; listOrdered = false;
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block fence
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        flushList();
        inCode = true; codeBuffer = '';
      } else {
        inCode = false;
        html += `<pre class="md-code"><code>${escHtml(codeBuffer.replace(/^\n/,'').replace(/\n$/,''))}</code></pre>`;
        codeBuffer = '';
      }
      continue;
    }
    if (inCode) { codeBuffer += line + '\n'; continue; }

    // Headers #### → #
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      flushList();
      const lvl = hm[1].length;
      const sizes = ['17px','15px','14px','13px','13px','12px'];
      const margins = ['16px 0 8px','14px 0 6px','12px 0 5px','10px 0 4px','8px 0 3px','6px 0 2px'];
      const content = inlineMarkdown(hm[2]);
      html += `<div class="md-h" style="font-size:${sizes[lvl-1]};margin:${margins[lvl-1]};color:var(--gold);font-weight:800;border-bottom:${lvl<=2?'1px solid rgba(240,192,64,0.15)':'none'};padding-bottom:${lvl<=2?'4px':'0'}">${content}</div>`;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList();
      html += `<hr style="border:none;border-top:1px solid var(--border2);margin:10px 0;">`;
      continue;
    }

    // Ordered list
    const olm = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (olm) {
      if (!inList || !listOrdered) { flushList(); inList = true; listOrdered = true; }
      listItems += `<li class="md-li">${inlineMarkdown(olm[2])}</li>`;
      continue;
    }

    // Unordered list
    const ulm = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ulm) {
      if (!inList || listOrdered) { flushList(); inList = true; listOrdered = false; }
      listItems += `<li class="md-li">${inlineMarkdown(ulm[1])}</li>`;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      html += `<div style="height:8px"></div>`;
      continue;
    }

    // Normal paragraph line
    flushList();
    html += `<div class="md-line">${inlineMarkdown(line)}</div>`;
  }

  flushList();
  if (inCode && codeBuffer) {
    html += `<pre class="md-code"><code>${escHtml(codeBuffer)}</code></pre>`;
  }
  return html;
}

function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inlineMarkdown(text) {
  let t = escHtml(text);
  // Bold+italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  t = t.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  // Inline code: `code`
  t = t.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  return t;
}

// ── Messaging ──────────────────────────────────────────
function esc(t) { return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function addMessage(role, text, scroll=true) {
  const w = document.getElementById("welcomeScreen");
  if (w) w.remove();
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const label = role === "user" ? "You" : "Raai";
  div.innerHTML = `<div class="msg-lbl">${label}</div><div class="msg-bubble">${renderMarkdown(text)}</div>`;
  messagesEl.appendChild(div);
  if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping(show) {
  typingEl.style.display = show ? "block" : "none";
  if (show) messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  const msg = inputEl.value.trim();
  if (!msg) return;
  inputEl.value = ""; inputEl.style.height = "auto";

  // Save user message to localStorage
  let chats = lsGetChats();
  let chat  = chats.find(c => c.id === activeChatId);
  if (!chat) { newChat(); chats = lsGetChats(); chat = chats.find(c => c.id === activeChatId); }
  chat.messages.push({ role: 'user', content: msg });
  // Auto-title on first message
  if (chat.messages.filter(m=>m.role==='user').length === 1) {
    chat.title = msg.slice(0, 32) + (msg.length > 32 ? '...' : '');
    if (curTitleEl) curTitleEl.textContent = chat.title;
  }
  lsSaveChats(chats);
  refreshChats();

  addMessage("user", msg); showTyping(true);
  if (window.setFaceThinking) setFaceThinking(true);

  try {
    const profile = lsGetProfile();
    const res  = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        messages: chat.messages.slice(0, -1), // history before this msg
        chat_id: activeChatId,
        profile
      })
    });
    const data = await res.json();
    showTyping(false);
    if (window.setFaceThinking) setFaceThinking(false);
    addMessage("bot", data.reply);

    // Save bot reply to localStorage
    chats = lsGetChats();
    chat  = chats.find(c => c.id === activeChatId);
    if (chat) { chat.messages.push({ role: 'assistant', content: data.reply }); lsSaveChats(chats); }
    refreshChats();
  } catch(e) {
    showTyping(false);
    if (window.setFaceThinking) setFaceThinking(false);
    addMessage("bot","❌ Can't reach the server bro!");
  }
}

inputEl.addEventListener("input", () => { inputEl.style.height="auto"; inputEl.style.height=Math.min(inputEl.scrollHeight,130)+"px"; });
inputEl.addEventListener("keydown", e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} });

// ── File Upload ────────────────────────────────────────
uploadZone.addEventListener("dragover",  e => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", ()  => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", e => { e.preventDefault(); uploadZone.classList.remove("drag-over"); if(e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]); });
uploadZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if(fileInput.files[0]) uploadFile(fileInput.files[0]); });

async function uploadFile(file) {
  fileBadge.className="file-badge uploading"; fileBadge.style.display="block";
  fileBadge.textContent=`⏳ Loading "${file.name}"...`; progressBar.style.display="block";
  const form = new FormData();
  form.append("file", file);
  form.append("chat_id", activeChatId || 'default');
  try {
    const res  = await fetch("/upload",{method:"POST",body:form});
    const data = await res.json(); progressBar.style.display="none";
    if (data.success) {
      fileBadge.className="file-badge success";
      fileBadge.textContent=`✅ ${data.filename}\n${data.word_count} words ready`;
      if (document.getElementById("page-chat").classList.contains("active"))
        addMessage("bot",`Got it bro! ✅ "${data.filename}" — ${data.word_count} words loaded.\n\nYou can now:\n• Chat and ask questions about it\n• Go to 🎓 Academic tab for exam tools\n• Summarize or Translate from the Tools panel`);
    } else { fileBadge.className="file-badge error"; fileBadge.textContent=`❌ ${data.message}`; }
  } catch(e) { progressBar.style.display="none"; fileBadge.className="file-badge error"; fileBadge.textContent="❌ Upload error."; }
  fileInput.value="";
}

async function quickSummarize() {
  const profile = lsGetProfile();
  switchPage("chat"); addMessage("user","Summarize the uploaded file"); showTyping(true);
  try { const res=await fetch("/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:activeChatId,profile})}); const d=await res.json(); showTyping(false); addMessage("bot",d.reply); }
  catch(e) { showTyping(false); addMessage("bot","❌ Error."); }
}

async function quickTranslate() {
  const lang = document.getElementById("langInput").value.trim();
  if (!lang) { alert("Type a language first!"); return; }
  const profile = lsGetProfile();
  switchPage("chat"); addMessage("user",`Translate the file to ${lang}`); showTyping(true);
  try { const res=await fetch("/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:lang,chat_id:activeChatId,profile})}); const d=await res.json(); showTyping(false); addMessage("bot",d.reply); }
  catch(e) { showTyping(false); addMessage("bot","❌ Error."); }
}

async function clearFile() {
  await fetch("/clear-file",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:activeChatId})});
  fileBadge.style.display="none"; fileBadge.className="file-badge";
  addMessage("bot","🗑️ File cleared! Upload a new one anytime bro."); switchPage("chat");
}

// ── Flashcard UI ───────────────────────────────────────
let fcCards = [], fcCurrent = 0, fcKnown = new Set(), fcFlipped = false;

function fcRenderCard() {
  const out = document.getElementById("academicOutput");
  if (!out || !fcCards.length) return;
  const c = fcCards[fcCurrent];
  fcFlipped = false;

  out.innerHTML = `
    <div class="flashcard-header">
      <h3>🃏 Flashcards</h3>
      <span class="fc-progress">${fcKnown.size}/${fcCards.length} known</span>
      <div class="fc-controls">
        <button class="fc-btn" onclick="fcShuffle()">🔀 Shuffle</button>
        <button class="fc-btn" onclick="fcResetBtn()">🔄 Reset</button>
        <button class="fc-btn primary" onclick="fcStudyWeak()">⚡ Study Weak</button>
      </div>
    </div>

    <div class="fc-dots" id="fcDots">
      ${fcCards.map((_, i) => `<div class="fc-dot ${i===fcCurrent?'active':''} ${fcKnown.has(i)?'known':''}" onclick="fcGoto(${i})"></div>`).join('')}
    </div>

    <div class="fc-stage">
      <div class="fc-card" id="fcCard" onclick="fcFlipCard()">
        <div class="fc-face fc-front">
          <div class="fc-tag">${c.tag || 'Concept'}</div>
          <div class="fc-label">FRONT — Question</div>
          <div class="fc-text">${c.front}</div>
          <div class="fc-hint">Tap to reveal answer 👆</div>
        </div>
        <div class="fc-face fc-back">
          <div class="fc-tag">${c.tag || 'Concept'}</div>
          <div class="fc-label">BACK — Answer</div>
          <div class="fc-text">${c.back}</div>
          <div class="fc-hint">Tap to flip back</div>
        </div>
      </div>
    </div>

    <div class="fc-nav">
      <button class="fc-nav-btn" onclick="fcPrevCard()" ${fcCurrent===0?'disabled':''}>◀</button>
      <span class="fc-counter">${fcCurrent+1} / ${fcCards.length}</span>
      <button class="fc-nav-btn" onclick="fcNextCard()" ${fcCurrent===fcCards.length-1?'disabled':''}>▶</button>
    </div>

    <div class="fc-known-row" id="fcKnownRow" style="display:none">
      <button class="fc-known-btn yes" onclick="fcMarkKnown(true)">✅ Got it!</button>
      <button class="fc-known-btn no" onclick="fcMarkKnown(false)">❌ Review again</button>
    </div>
  `;
}

window.fcFlipCard = function() {
  const card = document.getElementById("fcCard");
  const row  = document.getElementById("fcKnownRow");
  fcFlipped = !fcFlipped;
  if (card) card.classList.toggle("flipped", fcFlipped);
  if (row)  row.style.display = fcFlipped ? "flex" : "none";
};
window.fcNextCard = function() { if (fcCurrent < fcCards.length-1) { fcCurrent++; fcRenderCard(); } };
window.fcPrevCard = function() { if (fcCurrent > 0)               { fcCurrent--; fcRenderCard(); } };
window.fcGoto     = function(i) { fcCurrent = i; fcRenderCard(); };
window.fcMarkKnown = function(yes) {
  if (yes) fcKnown.add(fcCurrent); else fcKnown.delete(fcCurrent);
  if (fcCurrent < fcCards.length-1) { fcCurrent++; fcRenderCard(); } else fcRenderCard();
};
window.fcShuffle = function() {
  for (let i = fcCards.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [fcCards[i], fcCards[j]] = [fcCards[j], fcCards[i]];
  }
  fcCurrent = 0; fcKnown.clear(); fcRenderCard();
};
window.fcResetBtn = async function() {
  const out = document.getElementById("academicOutput");
  out.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-mid)">🔄 Generating a fresh set of 10 cards...</div>`;
  try {
    const res  = await fetch("/academic/exam-questions", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"flashcards"})});
    const data = await res.json();
    showFlashcards(data.reply);
  } catch(e) { out.innerHTML = "❌ Error refreshing cards bro!"; }
};
window.fcStudyWeak = function() {
  const weak = fcCards.filter((_, i) => !fcKnown.has(i));
  if (!weak.length) { alert("You know all cards! 🎉"); return; }
  fcCards = weak; fcCurrent = 0; fcKnown.clear(); fcRenderCard();
};

function showFlashcards(jsonText) {
  let parsed = [];
  try {
    // Backend always returns clean JSON array now
    parsed = JSON.parse(jsonText.trim());
  } catch(err) {
    // Fallback: try extracting from any wrapper text
    try {
      const s = jsonText.indexOf('['), e = jsonText.lastIndexOf(']');
      if (s !== -1 && e !== -1) parsed = JSON.parse(jsonText.slice(s, e+1));
    } catch(e2) {}
    if (!parsed.length) { showAcademicResult("❌ Could not load flashcards bro. Try generating again!"); return; }
  }
  if (!parsed.length) { showAcademicResult("❌ No flashcards generated. Try again!"); return; }

  // Set global state fresh
  fcCards   = parsed;
  fcCurrent = 0;
  fcKnown   = new Set();
  fcFlipped = false;

  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  document.getElementById("academicDoubtBar").classList.remove("visible");
  lastAcademicResult = jsonText;

  fcRenderCard();
  out.scrollIntoView({behavior:"smooth", block:"start"});
}


// ── Study Roadmap Renderer ─────────────────────────────
function showRoadmap(text) {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  lastAcademicResult = text;

  // Parse week blocks
  const weeks = [];
  const blocks = text.split(/(?=WEEK\s+\d)/i).filter(b => b.trim());

  // Color palette for weeks
  const colors = [
    ['#3cb371','#1e6b1e'], ['#2e86ab','#1a5276'], ['#8e44ad','#6c3483'],
    ['#e67e22','#ca6f1e'], ['#e74c3c','#c0392b'], ['#1abc9c','#148f77'],
    ['#f39c12','#d68910'], ['#2980b9','#1a5276']
  ];

  blocks.forEach((block, i) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    // Parse week header
    const headerLine = lines[0];
    const weekMatch = headerLine.match(/WEEK\s+([\d\-–]+)\s*:\s*(.+)/i);
    if (!weekMatch) return;

    const weekNum  = weekMatch[1];
    const title    = weekMatch[2];

    // Parse fields
    const get = (key) => {
      const line = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase() + ':'));
      return line ? line.replace(new RegExp('^'+key+':\\s*','i'),'').trim() : '';
    };

    const topics     = get('TOPICS').split('|').map(t=>t.trim()).filter(Boolean);
    const goal       = get('GOAL');
    const resources  = get('RESOURCES').split('|').map(r=>r.trim()).filter(Boolean);
    const difficulty = get('DIFFICULTY') || 'Medium';
    const tip        = get('TIP');

    weeks.push({weekNum, title, topics, goal, resources, difficulty, tip, colorIdx: i % colors.length});
  });

  if (!weeks.length) { showAcademicResult(text); return; }

  const [c1, c2] = colors[0];
  let html = `
    <div class="roadmap-wrap">
      <div class="roadmap-header">
        <h2>🗺️ Your Study Roadmap</h2>
        <p>${weeks.length} week blocks · From your uploaded document</p>
        <div class="roadmap-progress">
          ${weeks.map((_,i) => `<div class="rm-prog-dot" id="rmpd${i}"></div>`).join('')}
        </div>
      </div>
      <div class="roadmap-timeline">
  `;

  weeks.forEach((w, i) => {
    const [c1, c2] = colors[w.colorIdx];
    const diffClass = ['Easy','Medium','Hard'].includes(w.difficulty) ? w.difficulty : 'Medium';
    const delayStyle = `animation-delay:${i * 0.08}s`;

    html += `
      <div class="roadmap-week" onmouseenter="document.getElementById('rmpd${i}').style.background='${c1}'" onmouseleave="document.getElementById('rmpd${i}').style.background=''">
        <div class="rm-left">
          <div class="rm-bubble" style="background:linear-gradient(135deg,${c1},${c2})">
            <span class="wk-num">${w.weekNum}</span>
            <span class="wk-lbl">WEEK</span>
          </div>
          ${i < weeks.length-1 ? '<div class="rm-connector">↓</div>' : ''}
        </div>

        <div class="rm-card" style="${delayStyle};--card-c:${c1}">
          <div style="position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px;background:linear-gradient(to bottom,${c1},${c2})"></div>

          <div class="rm-week-label" style="color:${c1}">Week ${w.weekNum}</div>
          <div class="rm-week-title">${esc(w.title)}</div>

          ${w.goal ? `<div class="rm-goal">🎯 ${esc(w.goal)}</div>` : ''}

          ${w.topics.length ? `
            <div class="rm-section-lbl">📚 Key Topics</div>
            <div class="rm-tags">
              ${w.topics.map(t => `<span class="rm-tag topic">📌 ${esc(t)}</span>`).join('')}
            </div>` : ''}

          ${w.resources.length ? `
            <div class="rm-section-lbl">🔗 Resources</div>
            <div class="rm-tags">
              ${w.resources.map(r => `<span class="rm-tag resource">📖 ${esc(r)}</span>`).join('')}
            </div>` : ''}

          <div class="rm-footer">
            <span class="rm-difficulty ${diffClass}">
              ${diffClass === 'Easy' ? '🟢' : diffClass === 'Medium' ? '🟡' : '🔴'} ${diffClass}
            </span>
            ${w.tip ? `<div class="rm-tip"><span>💡</span><span>${esc(w.tip)}</span></div>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  out.innerHTML = html;
  saveToChatHistory("roadmap", text);
  document.getElementById("academicDoubtBar").classList.add("visible");
  out.scrollIntoView({behavior:"smooth", block:"start"});
}



function showAcademicResult(reply) {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  out.innerHTML = renderMarkdown(reply);
  lastAcademicResult = reply;
  // Save to active chat
  saveToChatHistory("academic_result", reply);
  // Show doubt bar
  const bar = document.getElementById("academicDoubtBar");
  bar.classList.add("visible");
  out.scrollIntoView({behavior:"smooth",block:"start"});
}

function saveToChatHistory(label, content) {
  // Save academic result to localStorage chat history
  try {
    const chats = lsGetChats();
    const chat  = chats.find(c => c.id === activeChatId);
    if (chat) {
      chat.messages.push({ role: 'assistant', content: `[${label}]\n${content}` });
      if (chat.title === 'New Chat') chat.title = 'Academic: ' + content.slice(0,28) + '...';
      lsSaveChats(chats);
      refreshChats();
    }
  } catch(e) {}
}

async function askAcademicDoubt() {
  const doubt = document.getElementById("academicDoubtInput").value.trim();
  if (!doubt) return;
  document.getElementById("academicDoubtInput").value = "";
  // Switch to chat and send
  switchPage("chat");
  const contextMsg = `[Academic Result Context]\n${lastAcademicResult.slice(0,800)}\n\n[My Doubt]\n${doubt}`;
  addMessage("user", doubt); showTyping(true);
  try {
    const chats = lsGetChats();
    const chat  = chats.find(c => c.id === activeChatId);
    const history = chat ? chat.messages : [];
    const profile = lsGetProfile();
    const res = await fetch("/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message: contextMsg, display_message: doubt, messages: history, chat_id: activeChatId, profile}) });
    const data = await res.json();
    showTyping(false); addMessage("bot", data.reply);
    // Save to localStorage
    const chats2 = lsGetChats(); const chat2 = chats2.find(c=>c.id===activeChatId);
    if(chat2){chat2.messages.push({role:'user',content:contextMsg});chat2.messages.push({role:'assistant',content:data.reply});lsSaveChats(chats2);refreshChats();}
  } catch(e) { showTyping(false); addMessage("bot","❌ Can't reach the server bro!"); }
}

async function runPredictions() {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  out.innerHTML = `<span style="color:var(--text-mid)">🌐 Searching the web for likely exam questions...</span>`;
  document.getElementById("academicDoubtBar").classList.remove("visible");
  out.scrollIntoView({behavior:"smooth",block:"nearest"});

  // Get topic from uploaded file via backend first
  try {
    const topicRes = await fetch("/academic/get-topic", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({chat_id: activeChatId})});
    const topicData = await topicRes.json();
    const topic = topicData.topic || "the uploaded document subject";

    // Now call Anthropic API with web search tool
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        tools: [{"type": "web_search_20250305", "name": "web_search"}],
        messages: [{
          role: "user",
          content: `You are an expert at predicting university exam questions. 
          
The student has uploaded notes/material about: "${topic}"

Use web search to find:
1. Common university exam questions for this topic
2. Previous year questions patterns
3. Most important concepts that are frequently tested

Then predict the TOP 10 most likely exam questions that could appear in their exam. 

Format your response as:
## 🎯 Predicted Exam Questions for: ${topic}

### High Probability Questions (Most Likely):
**Q1:** [question]
*Why likely:* [reason]

**Q2:** [question]  
*Why likely:* [reason]

... and so on for all 10 questions.

At the end add a ## Tips section with 3-4 study tips for this topic.`
        }]
      })
    });

    const data = await response.json();
    const fullText = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    if (fullText) {
      showAcademicResult(fullText);
    } else {
      // Fallback to local AI if Anthropic API fails
      const profile = lsGetProfile();
    const res = await fetch("/academic/exam-questions", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"predictions", chat_id: activeChatId, profile})});
      const localData = await res.json();
      showAcademicResult(localData.reply);
    }
  } catch(e) {
    // Fallback to local
    try {
      const profile = lsGetProfile();
      const res = await fetch("/academic/exam-questions", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"predictions", chat_id: activeChatId, profile})});
      const localData = await res.json();
      showAcademicResult(localData.reply);
    } catch(e2) {
      out.innerHTML = "❌ Error fetching predictions bro!";
    }
  }
}

async function runAcademic(type) {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  out.innerHTML = `<span style="color:var(--text-mid)">⏳ Raai is working on it...</span>`;
  document.getElementById("academicDoubtBar").classList.remove("visible");
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
  try {
    const profile = lsGetProfile();
    const res  = await fetch("/academic/exam-questions", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type, chat_id: activeChatId, profile}) });
    const data = await res.json();
    if (type === "flashcards") {
      showFlashcards(data.reply);
    } else if (type === "roadmap") {
      showRoadmap(data.reply);
    } else {
      showAcademicResult(data.reply);
    }
  } catch(e) { out.innerHTML = "❌ Error — is the server running?"; }
}

// ── CGPA Subject Deep Dive ─────────────────────────────
async function cgpaDeepDive(subjectName, priority, currentGPA, targetGPA) {
  // Switch to chat tab
  switchPage('chat');

  const prompt = `I'm studying "${subjectName}" as a ${priority} priority subject. My current CGPA is ${currentGPA} and I want to reach ${targetGPA}.

Give me a SPECIFIC and DETAILED study plan for ONLY this subject with:
1. **Exact topics to master** (list the most important ones)
2. **Daily study routine** (what to do each hour — e.g. "Hour 1: theory reading, Hour 2: solve 10 problems, Hour 3: past paper")
3. **5 proven techniques** to score above 90% in this subject specifically
4. **Common mistakes** students make in this subject and how to avoid them
5. **Quick revision tips** for exam day

Be extremely specific. No generic advice. Only things that directly help score high in ${subjectName}.`;

  addMessage('user', `Give me a detailed study plan for ${subjectName} (${priority} priority)`);
  showTyping(true);

  try {
    const chats  = lsGetChats();
    const chat   = chats.find(c => c.id === activeChatId);
    const history = chat ? chat.messages : [];
    const profile = lsGetProfile();
    const res = await fetch('/chat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({message: prompt, display_message: `Detailed study plan for ${subjectName}`, messages: history, chat_id: activeChatId, profile})
    });
    const data = await res.json();
    showTyping(false);
    addMessage('bot', data.reply);
    // Save to localStorage
    const chats2 = lsGetChats(); const chat2 = chats2.find(c=>c.id===activeChatId);
    if(chat2){chat2.messages.push({role:'user',content:prompt});chat2.messages.push({role:'assistant',content:data.reply});lsSaveChats(chats2);refreshChats();}
  } catch(e) {
    showTyping(false);
    addMessage('bot', '❌ Error getting tips bro!');
  }
}

// ── Dynamic CGPA Subject Boxes ─────────────────────────
function buildSubjectBoxes() {
  const n = parseInt(document.getElementById("cgpaNumSubjects").value) || 0;
  const container = document.getElementById("cgpaSubjectBoxes");
  if (n < 1 || n > 12) { container.innerHTML = ''; return; }

  container.innerHTML = '';

  // Header row
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:grid;grid-template-columns:28px 1fr 90px 70px;gap:8px;padding:0 2px;margin-bottom:2px";
  hdr.innerHTML = `
    <div></div>
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-family:'Fira Code',monospace">Subject Name</div>
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-family:'Fira Code',monospace">Credits</div>
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-family:'Fira Code',monospace">Priority</div>
  `;
  container.appendChild(hdr);

  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.style.cssText = "display:grid;grid-template-columns:28px 1fr 90px 70px;gap:8px;align-items:center;animation:ci-in 0.2s ease both";
    row.style.animationDelay = (i * 0.04) + 's';
    row.innerHTML = `
      <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#c49a6c,#6b4c22);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0">${i+1}</div>
      <input class="cgpa-inp" id="subj_name_${i}" placeholder="e.g. Data Structures" style="margin:0"/>
      <input class="cgpa-inp" id="subj_cred_${i}" placeholder="Credits" type="number" min="1" max="6" style="margin:0;text-align:center"/>
      <select class="cgpa-inp" id="subj_pri_${i}" style="margin:0;padding:8px 6px;cursor:pointer">
        <option value="High">🔴 High</option>
        <option value="Medium" selected>🟡 Med</option>
        <option value="Low">🟢 Low</option>
      </select>
    `;
    container.appendChild(row);
  }
}

// ── CGPA Visual Plan Renderer ──────────────────────────
function showCGPAPlan(text, meta) {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  lastAcademicResult = text;

  const current  = parseFloat(meta?.current  || 0);
  const target   = parseFloat(meta?.target   || 10);
  const maxGPA   = 10;
  const curPct   = (current / maxGPA) * 100;
  const tgtPct   = (target  / maxGPA) * 100;
  const gap      = (target - current).toFixed(2);

  // Parse lines
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const get = (key) => lines.filter(l => l.toUpperCase().startsWith(key.toUpperCase() + ':')).map(l => l.replace(new RegExp('^'+key+':\\s*','i'),'').trim());

  const summary    = get('SUMMARY')[0]    || '';
  const motivation = get('MOTIVATION')[0] || '';
  const stats      = get('STAT').map(s => { const [label,...rest] = s.split('|'); return {label: label?.trim(), val: rest.join('|')?.trim()}; });
  const subjects   = get('SUBJECT').map(s => { const p = s.split('|'); return {name:p[0]?.trim(), grade:p[1]?.trim(), priority:p[2]?.trim()||'Medium', hours:p[3]?.trim(), tips:p[4]?.trim()}; });
  const strategies = get('STRATEGY').map(s => { const [title,...rest] = s.split('|'); return {title:title?.trim(), desc:rest.join('|')?.trim()}; });
  const schedule   = get('SCHEDULE').map(s => { const p = s.split('|'); return {day:p[0]?.trim(), subjs:p[1]?.trim(), hours:p[2]?.trim(), focus:p[3]?.trim()}; });
  const subjectsList = subjects.length ? subjects : (meta?.subjects_list||[]).map(s=>({name:s.name, grade:meta?.req_grade_pct?meta.req_grade_pct+'%':'85%', priority:s.priority, hours:s.priority==='High'?'3+ hrs/day':s.priority==='Medium'?'2 hrs/day':'1 hr/day', tips:'Click the card to get specific study tips from Raai!'}));
  const dayColors = {'Monday':'#3cb371','Tuesday':'#2e86ab','Wednesday':'#8e44ad','Thursday':'#e67e22','Friday':'#e74c3c','Saturday':'#1abc9c','Sunday':'#95a5a6'};
  const stratIcons = ['🎯','📚','⏰','💪','🧠','🔥','📝','✅'];
  const gradeColor = (g) => { const n=parseFloat(g); if(n>=85) return '#c0392b'; if(n>=75) return '#b7770d'; return '#1e8449'; };
  const priBg = {'High':'rgba(231,76,60,0.08)','Medium':'rgba(243,156,18,0.08)','Low':'rgba(39,174,96,0.08)'};
  const priGlow = {'High':'rgba(231,76,60,0.3)','Medium':'rgba(243,156,18,0.3)','Low':'rgba(39,174,96,0.3)'};

  let html = `<div class="cgpa-plan-wrap">

    <!-- HERO -->
    <div class="cgpa-hero">
      <div class="cgpa-hero-label">📊 CGPA Improvement Plan</div>
      <h2>${current} → ${target} GPA 🎯</h2>
      <p>${esc(summary)}</p>
    </div>

    <!-- PROGRESS BAR -->
    <div class="cgpa-progress-section">
      <div class="cgpa-progress-header">
        <span class="cgpa-progress-title">Your Progress Journey</span>
        <div class="cgpa-progress-pcts">
          <span style="color:var(--accent)">Now: ${current}</span>
          <span style="color:var(--gold2)">Target: ${target}</span>
        </div>
      </div>
      <div class="cgpa-bar-wrap">
        <div class="cgpa-bar-fill" id="cgpaBarFill" style="width:0%;background:linear-gradient(90deg,var(--accent),var(--gold2))"></div>
        <div class="cgpa-bar-target" style="left:${tgtPct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-dim);font-family:'Fira Code',monospace">
        <span>0.0</span><span>Target: ${target}</span><span>${maxGPA}.0</span>
      </div>
    </div>

    <!-- STATS -->
    <div class="cgpa-stats-row">
      ${stats.length ? stats.map(s => `
        <div class="cgpa-stat">
          <div class="cgpa-stat-icon">${s.label?.includes('Gap')?'📉':s.label?.includes('Credit')?'🎓':s.label?.includes('Score')||s.label?.includes('Grade')?'💯':'⏱️'}</div>
          <div class="cgpa-stat-val" style="font-size:16px">${esc(s.val?.split(' ')[0]||s.val||'-')}</div>
          <div class="cgpa-stat-lbl">${esc(s.label||'')}</div>
        </div>`).join('') : `
        <div class="cgpa-stat"><div class="cgpa-stat-icon">📉</div><div class="cgpa-stat-val">${gap}</div><div class="cgpa-stat-lbl">GPA Gap</div></div>
        <div class="cgpa-stat"><div class="cgpa-stat-icon">🎓</div><div class="cgpa-stat-val">${meta?.credits||'?'}</div><div class="cgpa-stat-lbl">Credits Left</div></div>
        <div class="cgpa-stat"><div class="cgpa-stat-icon">💯</div><div class="cgpa-stat-val">85%+</div><div class="cgpa-stat-lbl">Min Grade Needed</div></div>
        <div class="cgpa-stat"><div class="cgpa-stat-icon">⏱️</div><div class="cgpa-stat-val">4h</div><div class="cgpa-stat-lbl">Study/Day</div></div>`}
    </div>

    <!-- SUBJECTS - CLICKABLE CARDS -->
    ${subjectsList.length ? `
    <div>
      <div class="cgpa-subjects-title">📚 Subject Action Plan <span style="font-size:10px;font-weight:500;color:var(--text-dim);margin-left:6px">👆 Click any subject for deep study tips</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${subjectsList.map((s,i) => {
          const pri = s.priority||'Medium';
          const hrsNum = pri==='High'?3:pri==='Medium'?2:1;
          const priColor = pri==='High'?'#e74c3c':pri==='Medium'?'#f39c12':'#27ae60';
          const priLabel = pri==='High'?'🔴 HIGH PRIORITY':pri==='Medium'?'🟡 MEDIUM':'🟢 LOW';
          return `
          <div onclick="cgpaDeepDive('${esc(s.name||'').replace(/'/g,"\\'")}','${pri}','${meta?.current||current}','${meta?.target||target}')"
               style="background:rgba(255,255,255,0.9);border:2px solid ${priColor}33;border-radius:16px;padding:16px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden"
               onmouseover="this.style.transform='translateY(-3px)';this.style.borderColor='${priColor}88';this.style.boxShadow='0 8px 24px ${priColor}22'"
               onmouseout="this.style.transform='';this.style.borderColor='${priColor}33';this.style.boxShadow=''">
            <!-- Glow top bar -->
            <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${priColor},${priColor}88)"></div>

            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;margin-top:2px">
              <div style="font-size:13px;font-weight:800;color:var(--text);flex:1;line-height:1.3">${esc(s.name||'')}</div>
              <div style="font-size:9px;font-weight:800;letter-spacing:1px;color:${priColor};background:${priColor}15;border:1px solid ${priColor}33;border-radius:20px;padding:3px 8px;white-space:nowrap;margin-left:6px">${priLabel}</div>
            </div>

            <!-- Hours badge - BIG -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <div style="background:${priColor}15;border:1.5px solid ${priColor}33;border-radius:12px;padding:8px 14px;text-align:center">
                <div style="font-size:20px;font-weight:900;color:${priColor};line-height:1">${hrsNum}+</div>
                <div style="font-size:9px;color:${priColor};font-weight:700;letter-spacing:0.5px">HRS/DAY</div>
              </div>
              <div style="flex:1">
                <div style="font-size:11px;font-weight:700;color:var(--text-mid)">Target Score</div>
                <div style="font-size:18px;font-weight:900;color:${gradeColor(s.grade)}">${esc(s.grade||'85%')}</div>
              </div>
            </div>

            <!-- Tips -->
            ${s.tips ? `<div style="font-size:11.5px;color:var(--text-mid);line-height:1.55;border-top:1px solid ${priColor}22;padding-top:8px">${esc(s.tips)}</div>` : ''}

            <!-- Click hint -->
            <div style="margin-top:10px;font-size:10px;color:${priColor};font-weight:700;display:flex;align-items:center;gap:4px;opacity:0.7">
              <span>💬</span> Click for more tips from Raai
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- WEEKLY SCHEDULE -->
    ${schedule.length ? `
    <div>
      <div class="cgpa-subjects-title">📅 Weekly Study Schedule</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${schedule.map(d => {
          const dc = dayColors[d.day]||'#3cb371';
          const isSun = d.day==='Sunday';
          return `<div style="display:grid;grid-template-columns:80px 1fr auto;align-items:center;gap:10px;background:${isSun?'rgba(149,165,166,0.08)':'rgba(255,255,255,0.88)'};border:1.5px solid ${dc}33;border-radius:12px;padding:10px 14px;box-shadow:0 2px 8px var(--shadow);transition:all 0.2s;cursor:default"
            onmouseover="this.style.transform='translateX(4px)';this.style.borderColor='${dc}77'"
            onmouseout="this.style.transform='';this.style.borderColor='${dc}33'">
            <div style="font-size:11px;font-weight:800;color:${dc};font-family:'Fira Code',monospace;letter-spacing:0.5px">${esc(d.day||'')}</div>
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(d.subjs||'')}</div>
              <div style="font-size:11px;color:var(--text-mid);margin-top:2px">${esc(d.focus||'')}</div>
            </div>
            <div style="background:${dc}18;border:1.5px solid ${dc}44;border-radius:20px;padding:5px 12px;font-size:11px;font-weight:800;color:${dc};white-space:nowrap">⏱️ ${esc(d.hours||'')}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- STRATEGIES -->
    ${strategies.length ? `
    <div>
      <div class="cgpa-subjects-title">⚡ Study Strategies</div>
      <div class="cgpa-strategies">
        ${strategies.map((s,i) => `
          <div class="cgpa-strategy">
            <div class="cgpa-strat-icon">${stratIcons[i % stratIcons.length]}</div>
            <div class="cgpa-strat-title">${esc(s.title||'')}</div>
            <div class="cgpa-strat-desc">${esc(s.desc||'')}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- MOTIVATION -->
    ${motivation ? `
    <div class="cgpa-motivation">
      <div class="cgpa-moti-icon">🔥</div>
      <div class="cgpa-moti-text">${esc(motivation)}</div>
    </div>` : ''}

  </div>`;

  out.innerHTML = html;
  saveToChatHistory("cgpa_plan", text);
  document.getElementById("academicDoubtBar").classList.add("visible");
  out.scrollIntoView({behavior:"smooth", block:"start"});

  // Animate progress bar after render
  setTimeout(() => {
    const bar = document.getElementById("cgpaBarFill");
    if (bar) bar.style.width = curPct + '%';
  }, 200);
}

async function runCGPA() {
  const out = document.getElementById("academicOutput");
  out.className = "ac-output visible";
  out.innerHTML = `<span style="color:var(--text-mid)">⏳ Calculating your CGPA plan...</span>`;
  document.getElementById("academicDoubtBar").classList.remove("visible");
  out.scrollIntoView({behavior:"smooth",block:"nearest"});

  const current = parseFloat(document.getElementById("cgpaCur").value) || 0;
  const target  = parseFloat(document.getElementById("cgpaTarget").value) || 0;
  const n       = parseInt(document.getElementById("cgpaNumSubjects").value) || 0;

  if (!current || !target || !n) {
    out.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-mid)">⚠️ Fill in Current CGPA, Target CGPA, and number of subjects bro!</div>`;
    return;
  }

  // Collect subject data
  const subjects = [];
  let totalCredits = 0;
  for (let i = 0; i < n; i++) {
    const name = document.getElementById(`subj_name_${i}`)?.value.trim() || `Subject ${i+1}`;
    const cred = parseFloat(document.getElementById(`subj_cred_${i}`)?.value) || 3;
    const pri  = document.getElementById(`subj_pri_${i}`)?.value || 'Medium';
    subjects.push({name, credits: cred, priority: pri});
    totalCredits += cred;
  }

  // Pre-calculate required GPA
  // Formula: target = (currentGPA * pastCredits + newGPA * newCredits) / (pastCredits + newCredits)
  // Assuming past credits ~ 40 (typical semester system default if not given)
  const pastCredits = 40;
  const requiredAvg = ((target * (pastCredits + totalCredits)) - (current * pastCredits)) / totalCredits;
  const reqGrade = Math.max(0, Math.min(100, requiredAvg * 9.5)).toFixed(1); // scale to percentage

  const subjLines = subjects.map(s => `${s.name} (${s.credits} credits, ${s.priority} priority)`).join(', ');

  const body = {
    current_cgpa: current,
    target_cgpa: target,
    remaining_credits: totalCredits,
    subjects: subjLines,
    subject_details: subjects,
    required_avg_gpa: requiredAvg.toFixed(2),
    req_grade_pct: reqGrade
  };

  try {
    const profile = lsGetProfile();
    const res  = await fetch("/academic/cgpa-planner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body, profile})});
    const data = await res.json();
    showCGPAPlan(data.reply, {...body, current, target, credits: totalCredits, subjects_list: subjects});
  } catch(e) { out.innerHTML = "❌ Error."; }
}

async function checkAttendance() {
  const total     = parseInt(document.getElementById("attTotal").value)     || 0;
  const attended  = parseInt(document.getElementById("attAttended").value)  || 0;
  const remaining = parseInt(document.getElementById("attRemaining").value) || 0;
  const profile = lsGetProfile();
  const res  = await fetch("/academic/attendance", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({total_classes:total,attended,remaining,profile}) });
  const data = await res.json();
  const resEl = document.getElementById("attResult"); resEl.style.display="block";
  const pct = data.current_pct || 0;
  document.getElementById("attPct").textContent = `${pct}%`;
  document.getElementById("attPct").style.color = pct>=75?"var(--teal)":pct>=65?"var(--gold)":"var(--red)";
  document.getElementById("attStatus").textContent = data.status || "";
  document.getElementById("attStatus").style.color = pct>=75?"var(--teal)":pct>=65?"var(--gold)":"var(--red)";
  document.getElementById("attMsg").textContent = data.msg || "";
  document.getElementById("attAdvice").innerHTML = renderMarkdown(data.reply || "");
  // Also show in academic output + doubt bar
  const summary = `Attendance: ${pct}% (${attended}/${total})\nStatus: ${data.status}\n${data.msg}\n\n${data.reply}`;
  showAcademicResult(summary);
  resEl.scrollIntoView({behavior:"smooth",block:"nearest"});
}

// ── Code Lab ───────────────────────────────────────────
// ── Time Complexity Visual Renderer ────────────────────
// ── Time Complexity Visual Renderer ────────────────────
function showComplexity(text) {
  const out = document.getElementById("codeOutput");
  out.className = "code-output visible";

  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const getV  = (key) => { const l = lines.find(l=>l.toUpperCase().startsWith(key.toUpperCase()+':')); return l ? l.replace(new RegExp('^'+key+':\\s*','i'),'').trim() : ''; };
  const getAll= (key) => lines.filter(l=>l.toUpperCase().startsWith(key.toUpperCase()+':')).map(l=>l.replace(new RegExp('^'+key+':\\s*','i'),'').trim());

  const overallTime  = getV('OVERALL_TIME')  || 'O(n)';
  const overallSpace = getV('OVERALL_SPACE') || 'O(1)';
  const rating       = getV('RATING')        || 'Good';
  const summary      = getV('SUMMARY')       || '';
  const bottleneck   = getV('BOTTLENECK')    || '';

  const funcs = getAll('FUNC').map(f => {
    const p = f.split('|');
    const get = (label) => { const part = p.find(x=>x.trim().toUpperCase().startsWith(label+':')); return part ? part.replace(new RegExp('^'+label+':\\s*','i'),'').trim() : ''; };
    return {name:get('TIME')?p[0]?.trim():'Block', time:get('TIME'), space:get('SPACE'), why:get('WHY')};
  });

  const loops = getAll('LOOP').map(l => {
    const p = l.split('|');
    const get = (label) => { const part = p.find(x=>x.trim().toUpperCase().startsWith(label+':')); return part ? part.replace(new RegExp('^'+label+':\\s*','i'),'').trim() : ''; };
    return {desc:p[0]?.trim(), depth:parseInt(get('DEPTH'))||1, complexity:get('COMPLEXITY'), line:get('LINE')};
  });

  const bestRaw  = getV('BEST');
  const avgRaw   = getV('AVERAGE');
  const worstRaw = getV('WORST');
  const bestVal  = bestRaw.split('|')[0]?.trim()  || 'O(1)';
  const avgVal   = avgRaw.split('|')[0]?.trim()   || 'O(n)';
  const worstVal = worstRaw.split('|')[0]?.trim() || 'O(n²)';
  const bestWhen = bestRaw.includes('|')  ? bestRaw.split('|')[1]?.replace(/^WHEN:\s*/i,'').trim()  : '';
  const avgWhen  = avgRaw.includes('|')   ? avgRaw.split('|')[1]?.replace(/^WHEN:\s*/i,'').trim()   : '';
  const worstWhen= worstRaw.includes('|') ? worstRaw.split('|')[1]?.replace(/^WHEN:\s*/i,'').trim() : '';

  const optimizes = getAll('OPTIMIZE').filter(o=>o&&o.length>3&&!o.match(/^\[/));

  // Big-O complexity scale positions (0-100%)
  const scaleMap = {'O(1)':4,'O(log n)':14,'O(√n)':22,'O(n)':32,'O(n log n)':44,'O(n²)':58,'O(n³)':72,'O(2ⁿ)':84,'O(n!)':94};
  const getScalePos = (notation) => {
    for (const [key, val] of Object.entries(scaleMap)) {
      if (notation.replace(/\s/g,'').toLowerCase().includes(key.replace(/\s/g,'').toLowerCase())) return val;
    }
    if (notation.includes('²') || notation.includes('^2')) return 58;
    if (notation.includes('log')) return 14;
    return 32;
  };
  const markerPos = getScalePos(overallTime);

  // Rating color
  const ratingColor = {Excellent:'#27ae60',Good:'#2ecc71',Fair:'#f39c12',Poor:'#e74c3c'}[rating]||'#3cb371';

  // Loop depth colors
  const depthColors = ['#27ae60','#f39c12','#e74c3c','#8e44ad'];

  const html = `<div class="tc-wrap">

    <!-- HERO -->
    <div class="tc-hero">
      <div class="tc-hero-row">
        <div>
          <div style="font-size:10px;letter-spacing:2px;font-family:'Fira Code',monospace;opacity:0.5;margin-bottom:6px;text-transform:uppercase">Time Complexity</div>
          <div class="tc-big-o">${esc(overallTime)}</div>
          <div class="tc-space-o">Space: ${esc(overallSpace)}</div>
        </div>
        <span class="tc-rating-badge rating-${rating}">${rating}</span>
      </div>
      ${summary?`<div class="tc-summary">${esc(summary)}</div>`:''}
    </div>

    <!-- BIG-O SCALE BAR -->
    <div class="tc-scale-wrap">
      <div class="tc-scale-title">📏 Complexity Scale</div>
      <div class="tc-scale-track">
        <div class="tc-scale-marker" id="tcMarker" style="left:0%;color:${ratingColor};border-color:${ratingColor}">
          <span style="font-size:7px">${esc(overallTime.replace('O(','').replace(')',''))}</span>
        </div>
      </div>
      <div class="tc-scale-labels">
        <span>O(1)</span><span>O(log n)</span><span>O(n)</span><span>O(n²)</span><span>O(2ⁿ)</span><span>O(n!)</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-mid);display:flex;align-items:center;gap:8px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#27ae60,#2ecc71)"></span> Optimal
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#f1c40f,#e67e22)"></span> Acceptable
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#e74c3c,#8e44ad)"></span> Expensive
      </div>
    </div>

    <!-- BEST / AVG / WORST -->
    <div>
      <div class="tc-section-title">📊 Case Analysis</div>
      <div class="tc-cases">
        <div class="tc-case best">
          <div class="tc-case-icon">🟢</div>
          <div class="tc-case-label">Best Case</div>
          <div class="tc-case-val">${esc(bestVal)}</div>
          ${bestWhen?`<div class="tc-case-when">${esc(bestWhen)}</div>`:''}
        </div>
        <div class="tc-case avg">
          <div class="tc-case-icon">🟡</div>
          <div class="tc-case-label">Average</div>
          <div class="tc-case-val">${esc(avgVal)}</div>
          ${avgWhen?`<div class="tc-case-when">${esc(avgWhen)}</div>`:''}
        </div>
        <div class="tc-case worst">
          <div class="tc-case-icon">🔴</div>
          <div class="tc-case-label">Worst Case</div>
          <div class="tc-case-val">${esc(worstVal)}</div>
          ${worstWhen?`<div class="tc-case-when">${esc(worstWhen)}</div>`:''}
        </div>
      </div>
    </div>

    <!-- FUNCTION BREAKDOWN -->
    ${funcs.length?`
    <div>
      <div class="tc-section-title">🔍 Function Breakdown</div>
      <div class="tc-funcs">
        ${funcs.map(f=>`
          <div class="tc-func">
            <div>
              <div class="tc-func-name">${esc(f.name||'Block')}</div>
              <div class="tc-func-why">${esc(f.why||'')}</div>
            </div>
            <div class="tc-badge time">${esc(f.time||'?')}</div>
            <div class="tc-badge space">${esc(f.space||'?')}</div>
          </div>`).join('')}
      </div>
    </div>`:''}

    <!-- LOOP DEPTH -->
    ${loops.length?`
    <div>
      <div class="tc-section-title">🔄 Loop Analysis</div>
      <div class="tc-loops">
        ${loops.map(l=>{
          const dc = depthColors[Math.min(l.depth-1,3)];
          return `<div class="tc-loop">
            <div class="tc-loop-depth">
              ${Array.from({length:l.depth},(_,i)=>`<div class="tc-depth-block" style="background:${depthColors[Math.min(i,3)]};height:${14+i*4}px"></div>`).join('')}
            </div>
            <div class="tc-loop-info">
              <div class="tc-loop-desc">${esc(l.desc||'')}</div>
              ${l.line?`<div class="tc-loop-line">📍 ${esc(l.line)}</div>`:''}
            </div>
            <div class="tc-loop-badge" style="color:${dc};background:${dc}15;border-color:${dc}44">${esc(l.complexity||'?')}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    <!-- BOTTLENECK -->
    ${bottleneck?`
    <div class="tc-bottleneck">
      <span style="font-size:26px;flex-shrink:0">⚠️</span>
      <div>
        <div style="font-size:12px;font-weight:800;color:#c0392b;margin-bottom:4px">Performance Bottleneck</div>
        <div style="font-size:12.5px;color:var(--text);line-height:1.6">${esc(bottleneck)}</div>
      </div>
    </div>`:''}

    <!-- OPTIMIZE -->
    ${optimizes.length?`
    <div>
      <div class="tc-section-title">⚡ How to Optimize</div>
      <div class="tc-optimize">
        ${optimizes.map(o=>`<div class="tc-opt-item">💡 ${esc(o)}</div>`).join('')}
      </div>
    </div>`:''}

  </div>`;

  out.innerHTML = html;

  // Animate the scale marker after render
  setTimeout(()=>{
    const marker = document.getElementById("tcMarker");
    if (marker) marker.style.left = markerPos + '%';
  }, 200);

  out.scrollIntoView({behavior:'smooth', block:'start'});
}

// ── Code Review Visual Renderer ────────────────────────
function showCodeReview(text) {
  const out = document.getElementById("codeOutput");
  out.className = "code-output visible";

  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const get   = (key) => lines.filter(l=>l.toUpperCase().startsWith(key.toUpperCase()+':')).map(l=>l.replace(new RegExp('^'+key+':\\s*','i'),'').trim());

  const lang    = get('LANG')[0]    || 'Code';
  const scoreRaw= get('SCORE')[0]   || '70';
  const score   = parseInt(scoreRaw) || 70;
  const level   = get('LEVEL')[0]   || 'Intermediate';
  const summary = get('SUMMARY')[0] || '';
  const verdict = get('VERDICT')[0] || '';

  const metrics = get('METRIC').map(m => {
    const p = m.split('|');
    const scoreStr = p[1]?.trim() || '0/20';
    const nums = scoreStr.match(/(\d+)\s*\/\s*(\d+)/);
    const got = nums ? parseInt(nums[1]) : 0;
    const max = nums ? parseInt(nums[2]) : 20;
    return {name:p[0]?.trim(), score:got, max, pct:Math.round((got/max)*100), verdict:p[2]?.trim()};
  });

  const bugs = get('BUG').map(b => {
    const p = b.split('|');
    return {text:p[0]?.trim(), sev:(p[1]?.trim()||'Minor').replace(/severity:\s*/i,'')};
  });

  const fixes    = get('FIX').filter(f => f && f.length > 3 && !f.match(/^\[.*\]$/));
  const improves = get('IMPROVE').filter(i => i && i.length > 3 && !i.match(/^\[.*\]$/));
  const fixesFinal    = fixes.length    ? fixes    : lines.filter(l=>/^fix\s*:/i.test(l)).map(l=>l.replace(/^fix\s*:\s*/i,'').trim()).filter(l=>l.length>3&&!l.match(/^\[/));
  const improvesFinal = improves.length ? improves : lines.filter(l=>/^improve\s*:/i.test(l)).map(l=>l.replace(/^improve\s*:\s*/i,'').trim()).filter(l=>l.length>3&&!l.match(/^\[/));

  const platforms= get('PLATFORM').map(p => {
    const pts = p.split('|');
    return {name:pts[0]?.trim(), level:pts[1]?.trim(), desc:pts[2]?.trim()};
  });

  // Score color
  const sc = score>=80?'#27ae60':score>=60?'#f39c12':'#e74c3c';
  const sc2= score>=80?'rgba(39,174,96,0.3)':score>=60?'rgba(243,156,18,0.3)':'rgba(231,76,60,0.3)';

  // Level badge color
  const lvlC = level==='Advanced'?'#8e44ad':level==='Intermediate'?'#2e86ab':'#27ae60';

  // Metric bar colors
  const mColor = (pct) => pct>=80?'#27ae60':pct>=60?'#f39c12':'#e74c3c';

  // Platform styling
  const platStyle = {
    'LeetCode':    {bg:'rgba(255,161,22,0.07)',  border:'rgba(255,161,22,0.4)',  color:'#e67e22', logo:'🟨'},
    'HackerRank':  {bg:'rgba(0,195,140,0.07)',   border:'rgba(0,195,140,0.4)',   color:'#00c38c', logo:'💚'},
    'CodeChef':    {bg:'rgba(90,62,47,0.07)',    border:'rgba(90,62,47,0.3)',    color:'#5a3e2f', logo:'👨‍🍳'},
  };

  let html = `<div class="cr-wrap">

    <!-- HERO -->
    <div class="cr-hero">
      <div class="cr-hero-top">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="cr-lang-badge">${esc(lang)}</span>
            <span class="cr-level-badge" style="background:${lvlC}22;border:1px solid ${lvlC}66;color:${lvlC}">${esc(level)}</span>
          </div>
          <div style="font-size:20px;font-weight:900">Code Review Report</div>
        </div>
        <div class="cr-score-circle" style="border-color:${sc2};background:${sc}15">
          <div class="cr-score-num" style="color:${sc}">${score}</div>
          <div class="cr-score-lbl" style="color:${sc}">/100</div>
        </div>
      </div>
      ${summary?`<div class="cr-summary">${esc(summary)}</div>`:''}
    </div>

    <!-- METRICS -->
    <div>
      <div class="cr-section-title">📊 Score Breakdown</div>
      <div class="cr-metrics">
        ${metrics.map(m=>`
          <div class="cr-metric">
            <div class="cr-metric-name">${esc(m.name)}</div>
            <div class="cr-metric-bar-wrap">
              <div class="cr-metric-bar" style="width:0%;background:linear-gradient(90deg,${mColor(m.pct)},${mColor(m.pct)}88)" data-pct="${m.pct}"></div>
            </div>
            <div class="cr-metric-score" style="color:${mColor(m.pct)}">${m.score}<span style="font-size:12px;font-weight:500;color:var(--text-dim)">/${m.max}</span></div>
            <div class="cr-metric-verdict">${esc(m.verdict||'')}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- BUGS -->
    ${bugs.length?`
    <div>
      <div class="cr-section-title">🐛 Issues Found</div>
      <div class="cr-bugs">
        ${bugs.map(b=>`
          <div class="cr-bug ${b.sev}">
            <span class="cr-bug-sev sev-${b.sev}">${esc(b.sev)}</span>
            <div class="cr-bug-text">${esc(b.text)}</div>
          </div>`).join('')}
      </div>
    </div>`:''}

    <!-- FIXES -->
    ${fixesFinal.length?`
    <div>
      <div class="cr-section-title">🔧 How to Fix</div>
      <div class="cr-improvements">
        ${fixesFinal.map(f=>`<div class="cr-improve" style="border-left-color:#e74c3c">🔴 ${esc(f)}</div>`).join('')}
      </div>
    </div>`:''}

    <!-- PLATFORM COMPARISON -->
    ${platforms.length?`
    <div>
      <div class="cr-section-title">🏆 Platform Comparison</div>
      <div class="cr-platforms">
        ${platforms.map(p=>{
          const ps = platStyle[p.name] || {bg:'rgba(100,100,100,0.07)',border:'rgba(100,100,100,0.3)',color:'#555',logo:'💻'};
          return `<div class="cr-platform" style="background:${ps.bg};border-color:${ps.border}">
            <div class="cr-plat-logo">${ps.logo}</div>
            <div class="cr-plat-name" style="color:${ps.color}">${esc(p.name)}</div>
            <div class="cr-plat-level" style="color:${ps.color}">${esc(p.level)}</div>
            <div class="cr-plat-desc" style="color:${ps.color}">${esc(p.desc)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    <!-- IMPROVEMENTS -->
    ${improvesFinal.length?`
    <div>
      <div class="cr-section-title">⚡ Improvements</div>
      <div class="cr-improvements">
        ${improvesFinal.map(im=>`<div class="cr-improve">💡 ${esc(im)}</div>`).join('')}
      </div>
    </div>`:''}

    <!-- VERDICT -->
    ${verdict?`
    <div class="cr-verdict">
      <span style="font-size:28px;flex-shrink:0">👨‍💻</span>
      <div><strong style="color:var(--gold2)">Senior Dev Verdict:</strong> ${esc(verdict)}</div>
    </div>`:''}

  </div>`;

  out.innerHTML = html;

  // Animate metric bars after render
  setTimeout(()=>{
    out.querySelectorAll('.cr-metric-bar').forEach(bar=>{
      bar.style.width = bar.dataset.pct + '%';
    });
  }, 150);

  out.scrollIntoView({behavior:'smooth', block:'start'});
}

async function analyzeCode(mode) {
  const code = document.getElementById("codeInput").value.trim();
  const out  = document.getElementById("codeOutput");
  if (!code) { out.className="code-output visible"; out.innerHTML="⚠️ Paste some code first bro!"; return; }
  out.className="code-output visible";
  out.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-mid)">
    <div style="font-size:32px;margin-bottom:10px">${mode==='review'?'🔍':'⚙️'}</div>
    <div style="font-size:14px;font-weight:600">Raai is ${mode==='review'?'reviewing your code deeply...':'analyzing...'}</div>
  </div>`;
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
  try {
    const profile = lsGetProfile();
    const res  = await fetch("/academic/code-analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,mode,profile})});
    const data = await res.json();
    if (mode === 'review') {
      showCodeReview(data.reply);
    } else if (mode === 'complexity') {
      showComplexity(data.reply);
    } else {
      out.innerHTML = renderMarkdown(data.reply);
    }
  } catch(e) { out.innerHTML="❌ Error — is server running?"; }
}

function clearCode() {
  document.getElementById("codeInput").value="";
  const out=document.getElementById("codeOutput"); out.className="code-output"; out.textContent="";
}

// ── Raai Emoji Face ────────────────────────────────────
(function() {
  const face       = document.getElementById("raaiface");
  const wrap       = face ? face.closest(".raai-face-wrap") : null;
  const status     = document.getElementById("faceStatus");
  const pupilL     = document.getElementById("pupilL");
  const pupilR     = document.getElementById("pupilR");
  const mouthShape = document.getElementById("mouthShape");
  const thinkDots  = document.getElementById("thinkDots");

  if (!face) return;

  let typingTimer = null;
  let isThinking  = false;

  function setMouth(state) {
    if (!mouthShape) return;
    mouthShape.className = "emoji-mouth-shape " + state;
  }

  // ── Cursor tracking — pupils follow mouse ──
  document.addEventListener("mousemove", e => {
    if (isThinking) return;
    const rect = face.getBoundingClientRect();
    const faceCX = rect.left + rect.width  / 2;
    const faceCY = rect.top  + rect.height / 2;
    const dx = e.clientX - faceCX;
    const dy = e.clientY - faceCY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxMove = 3;
    const nx = dist > 0 ? (dx / dist) * Math.min(dist * 0.07, maxMove) : 0;
    const ny = dist > 0 ? (dy / dist) * Math.min(dist * 0.06, maxMove) : 0;
    [pupilL, pupilR].forEach(p => {
      if (p) p.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    });
  });

  // ── Typing: mouth opens on any keydown in the textarea ──
  // Use both keydown AND input to catch all cases
  function onTypingActivity() {
    if (isThinking) return;
    face.classList.add("typing");
    if (wrap) wrap.classList.add("typing-active");
    setMouth("talking");
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      face.classList.remove("typing");
      if (wrap) wrap.classList.remove("typing-active");
      setMouth("idle");
    }, 800);
  }

  // Hook onto the actual textarea element directly
  const textarea = document.getElementById("chatInput");
  if (textarea) {
    textarea.addEventListener("keydown", onTypingActivity);
    textarea.addEventListener("input",   onTypingActivity);
  }

  // ── Thinking state ──
  window.setFaceThinking = function(on) {
    isThinking = on;
    clearTimeout(typingTimer);
    if (on) {
      face.classList.remove("typing");
      face.classList.add("thinking");
      if (wrap) { wrap.classList.remove("typing-active"); wrap.classList.add("thinking-active"); }
      setMouth("flat");
      if (thinkDots) thinkDots.classList.add("visible");
      if (status) status.textContent = "Ready to help ⚡";
    } else {
      face.classList.remove("thinking");
      if (wrap) wrap.classList.remove("thinking-active");
      setMouth("idle");
      if (thinkDots) thinkDots.classList.remove("visible");
      if (status) status.textContent = "Ready to help ⚡";
    }
  };

  // ── Random idle glances ──
  setInterval(() => {
    if (isThinking || face.classList.contains("typing")) return;
    if (Math.random() > 0.5) {
      const gx = (Math.random() - 0.5) * 5;
      const gy = (Math.random() - 0.5) * 2;
      [pupilL, pupilR].forEach(p => {
        if (p) p.style.transform = `translate(calc(-50% + ${gx}px), calc(-50% + ${gy}px))`;
      });
      setTimeout(() => {
        [pupilL, pupilR].forEach(p => {
          if (p) p.style.transform = "translate(-50%,-50%)";
        });
      }, 700);
    }
  }, 2600);
})();

// ── Mobile upload strip ────────────────────────────────
const mobFileInput = document.getElementById("mobFileInput");
const mobFileBadge = document.getElementById("mobFileBadge");
if (mobFileInput) {
  mobFileInput.addEventListener("change", () => {
    if (mobFileInput.files[0]) {
      uploadFile(mobFileInput.files[0]);
      if (mobFileBadge) { mobFileBadge.textContent = "📎 " + mobFileInput.files[0].name; mobFileBadge.style.display = "block"; }
    }
  });
}

function quickTranslateMob() {
  const lang = document.getElementById("mobLangInput");
  if (lang && lang.value.trim()) {
    // sync to desktop input and trigger
    const desktopLang = document.getElementById("langInput");
    if (desktopLang) desktopLang.value = lang.value.trim();
    quickTranslate();
  }
}

// ── Start ──────────────────────────────────────────────
// ── QP Generator ───────────────────────────────────────
let lastQPData = null;

function showQPModal() {
  document.getElementById('qpModal').style.display = 'flex';
}

async function runQPGenerator() {
  document.getElementById('qpModal').style.display = 'none';
  const subject = document.getElementById('qpSubject').value.trim();
  const dept    = document.getElementById('qpDept').value.trim();
  const year    = document.getElementById('qpYear').value.trim();
  const exam    = document.getElementById('qpExam').value;
  const out     = document.getElementById('academicOutput');
  out.className = 'ac-output visible';
  out.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-mid)"><div style="font-size:36px;margin-bottom:12px">📝</div><div style="font-size:14px;font-weight:600">Raai is generating your question paper...</div><div style="font-size:11px;margin-top:6px;color:var(--text-dim)">This may take 30-60 seconds</div></div>`;
  document.getElementById('academicDoubtBar').classList.remove('visible');
  out.scrollIntoView({behavior:'smooth',block:'nearest'});
  try {
    const profile = lsGetProfile();
    const res  = await fetch('/academic/generate-qp', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({subject, dept, year, exam, chat_id: activeChatId, profile})});
    const data = await res.json();
    if (data.success) {
      lastQPData = {raw: data.reply, subject, dept, year, exam};
      showQPResult(data.reply, subject, dept, year, exam);
    } else {
      out.innerHTML = renderMarkdown(data.reply);
    }
  } catch(e) { out.innerHTML = '❌ Error generating QP. Is the server running?'; }
}

function parseQP(raw) {
  const lines = raw.split('
').map(l => l.trim()).filter(Boolean);
  const get = (key) => { const l = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase() + ':')); return l ? l.replace(new RegExp('^' + key + ':\s*', 'i'), '').trim() : ''; };
  const getAll = (key) => lines.filter(l => l.toUpperCase().startsWith(key.toUpperCase() + ':')).map(l => l.replace(new RegExp('^' + key + ':\s*', 'i'), '').trim());
  return {
    subject:  get('QP_SUBJECT'),
    dept:     get('QP_DEPT'),
    exam:     get('QP_EXAM'),
    year:     get('QP_YEAR'),
    duration: get('QP_DURATION') || '3 Hours',
    marks:    get('QP_MAX_MARKS') || '100',
    q2m:      Array.from({length:10}, (_,i) => get(`2M_Q${i+1}`)).filter(Boolean),
    q16:      Array.from({length:5},  (_,i) => ({a: get(`16M_Q${i+1}A`), b: get(`16M_Q${i+1}B`)})).filter(q => q.a||q.b)
  };
}

function showQPResult(raw, subject, dept, year, exam) {
  const out = document.getElementById('academicOutput');
  out.className = 'ac-output visible';
  lastAcademicResult = raw;
  const qp = parseQP(raw);

  const html = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button onclick="viewQP()" style="flex:1;min-width:120px;padding:11px 16px;border-radius:12px;border:none;background:linear-gradient(135deg,#c49a6c,#6b4c22);color:#fff;font-family:'Exo 2',sans-serif;font-weight:800;font-size:13px;cursor:pointer">👁️ View QP</button>
      <button onclick="downloadQP()" style="flex:1;min-width:120px;padding:11px 16px;border-radius:12px;border:none;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;font-family:'Exo 2',sans-serif;font-weight:800;font-size:13px;cursor:pointer">⬇️ Download QP</button>
      <button onclick="editQPInChat()" style="flex:1;min-width:120px;padding:11px 16px;border-radius:12px;border:1.5px solid var(--border2);background:var(--card);color:var(--text-mid);font-family:'Exo 2',sans-serif;font-weight:700;font-size:13px;cursor:pointer">✏️ Edit via Chat</button>
    </div>
    <div style="background:rgba(255,255,255,0.9);border:2px solid var(--border2);border-radius:16px;padding:24px;font-family:'Times New Roman',serif">
      <div style="text-align:center;border-bottom:2px solid var(--border2);padding-bottom:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:var(--text-mid);letter-spacing:1px">${esc(qp.dept)} DEPARTMENT</div>
        <div style="font-size:18px;font-weight:800;color:var(--text);margin:6px 0">${esc(qp.exam || exam)}</div>
        <div style="font-size:15px;font-weight:700;color:var(--gold2)">${esc(qp.subject || subject)}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:6px">${esc(qp.year || year)}</div>
        <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--text-mid)">
          <span>Duration: <strong>${esc(qp.duration)}</strong></span>
          <span>Maximum Marks: <strong>${esc(qp.marks)}</strong></span>
        </div>
      </div>

      <div style="font-weight:800;font-size:14px;color:var(--gold2);margin-bottom:4px">PART A — 2 Mark Questions (10 × 2 = 20 Marks)</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;font-style:italic">Answer ALL questions.</div>
      ${qp.q2m.map((q,i) => `<div style="margin-bottom:10px;display:flex;gap:10px"><span style="font-weight:700;min-width:24px;color:var(--gold2)">${i+1}.</span><span style="font-size:13.5px;color:var(--text);line-height:1.6">${esc(q)}</span></div>`).join('')}

      <div style="font-weight:800;font-size:14px;color:var(--gold2);margin:20px 0 4px">PART B — 16 Mark Questions (5 × 16 = 80 Marks)</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;font-style:italic">Answer ALL questions. Each question carries 16 marks (8+8).</div>
      ${qp.q16.map((q,i) => `
        <div style="margin-bottom:14px;padding:12px;border:1px solid var(--border2);border-radius:10px">
          <div style="font-weight:700;color:var(--gold2);margin-bottom:8px">Question ${i+1}</div>
          ${q.a ? `<div style="display:flex;gap:10px;margin-bottom:8px"><span style="font-weight:700;min-width:24px;color:var(--text-mid)">(a)</span><span style="font-size:13.5px;color:var(--text);line-height:1.6;flex:1">${esc(q.a)}</span><span style="font-size:12px;color:var(--text-dim);white-space:nowrap">[8 Marks]</span></div>` : ''}
          ${q.b ? `<div style="display:flex;gap:10px"><span style="font-weight:700;min-width:24px;color:var(--text-mid)">(b)</span><span style="font-size:13.5px;color:var(--text);line-height:1.6;flex:1">${esc(q.b)}</span><span style="font-size:12px;color:var(--text-dim);white-space:nowrap">[8 Marks]</span></div>` : ''}
        </div>`).join('')}
    </div>`;

  out.innerHTML = html;
  saveToChatHistory('qp', raw);
  document.getElementById('academicDoubtBar').classList.add('visible');
  out.scrollIntoView({behavior:'smooth', block:'start'});
}

function viewQP() {
  if (!lastQPData) return;
  const qp = parseQP(lastQPData.raw);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Question Paper</title>
  <style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 30px;color:#222}
  .header{text-align:center;border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:20px}
  .dept{font-size:13px;font-weight:700;letter-spacing:1px;color:#555;text-transform:uppercase}
  .exam{font-size:20px;font-weight:800;margin:8px 0}
  .subj{font-size:16px;font-weight:700}
  .meta{display:flex;justify-content:space-between;margin-top:14px;font-size:13px}
  .part-title{font-size:15px;font-weight:800;margin:24px 0 6px;text-transform:uppercase;color:#333}
  .part-inst{font-size:12px;font-style:italic;color:#555;margin-bottom:14px}
  .q2{display:flex;gap:12px;margin-bottom:12px;font-size:14px;line-height:1.6}
  .q2 .qnum{font-weight:700;min-width:22px}
  .q16-block{margin-bottom:16px;padding:12px;border:1px solid #ccc;border-radius:6px}
  .q16-title{font-weight:700;margin-bottom:8px}
  .q16-part{display:flex;gap:10px;margin-bottom:8px;font-size:14px;line-height:1.6}
  .q16-part .qlet{font-weight:700;min-width:22px}
  .marks{font-size:12px;color:#555;white-space:nowrap}
  @media print{body{margin:10px auto}}</style>
  </head><body>
  <div class="header">
    <div class="dept">${escHtml(qp.dept)} Department</div>
    <div class="exam">${escHtml(qp.exam || lastQPData.exam)}</div>
    <div class="subj">${escHtml(qp.subject || lastQPData.subject)}</div>
    <div style="font-size:13px;color:#555;margin-top:4px">${escHtml(qp.year || lastQPData.year)}</div>
    <div class="meta"><span>Duration: <strong>${escHtml(qp.duration)}</strong></span><span>Maximum Marks: <strong>${escHtml(qp.marks)}</strong></span></div>
  </div>
  <div class="part-title">Part A — 2 Mark Questions (10 × 2 = 20 Marks)</div>
  <div class="part-inst">Answer ALL questions.</div>
  ${qp.q2m.map((q,i) => `<div class="q2"><span class="qnum">${i+1}.</span><span>${escHtml(q)}</span></div>`).join('')}
  <div class="part-title">Part B — 16 Mark Questions (5 × 16 = 80 Marks)</div>
  <div class="part-inst">Answer ALL questions. Each question carries 16 marks (8+8).</div>
  ${qp.q16.map((q,i) => `<div class="q16-block"><div class="q16-title">Question ${i+1}</div>${q.a ? `<div class="q16-part"><span class="qlet">(a)</span><span style="flex:1">${escHtml(q.a)}</span><span class="marks">[8 Marks]</span></div>` : ''}${q.b ? `<div class="q16-part"><span class="qlet">(b)</span><span style="flex:1">${escHtml(q.b)}</span><span class="marks">[8 Marks]</span></div>` : ''}</div>`).join('')}
  </body></html>`);
  win.document.close();
}


function downloadQP() {
  if (!lastQPData) return;
  const qp = parseQP(lastQPData.raw);
  let txt = `${(qp.dept||'').toUpperCase()} DEPARTMENT\n`;
  txt += `${qp.exam || lastQPData.exam}\n`;
  txt += `${qp.subject || lastQPData.subject}\n`;
  txt += `${qp.year || lastQPData.year}\n`;
  txt += `Duration: ${qp.duration}     Maximum Marks: ${qp.marks}\n`;
  txt += `\n${'='.repeat(60)}\n`;
  txt += `PART A — 2 Mark Questions (10 × 2 = 20 Marks)\n`;
  txt += `Answer ALL questions.\n\n`;
  qp.q2m.forEach((q,i) => txt += `${i+1}. ${q}\n\n`);
  txt += `${'='.repeat(60)}\n`;
  txt += `PART B — 16 Mark Questions (5 × 16 = 80 Marks)\n`;
  txt += `Answer ALL questions. Each question carries 16 marks (8+8).\n\n`;
  qp.q16.forEach((q,i) => {
    txt += `Question ${i+1}\n`;
    if (q.a) txt += `  (a) ${q.a}  [8 Marks]\n\n`;
    if (q.b) txt += `  (b) ${q.b}  [8 Marks]\n\n`;
  });
  const blob = new Blob([txt], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(qp.subject||lastQPData.subject||'QuestionPaper').replace(/\s+/g,'_')}_QP.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function editQPInChat() {
  switchPage('chat');
  addMessage('bot', `Sure! The question paper is ready. Tell me which question you want to change — for example:\n\n• "Change Q3 in Part A to something about sorting algorithms"\n• "Replace Part B Question 2a with a question on recursion"\n\nOnce you're happy with the changes, I'll give you the updated QP to download! 📝`);
  document.getElementById('academicDoubtBar').classList.add('visible');
}

// ── Answer Key Generator ───────────────────────────────
async function runAnswerKey() {
  const out = document.getElementById('academicOutput');
  out.className = 'ac-output visible';
  out.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-mid)"><div style="font-size:36px;margin-bottom:12px">🔑</div><div style="font-size:14px;font-weight:600">Generating complete answer key...</div><div style="font-size:11px;margin-top:6px;color:var(--text-dim)">This works only for QPs created by Raai</div></div>`;
  document.getElementById('academicDoubtBar').classList.remove('visible');
  out.scrollIntoView({behavior:'smooth',block:'nearest'});
  try {
    const profile = lsGetProfile();
    const res  = await fetch('/academic/answer-key', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id: activeChatId, profile})});
    const data = await res.json();
    if (data.success) {
      showAnswerKeyResult(data.reply);
    } else {
      out.innerHTML = renderMarkdown(data.reply);
    }
  } catch(e) { out.innerHTML = '❌ Error generating answer key!'; }
}

function showAnswerKeyResult(raw) {
  const out = document.getElementById('academicOutput');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const getAll = (key) => lines.filter(l => l.toUpperCase().startsWith(key.toUpperCase() + ':')).map(l => l.replace(new RegExp('^' + key + ':\\s*', 'i'), '').trim());
  const q2ans = Array.from({length:10}, (_,i) => getAll(`AK_2M_Q${i+1}`)[0] || '').filter(Boolean);
  const q16ans = Array.from({length:5}, (_,i) => ({a: getAll(`AK_16M_Q${i+1}A`)[0]||'', b: getAll(`AK_16M_Q${i+1}B`)[0]||''}));

  let html = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button onclick="downloadAnswerKey('${encodeURIComponent(raw)}')" style="flex:1;min-width:140px;padding:11px 16px;border-radius:12px;border:none;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;font-family:'Exo 2',sans-serif;font-weight:800;font-size:13px;cursor:pointer">⬇️ Download Answer Key</button>
    </div>
    <div style="background:rgba(255,255,255,0.9);border:2px solid var(--border2);border-radius:16px;padding:24px">
      <div style="font-size:17px;font-weight:800;color:var(--gold2);margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--border2)">🔑 Answer Key</div>`;

  if (q2ans.length) {
    html += `<div style="font-size:14px;font-weight:800;color:var(--gold2);margin-bottom:10px">PART A — 2 Mark Answers</div>`;
    q2ans.forEach((a,i) => {
      html += `<div style="margin-bottom:12px;padding:10px 14px;background:rgba(160,114,74,0.07);border-radius:10px;border-left:4px solid var(--accent)">
        <div style="font-size:11px;font-weight:800;color:var(--accent);margin-bottom:4px;font-family:'Fira Code',monospace">Q${i+1}</div>
        <div style="font-size:13px;color:var(--text);line-height:1.65">${esc(a)}</div>
      </div>`;
    });
  }

  if (q16ans.some(q => q.a || q.b)) {
    html += `<div style="font-size:14px;font-weight:800;color:var(--gold2);margin:20px 0 10px">PART B — 16 Mark Answers</div>`;
    q16ans.forEach((q,i) => {
      if (!q.a && !q.b) return;
      html += `<div style="margin-bottom:14px;border:1.5px solid var(--border2);border-radius:12px;overflow:hidden">
        <div style="background:var(--accent-light);padding:8px 14px;font-weight:800;color:var(--gold2);font-size:13px">Question ${i+1}</div>`;
      if (q.a) html += `<div style="padding:12px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;font-family:'Fira Code',monospace">PART (a)</div>
        <div style="font-size:13px;color:var(--text);line-height:1.7">${esc(q.a)}</div>
      </div>`;
      if (q.b) html += `<div style="padding:12px 14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:6px;font-family:'Fira Code',monospace">PART (b)</div>
        <div style="font-size:13px;color:var(--text);line-height:1.7">${esc(q.b)}</div>
      </div>`;
      html += `</div>`;
    });
  }

  if (!q2ans.length && !q16ans.some(q=>q.a||q.b)) {
    html += renderMarkdown(raw);
  }

  html += `</div>`;
  out.innerHTML = html;
  document.getElementById('academicDoubtBar').classList.add('visible');
  out.scrollIntoView({behavior:'smooth', block:'start'});
}

function downloadAnswerKey(encodedRaw) {
  const raw = decodeURIComponent(encodedRaw);
  const blob = new Blob([raw.replace(/^AK_[A-Z0-9_]+:\s*/gim, '')], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Answer_Key.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}


init();
