// ASR adapters for eval-asr.js. Each one turns an audio file into a transcript
// and nothing more: { text, latencyMs }. Scoring, resolving and reporting are
// the same for every vendor, which is what makes the comparison fair -- the
// only thing allowed to differ between two runs is this file's answer.
//
// `fetch` and `readFile` are injected so test-asr-eval.js can drive the real
// request sequence against a stub, and so nothing in the test suite can reach
// a vendor by accident.

const path = require("node:path");

// The ceiling: what the scoring would be if the ASR were perfect. Comparing a
// vendor's run against this one separates what the ASR lost from what the
// resolver could never have read in the first place.
function createTranscriptAdapter() {
  return {
    name: "transcript",
    needsAudio: false,
    async transcribe(item) {
      if (typeof item.reference_text !== "string" || !item.reference_text.trim()) {
        throw new Error("no reference_text to use as a transcript");
      }
      return { text: item.reference_text, latencyMs: null };
    }
  };
}

// Taiwan Tongues ASR CE (adi-gov-tw/Taiwan-Tongues-ASR-CE), self-hosted. Uses
// the task-based file API from api/README.md: log in for a JWT, create a task
// with the audio, poll until it settles, download the TXT transcript.
//
// Latency here is file-mode turnaround (upload + queue + decode + punctuation),
// not the streaming latency a live conversation would see. It is useful for
// comparing two runs of this adapter, not for comparing against a vendor's
// streaming figure.
const TT_SUCCESS = 3;
const TT_FAILED = new Set([4, 5, 32, 33]);

function createTaiwanTonguesAdapter(options) {
  const settings = options || {};
  const baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
  const fetchImpl = settings.fetch || globalThis.fetch;
  const readFile = settings.readFile || require("node:fs/promises").readFile;
  const pollMs = settings.pollMs ?? 500;
  const timeoutMs = settings.timeoutMs ?? 5 * 60 * 1000;
  const sleep = settings.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = settings.now || Date.now;

  if (!baseUrl) throw new Error("Taiwan Tongues: TT_BASE_URL is not set");
  if (!settings.token && !(settings.username && settings.password)) {
    throw new Error("Taiwan Tongues: set TT_TOKEN, or TT_USERNAME and TT_PASSWORD");
  }

  let token = settings.token || null;

  async function json(response, what) {
    if (!response.ok) throw new Error(`Taiwan Tongues ${what}: HTTP ${response.status}`);
    return response.json();
  }

  async function login() {
    const body = await json(await fetchImpl(`${baseUrl}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: settings.username, password: settings.password, rememberMe: 0 })
    }), "login");
    if (!body || typeof body.token !== "string") throw new Error("Taiwan Tongues login: no token in response");
    return body.token;
  }

  return {
    name: "taiwan-tongues",
    needsAudio: true,
    async transcribe(item, audioPath) {
      if (!token) token = await login();
      const auth = { Authorization: `Bearer ${token}` };

      const audio = await readFile(audioPath);
      const form = new FormData();
      form.append("audio", new Blob([audio]), path.basename(audioPath));

      const started = now();
      const created = await json(await fetchImpl(`${baseUrl}/api/v1/subtitle/tasks`, {
        method: "POST", headers: auth, body: form
      }), "create task");
      const taskId = created && created.id;
      if (taskId === undefined || taskId === null) throw new Error("Taiwan Tongues create task: no id in response");

      for (;;) {
        const polled = await json(await fetchImpl(`${baseUrl}/api/v1/subtitle/tasks/${taskId}`, {
          method: "POST", headers: auth
        }), "poll task");
        const status = polled && Array.isArray(polled.data) && polled.data[0] ? polled.data[0].status : undefined;
        if (status === TT_SUCCESS) break;
        if (TT_FAILED.has(status)) throw new Error(`Taiwan Tongues task ${taskId} ended with status ${status}`);
        if (now() - started > timeoutMs) throw new Error(`Taiwan Tongues task ${taskId} timed out`);
        await sleep(pollMs);
      }

      const response = await fetchImpl(`${baseUrl}/api/v1/subtitle/tasks/${taskId}/subtitle?type=TXT`, { headers: auth });
      if (!response.ok) throw new Error(`Taiwan Tongues download: HTTP ${response.status}`);
      const text = (await response.text()).trim();
      return { text, latencyMs: now() - started };
    }
  };
}

// myVoca (台灣大哥大 × 長問科技). Its API is not public; this adapter is a
// placeholder until Taiwan Mobile supplies the specification. It refuses rather
// than guessing at endpoints, because a guessed request that happens to return
// something would be scored as myVoca's result.
function createMyVocaAdapter() {
  return {
    name: "myvoca",
    needsAudio: true,
    async transcribe() {
      throw new Error("myVoca adapter not implemented yet: needs Taiwan Mobile's API specification");
    }
  };
}

function createAdapter(name, env, overrides) {
  const source = env || process.env;
  const extra = overrides || {};
  if (name === "transcript") return createTranscriptAdapter();
  if (name === "taiwan-tongues") {
    return createTaiwanTonguesAdapter({
      baseUrl: source.TT_BASE_URL,
      token: source.TT_TOKEN,
      username: source.TT_USERNAME,
      password: source.TT_PASSWORD,
      ...extra
    });
  }
  if (name === "myvoca") return createMyVocaAdapter();
  throw new Error(`unknown ASR "${name}" (transcript / taiwan-tongues / myvoca)`);
}

module.exports = {
  createTranscriptAdapter,
  createTaiwanTonguesAdapter,
  createMyVocaAdapter,
  createAdapter
};
