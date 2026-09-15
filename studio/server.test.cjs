const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, validate, settingsFor, themeFor, previewSamples } = require('./server.cjs');
const jsonc = require('/Applications/Cursor.app/Contents/Resources/app/node_modules/jsonc-parser');

test('settings updates keep unrelated preferences, comments and other themes', () => {
  const before = `{
  // Keep this comment.
  "editor.fontSize": 17,
  "editor.tokenColorCustomizations": {"[Other Theme]": {"comments": "#123456"}},
  "editor.semanticTokenColorCustomizations": {"[Function Focus Light]": {"rules": {"customType": "#aabbcc"}}},
  "workbench.colorCustomizations": {"[Other Theme]": {"editor.background": "#ffffff"}},
}`;
  const after = settingsFor(before, defaults.light);
  assert(after.includes('// Keep this comment.'));
  const parsed = jsonc.parse(after);
  assert.equal(parsed['editor.fontSize'], 17);
  assert.equal(parsed['editor.tokenColorCustomizations']['[Other Theme]'].comments, '#123456');
  assert.equal(parsed['workbench.colorCustomizations']['[Other Theme]']['editor.background'], '#ffffff');
  const rules = parsed['editor.semanticTokenColorCustomizations']['[Function Focus Light]'].rules;
  assert.equal(rules.customType, '#aabbcc');
  assert.equal(rules.function.bold, true);
  assert.equal(rules.parameter.foreground, '#A35F00');
  assert.equal(settingsFor(after, defaults.light), after);
});

test('invalid input cannot become a setting path or arbitrary style', () => {
  assert.throws(() => validate({ ...defaults.light, variant: '__proto__' }));
  assert.throws(() => validate({ ...defaults.light, colors: { ...defaults.light.colors, fn: 'url(https://example.com)' } }));
  assert.throws(() => validate({ ...defaults.light, options: { callBold: 'yes' } }));
  assert.throws(() => settingsFor('{broken', defaults.light));
  assert.deepEqual(validate(defaults.light), defaults.light);
});

test('export preserves function definition emphasis when call bold is off', () => {
  const result = themeFor({ ...defaults.dark, options: { callBold: false, parameterBold: true } });
  assert.equal(result.semanticTokenColors.function.bold, false);
  assert.equal(result.semanticTokenColors['function.declaration'].bold, true);
  assert.equal(result.semanticTokenColors.parameter.bold, true);
});

test('preview uses real Python tokens and keeps executable calls distinct from string templates', async () => {
  const samples = await previewSamples();
  const callLine = samples[0].lines.find(line => line.map(token => token.text).join('').includes('actor_list = enrich_actors'));
  const call = callLine.find(token => token.text === 'enrich_actors');
  assert.equal(call.role, 'fn');
  assert.equal(call.weight, 'call');
  const parameters = samples[0].lines.flat().filter(token => token.role === 'parameter');
  assert(parameters.some(token => token.text === 'task_info'));
  const template = samples[1].lines.find(line => line.map(token => token.text).join('').includes('def play_once(self):'));
  assert(template.every(token => token.role === 'string'));
});
