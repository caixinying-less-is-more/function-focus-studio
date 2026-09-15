'use strict';

const roles = [
  ['fn', '函数调用'], ['parameter', '参数'], ['control', '控制流程'], ['typeName', '类与类型'],
  ['fg', '普通变量'], ['string', '字符串'], ['comment', '注释'], ['builtin', '内置函数'],
  ['number', '数字与常量'], ['keyword', '其他关键字'], ['bg', '编辑器背景']
];
const $ = id => document.getElementById(id);
const copy = value => JSON.parse(JSON.stringify(value));
let bootstrap, configs, variant = 'light', selected = 'fn', sampleId = 'flow';
let picker, syncing = false, history = [], future = [], pendingHistory = null;
let applied = {}, recent = ['#005FCC', '#A35F00', '#FFD166', '#A33442', '#646F64', '#6E747A'];
let toastTimer, requestInFlight = false;
const storageKey = 'function-focus-studio-v1';

function signature(config) { return JSON.stringify(config); }
function snapshot() { return { configs: copy(configs), variant }; }
function beginEdit() { if (!pendingHistory) pendingHistory = snapshot(); }
function endEdit() {
  if (!pendingHistory) return;
  if (JSON.stringify(pendingHistory) !== JSON.stringify(snapshot())) {
    history.push(pendingHistory);
    if (history.length > 60) history.shift();
    future = [];
    addRecent(configs[variant].colors[selected]);
  }
  pendingHistory = null;
  persist();
  updateStatus();
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ configs, variant, recent })); } catch {}
}
function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400);
}
function updateStatus() {
  $('undo').disabled = history.length === 0;
  $('redo').disabled = future.length === 0;
  $('save-state').textContent = signature(configs[variant]) === applied[variant] ? '已应用' : '待应用';
}
function addRecent(hex) {
  recent = [hex, ...recent.filter(color => color.toUpperCase() !== hex.toUpperCase())].slice(0, 8);
  renderRecent();
}
function renderRecent() {
  $('recent').replaceChildren(...recent.map(hex => {
    const button = document.createElement('button');
    button.style.background = hex;
    button.title = '使用 ' + hex;
    button.setAttribute('aria-label', '使用颜色 ' + hex);
    button.addEventListener('click', () => { beginEdit(); setColor(hex); endEdit(); });
    return button;
  }));
}
function renderRoles() {
  $('roles').replaceChildren(...roles.map(([key, label]) => {
    const button = document.createElement('button');
    button.className = 'role-button';
    button.dataset.role = key;
    button.setAttribute('aria-pressed', String(key === selected));
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = configs[variant].colors[key];
    const title = document.createElement('span');
    title.textContent = label;
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'chevron-right');
    button.append(swatch, title, icon);
    button.addEventListener('click', () => {
      endEdit(); selected = key; renderRoles(); syncControls();
      document.querySelectorAll('.token.selected-role').forEach(node => node.classList.remove('selected-role'));
      document.querySelectorAll('.token[data-role="' + selected + '"]').forEach(node => node.classList.add('selected-role'));
    });
    return button;
  }));
  lucide.createIcons();
}

