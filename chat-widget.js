/**
 * Bylaws Assistant chat widget.
 *
 * Drop this into any page of your website:
 *
 *   <script src="/path/to/chat-widget.js"
 *           data-api-url="https://your-api-domain.com/ask"
 *           data-title="Bylaws Assistant"></script>
 *
 * It renders a floating chat bubble in the bottom-right corner. Clicking it
 * opens a small panel where visitors can ask questions; each answer shows
 * the section(s) of your documents it was based on.
 *
 * No build step, no dependencies — plain JS, self-contained CSS.
 */

(function () {
  var scriptTag = document.currentScript;
  var apiUrl = scriptTag.getAttribute("data-api-url");
  var title = scriptTag.getAttribute("data-title") || "Ask about our documents";

  if (!apiUrl) {
    console.error("[chat-widget] Missing required data-api-url attribute on the script tag.");
    return;
  }

  var style = document.createElement("style");
  style.textContent = [
    "#ba-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;",
    "background:#1f2937;color:#fff;display:flex;align-items:center;justify-content:center;",
    "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:999999;font-size:24px;}",
    "#ba-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:90vw;height:460px;",
    "max-height:75vh;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);",
    "display:none;flex-direction:column;overflow:hidden;z-index:999999;font-family:system-ui,-apple-system,sans-serif;}",
    "#ba-panel.open{display:flex;}",
    "#ba-header{background:#1f2937;color:#fff;padding:12px 14px;font-weight:600;font-size:14px;",
    "display:flex;justify-content:space-between;align-items:center;}",
    "#ba-close{cursor:pointer;opacity:.8;font-size:18px;line-height:1;}",
    "#ba-messages{flex:1;overflow-y:auto;padding:12px;font-size:13px;color:#111827;}",
    ".ba-msg{margin-bottom:12px;line-height:1.45;white-space:pre-wrap;}",
    ".ba-msg.user{text-align:right;}",
    ".ba-bubble-text{display:inline-block;padding:8px 11px;border-radius:10px;max-width:85%;}",
    ".ba-msg.user .ba-bubble-text{background:#1f2937;color:#fff;}",
    ".ba-msg.bot .ba-bubble-text{background:#f3f4f6;color:#111827;}",
    ".ba-sources{margin-top:6px;font-size:11px;color:#6b7280;}",
    ".ba-source-item{border-left:2px solid #d1d5db;padding-left:6px;margin-top:4px;}",
    "#ba-inputRow{display:flex;border-top:1px solid #e5e7eb;padding:8px;}",
    "#ba-input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}",
    "#ba-send{margin-left:6px;background:#1f2937;color:#fff;border:none;border-radius:8px;",
    "padding:0 14px;cursor:pointer;font-size:13px;}",
    "#ba-send:disabled{opacity:.5;cursor:default;}",
    ".ba-disclaimer{font-size:10px;color:#9ca3af;padding:4px 12px 8px;}",
  ].join("");
  document.head.appendChild(style);

  var bubble = document.createElement("div");
  bubble.id = "ba-bubble";
  bubble.innerHTML = "&#128172;"; // speech balloon emoji
  document.body.appendChild(bubble);

  var panel = document.createElement("div");
  panel.id = "ba-panel";
  panel.innerHTML =
    '<div id="ba-header"><span>' + escapeHtml(title) + '</span><span id="ba-close">&times;</span></div>' +
    '<div id="ba-messages"></div>' +
    '<div id="ba-inputRow">' +
    '<input id="ba-input" type="text" placeholder="Ask a question..." />' +
    '<button id="ba-send">Send</button>' +
    "</div>" +
    '<div class="ba-disclaimer">Informational only, not legal advice.</div>';
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#ba-messages");
  var inputEl = panel.querySelector("#ba-input");
  var sendBtn = panel.querySelector("#ba-send");

  bubble.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) inputEl.focus();
  });
  panel.querySelector("#ba-close").addEventListener("click", function () {
    panel.classList.remove("open");
  });

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addMessage(role, text) {
    var wrapper = document.createElement("div");
    wrapper.className = "ba-msg " + role;
    var bubbleText = document.createElement("span");
    bubbleText.className = "ba-bubble-text";
    bubbleText.textContent = text;
    wrapper.appendChild(bubbleText);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrapper;
  }

  function addSources(wrapper, sources) {
    if (!sources || !sources.length) return;
    var box = document.createElement("div");
    box.className = "ba-sources";
    box.appendChild(document.createTextNode("Sources:"));
    sources.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "ba-source-item";
      item.textContent = s.source_file + " — " + s.heading_path;
      box.appendChild(item);
    });
    wrapper.appendChild(box);
  }

  function sendQuestion() {
    var question = inputEl.value.trim();
    if (!question) return;

    addMessage("user", question);
    inputEl.value = "";
    sendBtn.disabled = true;
    var thinkingEl = addMessage("bot", "Thinking...");

    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed with status " + res.status);
        return res.json();
      })
      .then(function (data) {
        thinkingEl.querySelector(".ba-bubble-text").textContent = data.answer;
        addSources(thinkingEl, data.sources);
      })
      .catch(function (err) {
        thinkingEl.querySelector(".ba-bubble-text").textContent =
          "Sorry, something went wrong reaching the assistant. Please try again shortly.";
        console.error("[chat-widget]", err);
      })
      .finally(function () {
        sendBtn.disabled = false;
      });
  }

  sendBtn.addEventListener("click", sendQuestion);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendQuestion();
  });

  addMessage("bot", "Hi! Ask me anything about our bylaws or policy documents.");
})();
