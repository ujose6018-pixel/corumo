import { api, session, changeOwnPassword, CYCLES } from '../store.js';
import { h, field, input, select, card, toast, confirmAction } from '../ui.js';

export const meta = { title: 'Ajustes', subtitle: 'Configuracion de la cafeteria y tu cuenta' };

export async function render(host) {
  const s = await api.settings();
  const admin = session.is('admin');

  const empresa = input({ value: s.company_name, placeholder: 'Nombre de la empresa', disabled: !admin });
  const cafeteria = input({ value: s.cafeteria_name, placeholder: 'Cafeteria interna', disabled: !admin });
  const isv = select(
    [
      { value: '0', label: 'Sin ISV (consumo interno)', selected: String(s.isv_rate) === '0' },
      { value: '0.15', label: 'ISV 15%', selected: String(s.isv_rate) === '0.15' },
      { value: '0.18', label: 'ISV 18%', selected: String(s.isv_rate) === '0.18' }
    ],
    { disabled: !admin }
  );
  const incluido = select(
    [
      { value: '1', label: 'Los precios ya incluyen el impuesto', selected: s.prices_include_tax !== '0' },
      { value: '0', label: 'El impuesto se suma al total', selected: s.prices_include_tax === '0' }
    ],
    { disabled: !admin }
  );
  const limite = input({ type: 'number', min: '0', step: '50', value: s.default_credit_limit, disabled: !admin });
  const ciclo = select(
    Object.entries(CYCLES).map(([value, label]) => ({ value, label, selected: s.payroll_cycle === value })),
    { disabled: !admin }
  );
  const autoAbrir = select(
    [
      { value: '1', label: 'Abrir el siguiente corte automaticamente', selected: s.auto_open_period !== '0' },
      { value: '0', label: 'Abrirlo a mano cada vez', selected: s.auto_open_period === '0' }
    ],
    { disabled: !admin }
  );
  const pie = input({ value: s.receipt_footer, placeholder: 'Texto al pie del vale', disabled: !admin });

  const actual = input({ type: 'password', placeholder: 'Contrasena actual' });
  const nueva = input({ type: 'password', placeholder: 'Minimo 6 caracteres' });

  host.append(
    card(
      'Cafeteria',
      admin ? h('button', { class: 'btn btn--primary btn--sm', text: 'Guardar ajustes', onClick: save }) : null,
      [
        !admin ? h('div', { class: 'hint', text: 'Solo el administrador puede cambiar estos valores.' }) : null,
        h(
          'div',
          { class: 'form-grid' },
          field('Empresa', empresa),
          field('Nombre de la cafeteria', cafeteria),
          field('Impuesto', isv),
          field('Manejo del impuesto', incluido),
          field('Limite de credito sugerido', limite, 'Se usa al crear un trabajador nuevo'),
          field('Pie del vale', pie),
          field('Ciclo de cobro', ciclo, cicloHint(s.payroll_cycle)),
          field('Al cerrar un corte', autoAbrir)
        )
      ]
    ),
    card('Tu contrasena', null, [
      h('div', { class: 'form-grid' }, field('Contrasena actual', actual), field('Nueva contrasena', nueva)),
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn btn--ghost btn--sm', text: 'Cambiar contrasena', onClick: changePass }))
    ]),
    admin
      ? card('Mantenimiento', null, [
          h('p', {
            style: 'margin:0 0 12px',
            text: 'Si importaste trabajadores antes de que existiera el buscador, este proceso les agrega los campos que necesita la busqueda por codigo y por nombre. Se corre una sola vez y se puede repetir sin riesgo.'
          }),
          h('button', { class: 'btn btn--ghost btn--sm', text: 'Preparar trabajadores para busqueda', onClick: reindexar })
        ])
      : null,
    admin
      ? card('Datos de prueba', null, [
          h('p', {
            style: 'margin:0 0 12px',
            text: 'Carga un catalogo de arranque con refrescos, snacks, comidas y cuatro trabajadores para probar la caja. Puedes editarlo o desactivarlo despues.'
          }),
          h('button', { class: 'btn btn--ghost btn--sm', text: 'Cargar catalogo de ejemplo', onClick: loadSample })
        ])
      : null
  );

  ciclo.addEventListener('change', () => {
    ciclo.parentElement.querySelector('.hint').textContent = cicloHint(ciclo.value);
  });

  async function save() {
    try {
      await api.saveSettings({
        company_name: empresa.value.trim(),
        cafeteria_name: cafeteria.value.trim(),
        isv_rate: isv.value,
        prices_include_tax: incluido.value,
        default_credit_limit: limite.value,
        receipt_footer: pie.value.trim(),
        payroll_cycle: ciclo.value,
        auto_open_period: autoAbrir.value
      });
      toast('Ajustes guardados');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function changePass() {
    if (nueva.value.length < 6) return toast('La nueva contrasena necesita al menos 6 caracteres', 'warn');
    try {
      await changeOwnPassword(actual.value, nueva.value);
      actual.value = '';
      nueva.value = '';
      toast('Contrasena actualizada');
    } catch (err) {
      toast(err.code === 'auth/invalid-credential' ? 'La contrasena actual no coincide' : err.message, 'error');
    }
  }

  function reindexar() {
    confirmAction({
      title: 'Preparar trabajadores',
      message: 'Se recorre la lista de trabajadores y se completan los campos de busqueda. En planillas grandes puede tardar un par de minutos; no cierres la pestana.',
      confirmLabel: 'Empezar',
      onConfirm: async () => {
        const res = await api.reindexEmployees();
        const base = res.corregidos
          ? `${res.corregidos} de ${res.revisados} trabajadores quedaron listos para buscar.`
          : `Los ${res.revisados} trabajadores ya estaban al dia.`;
        toast(res.omitidos ? `${base} ${res.omitidos} no se pudieron actualizar.` : base, res.omitidos ? 'warn' : 'ok');
      }
    });
  }

  function loadSample() {
    confirmAction({
      title: 'Cargar catalogo de ejemplo',
      message: 'Se agregaran categorias, productos y trabajadores de prueba a Firestore. Si ya cargaste el ejemplo antes, quedaran duplicados.',
      confirmLabel: 'Cargar',
      onConfirm: async () => {
        await api.loadSampleData();
        toast('Catalogo de ejemplo cargado');
      }
    });
  }
}

function cicloHint(cycle) {
  if (cycle === 'semanal') return 'Cortes de lunes a domingo';
  if (cycle === 'mensual') return 'Del primero al ultimo dia de cada mes';
  return 'Del 1 al 15 y del 16 al fin de mes';
}
