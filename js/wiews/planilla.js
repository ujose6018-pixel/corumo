import { api, session, downloadCSV } from '../store.js';
import { h, L, field, input, table, card, tag, toast, modal, dateOnly, confirmAction } from '../ui.js';

export const meta = { title: 'Planilla', subtitle: 'Descuentos por consumo de cafeteria' };

export async function render(host) {
  const periodList = h('div');
  const detail = h('div');
  let periods = [];
  let selected = null;

  host.append(
    card(
      'Periodos',
      session.is('admin') ? h('button', { class: 'btn btn--ghost btn--sm', text: 'Abrir corte', onClick: newPeriod }) : null,
      periodList,
      true
    ),
    detail
  );

  await loadPeriods();

  async function loadPeriods() {
    periods = await api.periods();
    selected = selected ? periods.find((p) => p.id === selected.id) || periods[0] : periods[0];
    periodList.replaceChildren(
      table(
        ['Periodo', 'Inicio', 'Cierre', 'Estado', ''],
        periods.map((p) =>
          h(
            'tr',
            { style: selected && p.id === selected.id ? 'background:var(--surface-2)' : '' },
            h('td', { text: p.name }),
            h('td', { text: dateOnly(p.start_date) }),
            h('td', { text: dateOnly(p.end_date) }),
            h('td', null, p.status === 'abierto' ? tag('abierto', 'verde') : tag('cerrado')),
            h(
              'td',
              { class: 'actions' },
              h('button', {
                class: 'btn btn--ghost btn--sm',
                text: 'Ver detalle',
                onClick: () => {
                  selected = p;
                  loadPeriods();
                }
              })
            )
          )
        )
      )
    );
    if (selected) loadDetail(selected.id);
  }

  async function loadDetail(id) {
    const data = await api.period(id);
    const open = data.period.status === 'abierto';

    const actions = h(
      'div',
      { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', {
        class: 'btn btn--ghost btn--sm',
        text: 'Descargar archivo',
        onClick: () =>
          downloadCSV(
            `planilla-${data.period.start_date}-${data.period.end_date}.csv`,
            ['Codigo', 'Trabajador', 'Departamento', 'Consumos', 'Cargos', 'Abonos', 'Ajustes', 'Descontar'],
            data.rows.map((r) => [
              r.code,
              r.full_name,
              r.department || '',
              r.consumos,
              r.cargos.toFixed(2),
              r.abonos.toFixed(2),
              r.ajustes.toFixed(2),
              r.total.toFixed(2)
            ])
          )
      }),
      h('button', { class: 'btn btn--ghost btn--sm no-print', text: 'Imprimir', onClick: () => window.print() }),
      open && session.is('admin')
        ? h('button', { class: 'btn btn--primary btn--sm', text: 'Cerrar y aplicar descuento', onClick: () => closePeriod(data) })
        : null
    );

    detail.replaceChildren(
      h(
        'div',
        { style: 'display:grid;gap:18px' },
        h(
          'div',
          { class: 'stats' },
          box('Trabajadores a descontar', String(data.totals.empleados)),
          box('Consumos del periodo', L(data.totals.cargos), 'cargos a cuenta', 'sello'),
          box('Abonos en efectivo', L(data.totals.abonos), 'ya pagados en caja', 'verde'),
          box('Total a descontar', L(data.totals.descuento), data.period.name, 'ambar')
        ),
        card(data.period.name, actions, [
          h('div', {
            class: 'hint',
            text: open
              ? 'Este corte esta abierto: los consumos siguen sumando y los abonos que el trabajador haga en caja bajan lo que se le descuenta. Cierralo cuando entregues el reporte a Recursos Humanos.'
              : `Cerrado el ${dateOnly(data.period.closed_at)}. Los saldos ya se aplicaron a la planilla.`
          }),
          h('div', { style: 'height:12px' }),
          table(
            [
              'Codigo',
              'Trabajador',
              'Departamento',
              { label: 'Consumos', align: 'right' },
              { label: 'Cargos', align: 'right' },
              { label: 'Abonos', align: 'right' },
              { label: 'A descontar', align: 'right' }
            ],
            [
              ...data.rows.map((r) =>
                h(
                  'tr',
                  null,
                  h('td', null, h('span', { class: 'mono', text: r.code })),
                  h('td', { text: r.full_name }),
                  h('td', { text: r.department || '—' }),
                  h('td', { class: 'num', text: String(r.consumos) }),
                  h('td', { class: 'num', text: L(r.cargos) }),
                  h('td', { class: 'num', text: L(r.abonos) }),
                  h('td', { class: 'num', style: 'font-weight:600', text: L(r.total) })
                )
              ),
              data.rows.length
                ? h(
                    'tr',
                    null,
                    h('td', { colspan: '6', style: 'text-align:right;font-weight:600' }, 'Total del periodo'),
                    h('td', { class: 'num', style: 'font-weight:600', text: L(data.totals.descuento) })
                  )
                : null
            ].filter(Boolean),
            'Nadie ha consumido a cuenta en este periodo.'
          )
        ])
      )
    );
  }

  function closePeriod(data) {
    confirmAction({
      title: `Cerrar ${data.period.name}`,
      message: `Se aplicaran ${L(data.totals.descuento)} en descuentos a ${data.totals.empleados} trabajadores y los saldos quedaran en cero. Esta accion no se revierte.`,
      confirmLabel: 'Cerrar periodo',
      danger: true,
      onConfirm: async () => {
        const res = await api.closePeriod(data.period.id);
        toast(
          res.next
            ? `Descuentos aplicados. Ya quedo abierto ${res.next.name}.`
            : 'Descuentos aplicados. Recuerda abrir el siguiente corte.'
        );
        selected = null;
        await loadPeriods();
      }
    });
  }

  async function newPeriod() {
    const sugerido = await api.suggestPeriod();
    const name = input({ value: sugerido.nombre });
    const start = input({ type: 'date', value: sugerido.inicio });
    const end = input({ type: 'date', value: sugerido.fin });
    const dialog = modal({
      title: 'Abrir corte',
      body: [
        h('div', {
          class: 'hint',
          text: `Ciclo configurado: ${sugerido.cycleLabel.toLowerCase()}. Puedes cambiar las fechas si este corte es distinto. Se cambia el ciclo en Ajustes.`
        }),
        h('div', { class: 'form-grid' }, h('div', { class: 'span-2' }, field('Nombre', name)), field('Inicio', start), field('Cierre', end))
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Abrir corte',
          onClick: async () => {
            try {
              await api.createPeriod({ name: name.value.trim(), start_date: start.value, end_date: end.value });
              dialog.close();
              toast('Periodo abierto');
              selected = null;
              loadPeriods();
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
