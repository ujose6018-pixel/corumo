import { api } from '../store.js';
import { h, icon, ICONS, L, qty, field, input, select, toast, modal, card } from '../ui.js';

export const meta = { title: 'Caja', subtitle: 'Cobra, carga a cuenta y entrega el vale' };

/** Sugerencia de tiempo de comida segun la hora local. */
function currentMeal() {
  const hour = new Date().getHours();
  if (hour < 10) return 'Desayuno';
  if (hour < 15) return 'Almuerzo';
  if (hour < 21) return 'Cena';
  return 'Otro';
}

export async function render(host) {
  const state = {
    products: [],
    categories: [],
    employees: [],
    cart: new Map(),
    category: 'all',
    search: '',
    method: 'efectivo',
    employeeId: '',
    received: '',
    note: '',
    meal: currentMeal()
  };

  const grid = h('div', { class: 'tiles' });
  const catnav = h('div', { class: 'catnav' });
  const valeHost = h('aside');
  const searchBox = input({ placeholder: 'Nombre o codigo del producto', autocomplete: 'off' });
  searchBox.addEventListener('input', () => {
    state.search = searchBox.value.trim().toLowerCase();
    drawTiles();
  });

  host.append(
    h(
      'div',
      { class: 'pos' },
      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'card__body' },
          h('div', { class: 'pos__search' }, field('Buscar', searchBox), field('Tiempo de comida', mealSelect())),
          catnav,
          grid
        )
      ),
      valeHost
    )
  );

  function mealSelect() {
    const el = select(
      ['Desayuno', 'Almuerzo', 'Cena', 'Otro'].map((m) => ({ value: m, label: m, selected: m === state.meal })),
      { onChange: (e) => (state.meal = e.target.value) }
    );
    return el;
  }

  const [products, categories, employees] = await Promise.all([
    api.products(),
    api.categories(),
    api.employees()
  ]);
  state.products = products;
  state.categories = categories.filter((c) => c.active);
  state.employees = employees;

  drawCatnav();
  drawTiles();
  drawVale();

  function drawCatnav() {
    catnav.replaceChildren();
    const entries = [{ id: 'all', name: 'Todo' }, ...state.categories];
    for (const cat of entries) {
      catnav.append(
        h('button', {
          class: String(state.category) === String(cat.id) ? 'is-active' : '',
          text: cat.name,
          onClick: () => {
            state.category = cat.id;
            drawCatnav();
            drawTiles();
          }
        })
      );
    }
  }

  function visibleProducts() {
    return state.products.filter((p) => {
      if (state.category !== 'all' && p.category_id !== state.category) return false;
      if (!state.search) return true;
      return (p.name + ' ' + (p.sku || '')).toLowerCase().includes(state.search);
    });
  }

  function drawTiles() {
    const list = visibleProducts();
    grid.replaceChildren();
    if (!list.length) {
      grid.append(
        h(
          'div',
          { class: 'empty', style: 'grid-column:1/-1' },
          h('strong', { text: 'Sin resultados' }),
          h('div', { text: 'Prueba con otro nombre o cambia de categoria.' })
        )
      );
      return;
    }
    for (const p of list) {
      const out = p.track_stock && p.stock <= 0;
      const low = p.track_stock && p.stock > 0 && p.stock <= p.min_stock;
      grid.append(
        h(
          'button',
          { class: 'tile', disabled: out, onClick: () => addToCart(p) },
          h('div', { class: 'tile__name', text: p.name }),
          h(
            'div',
            { class: 'tile__meta' },
            h('span', { class: 'tile__price', text: L(p.price) }),
            h('span', {
              class: `tile__stock${low || out ? ' is-low' : ''}`,
              text: p.track_stock ? (out ? 'agotado' : `${qty(p.stock)} u.`) : 'al momento'
            })
          )
        )
      );
    }
  }

  function addToCart(product) {
    const line = state.cart.get(product.id);
    const nextQty = (line?.qty || 0) + 1;
    if (product.track_stock && nextQty > product.stock) {
      toast(`Solo hay ${qty(product.stock)} de ${product.name}`, 'warn');
      return;
    }
    state.cart.set(product.id, { product, qty: nextQty });
    drawVale();
  }

  function setQty(id, value) {
    const line = state.cart.get(id);
    if (!line) return;
    if (value <= 0) state.cart.delete(id);
    else if (line.product.track_stock && value > line.product.stock) {
      toast(`Solo hay ${qty(line.product.stock)} de ${line.product.name}`, 'warn');
      return;
    } else state.cart.set(id, { ...line, qty: value });
    drawVale();
  }

  // Declarada como funcion, no como const: drawVale() corre antes de esta linea.
  function total() {
    let sum = 0;
    for (const { product, qty: q } of state.cart.values()) sum += product.price * q;
    return Math.round(sum * 100) / 100;
  }

  function drawVale() {
    const lines = [...state.cart.values()];
    const sum = total();
    const employee = state.employees.find((e) => String(e.id) === String(state.employeeId));

    const linesHost = h('div', { class: 'vale__lines' });
    if (!lines.length) {
      linesHost.append(
        h('div', { class: 'empty', style: 'padding:26px 0' }, h('strong', { text: 'Vale vacio' }), h('div', { text: 'Toca un producto para empezar.' }))
      );
    }
    for (const line of lines) {
      linesHost.append(
        h(
          'div',
          { class: 'line' },
          h('span', { class: 'line__qty', text: `${qty(line.qty)}x` }),
          h(
            'div',
            { class: 'line__name' },
            h('b', { text: line.product.name }),
            h('small', { text: `${L(line.product.price)} c/u` }),
            h(
              'div',
              { class: 'qty-set', style: 'margin-top:3px' },
              h('button', { text: '−', 'aria-label': 'Quitar uno', onClick: () => setQty(line.product.id, line.qty - 1) }),
              h('button', { text: '+', 'aria-label': 'Agregar uno', onClick: () => setQty(line.product.id, line.qty + 1) }),
              h('button', { text: '×', 'aria-label': 'Quitar del vale', onClick: () => setQty(line.product.id, 0) })
            )
          ),
          h('span', { class: 'line__total', text: L(line.product.price * line.qty) })
        )
      );
    }

    const payment = h('div', { style: 'display:grid;gap:10px' });
    payment.append(
      h(
        'div',
        { class: 'pay-switch' },
        h('button', {
          class: state.method === 'efectivo' ? 'is-active' : '',
          text: 'Efectivo',
          onClick: () => {
            state.method = 'efectivo';
            drawVale();
          }
        }),
        h('button', {
          class: state.method === 'credito' ? 'is-active' : '',
          text: 'A cuenta',
          onClick: () => {
            state.method = 'credito';
            drawVale();
          }
        })
      )
    );

    if (state.method === 'efectivo') {
      const recv = input({
        type: 'number',
        min: '0',
        step: '0.01',
        value: state.received,
        placeholder: sum.toFixed(2),
        onInput: (e) => {
          state.received = e.target.value;
          changeNote.textContent = changeText();
        }
      });
      const changeNote = h('div', { class: 'hint mono', text: changeText() });
      payment.append(field('Efectivo recibido', recv), changeNote);
    } else {
      const picker = select(
        [
          { value: '', label: 'Elige al trabajador' },
          ...state.employees
            .filter((e) => e.active)
            .map((e) => ({ value: e.id, label: `${e.code} — ${e.full_name}`, selected: String(e.id) === String(state.employeeId) }))
        ],
        {
          onChange: (e) => {
            state.employeeId = e.target.value;
            drawVale();
          }
        }
      );
      payment.append(field('Trabajador', picker));

      if (employee) {
        const nuevo = employee.balance + sum;
        const over = employee.credit_limit > 0 && nuevo > employee.credit_limit;
        payment.append(
          h(
            'div',
            { class: 'account-box' },
            h('div', { class: 'row' }, h('span', { text: 'Saldo actual' }), h('b', { text: L(employee.balance) })),
            h(
              'div',
              { class: `row${over ? ' over' : ''}` },
              h('span', { text: 'Queda debiendo' }),
              h('b', { text: L(nuevo) })
            ),
            h(
              'div',
              { class: 'row' },
              h('span', { text: 'Limite autorizado' }),
              h('b', { text: employee.credit_limit > 0 ? L(employee.credit_limit) : 'sin limite' })
            ),
            over ? h('div', { class: 'row over', text: 'Pasa del limite. Registra un abono o pide autorizacion.' }) : null,
            employee.balance > 0
              ? h(
                  'div',
                  { style: 'margin-top:6px' },
                  h('button', {
                    class: 'btn btn--ghost btn--sm btn--block',
                    text: 'Abonar a la cuenta',
                    onClick: () => abonar(employee)
                  })
                )
              : null
          )
        );
      }
    }

    function changeText() {
      const recv = Number(state.received);
      if (!recv || recv < sum) return 'Cambio: —';
      return `Cambio: ${L(recv - sum)}`;
    }

    const blocked =
      !lines.length ||
      (state.method === 'credito' && !employee) ||
      (state.method === 'efectivo' && state.received !== '' && Number(state.received) < sum);

    const vale = h(
      'div',
      { class: 'vale' },
      h(
        'div',
        { class: 'vale__head' },
        h('h2', { text: 'Vale' }),
        h('span', { class: 'vale__folio', text: state.meal.toLowerCase() })
      ),
      linesHost,
      h(
        'div',
        { class: 'vale__sum' },
        h('div', { class: 'vale__row' }, h('span', { text: `Renglones` }), h('span', { text: String(lines.length) })),
        h('div', { class: 'vale__row vale__row--total' }, h('span', { text: 'Total' }), h('span', { text: L(sum) }))
      ),
      payment,
      field(
        'Nota',
        input({
          placeholder: 'Opcional',
          value: state.note,
          onInput: (e) => (state.note = e.target.value)
        })
      ),
      h(
        'div',
        { style: 'display:grid;gap:8px' },
        h('button', {
          class: 'btn btn--primary btn--lg btn--block',
          disabled: blocked,
          text: state.method === 'efectivo' ? 'Cobrar' : 'Cargar a cuenta',
          onClick: submit
        }),
        lines.length
          ? h('button', { class: 'btn btn--ghost btn--sm btn--block', text: 'Vaciar vale', onClick: clear })
          : null
      )
    );

    valeHost.replaceChildren(vale);
  }

  /** El trabajador paga parte de su cuenta antes de que se liquide la planilla. */
  function abonar(employee) {
    const amount = input({ type: 'number', min: '0.01', step: '0.01', value: employee.balance.toFixed(2) });
    const note = input({ placeholder: 'Abono en caja' });
    const dialog = modal({
      title: `Abono — ${employee.full_name}`,
      body: [
        h('div', { class: 'hint', text: `Saldo pendiente: ${L(employee.balance)}. Puede abonar todo o una parte.` }),
        field('Monto recibido', amount),
        field('Nota', note),
        h('div', {
          class: 'hint',
          text: 'El abono baja lo que se le descuenta en el corte actual y queda anotado en su estado de cuenta.'
        })
      ],
      footer: [
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Registrar abono',
          onClick: async () => {
            try {
              await api.addPayment(employee.id, { amount: Number(amount.value), note: note.value.trim() });
              state.employees = await api.employees();
              dialog.close();
              toast(`Abono registrado. ${employee.full_name} queda con saldo actualizado.`);
              drawVale();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      ]
    });
  }

  function clear() {
    state.cart.clear();
    state.received = '';
    state.note = '';
    drawVale();
  }

  async function submit() {
    const payload = {
      method: state.method,
      meal: state.meal,
      note: state.note,
      items: [...state.cart.values()].map((l) => ({ product_id: l.product.id, qty: l.qty }))
    };
    if (state.method === 'credito') payload.employee_id = Number(state.employeeId);
    else if (state.received !== '') payload.received = Number(state.received);

    try {
      const sale = await api.createSale(payload);
      state.products = await api.products();
      state.employees = await api.employees();
      state.cart.clear();
      state.received = '';
      state.note = '';
      state.employeeId = '';
      drawTiles();
      drawVale();
      showReceipt(sale);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

/** Vale cerrado con el sello de la forma de pago. */
export function showReceipt(sale) {
  const credit = sale.method === 'credito';
  const sheet = h(
    'div',
    { class: 'stamp-sheet' },
    h(
      'div',
      { style: 'display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dashed #cbc9c0;padding-bottom:8px' },
      h('strong', { class: 'mono', text: sale.folio }),
      h('span', { class: 'hint', text: sale.meal || '' })
    ),
    h(
      'div',
      { class: 'mono', style: 'font-size:13px;display:grid;gap:3px;padding:10px 0' },
      sale.items.map((i) =>
        h(
          'div',
          { style: 'display:flex;justify-content:space-between;gap:12px' },
          h('span', { text: `${qty(i.qty)}x ${i.name}` }),
          h('span', { text: L(i.line_total) })
        )
      )
    ),
    h(
      'div',
      { class: 'mono', style: 'border-top:1px dashed #cbc9c0;padding-top:8px;display:grid;gap:3px;font-size:13px' },
      sale.tax > 0
        ? h('div', { style: 'display:flex;justify-content:space-between' }, h('span', { text: 'ISV' }), h('span', { text: L(sale.tax) }))
        : null,
      h(
        'div',
        { style: 'display:flex;justify-content:space-between;font-size:19px;font-weight:600' },
        h('span', { text: 'Total' }),
        h('span', { text: L(sale.total) })
      ),
      credit
        ? h('div', { style: 'display:flex;justify-content:space-between' }, h('span', { text: 'Trabajador' }), h('span', { text: sale.employee_code || '' }))
        : h('div', { style: 'display:flex;justify-content:space-between' }, h('span', { text: 'Cambio' }), h('span', { text: L(sale.change_due) })),
      h('div', { class: 'hint', style: 'margin-top:6px', text: `Atendio ${sale.cashier}` })
    ),
    h(
      'div',
      { class: `stamp${credit ? '' : ' stamp--verde'}` },
      credit ? 'Cargado a planilla' : 'Pagado en efectivo',
      h('small', { text: credit ? sale.employee || '' : new Date(sale.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) })
    )
  );

  const dialog = modal({
    title: 'Venta registrada',
    body: sheet,
    footer: [
      h('button', { class: 'btn btn--ghost', text: 'Imprimir', onClick: () => window.print() }, icon(ICONS.print, 15)),
      h('button', { class: 'btn btn--primary', text: 'Siguiente cliente', onClick: () => dialog.close() })
    ]
  });
}
