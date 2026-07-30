import { session, login, logout, watchAuth, loadProfile } from './firebase.js';
import { api } from './store.js';
import { h, icon, ICONS, field, input, checkbox, toast, L, dateOnly } from './ui.js';

const root = document.getElementById('root');

const NAV = [
  { group: 'Operacion' },
  { key: 'caja', label: 'Caja', icon: 'caja', roles: ['admin', 'cajero'] },
  { key: 'ventas', label: 'Ventas', icon: 'ventas', roles: ['admin', 'cajero'] },
  { group: 'Cafeteria' },
  { key: 'productos', label: 'Productos y precios', icon: 'productos', roles: ['admin', 'cajero'] },
  { key: 'inventario', label: 'Inventario', icon: 'inventario', roles: ['admin', 'cajero'] },
  { group: 'Credito' },
  { key: 'trabajadores', label: 'Trabajadores', icon: 'gente', roles: ['admin', 'cajero'] },
  { key: 'planilla', label: 'Planilla', icon: 'planilla', roles: ['admin', 'cajero'] },
  { group: 'Control' },
  { key: 'reportes', label: 'Reportes', icon: 'reportes', roles: ['admin', 'cajero'] },
  { key: 'usuarios', label: 'Usuarios del sistema', icon: 'usuarios', roles: ['admin'] },
  { key: 'ajustes', label: 'Ajustes', icon: 'ajustes', roles: ['admin', 'cajero'] }
];

const MODULES = {
  caja: () => import('./views/caja.js'),
  ventas: () => import('./views/ventas.js'),
  productos: () => import('./views/productos.js'),
  inventario: () => import('./views/inventario.js'),
  trabajadores: () => import('./views/trabajadores.js'),
  planilla: () => import('./views/planilla.js'),
  reportes: () => import('./views/reportes.js'),
  usuarios: () => import('./views/usuarios.js'),
  ajustes: () => import('./views/ajustes.js')
};

const COLLAPSE_KEY = 'cafeteria.panel';

/* ================= acceso ================= */

function renderGate() {
  const usuario = input({ value: session.remembered, placeholder: 'usuario', autocomplete: 'username' });
  const clave = input({ type: 'password', placeholder: 'contrasena', autocomplete: 'current-password' });
  const recordar = checkbox('Recordar mi usuario en este equipo', !!session.remembered);
  const errorBox = h('div', { class: 'error-note', hidden: true });
  const boton = h('button', { class: 'btn btn--primary btn--lg btn--block', text: 'Entrar' });

  const submit = async () => {
    errorBox.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Verificando…';
    try {
      await login(usuario.value.trim(), clave.value, recordar.querySelector('input').checked);
      renderShell();
    } catch (err) {
      errorBox.textContent = translate(err);
      errorBox.hidden = false;
      boton.disabled = false;
      boton.textContent = 'Entrar';
      clave.value = '';
      clave.focus();
    }
  };

  boton.addEventListener('click', submit);
  for (const el of [usuario, clave]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'gate' },
      h(
        'div',
        { class: 'gate__art' },
        h('div', { class: 'eyebrow', style: 'color:#7fc9a5', text: 'Cafeteria de empresa' }),
        h('div', { class: 'gate__mark' }, 'Caja y', h('span', null, 'credito')),
        h(
          'div',
          { class: 'gate__note' },
          'Cobro en efectivo o cargo a la cuenta del trabajador. ',
          'Cada consumo queda anotado y al cerrar la quincena sale el archivo de descuentos para planilla.'
        )
      ),
      h(
        'div',
        { class: 'gate__panel' },
        h('h1', { text: 'Iniciar sesion' }),
        h('p', { class: 'lede', text: 'Escribe el usuario que te dio el administrador.' }),
        errorBox,
        field('Usuario', usuario),
        field('Contrasena', clave),
        recordar,
        boton,
        h('div', { class: 'hint', text: 'Si olvidaste tu contrasena, pidele al administrador que te envie el correo de restablecimiento.' })
      )
    )
  );

  (session.remembered ? clave : usuario).focus();
}

function translate(err) {
  const code = err?.code || '';
  if (code.startsWith('auth/')) {
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Usuario o contrasena incorrectos.';
    }
    if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera un momento antes de volver a probar.';
    if (code === 'auth/network-request-failed') return 'Sin conexion. Revisa la red e intenta de nuevo.';
  }
  return err?.message || 'No se pudo iniciar sesion.';
}

/* ================= estructura ================= */

let shellRefs = null;