function renderCode() {
  const sample = bootstrap.samples.find(item => item.id === sampleId);
  $('filename').textContent = sample.filename;
  $('code').replaceChildren(...sample.lines.map((tokens, i) => {
    const line = document.createElement('div');
    line.className = 'code-line';
    const number = document.createElement('span');
    number.className = 'line-number'; number.textContent = i + 1;
    number.setAttribute('aria-hidden', 'true');
    const content = document.createElement('span');
    content.className = 'line-content';
    for (const token of tokens) {
      const span = document.createElement('span');
      span.className = 'token' + (token.role === selected ? ' selected-role' : '');
      span.dataset.role = token.role;
      span.dataset.weight = token.weight;
      span.textContent = token.text;
      span.style.setProperty('--token-color', 'var(--preview-' + token.role + ', var(--preview-fg))');
      span.style.setProperty('--token-weight', token.weight === 'call' ? 'var(--call-weight)' : token.weight === 'parameter' ? 'var(--parameter-weight)' : token.weight === 'bold' ? '700' : '400');
      content.append(span);
    }
    if (!tokens.length) content.textContent = ' ';
    line.append(number, content);
    return line;
  }));
  $('samples').replaceChildren(...bootstrap.samples.map(item => {
    const button = document.createElement('button');
    button.textContent = item.name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(item.id === sampleId));
    button.addEventListener('click', () => { sampleId = item.id; renderCode(); });
    return button;
  }));
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function updateContrast() {
  const c = configs[variant].colors;
  const first = luminance(c[selected === 'bg' ? 'fg' : selected]), second = luminance(c.bg);
  const ratio = (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  $('contrast').textContent = ratio.toFixed(2) + ' : 1';
  $('contrast-mark').textContent = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : '偏低';
  $('contrast-mark').classList.toggle('low', ratio < 4.5);
}
function applyPreview() {
  const config = configs[variant];
  for (const [key, hex] of Object.entries(config.colors)) $('editor').style.setProperty('--preview-' + key, hex);
  $('editor').style.setProperty('--call-weight', config.options.callBold ? '700' : '400');
  $('editor').style.setProperty('--parameter-weight', config.options.parameterBold ? '700' : '400');
  $('editor').style.setProperty('--editor-border', variant === 'light' ? '#e1e6ec' : '#3c434d');
  $('editor').style.setProperty('--selected-tint', config.colors[selected] + (variant === 'light' ? '0a' : '10'));
  document.querySelectorAll('.role-button').forEach(button => {
    button.querySelector('.swatch').style.background = config.colors[button.dataset.role];
  });
  updateContrast(); updateStatus();
}
function syncControls() {
  const hex = configs[variant].colors[selected];
  syncing = true;
  picker.color.hexString = hex;
  syncing = false;
  $('current-label').textContent = roles.find(role => role[0] === selected)[1];
  $('current-swatch').style.background = hex;
  $('hex').value = hex;
  $('native-color').value = hex;
  $('color-error').textContent = '';
  const { h, s, v } = picker.color.hsv;
  for (const [id, value, unit] of [['hue', h, '°'], ['saturation', s, '%'], ['brightness', v, '%']]) {
    $(id).value = Math.round(value);
    $(id + '-value').value = Math.round(value) + unit;
  }
  $('call-bold').checked = configs[variant].options.callBold;
  $('parameter-bold').checked = configs[variant].options.parameterBold;
  $('light').setAttribute('aria-pressed', String(variant === 'light'));
  $('dark').setAttribute('aria-pressed', String(variant === 'dark'));
  applyPreview();
}
function setColor(hex, updatePicker = true) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  configs[variant].colors[selected] = hex.toUpperCase();
  if (updatePicker) syncControls();
  else {
    $('current-swatch').style.background = hex;
    $('hex').value = hex.toUpperCase();
    $('native-color').value = hex;
    const hsv = picker.color.hsv;
    for (const [id, key, suffix] of [['hue', 'h', '°'], ['saturation', 's', '%'], ['brightness', 'v', '%']]) {
      $(id).value = Math.round(hsv[key]);
      $(id + '-value').value = Math.round(hsv[key]) + suffix;
    }
    $('color-error').textContent = '';
    applyPreview();
  }
  persist();
}

