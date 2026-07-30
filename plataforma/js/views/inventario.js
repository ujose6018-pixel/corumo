import { api } from '../store.js';
import { h, L, qty, field, input, select, table, card, tag, toast, modal, dateTime, todayISO } from '../ui.js';

export const meta = { title: 'Inventario', subtitle: 'Existencias, entradas y movimientos' };

export async function render(host) {
  const tabsHost = h('div', { class: 'tabs' });
  const panel = h('div', { style: 'padding-top:16px' });
  const summary = h('div', { class: 'stats' });
  let tab = 'existencias';

  host.append(summary, card(null, null, [tabsHost, panel]));

  drawTabs();
  await loadSummary();
  await show();

  function drawTabs() {
    tabsHost.replaceChildren();
    for (const [key, label] of [
      ['existencias', 'Existencias'],
      ['movimientos', 'Kardex'],
      ['valor', 'Valor del inventario']
    ]) {
      tabsHost.append(
        h('button', {
          class: tab === key ? 'is-active' : '',
          text: label,
          onClick: () => {
            tab = key;
            drawTabs();
            show();
          }
        })
      );
    }
  }

  async function loadSummary() {
    const data = await api.inventoryValue();
    const low = data.rows.filter((r) => r.stock <= r.min_stock);
    summary.replaceChildren(
      box('Renglones con existencia', String(data.rows.length)),
      box('Valor al costo', L(data.total), 'suma de existencia por costo', 'verde'),
      box('Bajo el minimo', String(low.length), low.length ? 'necesitan reposicion' : 'todo cubierto', low.length ? 'sello' : undefined)
    );
  }

  async function show() {
    panel.replaceChildren(h('div', { class: 'empty', text: 'Cargando…' }));
    if (tab === 'existencias') return existencias();
    if (tab === 'movimientos') return movimientos();
    return valor();
  }

  async function existencias() {
    const rows = await api.products({ active: '' });
    const stocked = rows.filter((p) => p.track_stock);
    panel.replaceChildren(
      table(
        ['Codigo', 'Producto', 'Categoria', { label: 'Existencia', align: 'right' }, { label: 'Minimo', align: 'right' }, 'Estado', ''],
        stocked.map((p) =>
          h(
            'tr',
            null,
            h('td', null, h('span', { class: 'mono', text: p.sku || '—' })),
            h('td', { text: p.name }),
            h('td', { text: p.category }),
            h('td', { class: 'num', text: qty(p.stock) }),
            h('td', { class: 'num', text: qty(p.min_stock) }),
            h(
              'td',
              null,
              p.stock <= 0 ? tag('agotado', 'sello') : p.stock <= p.min_stock ? tag('bajo', 'ambar') : tag('normal', 'verde')
            ),
            h(
              'td',
              { class: 'actions' },
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Movimiento', onClick: () => move(p) }),
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Kardex', onClick: () => movimientos(p.id) })
            )
          )
        ),
        'Los productos preparados al momento no llevan existencias.'
      )
    );
  }

  async function movimientos(productId) {
    if (productId) {
      tab = 'movimientos';
      drawTabs();
    }
    const rows = await api.stockMovements({ product_id: productId, limit: 300 });
    panel.replaceChildren(
      table(
        ['Fecha', 'Producto', 'Tipo', { label: 'Cantidad', align: 'right' }, { label: 'Queda', align: 'right' }, 'Nota', 'Registro'],
        rows.map((m) =>
          h(
            'tr',
            null,
            h('td', { text: dateTime(m.created_at) }),
            h('td', { text: m.product }),
            h('td', null, tag(m.type, m.qty > 0 ? 'verde' : m.type === 'venta' ? undefined : 'sello')),
            h('td', { class: 'num', text: `${m.qty > 0 ? '+' : ''}${qty(m.qty)}` }),
            h('td', { class: 'num', text: qty(m.stock_after) }),
            h('td', { text: m.note || '—' }),
            h('td', { text: m.user })
          )
        ),
        'Todavia no hay movimientos registrados.'
      )
    );
  }

  async function valor() {
    const data = await api.inventoryValue();
    panel.replaceChildren(
      table(
        ['Codigo', 'Producto', { label: 'Existencia', align: 'right' }, { label: 'Costo', align: 'right' }, { label: 'Valor', align: 'right' }],
        [
          ...data.rows.map((r) =>
            h(
              'tr',
              null,
              h('td', null, h('span', { class: 'mono', text: r.sku || '—' })),
              h('td', { text: r.name }),
              h('td', { class: 'num', text: qty(r.stock) }),
              h('td', { class: 'num', text: L(r.cost) }),
              h('td', { class: 'num', text: L(r.valor) })
            )
          ),
          h(
            'tr',
            null,
            h('td', { colspan: '4', style: 'text-align:right;font-weight:600' }, 'Total al costo'),
            h('td', { class: 'num', style: 'font-weight:600', text: L(data.total) })
          )
        ]
      )
    );
  }

  function move(product) {
    const type = select([
      { value: 'entrada', label: 'Entrada (compra o reposicion)' },
      { value: 'salida', label: 'Salida (merma, consumo interno)' },
      { value: 'ajuste', label: 'Ajuste (dejar en la cantidad contada)' }
    ]);
    const amount = input({ type: 'number', step: '1', min: '0', value: '' });
    const cost = input({ type: 'number', step: '0.01', min: '0', value: product.cost });
    const note = input({ placeholder: 'Factura, proveedor o motivo' });
    const hint = h('div', { class: 'hint', text: `Existencia actual: ${qty(product.stock)}` });

    type.addEventListener('change', () => {
      amount.previousElementSibling.textContent = type.value === 'ajuste' ? 'Cantidad contada' : 'Cantidad';
    });

    const dialog = modal({
      title: `Movimiento — ${product.name}`,
      body: [
        hint,
        h('div', { class: 'form-grid' }, field('Tipo', type), field('Cantidad', amount), field('Costo unitario', cost), field('Nota', note))
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Registrar',
          onClick: async () => {
            try {
              await api.moveStock(product.id, {
                type: type.value,
                qty: Number(amount.value),
                unit_cost: Number(cost.value) || null,
                note: note.value.trim()
              });
              dialog.close();
              toast('Movimiento registrado');
              await loadSummary();
              existencias();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }
}

function box(label, value, foot, tone) {
  return h(
    'div',
    { class: `stat${tone ? ' stat--' + tone : ''}` },
    h('div', { class: 'eyebrow', text: label }),
    h('div', { class: 'stat__value', text: value }),
    foot ? h('div', { class: 'stat__foot', text: foot }) : null
  );
}