async function renderShell(route) {
  const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  const allowed = NAV.filter((item) => item.key && item.roles.includes(session.user.role));
  const target = route || (location.hash.slice(1) || 'caja');
  const active = allowed.some((a) => a.key === target) ? target : allowed[0].key;

  const nav = h('nav', { class: 'rail__nav' });
  for (const item of NAV) {
    if (item.group) {
      if (NAV.slice(NAV.indexOf(item) + 1).some((n) => n.key && n.roles.includes(session.user.role))) {
        nav.append(h('div', { class: 'rail__group', text: item.group }));
      }
      continue;
    }
    if (!item.roles.includes(session.user.role)) continue;
    nav.append(
      h(
        'a',
        {
          class: `rail__link${item.key === active ? ' is-active' : ''}`,
          href: `#${item.key}`,
          title: item.label,
          onClick: () => shell.classList.remove('is-open')
        },
        icon(ICONS[item.icon], 19),
        h('span', { text: item.label })
      )
    );
  }

  const title = h('h1', { text: '' });
  const subtitle = h('div', { class: 'topbar__sub', text: '' });
  const periodChip = h('div', { class: 'chip', hidden: true });
  const view = h('main', { class: 'view' });

  const toggle = h(
    'button',
    {
      class: 'icon-btn',
      'aria-label': 'Mostrar u ocultar el panel',
      onClick: () => {
        if (window.matchMedia('(max-width: 720px)').matches) {
          shell.classList.toggle('is-open');
          return;
        }
        shell.classList.toggle('is-collapsed');
        localStorage.setItem(COLLAPSE_KEY, shell.classList.contains('is-collapsed') ? '1' : '0');
      }
    },
    icon(ICONS.menu, 18)
  );

  const shell = h(
    'div',
    { class: `shell${collapsed ? ' is-collapsed' : ''}` },
    h(
      'aside',
      { class: 'rail' },
      h(
        'div',
        { class: 'rail__head' },
        h('div', { class: 'rail__badge', text: 'CF' }),
        h('div', { class: 'rail__title' }, h('strong', { text: 'Cafeteria' }), h('span', { text: 'caja y credito' }))
      ),
      nav,
      h(
        'div',
        { class: 'rail__foot' },
        h(
          'div',
          { class: 'rail__who' },
          h('strong', { text: session.user.full_name }),
          h('span', { text: session.user.role === 'admin' ? 'administrador' : 'cajero' })
        ),
        h(
          'button',
          {
            class: 'rail__out',
            onClick: async () => {
              await logout();
              location.hash = '';
              renderGate();
            }
          },
          h('span', { text: 'Cerrar sesion' })
        )
      )
    ),
    h(
      'div',
      { class: 'main' },
      h(
        'header',
        { class: 'topbar' },
        toggle,
        h('div', null, title, subtitle),
        h('div', { class: 'topbar__right' }, periodChip)
      ),
      view
    )
  );

  root.replaceChildren(shell);
  shellRefs = { view, title, subtitle, periodChip };

  loadPeriodChip();
  await mount(active);
}

async function loadPeriodChip() {
  try {
    const period = await api.openPeriod();
    const chip = shellRefs.periodChip;
    chip.replaceChildren(
      h('span', { text: 'Planilla' }),
      period
        ? h('strong', { text: `${period.name} · cierra ${dateOnly(period.end_date)}` })
        : h('strong', { style: 'color:var(--sello)', text: 'sin periodo abierto' })
    );
    chip.hidden = false;
  } catch {
    /* el chip es informativo, no interrumpe la caja */
  }
}

async function mount(key) {
  const { view, title, subtitle } = shellRefs;
  view.replaceChildren(h('div', { class: 'empty', text: 'Cargando…' }));

  try {
    const mod = await MODULES[key]();
    title.textContent = mod.meta.title;
    subtitle.textContent = mod.meta.subtitle;
    view.replaceChildren();
    await mod.render(view);
    for (const link of document.querySelectorAll('.rail__link')) {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${key}`);
    }
  } catch (err) {
    view.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('strong', { text: 'No se pudo abrir esta pantalla' }),
        h('div', { text: err.message }),
        h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn btn--ghost btn--sm', text: 'Intentar de nuevo', onClick: () => mount(key) }))
      )
    );
  }
}

window.addEventListener('hashchange', () => {
  const key = location.hash.slice(1);
  if (!shellRefs || !MODULES[key]) return;
  const item = NAV.find((n) => n.key === key);
  if (!item?.roles.includes(session.user?.role)) return;
  mount(key);
});

/* ================= arranque ================= */

root.replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'gate__art' }, h('div', { class: 'gate__note', text: 'Abriendo la caja…' })), h('div', { class: 'gate__panel' })));

watchAuth(async (fbUser) => {
  if (!fbUser) {
    session.user = null;
    renderGate();
    return;
  }
  if (session.user) return;
  try {
    await loadProfile(fbUser);
    renderShell();
  } catch (err) {
    await logout();
    renderGate();
    toast(err.message, 'error');
  }
});