async function api(endpoint, config) {
  const response = await fetch('/api/' + endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': bootstrap.token }, body: JSON.stringify(config)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作未完成');
  return result;
}
function validDraft(value) {
  return value && ['light', 'dark'].every(mode => value[mode]?.variant === mode &&
    roles.every(([key]) => /^#[0-9a-f]{6}$/i.test(value[mode].colors?.[key])) &&
    typeof value[mode].options?.callBold === 'boolean' && typeof value[mode].options?.parameterBold === 'boolean');
}

async function init() {
  lucide.createIcons();
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('配色服务不可用');
  bootstrap = await response.json();
  configs = copy(bootstrap.defaults);
  for (const mode of ['light', 'dark']) {
    if (bootstrap.saved[mode]) configs[mode] = bootstrap.saved[mode];
    applied[mode] = bootstrap.saved[mode] ? signature(bootstrap.saved[mode]) : '';
  }
  variant = bootstrap.saved.active === 'dark' ? 'dark' : 'light';
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey));
    if (validDraft(draft?.configs)) configs = draft.configs;
    if (['light', 'dark'].includes(draft?.variant)) variant = draft.variant;
    if (Array.isArray(draft?.recent)) recent = draft.recent.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8);
  } catch {}
  const pickerWidth = Math.min(232, $('picker').getBoundingClientRect().width);
  picker = new iro.ColorPicker('#picker', {
    width: pickerWidth, color: configs[variant].colors[selected], borderWidth: 1, borderColor: '#d4dae2',
    handleRadius: 7, padding: 0,
    layout: [{ component: iro.ui.Box, options: { boxHeight: 154 } }, { component: iro.ui.Slider, options: { sliderType: 'hue', sliderSize: 14, margin: 14 } }]
  });
  // iro updates the color before input:start; capture the pre-drag state first.
  $('picker').addEventListener('pointerdown', beginEdit, { capture: true });
  picker.on('input:start', beginEdit);
  picker.on('input:end', endEdit);
  picker.on('color:change', color => { if (!syncing) setColor(color.hexString, false); });
  for (const id of ['hue', 'saturation', 'brightness']) {
    $(id).addEventListener('input', () => {
      beginEdit();
      picker.color.hsv = { h: +$('hue').value, s: +$('saturation').value, v: +$('brightness').value };
    });
    $(id).addEventListener('change', endEdit);
  }
  $('native-color').addEventListener('input', event => { beginEdit(); setColor(event.target.value); });
  $('native-color').addEventListener('change', endEdit);
  $('hex').addEventListener('input', event => {
    const value = event.target.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) { $('color-error').textContent = '格式：#RRGGBB'; return; }
    beginEdit(); setColor(value);
  });
  $('hex').addEventListener('change', endEdit);
  $('hex').addEventListener('keydown', event => { if (event.key === 'Enter') { endEdit(); $('hex').blur(); } });
  for (const [id, option] of [['call-bold', 'callBold'], ['parameter-bold', 'parameterBold']]) {
    $(id).addEventListener('change', event => { beginEdit(); configs[variant].options[option] = event.target.checked; applyPreview(); endEdit(); });
  }
  for (const mode of ['light', 'dark']) $(mode).addEventListener('click', () => {
    endEdit(); variant = mode; renderRoles(); syncControls(); persist();
  });
  $('reset').addEventListener('click', () => { beginEdit(); configs[variant] = copy(bootstrap.defaults[variant]); syncControls(); endEdit(); notify('已恢复当前主题的默认配色'); });
  $('reset-compact').addEventListener('click', () => $('reset').click());
  $('undo').addEventListener('click', () => {
    endEdit(); if (!history.length) return;
    future.push(snapshot()); const previous = history.pop(); configs = previous.configs; variant = previous.variant;
    renderRoles(); syncControls(); persist();
  });
  $('redo').addEventListener('click', () => {
    if (!future.length) return;
    history.push(snapshot()); const next = future.pop(); configs = next.configs; variant = next.variant;
    renderRoles(); syncControls(); persist();
  });
  $('wrap').addEventListener('click', () => { const active = $('code').classList.toggle('wrap'); $('wrap').setAttribute('aria-pressed', String(active)); });
  $('font-size').addEventListener('input', event => { $('code').style.setProperty('--code-size', event.target.value + 'px'); $('font-size-value').value = event.target.value + ' px'; });
  $('apply').addEventListener('click', async () => {
    if (requestInFlight) return;
    endEdit(); const config = copy(configs[variant]); requestInFlight = true; $('apply').disabled = true;
    $('save-state').textContent = '正在应用';
    try {
      await api('apply', config); applied[config.variant] = signature(config); updateStatus();
      notify('已应用到 Cursor · ' + (config.variant === 'light' ? '浅色主题' : '深色主题'));
    } catch (error) { notify(error.message); updateStatus(); }
    finally { requestInFlight = false; $('apply').disabled = false; }
  });
  $('export').addEventListener('click', async () => {
    const config = copy(configs[variant]); $('export').disabled = true;
    try {
      const result = await api('export', config);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'function-focus-' + config.variant + '.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notify(error.message); }
    finally { $('export').disabled = false; }
  });
  renderRoles(); renderCode(); renderRecent(); syncControls();
  $('apply').disabled = false; $('export').disabled = false;
}

init().catch(error => { $('save-state').textContent = '载入失败'; $('code').textContent = error.message; notify(error.message); });
