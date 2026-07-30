import { api, session } from '../store.js';
import { h, L, qty, field, input, select, checkbox, table, card, tag, toast, modal, confirmAction } from '../ui.js';
import { debounce } from './ventas.js';

export const meta = { title: 'Productos y precios', subtitle: 'Catalogo de la cafeteria' };

export async function render(host) {
  let categories = await api.categories();
  const filters = { q: '', category: '', active: 'all' };
  const body = h('div');

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'field grow' },
      h('label', { text: 'Buscar' }),
      input({ placeholder: 'Nombre o codigo', onInput: debounce((e) => set('q', e.target.value)) })
    ),
    field(
      'Categoria',
      select([{ value: '', label: 'Todas' }, ...categories.map((c) => ({ value: c.id, label: c.name }))], {
        onChange: (e) => set('category', e.target.value)
      })
    ),
    field(
      'Estado',
      select(
        [
          { value: 'all', label: 'Todos' },
          { value: '', label: 'Solo activos' }
        ],
        { onChange: (e) => set('active', e.target.value) }
      )
    )
  );

  const actions = h(
    'div',
    { style: 'display:flex;gap:8px' },
    h('button', { class: 'btn btn--ghost btn--sm', text: 'Categorias', onClick: manageCategories }),
    h('button', { class: 'btn btn--primary btn--sm', text: 'Nuevo producto', onClick: () => edit(null) })
  );

  host.append(card('Catalogo', actions, [toolbar, h('div', { style: 'height:14px' }), body]));
  await load();

  function set(key, value) {
    filters[key] = value;
    load();
  }

  async function load() {
    const rows = await api.products(filters);
    body.replaceChildren(
      table(
        [
          'Codigo',
          'Producto',
          'Categoria',
          { label: 'Precio', align: 'right' },
          { label: 'Costo', align: 'right' },
          { label: 'Margen', align: 'right' },
          'Existencia',
          ''
        ],
        rows.map((p) => {
          const margin = p.price > 0 && p.cost > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : null;
          return h(
            'tr',
            null,
            h('td', null, h('span', { class: 'mono', text: p.sku || '—' })),
            h('td', null, h('div', { text: p.name }), p.active ? null : tag('inactivo', 'ambar')),
            h('td', { text: p.category }),
            h('td', { class: 'num', text: L(p.price) }),
            h('td', { class: 'num', text: p.cost ? L(p.cost) : '—' }),
            h('td', { class: 'num', text: margin === null ? '—' : `${margin}%` }),
            h(
              'td',
              null,
              p.track_stock
                ? h('span', {
                    class: 'mono',
                    style: p.stock <= p.min_stock ? 'color:var(--sello)' : '',
                    text: `${qty(p.stock)} u.`
                  })
                : tag('al momento')
            ),
            h(
              'td',
              { class: 'actions' },
              h('button', { class: 'btn btn--ghost btn--sm', text: 'Editar', onClick: () => edit(p) })
            )
          );
        }),
        'Agrega tu primer producto con el boton de arriba.'
      )
    );
  }

  function edit(product) {
    const isNew = !product;
    const sku = input({ value: product?.sku || '', placeholder: 'REF-001' });
    const name = input({ value: product?.name || '', placeholder: 'Nombre como aparece en la caja' });
    const cat = select(
      categories.map((c) => ({ value: c.id, label: c.name, selected: c.id === product?.category_id })),
      {}
    );
    const price = input({ type: 'number', min: '0', step: '0.01', value: product?.price ?? '' });
    const cost = input({ type: 'number', min: '0', step: '0.01', value: product?.cost ?? 0 });
    const track = checkbox('Lleva control de existencias', product ? !!product.track_stock : true);
    const minStock = input({ type: 'number', min: '0', step: '1', value: product?.min_stock ?? 0 });
    const stock = input({ type: 'number', min: '0', step: '1', value: 0 });
    const active = checkbox('Disponible en la caja', product ? !!product.active : true);

    const stockRow = h('div', { class: 'span-2 form-grid' }, field('Existencia inicial', stock), field('Minimo antes de avisar', minStock));
    const syncStockRow = () => {
      stockRow.hidden = !track.querySelector('input').checked;
      if (!isNew) stock.parentElement.hidden = true;
    };
    track.querySelector('input').addEventListener('change', syncStockRow);

    const dialog = modal({
      title: isNew ? 'Nuevo producto' : product.name,
      body: h(
        'div',
        { class: 'form-grid' },
        field('Codigo', sku, 'Opcional, sirve para buscar rapido'),
        field('Categoria', cat),
        h('div', { class: 'span-2' }, field('Nombre', name)),
        field('Precio de venta', price),
        field('Costo', cost),
        stockRow,
        h('div', { class: 'span-2' }, track),
        h('div', { class: 'span-2' }, active)
      ),
      wide: true,
      footer: [
        !isNew && session.is('admin')
          ? h('button', {
              class: 'btn btn--danger',
              text: 'Quitar del catalogo',
              onClick: () =>
                confirmAction({
                  title: 'Quitar producto',
                  message: `${product.name} dejara de aparecer en la caja. El historial de ventas se conserva.`,
                  confirmLabel: 'Quitar',
                  danger: true,
                  onConfirm: async () => {
                    await api.removeProduct(product.id);
                    dialog.close();
                    toast('Producto retirado del catalogo');
                    load();
                  }
                })
            })
          : null,
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', { class: 'btn btn--primary', text: isNew ? 'Crear producto' : 'Guardar cambios', onClick: save })
      ]
    });

    syncStockRow();

    async function save() {
      const payload = {
        sku: sku.value.trim(),
        name: name.value.trim(),
        category_id: Number(cat.value),
        price: Number(price.value),
        cost: Number(cost.value) || 0,
        track_stock: track.querySelector('input').checked,
        min_stock: Number(minStock.value) || 0,
        active: active.querySelector('input').checked
      };
      if (isNew) payload.stock = Number(stock.value) || 0;
      try {
        if (isNew) await api.createProduct(payload);
        else await api.updateProduct(product.id, payload);
        dialog.close();
        toast(isNew ? 'Producto creado' : 'Cambios guardados');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  }

  function manageCategories() {
    const list = h('div');
    const name = input({ placeholder: 'Nombre de la categoria' });
    const kind = select([
      { value: 'bebida', label: 'Bebida' },
      { value: 'snack', label: 'Snack' },
      { value: 'comida', label: 'Comida preparada' }
    ]);

    const dialog = modal({
      title: 'Categorias',
      body: [
        list,
        h('div', { class: 'form-grid' }, field('Nueva categoria', name), field('Tipo', kind)),
        h('button', { class: 'btn btn--primary btn--sm', text: 'Agregar categoria', onClick: add })
      ],
      wide: true,
      footer: [h('button', { class: 'btn btn--ghost', text: 'Cerrar', onClick: () => dialog.close() })]
    });

    draw();

    function draw() {
      list.replaceChildren(
        table(
          ['Categoria', 'Tipo', 'Orden', ''],
          categories.map((c) =>
            h(
              'tr',
              null,
              h('td', { text: c.name }),
              h('td', null, tag(c.kind)),
              h('td', { class: 'num', text: String(c.sort) }),
              h(
                'td',
                { class: 'actions' },
                h('button', {
                  class: 'btn btn--ghost btn--sm',
                  text: c.active ? 'Ocultar' : 'Mostrar',
                  onClick: async () => {
                    await api.updateCategory(c.id, { active: !c.active });
                    categories = await api.categories();
                    draw();
                    load();
                  }
                })
              )
            )
          )
        )
      );
    }

    async function add() {
      try {
        await api.createCategory({ name: name.value.trim(), kind: kind.value, sort: (categories.length + 1) * 10 });
        categories = await api.categories();
        name.value = '';
        draw();
        toast('Categoria agregada');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  }
}
