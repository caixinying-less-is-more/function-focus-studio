const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { palettes, theme } = require('../build.cjs');
const runtime = '/Applications/Cursor.app/Contents/Resources/app/';
const jsonc = require(runtime + 'node_modules/jsonc-parser');
const tm = require(runtime + 'node_modules/vscode-textmate');
const oni = require(runtime + 'node_modules/vscode-oniguruma');
const root = path.dirname(__dirname);
const settingsPath = path.join(process.env.HOME, 'Library/Application Support/Cursor/User/settings.json');
const statePath = path.join(root, 'studio-state.json');
const roleKeys = ['fn', 'parameter', 'control', 'typeName', 'fg', 'string', 'comment', 'builtin', 'number', 'keyword', 'bg'];
const defaults = Object.fromEntries(Object.entries(palettes).map(([variant, p]) => [variant, {
  variant, colors: Object.fromEntries(roleKeys.map(key => [key, p[key]])), options: { callBold: true, parameterBold: false }
}]));
const samples = [
  { id: 'flow', name: '生成与测试', filename: 'task_generation_mm.py', code: `from test_gen_code import enrich_actors, setup_task_config, run
from gpt_agent import generate


def generate_code(task_info, las_error=None, message=None):
    """生成一轮机器人程序，并返回仿真测试结果。"""
    if message is None:
        message = []

    # 准备任务信息
    task_name = task_info["task_name"]
    task_description = task_info["task_description"]
    original_actor_list = task_info["actor_list"]
    actor_list = enrich_actors(original_actor_list)

    # 根据上一轮结果选择提示词
    if las_error is not None:
        prompt = f"Repair the code: {las_error}"
    else:
        prompt = f"Task: {task_description}"

    message.append({"role": "user", "content": prompt})
    res = generate(message)

    # 加载生成的任务，进行多次测试
    task, args = setup_task_config(task_name)
    try:
        success_rate, error_message, error_count, records = run(task, args)
        return res, success_rate, error_message, error_count, records
    except Exception as error:
        print(f"Testing failed: {error}")
        return res, 0, str(error), 1, []


class TaskResult:
    def __init__(self, success_rate: float):
        self.success_rate = success_rate

    def is_ready(self):
        return self.success_rate >= 0.5
` },
  { id: 'prompt', name: '提示词与分支', filename: 'observation_agent.py', code: `def prepare_prompt(task_info, observation_feedback=None):
    # 任务与物体描述
    task_name = task_info["task_name"]
    actor_list = enrich_actors(task_info["actor_list"])

    prompt = f"""
Task: {task_name}
Actor list: {actor_list}

Generate a robot manipulation program.
Use the available API and the provided examples.
Return a complete play_once method.
"""

    # 模板中的代码是字符串内容
    template = """
class GeneratedTask(Base_Task):
    def play_once(self):
        pass
"""

    if observation_feedback:
        prompt += f"\\nVisual feedback: {observation_feedback}"

    messages = [{"role": "user", "content": prompt}]
    response = generate(messages)
    return response, template


def evaluate_candidates(candidates, threshold=0.5):
    for candidate in candidates:
        task, args = setup_task_config(candidate)
        success_rate, error, count, records = run(task, args)
        if success_rate >= threshold:
            return candidate
    return None
` }
];

function validate(input) {
  if (!input || !Object.hasOwn(defaults, input.variant)) throw new Error('请选择浅色或深色主题');
  if (!input.colors || typeof input.colors !== 'object') throw new Error('缺少配色');
  const colors = {};
  for (const key of roleKeys) {
    if (typeof input.colors[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.colors[key])) throw new Error('颜色必须是六位 HEX 值');
    colors[key] = input.colors[key].toUpperCase();
  }
  const options = input.options;
  if (!options || typeof options.callBold !== 'boolean' || typeof options.parameterBold !== 'boolean') throw new Error('字重配置无效');
  return { variant: input.variant, colors, options: { callBold: options.callBold, parameterBold: options.parameterBold } };
}

function themeFor(config) {
  const palette = { ...palettes[config.variant], ...config.colors };
  return theme(palette, config.options);
}

function settingsFor(source, config) {
  const errors = [];
  const current = jsonc.parse(source, errors, { allowTrailingComma: true });
  if (errors.length || !current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Cursor 设置文件格式有误，未写入');
  const generated = themeFor(config);
  const scope = '[' + generated.name + ']';
  const patches = [
    [['workbench.colorTheme'], generated.name],
    [['editor.semanticHighlighting.enabled'], true],
    [['editor.tokenColorCustomizations', scope], {
      ...current['editor.tokenColorCustomizations']?.[scope], textMateRules: generated.tokenColors
    }],
    [['editor.semanticTokenColorCustomizations', scope], {
      ...current['editor.semanticTokenColorCustomizations']?.[scope], enabled: true,
      rules: { ...current['editor.semanticTokenColorCustomizations']?.[scope]?.rules, ...generated.semanticTokenColors }
    }],
    [['workbench.colorCustomizations', scope], {
      ...current['workbench.colorCustomizations']?.[scope], ...generated.colors
    }]
  ];
  let output = source;
  for (const [location, value] of patches) {
    output = jsonc.applyEdits(output, jsonc.modify(output, location, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' }
    }));
  }
  return output;
}

