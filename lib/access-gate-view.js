const GATE_MARKERS = {
  langswitch: ["<!--GATE:LANGSWITCH_START-->", "<!--GATE:LANGSWITCH_END-->"],
  cta: ["<!--GATE:CTA_START-->", "<!--GATE:CTA_END-->"],
  workspace: ["<!--GATE:WORKSPACE_START-->", "<!--GATE:WORKSPACE_END-->"],
  scripts: ["<!--GATE:SCRIPTS_START-->", "<!--GATE:SCRIPTS_END-->"]
};

const GATE_FORM_HTML = `
          <section class="validation-card access-gate-panel" aria-labelledby="accessGateTitle">
            <h2 id="accessGateTitle">需要授權才能使用</h2>
            <p id="accessGateDescription">本服務採授權使用制。請使用您的專屬連結，或在下方輸入所屬機構提供的存取代碼以繼續。</p>
            <form class="access-gate-form" id="code-form">
              <label id="accessCodeLabel" for="code-input">存取代碼</label>
              <div class="access-gate-row">
                <input class="access-gate-input" id="code-input" name="code" type="text" autocomplete="off" required minlength="6" placeholder="請輸入存取代碼" />
                <button class="primary-action" id="accessGateSubmit" type="submit">繼續</button>
              </div>
              <p class="access-gate-error" id="code-error" role="alert" hidden></p>
            </form>
            <p class="access-gate-support" id="accessGateSupport">
              已經有專屬連結卻無法開啟？請聯繫 <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>。
            </p>
          </section>
          <script>
            (function () {
              var gateLanguage = "zh";
              var copy = {
                zh: {
                  pageTitle: "AI十大癌症健康風險因子評估",
                  heroTitle: "AI十大癌症健康風險因子評估",
                  heroSubtitle: "透過 8-12 分鐘的互動問答，了解與您相關的癌症健康風險因子組合。",
                  trust: ["個人化因子整理", "資料確認後才送出", "中英文 Email 報告"],
                  trustLabel: "評估說明",
                  gateTitle: "需要授權才能使用",
                  gateDescription: "本服務採授權使用制。請使用您的專屬連結，或在下方輸入所屬機構提供的存取代碼以繼續。",
                  codeLabel: "存取代碼",
                  codePlaceholder: "請輸入存取代碼",
                  continueButton: "繼續",
                  invalidCode: "代碼無法辨識，請確認後再試一次。",
                  networkError: "網路錯誤，請再試一次。",
                  supportHtml: '已經有專屬連結卻無法開啟？請聯繫 <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>。',
                  footerSummary: "個人化癌症相關健康風險因子整理與健康教育資訊。",
                  serviceSummary: "服務說明與使用限制"
                },
                en: {
                  pageTitle: "AI Ten-Cancer Health Risk Factor Assessment",
                  heroTitle: "AI Ten-Cancer Health Risk Factor Assessment",
                  heroSubtitle: "Complete an 8-12 minute guided assessment to understand your cancer-related health risk factors.",
                  trust: ["Personalized factor summary", "Submit only after review", "Bilingual email report"],
                  trustLabel: "Assessment information",
                  gateTitle: "Authorization required",
                  gateDescription: "This service requires authorization. Use your personal link, or enter the access code provided by your organization below to continue.",
                  codeLabel: "Access code",
                  codePlaceholder: "Enter your access code",
                  continueButton: "Continue",
                  invalidCode: "Code not recognized. Please check it and try again.",
                  networkError: "Network error. Please try again.",
                  supportHtml: 'Trouble opening your personal link? Contact <a href="mailto:egbiomedai@eg-bio.com">egbiomedai@eg-bio.com</a>.',
                  footerSummary: "Personalized cancer-related health risk factor summaries and health education information.",
                  serviceSummary: "Service information and limitations"
                }
              };

              function setText(selector, value) {
                var element = document.querySelector(selector);
                if (element) element.textContent = value;
              }

              function setGateLanguage(language) {
                gateLanguage = language === "en" ? "en" : "zh";
                var selected = copy[gateLanguage];
                document.documentElement.lang = gateLanguage === "en" ? "en" : "zh-Hant";
                document.title = selected.pageTitle;
                setText("#hero-title", selected.heroTitle);
                setText(".hero__subtitle", selected.heroSubtitle);
                var trustStrip = document.querySelector(".trust-strip");
                if (trustStrip) {
                  trustStrip.setAttribute("aria-label", selected.trustLabel);
                  trustStrip.querySelectorAll("span").forEach(function (item, index) {
                    item.textContent = selected.trust[index] || "";
                  });
                }
                setText("#accessGateTitle", selected.gateTitle);
                setText("#accessGateDescription", selected.gateDescription);
                setText("#accessCodeLabel", selected.codeLabel);
                setText("#accessGateSubmit", selected.continueButton);
                setText("#footerSummary", selected.footerSummary);
                setText("#serviceDetailsSummary", selected.serviceSummary);
                document.getElementById("code-input").placeholder = selected.codePlaceholder;
                document.getElementById("accessGateSupport").innerHTML = selected.supportHtml;
                document.querySelectorAll("[data-service-copy]").forEach(function (section) {
                  section.hidden = section.getAttribute("data-service-copy") !== gateLanguage;
                });
                document.querySelectorAll("[data-lang]").forEach(function (button) {
                  var active = button.getAttribute("data-lang") === gateLanguage;
                  button.classList.toggle("is-active", active);
                  button.setAttribute("aria-pressed", String(active));
                });
                var errorEl = document.getElementById("code-error");
                if (!errorEl.hidden) errorEl.textContent = selected.invalidCode;
                try { localStorage.setItem("egbiomed_lang", gateLanguage); } catch (error) {}
              }

              document.querySelectorAll("[data-lang]").forEach(function (button) {
                button.addEventListener("click", function () {
                  setGateLanguage(button.getAttribute("data-lang"));
                });
              });

              var savedLanguage = "";
              try { savedLanguage = localStorage.getItem("egbiomed_lang") || ""; } catch (error) {}
              var initialLanguage = savedLanguage === "en" || savedLanguage === "zh"
                ? savedLanguage
                : ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
              setGateLanguage(initialLanguage);

              document.getElementById("code-form").addEventListener("submit", async function (event) {
                event.preventDefault();
                var button = document.getElementById("accessGateSubmit");
                var errorEl = document.getElementById("code-error");
                var input = document.getElementById("code-input");
                errorEl.hidden = true;
                button.disabled = true;
                try {
                  var response = await fetch("/api/access/redeem-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ code: input.value })
                  });
                  if (response.ok) {
                    window.location.href = "/";
                    return;
                  }
                  errorEl.textContent = copy[gateLanguage].invalidCode;
                  errorEl.hidden = false;
                } catch (error) {
                  errorEl.textContent = copy[gateLanguage].networkError;
                  errorEl.hidden = false;
                } finally {
                  button.disabled = false;
                }
              });
            })();
          </script>`;

function stripMarkerRegion(html, [startMarker, endMarker], replacement = "") {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) return html;
  return html.slice(0, start) + replacement + html.slice(end + endMarker.length);
}

function buildGatedIndexHtml(indexHtml) {
  let html = String(indexHtml);
  html = stripMarkerRegion(html, GATE_MARKERS.cta, GATE_FORM_HTML);
  html = stripMarkerRegion(html, GATE_MARKERS.workspace);
  html = stripMarkerRegion(html, GATE_MARKERS.scripts);
  return html;
}

module.exports = { GATE_MARKERS, GATE_FORM_HTML, stripMarkerRegion, buildGatedIndexHtml };
