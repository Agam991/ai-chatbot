const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("chat-messages");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const menuBtn = document.getElementById("menu-btn");
const scrim = document.getElementById("scrim");
const themeBtn = document.getElementById("theme-btn");

const root = document.documentElement;
const welcomeTemplate = document.getElementById("welcome-screen").cloneNode(true);

let history = [];
let controller = null;
let busy = false;
let session = 0; // bumped on New Chat so stale requests never touch the UI


// SEND MESSAGE

form.addEventListener("submit", e => {
    e.preventDefault();
    if (busy) return;

    const text = input.value.trim();
    if (!text) return;

    document.getElementById("welcome-screen")?.remove();

    addMessage("user", text);
    history.push({ role: "user", content: text });

    input.value = "";
    resizeInput();

    requestReply();
});


// REQUEST REPLY (shared by send, retry and regenerate)

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
            body: JSON.stringify({ messages: history }),
            signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        if (mySession !== session) return;

        removeTyping();

        history.push({
            role: "assistant",
            content: data.reply
        });

        addMessage("assistant", data.reply);

    } catch (error) {
        if (mySession !== session) return;

        removeTyping();

        if (error.name === "AbortError") {
            addMessage("assistant", "Generation stopped.", { variant: "note" });
        } else {
            console.error(error);
            addMessage(
                "assistant",
                "Something went wrong. Check your connection and try again.",
                { variant: "error" }
            );
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


// ADD MESSAGE

function icon(name) {
    const i = document.createElement("i");
    i.className = `ph ph-${name}`;
    i.setAttribute("aria-hidden", "true");
    return i;
}

function actionButton(className, iconName, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn ${className}`;
    button.append(icon(iconName), document.createTextNode(label));
    button.onclick = onClick;
    return button;
}

function addMessage(role, text, options = {}) {
    const { variant } = options;

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

            actions.append(actionButton("copy-reply-btn", "copy", "Copy", async function () {
                await copyText(text);
                flashCopied(this, "Copy");
            }));

            actions.append(actionButton("regenerate-btn", "arrow-clockwise", "Regenerate", () => {
                regenerateResponse(message);
            }));
        }

        content.appendChild(actions);
    } else {
        content.textContent = text;
    }

    message.append(content);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
}


// MARKDOWN ENHANCEMENTS

function enhanceMarkdown(content) {
    content.querySelectorAll("a").forEach(link => {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    });

    content.querySelectorAll("table").forEach(table => {
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        table.replaceWith(wrap);
        wrap.appendChild(table);
    });

    addCodeBlocks(content);
}

function addCodeBlocks(content) {
    content.querySelectorAll("pre").forEach(pre => {
        const code = pre.querySelector("code");
        if (!code) return;

        if (window.hljs) {
            try { hljs.highlightElement(code); } catch (e) { /* plain text fallback */ }
        }

        const language = (code.className.match(/language-([\w+-]+)/) || [])[1] || "code";

        const wrap = document.createElement("div");
        wrap.className = "code-block";

        const head = document.createElement("div");
        head.className = "code-head";

        const label = document.createElement("span");
        label.textContent = language;

        const button = actionButton("copy-btn", "copy", "Copy", async function () {
            await copyText(code.textContent || "");
            flashCopied(this, "Copy");
        });

        head.append(label, button);

        pre.replaceWith(wrap);
        wrap.append(head, pre);
    });
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        console.error(error);
    }
}

function flashCopied(button, original) {
    button.replaceChildren(icon("check"), document.createTextNode("Copied"));
    button.classList.add("is-done");

    setTimeout(() => {
        button.replaceChildren(icon("copy"), document.createTextNode(original));
        button.classList.remove("is-done");
    }, 1500);
}


// REGENERATE

function regenerateResponse(message) {
    if (busy) return;
    if (history.length < 2) return;
    if (history[history.length - 1].role !== "assistant") return;

    history.pop();
    message.remove();

    requestReply();
}


// TYPING INDICATOR (skeleton)

function showTyping() {
    const typing = document.createElement("div");

    typing.id = "typing-indicator";
    typing.className = "message enter";
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", "Generating response");

    typing.innerHTML = `
        <div class="message-avatar" aria-hidden="true"><i class="ph ph-chat-teardrop-text"></i></div>
        <div class="message-content">
            <div class="skeleton"><span></span><span></span><span></span></div>
        </div>
    `;

    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    setSendIcon("stop", "Stop generating");
    sendBtn.disabled = false;
    sendBtn.onclick = () => controller?.abort();
}

function removeTyping() {
    document.getElementById("typing-indicator")?.remove();
}

function setSendIcon(name, label) {
    sendBtn.replaceChildren(icon(name));
    sendBtn.setAttribute("aria-label", label);
}

function resetSendButton() {
    setSendIcon("arrow-up", "Send message");
    sendBtn.onclick = null;
    updateSendState();
}

function updateSendState() {
    sendBtn.disabled = !busy && !input.value.trim();
}


// TEXTAREA

function resizeInput() {
    input.style.height = "auto";
    input.style.height =
        Math.min(input.scrollHeight, 150) + "px";
    updateSendState();
}

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
    }
});


// SUGGESTIONS

messages.addEventListener("click", e => {
    const suggestion = e.target.closest(".suggestion");
    if (!suggestion || busy) return;

    input.value = suggestion.dataset.prompt;
    resizeInput();
    form.requestSubmit();
});


// NEW CHAT

newChatBtn.addEventListener("click", () => {
    session++;
    controller?.abort();
    controller = null;
    busy = false;

    history = [];

    messages.replaceChildren(welcomeTemplate.cloneNode(true));

    input.value = "";
    input.disabled = false;
    form.classList.remove("is-busy");
    resizeInput();
    resetSendButton();

    closeSidebar();
    input.focus();
});


// SIDEBAR (mobile drawer)

function setSidebar(open) {
    document.body.classList.toggle("sidebar-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
}

function closeSidebar() {
    setSidebar(false);
}

menuBtn.addEventListener("click", () => {
    setSidebar(!document.body.classList.contains("sidebar-open"));
});

scrim.addEventListener("click", closeSidebar);

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSidebar();
});


// THEME

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
    return root.dataset.theme || (prefersDark.matches ? "dark" : "light");
}

function syncThemeButton() {
    const dark = currentTheme() === "dark";
    themeBtn.replaceChildren(icon(dark ? "sun" : "moon"));
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;

    try {
        localStorage.setItem("theme", next);
    } catch (e) { /* storage unavailable */ }

    syncThemeButton();
});

prefersDark.addEventListener("change", syncThemeButton);

syncThemeButton();
resetSendButton();