function atomicWrite(filename, text, mode = 0o600) {
  const temporary = filename + '.tmp-' + crypto.randomBytes(6).toString('hex');
  try {
    fs.writeFileSync(temporary, text, { mode });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function applyConfig(config) {
  const source = fs.readFileSync(settingsPath, 'utf8');
  const output = settingsFor(source, config);
  const backups = path.join(root, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const backup = path.join(backups, 'settings-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.jsonc');
  fs.writeFileSync(backup, source, { mode: 0o600 });
  // Read again before committing so concurrent edits are not silently replaced.
  if (fs.readFileSync(settingsPath, 'utf8') !== source) throw new Error('Cursor 设置刚刚发生变化，请再次应用');
  atomicWrite(settingsPath, output, fs.statSync(settingsPath).mode);
  const state = readState();
  state[config.variant] = config;
  state.active = config.variant;
  atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
  return { name: palettes[config.variant].name, appliedAt: new Date().toISOString() };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
}

async function previewSamples() {
  await oni.loadWASM(fs.readFileSync(runtime + 'node_modules/vscode-oniguruma/release/onig.wasm'));
  const p = palettes.light;
  const generated = theme(p);
  const registry = new tm.Registry({
    theme: { settings: [{ settings: { foreground: p.fg, background: p.bg } }, ...generated.tokenColors] },
    onigLib: Promise.resolve({ createOnigScanner: value => new oni.OnigScanner(value), createOnigString: value => new oni.OnigString(value) }),
    loadGrammar: async scope => scope === 'source.python'
      ? tm.parseRawGrammar(fs.readFileSync(runtime + 'extensions/python/syntaxes/MagicPython.tmLanguage.json', 'utf8'), 'grammar.json') : null
  });
  const grammar = await registry.loadGrammar('source.python');
  const result = samples.map(sample => {
    let state = tm.INITIAL;
    const lines = sample.code.trimEnd().split('\n').map(line => {
      const raw = grammar.tokenizeLine(line, state);
      const packed = grammar.tokenizeLine2(line, state);
      state = raw.ruleStack;
      return raw.tokens.map(token => {
        let metadata = packed.tokens[1];
        for (let i = 0; i < packed.tokens.length; i += 2) {
          if (packed.tokens[i] > token.startIndex) break;
          metadata = packed.tokens[i + 1];
        }
        const color = registry.getColorMap()[(metadata >>> 15) & 511];
        const role = Object.keys(p).find(key => typeof p[key] === 'string' && p[key].toUpperCase() === color) || 'fg';
        const isDefinition = token.scopes.some(s => s.startsWith('entity.name.function')) && !token.scopes.some(s => s.includes('function-call'));
        const weight = role === 'parameter' ? 'parameter' : ['fn', 'builtin'].includes(role) ? (isDefinition ? 'bold' : 'call') : ((metadata >>> 11) & 2) ? 'bold' : 'normal';
        return { text: line.slice(token.startIndex, token.endIndex), role, weight };
      });
    });
    return { ...sample, lines };
  });
  registry.dispose();
  return result;
}

async function start() {
  const sampleData = await previewSamples();
  const token = crypto.randomBytes(32).toString('hex');
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/iro.js': ['../node_modules/@jaames/iro/dist/iro.min.js', 'text/javascript; charset=utf-8'],
    '/lucide.js': ['../node_modules/lucide/dist/umd/lucide.js', 'text/javascript; charset=utf-8']
  };
  let port = Number(process.env.FUNCTION_FOCUS_PORT || 4317);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== '127.0.0.1:' + port && req.headers.host !== 'localhost:' + port) return send(403, { error: '仅允许本机访问' });
    const pathname = new URL(req.url, 'http://127.0.0.1:' + port).pathname;
    try {
      if (req.method === 'GET' && pathname === '/api/config') {
        return send(200, { defaults, saved: readState(), samples: sampleData, token });
      }
      if (req.method === 'POST' && ['/api/apply', '/api/export'].includes(pathname)) {
        if (req.headers['x-studio-token'] !== token || req.headers['content-type'] !== 'application/json' ||
            (req.headers.origin && !['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(req.headers.origin))) return send(403, { error: '请求来源无效' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 16000) return send(413, { error: '配色内容过大' }); }
        const config = validate(JSON.parse(body));
        return send(200, pathname === '/api/apply' ? applyConfig(config) : themeFor(config));
      }
      if (req.method === 'GET' && Object.hasOwn(files, pathname)) {
        const [filename, mime] = files[pathname];
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(fs.readFileSync(path.resolve(__dirname, filename)));
      }
      send(404, { error: '未找到内容' });
    } catch (error) { send(400, { error: error.message }); }
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < 4340) { port++; server.listen(port, '127.0.0.1'); }
    else { console.error(error); process.exitCode = 1; }
  });
  server.on('listening', () => {
    const info = { pid: process.pid, port, url: 'http://127.0.0.1:' + port };
    atomicWrite(path.join(root, 'studio-server.json'), JSON.stringify(info));
    console.log(info.url);
  });
  server.listen(port, '127.0.0.1');
}

module.exports = { validate, settingsFor, themeFor, defaults, applyConfig, previewSamples };
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
