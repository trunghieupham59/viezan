// Review 18: prototype interaction contracts. No provider, disk or OS operations.
const defaultModel18 = state.model;
for (const feature of ['translate', 'interpret', 'dictionary']) saveHistory13(feature);

const navigateBefore18 = navigate;
navigate = (page) => {
  if (!views[page]) return;
  save5();
  saveHistory13(state.page);
  const previous = history13[state.page];
  if (previous) previous.open = false;
  sessions5.history = false;
  const next = history13[page];
  state.model = page === 'chat' ? sessions5.items[sessions5.active].model
    : next?.items?.[next.active]?.snapshot.model || defaultModel18;
  navigateBefore18(page);
};

// Bounds belong to the app window, including review-sized windows inside a larger tab.
function positionTransient18(panel, anchor) {
  if (!panel || !anchor) return;
  const app = $('#app').getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vzn-space-2'));
  const left = Math.max(0, app.left) + gap;
  const right = Math.min(innerWidth, app.right) - gap;
  const top = Math.max(0, app.top) + gap;
  const bottom = Math.min(innerHeight, app.bottom) - gap;
  panel.style.maxWidth = `${Math.max(0, right - left)}px`;
  panel.style.maxHeight = `${Math.max(0, bottom - top)}px`;
  const a = anchor.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const below = Math.max(0, bottom - a.bottom - gap);
  const above = Math.max(0, a.top - top - gap);
  const useBelow = below >= p.height || below >= above;
  const available = useBelow ? below : above;
  panel.style.maxHeight = `${available}px`;
  panel.style.left = `${Math.max(left, Math.min(a.right - p.width, right - p.width))}px`;
  panel.style.top = `${useBelow ? a.bottom + gap : Math.max(top, a.top - p.height - gap)}px`;
}

function layoutTransients18() {
  positionTransient18($('#session-panel.history-popover'), $('.uh-trigger'));
  const activity = $('#dialog[open][data-type="activity"]');
  if (activity) positionTransient18(activity, $('.toolbar [data-dialog="activity"]'));
}
new ResizeObserver(layoutTransients18).observe($('#app'));
window.addEventListener('resize', layoutTransients18);

const dialogBodyBefore18 = dialogBody;
dialogBody = (type) => {
  if (type !== 'activity') return dialogBodyBefore18(type);
  const tasks = [
    ['Kế hoạch ra mắt sản phẩm', 'AI Chat', 'taskA', 'task-a', 'data-session="launch"'],
    ['Product brief', 'Dịch', 'taskB', 'task-b', 'data-open-task-translation'],
  ];
  return ['Hoạt động', `<div class="activity18-content"><p class="activity18-note">Tác vụ mẫu · chạy độc lập trong bản xem trước</p>${tasks.map(([title, feature, key, action, target]) => `<article class="activity18-task"><div><small>${feature}</small><h3>${title}</h3><p role="status">${taskLabel[review[key]]}</p></div><div class="activity18-actions">${button('Mở', `${target} aria-label="Mở ${title}"`, 'secondary', 'ArrowRightIcon')}${button(review[key] === 'running' ? 'Dừng' : 'Thử lại', `data-review-action="${action}" aria-label="${review[key] === 'running' ? 'Dừng' : 'Thử lại'} ${title}"`, review[key] === 'running' ? 'danger' : 'primary', review[key] === 'running' ? 'StopIcon' : 'RefreshIcon')}</div></article>`).join('')}<p class="activity18-note">Dừng tác vụ vẫn giữ nội dung và bản nháp.</p></div>`];
};

const openDialogBefore18 = openDialog;
openDialog = (type) => {
  openDialogBefore18(type);
  if (type === 'activity') {
    const trigger = $('.toolbar [data-dialog="activity"]');
    state.lastFocus = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    $('#dialog').setAttribute('aria-label', 'Hoạt động');
    layoutTransients18();
  } else $('#dialog').removeAttribute('aria-label');
};
$('#dialog').addEventListener('close', () => {
  $('.toolbar [data-dialog="activity"]')?.setAttribute('aria-expanded', String($('#dialog[open][data-type="activity"]') !== null));
});

const renderBefore18 = render;
render = () => {
  renderBefore18();
  const activity = $('.toolbar [data-dialog="activity"]');
  activity?.setAttribute('aria-haspopup', 'dialog');
  activity?.setAttribute('aria-expanded', String($('#dialog[open][data-type="activity"]') !== null));
  document.querySelectorAll('[data-history-preview]').forEach(row => {
    const h = history13[state.page];
    row.setAttribute('aria-pressed', String(row.dataset.historyPreview === (h.preview || (state.page === 'chat' ? sessions5.active : h.active))));
  });
  // A sample result must never be presented as the translation of a changed input.
  if (state.page === 'translate' && (state.translation !== translationFixture18 || languagePairs.translate.source !== 'en' || languagePairs.translate.target !== 'vi')) invalidateTranslation18();
  if (state.page === 'translate') $('[data-lw-translate]').disabled = !state.translation.trim();
  if (state.page === 'interpret' && history13.interpret.items[history13.interpret.active].fresh) {
    document.querySelectorAll('[data-action="export"], .lw-header-actions [data-dialog="summary"]').forEach(control => {
      control.disabled = true;
      control.title = 'Chưa có bản ghi';
    });
  }
  layoutTransients18();
};

function invalidateTranslation18() {
  const result = $('#translation-result');
  if (!result) return;
  result.innerHTML = '<div class="lw-placeholder"><h2>Chưa có bản dịch cho nội dung này</h2><p>Bản nháp được giữ. Bản xem trước chưa kết nối dịch AI.</p></div>';
  $('.lw-output footer small').textContent = 'Chưa có bản dịch';
  $('.lw-output footer').querySelectorAll('button').forEach(b => { b.disabled = true; });
}

document.addEventListener('input', e => {
  if (e.target.id === 'source-text') {
    invalidateTranslation18();
    $('[data-lw-translate]').disabled = !e.target.value.trim();
  }
  if (e.target.matches('#word-form input')) $('.lw-entry')?.remove();
});

document.addEventListener('click', e => {
  const button = e.target.closest('[data-open-task-translation]');
  if (!button) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  navigate('translate');
  saveHistory13('translate');
  const h = history13.translate;
  h.active = 'initial';
  const s = h.items.initial.snapshot;
  state.model = s.model;
  state.translation = s.text;
  languagePairs.translate = { ...s.pair };
  render();
  $('#source-text')?.focus();
}, true);

document.addEventListener('keydown', e => {
  if (e.isComposing || !e.target.closest('#session-panel')) return;
  const rows = [...document.querySelectorAll('#session-panel .session-row')];
  const index = rows.indexOf(document.activeElement);
  let destination;
  if (e.key === 'ArrowDown') destination = rows[Math.min(rows.length - 1, index + 1)];
  if (e.key === 'ArrowUp') destination = rows[index < 0 ? rows.length - 1 : Math.max(0, index - 1)];
  if (destination) { e.preventDefault(); destination.focus(); }
});

$('.reviewbar>span').innerHTML = '<strong>VIEZAN</strong> / Review 18 <span class="muted">· Hành vi & bàn giao native</span>';
render();
