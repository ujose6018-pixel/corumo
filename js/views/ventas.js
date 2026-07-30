import { api, session } from '../store.js';
import { h, L, qty, field, input, select, table, card, tag, toast, modal, dateTime, todayISO, confirmAction } from '../ui.js';

export const meta = { title: 'Ventas', subtitle: 'Consulta, revisa y anula movimientos de caja' };

export async function render(host) {
  const filters = { from: todayISO(), to: todayISO(), method: '', q: '' };
  const body = h('div');
  const summary = h('div', { class: 'stats' });

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    field('Desde', input({ type: 'date', value: filters.from, onChange: (e) => set('from', e.target.value) })),
    field('Hasta', input({ type: 'date', value: filters.to, onChange: (e) => set('to', e.target.value) })),
    field(
      'Forma de pago',
      select(
        [
          { value: '', label: 'Todas' },
          { value: 'efectivo', label: 'Efectivo' },
          { value: 'credito', label: 'A cuenta' }
        ],
        { onChange: (e) => set('method', e.target.value) }
      )
    ),
    h(
      'div',
      { class: 'field grow' },
      h('label', { text: 'Buscar' }),
      input({ placeholder: 'Folio o trabajador', onInput: debounce((e) => set('q', e.target.value)) })
    )
  );

  host.append(summary, card('Movimientos', toolbar, body, true));
  await load();

  function set(key, value) {
    filters[key] = value;
    load();
  }

  async function load() {
    body.replaceChildren(h('div', { class: 'empty', text: 'Cargando…' }));
    const rows = await api.sales(filters);
    const efectivo = rows.filter((r) => r.method === 'efectivo' && r.status === 'completada');
    const credito = rows.filter((r) => r.method === 'credito' && r.status === 'completada');
    const sum = (list) => list.reduce((a, b) => a + b.total, 0);

    summary.replaceChildren(
      statBox('Cobrado en efectivo', L(sum(efectivo)), `${efectivo.length} ventas`, 'verde'),
      statBox('Cargado a cuenta', L(sum(credito)), `${credito.length} vales`, 'sello'),
      statBox('Total del rango', L(sum(efectivo) + sum(credito)), `${efectivo.length + credito.length} ventas`),
      statBox('Anuladas', String(rows.filter((r) => r.status === 'anulada').length), 'no suman al corte', 'ambar')
    );

    body.replaceChildren(
      table(
        ['Folio', 'Fecha', 'Trabajador', 'Pago', 'Cajero', { label: 'Total', align: 'right' }, ''],
        rows.map((row) =>
          h(
            'tr',
            null,
            h('td', null, h('span', { class: 'mono', text: row.folio })),
            h('td', { text: dateTime(row.created_at) }),
            h('td', { text: row.employee || '—' }),
            h('td', null, row.method === 'credito' ? tag('a cuenta', 'sello') : tag('efectivo', 'verde')),
            h('td', { text: row.cashier }),
            h('td', { class: 'num', text: L(row.total) }),
            h(
              'td',
              { class: 'actions' },
              row.status === 'anulada' ? tag('anulada', 'ambar') : null,
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Ver', onClick: () => detail(row.id) })
            )
          )
        ),
        'No hay ventas en este rango de fechas.'
      )
    );
  }

  async function detail(id) {
    const sale = await api.sale(id);
    const dialog = modal({
      title: `Vale ${sale.folio}`,
      body: [
        h(
          'div',
          { class: 'stats' },
          statBox('Total', L(sale.total)),
          statBox('Pago', sale.method === 'credito' ? 'A cuenta' : 'Efectivo'),
          statBox('Estado', sale.status === 'anulada' ? 'Anulada' : 'Completada')
        ),
        h(
          'div',
          { class: 'hint' },
          `${dateTime(sale.created_at)} · atendio ${sale.cashier}${sale.employee ? ` · ${sale.employee}` : ''}${sale.meal ? ` · ${sale.meal}` : ''}`
        ),
        table(
          ['Producto', { label: 'Cant.', align: 'right' }, { label: 'Precio', align: 'right' }, { label: 'Importe', align: 'right' }],
          sale.items.map((i) =>
            h(
              'tr',
              null,
              h('td', { text: i.name }),
              h('td', { class: 'num', text: qty(i.qty) }),
              h('td', { class: 'num', text: L(i.unit_price) }),
              h('td', { class: 'num', text: L(i.line_total) })
            )
          )
        ),
        sale.note ? h('div', { class: 'hint', text: `Nota: ${sale.note}` }) : null
      ],
      wide: true,
      footer: [
        session.is('admin') && sale.status === 'completada'
          ? h('button', {
              class: 'btn btn--danger',
              text: 'Anular',
              onClick: () => {
                dialog.close();
                voidSale(sale);
              }
            })
          : null,
        h('button', { class: 'btn btn--ghost', text: 'Cerrar', onClick: () => dialog.close() })
      ]
    });
  }

  function voidSale(sale) {
    const reason = input({ placeholder: 'Motivo de la anulacion' });
    const dialog = modal({
      title: `Anular ${sale.folio}`,
      body: [
        h('p', {
          style: 'margin:0',
          text: 'Las existencias regresan al inventario y el cargo se revierte de la cuenta del trabajador.'
        }),
        field('Motivo', reason)
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--danger',
          text: 'Anular venta',
          onClick: async () => {
            try {
              await api.voidSale(sale.id, reason.value.trim());
              dialog.close();
              toast(`${sale.folio} anulada`);
              load();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }
}

function statBox(label, value, foot, tone) {
  return h(
    'div',
    { class: `stat${tone ? ' stat--' + tone : ''}` },
    h('div', { class: 'eyebrow', text: label }),
    h('div', { class: 'stat__value', text: value }),
    foot ? h('div', { class: 'stat__foot', text: foot }) : null
  );
}

export function debounce(fn, wait = 280) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
