import { api, session } from '../store.js';
import { h, L, field, input, checkbox, table, card, tag, toast, modal, dateTime } from '../ui.js';
import { debounce } from './ventas.js';

export const meta = { title: 'Trabajadores', subtitle: 'Cuentas de credito de la empresa' };

export async function render(host) {
  const filters = { q: '', debt: '', active: 'all' };
  const body = h('div');
  const summary = h('div', { class: 'stats' });

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'field grow' },
      h('label', { text: 'Buscar' }),
      input({ placeholder: 'Nombre, codigo o departamento', onInput: debounce((e) => set('q', e.target.value)) })
    ),
    h('div', { style: 'display:flex;gap:8px;align-items:center;padding-bottom:2px' },
      h('button', { class: 'btn btn--ghost btn--sm', text: 'Solo con saldo', onClick: (e) => {
        filters.debt = filters.debt ? '' : '1';
        e.currentTarget.classList.toggle('btn--primary', !!filters.debt);
        load();
      } })
    )
  );

  host.append(
    summary,
    card('Cuentas', h('button', { class: 'btn btn--primary btn--sm', text: 'Nuevo trabajador', onClick: () => edit(null) }), [
      toolbar,
      h('div', { style: 'height:14px' }),
      body
    ])
  );

  await load();

  function set(key, value) {
    filters[key] = value;
    load();
  }

  async function load() {
    const rows = await api.employees(filters);
    const deuda = rows.reduce((a, b) => a + b.balance, 0);
    const conSaldo = rows.filter((r) => r.balance > 0.009);

    summary.replaceChildren(
      box('Cuentas registradas', String(rows.length)),
      box('Con saldo pendiente', String(conSaldo.length), 'se descuenta en la planilla', conSaldo.length ? 'sello' : 'verde'),
      box('Cartera acumulada', L(deuda), 'total por descontar', 'sello')
    );

    body.replaceChildren(
      table(
        ['Codigo', 'Trabajador', 'Departamento', { label: 'Saldo', align: 'right' }, { label: 'Limite', align: 'right' }, 'Estado', ''],
        rows.map((e) => {
          const near = e.credit_limit > 0 && e.balance >= e.credit_limit * 0.85;
          return h(
            'tr',
            null,
            h('td', null, h('span', { class: 'mono', text: e.code })),
            h('td', { text: e.full_name }),
            h('td', { text: e.department || '—' }),
            h('td', {
              class: 'num',
              style: e.balance > 0 ? 'color:var(--sello);font-weight:500' : '',
              text: L(e.balance)
            }),
            h('td', { class: 'num', text: e.credit_limit > 0 ? L(e.credit_limit) : 'sin limite' }),
            h('td', null, !e.active ? tag('inhabilitada', 'ambar') : near ? tag('cerca del limite', 'sello') : tag('al dia', 'verde')),
            h(
              'td',
              { class: 'actions' },
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Estado de cuenta', onClick: () => statement(e) }),
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Editar', onClick: () => edit(e) })
            )
          );
        }),
        'Registra a los trabajadores que van a consumir a cuenta.'
      )
    );
  }

  function edit(employee) {
    const isNew = !employee;
    const code = input({ value: employee?.code || '', placeholder: 'E-1001' });
    const name = input({ value: employee?.full_name || '', placeholder: 'Nombre completo' });
    const dept = input({ value: employee?.department || '', placeholder: 'Area o departamento' });
    const limit = input({ type: 'number', min: '0', step: '50', value: employee?.credit_limit ?? 1500 });
    const active = checkbox('Puede consumir a cuenta', employee ? !!employee.active : true);

    const dialog = modal({
      title: isNew ? 'Nuevo trabajador' : employee.full_name,
      body: h(
        'div',
        { class: 'form-grid' },
        field('Codigo de empleado', code, 'El numero de la ficha o de planilla'),
        field('Limite de credito', limit, 'Cero significa sin limite'),
        h('div', { class: 'span-2' }, field('Nombre completo', name)),
        h('div', { class: 'span-2' }, field('Departamento', dept)),
        h('div', { class: 'span-2' }, active)
      ),
      wide: true,
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: isNew ? 'Crear cuenta' : 'Guardar cambios',
          onClick: async () => {
            const payload = {
              code: code.value.trim(),
              full_name: name.value.trim(),
              department: dept.value.trim(),
              credit_limit: Number(limit.value) || 0,
              active: active.querySelector('input').checked
            };
            try {
              if (isNew) await api.createEmployee(payload);
              else await api.updateEmployee(employee.id, payload);
              dialog.close();
              toast(isNew ? 'Cuenta creada' : 'Cambios guardados');
              load();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }

  async function statement(employee) {
    const data = await api.statement(employee.id, { limit: 150 });
    const dialog = modal({
      title: `${employee.code} — ${employee.full_name}`,
      wide: true,
      body: [
        h(
          'div',
          { class: 'stats' },
          box('Saldo actual', L(data.employee.balance), 'pendiente de descuento', 'sello'),
          box('Consumo del periodo', L(data.period_total), data.period.name, 'verde'),
          box('Limite', data.employee.credit_limit ? L(data.employee.credit_limit) : 'sin limite')
        ),
        table(
          ['Fecha', 'Movimiento', 'Detalle', { label: 'Monto', align: 'right' }, { label: 'Saldo', align: 'right' }, 'Registro'],
          data.movements.map((m) =>
            h(
              'tr',
              null,
              h('td', { text: dateTime(m.created_at) }),
              h('td', null, tag(m.type, m.amount > 0 ? 'sello' : 'verde')),
              h('td', null, h('div', { text: m.note || '—' }), m.folio ? h('small', { class: 'mono hint', text: m.folio }) : null),
              h('td', { class: 'num', text: `${m.amount > 0 ? '+' : ''}${L(m.amount)}` }),
              h('td', { class: 'num', text: L(m.balance_after) }),
              h('td', { text: m.user })
            )
          ),
          'Esta cuenta todavia no tiene consumos.'
        )
      ],
      footer: [
        session.is('admin')
          ? h('button', {
              class: 'btn btn--ghost',
              text: 'Ajuste manual',
              onClick: () => {
                dialog.close();
                adjust(employee);
              }
            })
          : null,
        data.employee.balance > 0
          ? h('button', {
              class: 'btn btn--primary',
              text: 'Registrar abono',
              onClick: () => {
                dialog.close();
                pay(data.employee);
              }
            })
          : null,
        h('button', { class: 'btn btn--ghost', text: 'Cerrar', onClick: () => dialog.close() })
      ]
    });
  }

  function pay(employee) {
    const amount = input({ type: 'number', min: '0.01', step: '0.01', value: employee.balance.toFixed(2) });
    const note = input({ placeholder: 'Abono en efectivo' });
    const dialog = modal({
      title: `Abono — ${employee.full_name}`,
      body: [
        h('div', { class: 'hint', text: `Saldo pendiente: ${L(employee.balance)}` }),
        h('div', { class: 'form-grid' }, field('Monto recibido', amount), field('Nota', note))
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Registrar abono',
          onClick: async () => {
            try {
              await api.addPayment(employee.id, { amount: Number(amount.value), note: note.value.trim() });
              dialog.close();
              toast('Abono registrado');
              load();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }

  function adjust(employee) {
    const amount = input({ type: 'number', step: '0.01', value: '' });
    const note = input({ placeholder: 'Motivo del ajuste' });
    const dialog = modal({
      title: `Ajuste — ${employee.full_name}`,
      body: [
        h('div', { class: 'hint', text: 'Usa numeros positivos para aumentar la deuda y negativos para bajarla.' }),
        h('div', { class: 'form-grid' }, field('Monto', amount), field('Motivo', note))
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Aplicar ajuste',
          onClick: async () => {
            try {
              await api.addAdjustment(employee.id, { amount: Number(amount.value), note: note.value.trim() });
              dialog.close();
              toast('Ajuste aplicado');
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

function box(label, value, foot, tone) {
  return h(
    'div',
    { class: `stat${tone ? ' stat--' + tone : ''}` },
    h('div', { class: 'eyebrow', text: label }),
    h('div', { class: 'stat__value', text: value }),
    foot ? h('div', { class: 'stat__foot', text: foot }) : null
  );
}
