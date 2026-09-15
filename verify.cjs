const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { palettes, theme } = require('./build.cjs');
const runtime = '/Applications/Cursor.app/Contents/Resources/app/';
const textmate = require(runtime + 'node_modules/vscode-textmate');
const oniguruma = require(runtime + 'node_modules/vscode-oniguruma');

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

async function main() {
  await oniguruma.loadWASM(fs.readFileSync(runtime + 'node_modules/vscode-oniguruma/release/onig.wasm'));
  for (const [variant, p] of Object.entries(palettes)) {
    const actual = JSON.parse(fs.readFileSync(path.join(__dirname, 'extension/themes/function-focus-' + variant + '.json')));
    assert.deepEqual(actual, theme(p));
    assert.equal(actual.semanticHighlighting, true);
    assert.equal(actual.semanticTokenColors['function.declaration'].bold, true);
    assert.equal(actual.semanticTokenColors['method'].foreground, p.fn);
    assert.equal(actual.semanticTokenColors['parameter'].foreground, p.parameter);
    assert.equal(actual.semanticTokenColors['selfParameter'].foreground, p.muted);
    for (const key of ['fg', 'fn', 'builtin', 'control', 'keyword', 'parameter', 'typeName', 'number', 'operator', 'punctuation', 'string', 'comment']) {
      const a = luminance(p[key]), b = luminance(p.bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert(ratio >= 4.5, variant + ': ' + key + ' contrast = ' + ratio);
    }
    const registry = new textmate.Registry({
      theme: { settings: [{ settings: { foreground: p.fg, background: p.bg } }, ...actual.tokenColors] },
      onigLib: Promise.resolve({
        createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
        createOnigString: text => new oniguruma.OnigString(text)
      }),
      loadGrammar: async scope => scope === 'source.python'
        ? textmate.parseRawGrammar(fs.readFileSync(runtime + 'extensions/python/syntaxes/MagicPython.tmLanguage.json', 'utf8'), 'grammar.json')
        : null
    });
    const grammar = await registry.loadGrammar('source.python');
    function check(line, text, expectedColor, expectedBold = false, state = textmate.INITIAL) {
      const result = grammar.tokenizeLine2(line, state);
      const offset = line.indexOf(text);
      assert(offset >= 0);
      let metadata;
      for (let i = 0; i < result.tokens.length; i += 2) {
        if (result.tokens[i] > offset) break;
        metadata = result.tokens[i + 1];
      }
      assert.equal(registry.getColorMap()[(metadata >>> 15) & 511], expectedColor.toUpperCase(), variant + ' ' + line + ' [' + text + ']');
      assert.equal(Boolean((metadata >>> 11) & 2), expectedBold, variant + ' bold ' + text);
      return result.ruleStack;
    }
    const definition = 'def generate_code(self, task_info, las_error=None):';
    check(definition, 'generate_code', p.fn, true);
    check(definition, 'task_info', p.parameter);
    check(definition, 'self', p.muted);
    check('    actor_list = enrich_actors(original_actor_list)', 'enrich_actors', p.fn, true);
    check('    res = generate(message)', 'generate', p.fn, true);
    check('    observation_output = insert_observation_points(task_info, res)', 'insert_observation_points', p.fn, true);
    check('    task, args = setup_task_config(task_name)', 'setup_task_config', p.fn, true);
    check('    file.write(res)', 'write', p.fn, true);
    check('    file.write(res)', 'res', p.fg);
    check('    file.write(res)', '(', p.punctuation);
    check('    print(res)', 'print', p.builtin, true);
    check('    if las_error is not None:', 'if', p.control, true);
    check('    return res, success_rate', 'return', p.control, true);
    check('    # A readable comment', '#', p.comment);
    check('    prompt = f"Task: {task_name}"', 'Task:', p.string);
    check('    prompt = f"Task: {task_name}"', 'task_name', p.fg);
    const state = check('    template = """', '"""', p.string);
    check('def play_once(self):', 'play_once', p.string, false, state);
    console.log(variant + ': contrast, Python definitions/calls/parameters, control flow, comments, f-strings, and code-template strings passed.');
    registry.dispose();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
