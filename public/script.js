const $ = id => document.getElementById(id);

const form = $("chat-form");
const input = $("message-input");
const messages = $("chat-messages");
const sendBtn = $("send-btn");
const menuBtn = $("menu-btn");
const themeBtn = $("theme-btn");

const root = document.documentElement;
const welcomeTemplate = $("welcome-screen").cloneNode(true);

let history = [];
let chatId = null;   // MongoDB _id of the open chat (null = new chat)
let controller = null;
let busy = false;
let session = 0; // bumped on New Chat so stale requests never touch the UI


// ---------- Helpers ----------

function icon(name) {
    const i = document.createElement("i");
    i.className = `ph ph-${name}`;
    i.setAttribute("aria-hidden", "true");
    return i;
}

function setLabel(button, iconName, label) {
    button.replaceChildren(icon(iconName), document.createTextNode(label));
}

function actionButton(className, iconName, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn ${className}`;
    setLabel(button, iconName, label);
    button.onclick = onClick;
    return button;
}

function copyButton(className, getText) {
    return actionButton(className, "copy", "Copy", async function () {
        await navigator.clipboard.writeText(getText()).catch(console.error);
        setLabel(this, "check", "Copied");
        this.classList.add("is-done");
        setTimeout(() => {
            setLabel(this, "copy", "Copy");
            this.classList.remove("is-done");
        }, 1500);
    });
}

const scrollToBottom = () => (messages.scrollTop = messages.scrollHeight);


// ---------- Send / request ----------

form.addEventListener("submit", e => {
    e.preventDefault();

    const text = input.value.trim();
    if (busy || !text) return;

    $("welcome-screen")?.remove();
    addMessage("user", text);
    history.push({ role: "user", content: text });

    input.value = "";
    resizeInput();
    requestReply();
});

// Shared by send, retry and regenerate
async function requestReply() {
    const mySession = session;

    busy = true;
    input.disabled = true;
    form.classList.add("is-busy");
    controller = new AbortController();
    showTyping();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, messages: history }),
            signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        if (mySession !== session) return;   // user clicked New Chat / opened another chat meanwhile

        chatId = data.chatId;
        history.push({ role: "assistant", content: data.result });

        removeTyping();
        addMessage("assistant", data.result);
        loadHistory();   // refresh sidebar list

    } catch (error) {
        if (mySession !== session) return;

        removeTyping();
        if (error.name === "AbortError") {
            addMessage("assistant", "Generation stopped.", { variant: "note" });
        } else {
            console.error(error);
            addMessage("assistant", "Something went wrong. Check your connection and try again.", { variant: "error" });
        }

    } finally {
        if (mySession === session) {
            controller = null;
            busy = false;
            input.disabled = false;
            form.classList.remove("is-busy");
            resetSendButton();
            input.focus();
        }
    }
}


// ---------- Messages ----------

function addMessage(role, text, { variant } = {}) {
    // Only the newest reply can be regenerated
    messages.querySelectorAll(".regenerate-btn").forEach(b => b.remove());

    const message = document.createElement("div");
    message.className = `message ${role}-message enter`;
    if (variant) message.classList.add(`is-${variant}`);

    const content = document.createElement("div");
    content.className = "message-content";

    if (role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.append(icon(variant === "error" ? "warning-circle" : "chat-teardrop-text"));
        message.append(avatar);

        const actions = document.createElement("div");
        actions.className = "msg-actions";

        if (variant) {
            content.textContent = text;
            actions.append(actionButton("retry-btn", "arrow-clockwise", "Retry", () => {
                if (busy) return;
                message.remove();
                requestReply();
            }));
        } else {
            content.innerHTML = marked.parse(text);
            enhanceMarkdown(content);
            actions.append(
                copyButton("copy-reply-btn", () => text),
                actionButton("regenerate-btn", "arrow-clockwise", "Regenerate", () => regenerate(message))
            );
        }

        content.append(actions);
    } else {
        content.textContent = text;
    }

    message.append(content);
    messages.append(message);
    scrollToBottom();
}

function regenerate(message) {
    if (busy || history.at(-1)?.role !== "assistant") return;

    history.pop();
    message.remove();
    requestReply();
}


// ---------- Markdown ----------

function enhanceMarkdown(content) {
    content.querySelectorAll("a").forEach(link => {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    });

    content.querySelectorAll("table").forEach(table => {
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        table.replaceWith(wrap);
        wrap.append(table);
    });

    content.querySelectorAll("pre").forEach(pre => {
        const code = pre.querySelector("code");
        if (!code) return;

        try { hljs.highlightElement(code); } catch (e) { /* plain text fallback */ }

        const label = document.createElement("span");
        label.textContent = (code.className.match(/language-([\w+-]+)/) || [])[1] || "code";

        const head = document.createElement("div");
        head.className = "code-head";
        head.append(label, copyButton("copy-btn", () => code.textContent));

        const wrap = document.createElement("div");
        wrap.className = "code-block";
        pre.replaceWith(wrap);
        wrap.append(head, pre);
    });
}


// ---------- Typing indicator and send button ----------

function showTyping() {
    const typing = document.createElement("div");
    typing.id = "typing-indicator";
    typing.className = "message enter";
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", "Generating response");
    typing.innerHTML = `
        <div class="message-avatar" aria-hidden="true"><i class="ph ph-chat-teardrop-text"></i></div>
        <div class="message-content"><div class="skeleton"><span></span><span></span><span></span></div></div>`;

    messages.append(typing);
    scrollToBottom();

    // While busy, the send button becomes a stop button
    sendBtn.replaceChildren(icon("stop"));
    sendBtn.setAttribute("aria-label", "Stop generating");
    sendBtn.disabled = false;
    sendBtn.onclick = () => controller?.abort();
}

const removeTyping = () => $("typing-indicator")?.remove();

function resetSendButton() {
    sendBtn.replaceChildren(icon("arrow-up"));
    sendBtn.setAttribute("aria-label", "Send message");
    sendBtn.onclick = null;
    updateSendState();
}

function updateSendState() {
    sendBtn.disabled = !busy && !input.value.trim();
}


// ---------- Input ----------

function resizeInput() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
    updateSendState();
}

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
    }
});

messages.addEventListener("click", e => {
    const suggestion = e.target.closest(".suggestion");
    if (!suggestion || busy) return;

    input.value = suggestion.dataset.prompt;
    resizeInput();
    form.requestSubmit();
});


// ---------- New chat ----------

$("new-chat-btn").addEventListener("click", () => {
    session++;
    controller?.abort();
    controller = null;
    busy = false;
    history = [];
    chatId = null;

    messages.replaceChildren(welcomeTemplate.cloneNode(true));

    input.value = "";
    input.disabled = false;
    form.classList.remove("is-busy");
    resizeInput();
    resetSendButton();

    setSidebar(false);
    loadHistory();
    input.focus();
});



// ---------- Chat history (MongoDB) ----------

const historyList = document.querySelector(".chat-history");

async function loadHistory() {
    try {
        const res = await fetch("/api/chats");
        const chats = await res.json();

        historyList.replaceChildren();
        chats.forEach(chat => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "history-item";
            if (chat._id === chatId) item.classList.add("is-active");
            item.textContent = chat.title;
            item.onclick = () => openChat(chat._id);
            historyList.append(item);
        });
    } catch (e) {
        console.error(e);
    }
}

async function openChat(id) {
    if (busy) return;

    const res = await fetch(`/api/chats/${id}`);
    const chat = await res.json();

    session++;
    chatId = chat._id;
    history = chat.messages.map(m => ({ role: m.role, content: m.content }));

    messages.replaceChildren();
    history.forEach(m => addMessage(m.role, m.content));

    setSidebar(false);
    loadHistory();
}

// ---------- Sidebar (mobile drawer) ----------

function setSidebar(open) {
    document.body.classList.toggle("sidebar-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
}

menuBtn.addEventListener("click", () => setSidebar(!document.body.classList.contains("sidebar-open")));
$("scrim").addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", e => e.key === "Escape" && setSidebar(false));


// ---------- Theme ----------

const prefersDark = matchMedia("(prefers-color-scheme: dark)");
const currentTheme = () => root.dataset.theme || (prefersDark.matches ? "dark" : "light");

function syncThemeButton() {
    const dark = currentTheme() === "dark";
    themeBtn.replaceChildren(icon(dark ? "sun" : "moon"));
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable */ }
    syncThemeButton();
});

prefersDark.addEventListener("change", syncThemeButton);

syncThemeButton();
resetSendButton();
loadHistory();