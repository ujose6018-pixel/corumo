import { api } from '../store.js';
import { h, L, qty, field, input, table, card, tag, todayISO } from '../ui.js';

export const meta = { title: 'Reportes', subtitle: 'Corte de caja y comportamiento de consumo' };

export async function render(host) {
  const range = { from: todayISO(), to: todayISO() };
  const summary = h('div', { class: 'stats' });
  const panels = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px' });

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    field('Desde', input({ type: 'date', value: range.from, onChange: (e) => set('from', e.target.value) })),
    field('Hasta', input({ type: 'date', value: range.to, onChange: (e) => set('to', e.target.value) })),
    h('div', { style: 'display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap' },
      quick('Hoy', 0),
      quick('Ayer', 1),
      quick('Ultimos 7 dias', 7),
      quick('Ultimos 30 dias', 30)
    ),
    h('div', { style: 'margin-left:auto' }, h('button', { class: 'btn btn--ghost btn--sm no-print', text: 'Imprimir corte', onClick: () => window.print() }))
  );

  host.append(card('Rango', null, toolbar), summary, panels);
  await load();

  function quick(label, days) {
    return h('button', {
      class: 'btn btn--ghost btn--sm',
      text: label,
      onClick: () => {
        const d = new Date();
        const iso = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (days === 0) {
          range.from = range.to = iso(d);
        } else if (days === 1) {
          d.setDate(d.getDate() - 1);
          range.from = range.to = iso(d);
        } else {
          range.to = iso(new Date());
          d.setDate(d.getDate() - (days - 1));
          range.from = iso(d);
        }
        for (const el of toolbar.querySelectorAll('input[type=date]')) {
          el.value = el.previousElementSibling.textContent === 'Desde' ? range.from : range.to;
        }
        load();
      }
    });
  }

  function set(key, value) {
    range[key] = value;
    load();
  }

  async function load() {
    const d = await api.dashboard(range);
    const ticket = d.ventas.n ? d.ventas.total / d.ventas.n : 0;

    summary.replaceChildren(
      box('Venta total', L(d.ventas.total), `${d.ventas.n} ventas`),
      box('Efectivo en caja', L(d.efectivo.total), `${d.efectivo.n} cobros`, 'verde'),
      box('Cargado a cuenta', L(d.credito.total), `${d.credito.n} vales`, 'sello'),
      box('Ticket promedio', L(ticket)),
      box('Cartera acumulada', L(d.cartera), `${d.deudores} trabajadores`, 'ambar')
    );

    const maxHour = Math.max(1, ...d.por_hora.map((r) => r.total));
    const horas = d.por_hora.length
      ? h(
          'div',
          { class: 'bars' },
          d.por_hora.map((r) =>
            h(
              'div',
              { class: 'bar-row' },
              h('span', { class: 'mono', text: `${r.hour}:00` }),
              h('div', { class: 'bar-row__track' }, h('div', { class: 'bar-row__fill', style: `width:${(r.total / maxHour) * 100}%` })),
              h('span', { class: 'bar-row__val', text: L(r.total) })
            )
          )
        )
      : h('div', { class: 'empty', text: 'Sin ventas en el rango.' });

    const maxCat = Math.max(1, ...d.por_categoria.map((r) => r.total));
    const cats = d.por_categoria.length
      ? h(
          'div',
          { class: 'bars' },
          d.por_categoria.map((r) =>
            h(
              'div',
              { class: 'bar-row' },
              h('span', { text: r.category || 'Sin categoria' }),
              h('div', { class: 'bar-row__track' }, h('div', { class: 'bar-row__fill', style: `width:${(r.total / maxCat) * 100}%` })),
              h('span', { class: 'bar-row__val', text: L(r.total) })
            )
          )
        )
      : h('div', { class: 'empty', text: 'Sin datos.' });

    panels.replaceChildren(
      card('Venta por hora', null, horas),
      card('Venta por categoria', null, cats),
      card(
        'Lo mas vendido',
        null,
        table(
          ['Producto', { label: 'Unidades', align: 'right' }, { label: 'Importe', align: 'right' }],
          d.top.map((t) =>
            h('tr', null, h('td', { text: t.name }), h('td', { class: 'num', text: qty(t.qty) }), h('td', { class: 'num', text: L(t.total) }))
          ),
          'Sin ventas en el rango.'
        ),
        true
      ),
      card(
        'Productos por reponer',
        null,
        table(
          ['Producto', { label: 'Existencia', align: 'right' }, { label: 'Minimo', align: 'right' }, 'Estado'],
          d.bajo_minimo.map((p) =>
            h(
              'tr',
              null,
              h('td', { text: p.name }),
              h('td', { class: 'num', text: qty(p.stock) }),
              h('td', { class: 'num', text: qty(p.min_stock) }),
              h('td', null, p.stock <= 0 ? tag('agotado', 'sello') : tag('bajo', 'ambar'))
            )
          ),
          'Todas las existencias estan sobre el minimo.'
        ),
        true
      )
    );
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
