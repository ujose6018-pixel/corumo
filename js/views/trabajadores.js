import { api, session } from '../store.js';
import { h, L, field, input, checkbox, table, card, tag, toast, modal, dateTime, debounce, confirmAction } from '../ui.js';

export const meta = { title: 'Trabajadores', subtitle: 'Cuentas de credito de la empresa' };

export async function render(host) {
  const filters = { q: '', debt: '' };
  let cursor = null;
  let acumulado = [];

  const body = h('div');
  const summary = h('div', { class: 'stats' });
  const masBoton = h('button', { class: 'btn btn--ghost btn--sm', text: 'Cargar mas', hidden: true, onClick: more });

  const buscador = input({
    type: 'search',
    placeholder: 'Codigo, nombre o apellido',
    autocomplete: 'off',
    onInput: debounce((e) => {
      filters.q = e.target.value.trim();
      reload();
    })
  });

  const deudaBoton = h('button', {
    class: 'btn btn--ghost btn--sm',
    text: 'Solo con saldo',
    onClick: (e) => {
      filters.debt = filters.debt ? '' : '1';
      e.currentTarget.classList.toggle('btn--primary', !!filters.debt);
      reload();
    }
  });

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h('div', { class: 'field grow' }, h('label', { text: 'Buscar' }), buscador),
    h('div', { style: 'display:flex;gap:8px;align-items:center;padding-bottom:2px;flex-wrap:wrap' }, deudaBoton)
  );

  host.append(
    summary,
    card(
      'Cuentas',
      h(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        h('button', { class: 'btn btn--ghost btn--sm', text: 'Importar lista', onClick: importar }),
        h('button', { class: 'btn btn--primary btn--sm', text: 'Nuevo trabajador', onClick: () => edit(null) })
      ),
      [toolbar, h('div', { style: 'height:14px' }), body, h('div', { style: 'padding-top:12px;text-align:center' }, masBoton)]
    )
  );

  await loadSummary();
  await reload();

  async function loadSummary() {
    const cartera = await api.carteraTotal();
    summary.replaceChildren(
      box('Con saldo pendiente', String(cartera.deudores), 'se descuenta en la planilla', cartera.deudores ? 'sello' : 'verde'),
      box('Cartera acumulada', L(cartera.total), 'total por descontar', 'sello')
    );
  }

  async function reload() {
    cursor = null;
    acumulado = [];
    body.replaceChildren(h('div', { class: 'empty', text: 'Cargando…' }));
    await more(true);
  }

  async function more(primera = false) {
    try {
      let lote;
      if (filters.q) {
        // Con termino de busqueda no hay paginacion: se muestran las coincidencias.
        lote = await api.searchEmployees(filters.q, { limit: 40, active: 'all' });
        masBoton.hidden = true;
      } else {
        lote = await api.employees({ debt: filters.debt, active: 'all', limit: 50, after: cursor });
        cursor = lote.length ? (filters.debt ? lote[lote.length - 1].balance : lote[lote.length - 1].full_name.toUpperCase()) : cursor;
        masBoton.hidden = lote.length < 50;
      }
      acumulado = primera ? lote : [...acumulado, ...lote];
      draw();
    } catch (err) {
      body.replaceChildren(h('div', { class: 'empty' }, h('strong', { text: 'No se pudo cargar' }), h('div', { text: err.message })));
    }
  }

  function draw() {
    body.replaceChildren(
      table(
        ['Codigo', 'Trabajador', 'Departamento', { label: 'Saldo', align: 'right' }, { label: 'Limite', align: 'right' }, 'Estado', ''],
        acumulado.map((e) => {
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
        filters.q ? 'Ningun trabajador coincide con esa busqueda.' : 'Registra a los trabajadores que van a consumir a cuenta.'
      )
    );
  }

  function edit(employee) {
    const isNew = !employee;
    const code = input({
      value: employee?.code || '',
      placeholder: 'E-1001',
      disabled: !isNew,
      style: 'text-transform:uppercase;font-family:var(--fs-mono)'
    });
    const name = input({ value: employee?.full_name || '', placeholder: 'Nombre completo' });
    const dept = input({ value: employee?.department || '', placeholder: 'Area o departamento' });
    const limit = input({ type: 'number', min: '0', step: '50', value: employee?.credit_limit ?? 1500 });
    const active = checkbox('Puede consumir a cuenta', employee ? !!employee.active : true);

    const dialog = modal({
      title: isNew ? 'Nuevo trabajador' : employee.full_name,
      body: h(
        'div',
        { class: 'form-grid' },
        field(
          'Codigo de empleado',
          code,
          isNew
            ? 'El numero de la ficha o de planilla. Queda fijo: es la identidad del trabajador.'
            : 'El codigo no se puede cambiar: su historial cuelga de el.'
        ),
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
              code: isNew ? code.value.trim() : undefined,
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
              reload();
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
              reload();
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
              reload();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }

/** Alta masiva pegando la planilla o subiendo un CSV. */
  function importar() {
    const archivo = h('input', { type: 'file', accept: '.csv,.txt,text/csv' });
    const area = h('textarea', {
      rows: 8,
      placeholder: 'E-1001;Ana Lucia Martinez;Produccion;1500\nE-1002;Carlos Fuentes;Bodega;1500',
      style: 'width:100%;font-family:var(--fs-mono);font-size:13px'
    });
    const avance = h('div', { class: 'hint' });

    archivo.addEventListener('change', async () => {
      const f = archivo.files?.[0];
      if (f) area.value = await f.text();
    });

    const dialog = modal({
      title: 'Importar trabajadores',
      wide: true,
      body: [
        h('p', {
          style: 'margin:0',
          text: 'Una linea por trabajador, con los datos separados por punto y coma o coma: codigo, nombre, departamento y limite de credito. El departamento y el limite se pueden dejar vacios.'
        }),
        field('Archivo CSV', archivo, 'O pega el contenido abajo'),
        field('Contenido', area),
        avance
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Revisar e importar',
          onClick: async (ev) => {
            const registros = parseLista(area.value);
            if (!registros.length) return toast('No se encontro ninguna linea con codigo y nombre', 'warn');

            ev.currentTarget.disabled = true;
            avance.textContent = `Procesando ${registros.length} registros…`;
            try {
              const res = await api.importEmployees(registros, (hechos, total) => {
                avance.textContent = `Procesando ${hechos} de ${total}…`;
              });
              dialog.close();
              const detalles = [
                res.repetidos ? `${res.repetidos} ya existian` : null,
                res.invalidos ? `${res.invalidos} lineas sin codigo o sin nombre` : null
              ].filter(Boolean);
              toast(
                detalles.length
                  ? `${res.creados} trabajadores creados. Se omitieron: ${detalles.join(' y ')}.`
                  : `${res.creados} trabajadores creados.`
              );
              await loadSummary();
              reload();
            } catch (err) {
              ev.currentTarget.disabled = false;
              avance.textContent = '';
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }
}

/** Lee lineas separadas por punto y coma, coma o tabulacion. */
function parseLista(texto) {
  const out = [];
  for (const linea of String(texto || '').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const cols = limpia.split(/[;\t,]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const [code, full_name, department, credit_limit] = cols;
    if (!code || !full_name) continue;
    // Encabezado del archivo
    if (/^(codigo|code)$/i.test(code)) continue;
    out.push({ code, full_name, department, credit_limit: Number(credit_limit) || 0 });
  }
  return out;
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
