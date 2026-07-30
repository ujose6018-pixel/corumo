const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(parent, nodes) {
  for (const node of nodes.flat(4)) {
    if (node === null || node === undefined || node === false) continue;
    parent.append(node instanceof Node ? node : document.createTextNode(String(node)));
  }
}

export function icon(path, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

export const ICONS = {
  caja: '<rect x="2.5" y="7.5" width="19" height="12" rx="1.5"/><path d="M6 7.5V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M8 12h8M8 15.5h4"/>',
  ventas: '<path d="M4 3.5h16v17l-3-2-2.5 2-2.5-2-2.5 2-2.5-2z"/><path d="M8 8h8M8 11.5h8M8 15h4"/>',
  inventario: '<path d="M3 8.5 12 4l9 4.5-9 4.5z"/><path d="M3 8.5v7L12 20l9-4.5v-7"/><path d="M12 13v7"/>',
  productos: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18.5" cy="18" r="2.2"/>',
  gente: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.3M18 20c0-2.4-.9-4.2-2.4-5.4"/>',
  creditos: '<rect x="2.5" y="5.5" width="19" height="13" rx="1.6"/><path d="M2.5 10h19M6 14.5h4"/>',
  planilla: '<path d="M5 3.5h14v17H5z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  reportes: '<path d="M4 20V4M4 20h16"/><rect x="7.5" y="12" width="3" height="5"/><rect x="12.5" y="8.5" width="3" height="8.5"/><rect x="17" y="5" width="3" height="12"/>',
  usuarios: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8" rx="1.5"/><path d="M7 16h10v4.5H7z"/>',
  download: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'
};

const fmtMoney = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 2 });

export const L = (n) => `L ${fmtMoney.format(Number(n) || 0)}`;
export const qty = (n) => fmtQty.format(Number(n) || 0);

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function dateOnly(iso) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function toast(message, kind = 'ok') {
  const host = document.getElementById('toasts');
  const node = h('div', { class: `toast${kind === 'ok' ? '' : ' toast--' + kind}`, text: message });
  host.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, kind === 'error' ? 5200 : 3200);
}

/* ---------- capa modal ---------- */

let closeCurrent = null;

export function modal({ title, body, footer, wide = false, onClose }) {
  const overlay = document.getElementById('overlay');
  const sheet = h(
    'div',
    { class: `sheet${wide ? ' sheet--wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h(
      'div',
      { class: 'sheet__head' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', style: 'margin-left:auto', 'aria-label': 'Cerrar', onClick: () => close() }, icon(ICONS.close, 16))
    ),
    h('div', { class: 'sheet__body' }, body),
    footer ? h('div', { class: 'sheet__foot' }, footer) : null
  );

  overlay.replaceChildren(sheet);
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const onBackdrop = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', onBackdrop);

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('mousedown', onBackdrop);
    overlay.hidden = true;
    overlay.replaceChildren();
    document.body.style.overflow = '';
    closeCurrent = null;
    onClose?.();
  }

  closeCurrent = close;
  sheet.querySelector('input, select, textarea, button')?.focus();
  return { close, sheet };
}

export const closeModal = () => closeCurrent?.();

export function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false, onConfirm }) {
  const dialog = modal({
    title,
    body: h('p', { style: 'margin:0', text: message }),
    footer: [
      h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
      h('button', {
        class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
        text: confirmLabel,
        onClick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            await onConfirm();
            dialog.close();
          } catch (err) {
            e.currentTarget.disabled = false;
            toast(err.message, 'error');
          }
        }
      })
    ]
  });
  return dialog;
}

/* ---------- piezas reutilizables ---------- */

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', { text: label }), control, hint ? h('div', { class: 'hint', text: hint }) : null);
}

export function input(props = {}) {
  return h('input', { type: 'text', ...props });
}

export function select(options, props = {}) {
  const el = h('select', props);
  for (const opt of options) {
    el.append(h('option', { value: opt.value, text: opt.label, selected: opt.selected || false }));
  }
  return el;
}

export function checkbox(label, checked, props = {}) {
  const box = h('input', { type: 'checkbox', checked, ...props });
  const id = props.id || `chk-${Math.random().toString(36).slice(2, 8)}`;
  box.id = id;
  return h('div', { class: 'field field--check' }, box, h('label', { for: id, text: label }));
}

export function stat(label, value, foot, tone) {
  return h(
    'div',
    { class: `stat${tone ? ' stat--' + tone : ''}` },
    h('div', { class: 'eyebrow', text: label }),
    h('div', { class: 'stat__value', text: value }),
    foot ? h('div', { class: 'stat__foot', text: foot }) : null
  );
}

export function table(headers, rows, emptyMessage = 'Sin registros todavia') {
  if (!rows.length) {
    return h('div', { class: 'empty' }, h('strong', { text: 'Nada por aqui' }), h('div', { text: emptyMessage }));
  }
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'grid' },
      h('thead', null, h('tr', null, headers.map((head) =>
        h('th', { class: head.align === 'right' ? 'num' : null, text: head.label ?? head })
      ))),
      h('tbody', null, rows)
    )
  );
}

export function card(title, actions, body, flush = false) {
  return h(
    'section',
    { class: 'card' },
    title
      ? h('div', { class: 'card__head' }, h('h2', { text: title }), actions ? h('div', { class: 'spacer' }) : null, actions)
      : null,
    h('div', { class: `card__body${flush ? ' card__body--flush' : ''}` }, body)
  );
}

export function tag(text, tone) {
  return h('span', { class: `tag${tone ? ' tag--' + tone : ''}`, text });
}
