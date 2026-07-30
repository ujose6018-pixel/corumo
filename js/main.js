import {
  session,
  login,
  logout,
  watchAuth,
  loadProfile,
  needsSetup,
  createFirstAdmin,
  sha256,
  SETUP_KEY_HASH,
  LOGIN_DOMAIN
} from './firebase.js';
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

/**
 * Una sola pantalla para las dos situaciones. Si la base todavia no tiene
 * administrador, las credenciales que se escriban aqui crean esa cuenta.
 */
function renderGate(firstRun = false) {
  const usuario = input({
    value: firstRun ? '' : session.remembered,
    placeholder: 'usuario',
    autocomplete: 'username'
  });
  const clave = input({
    type: 'password',
    placeholder: firstRun ? 'define tu contrasena' : 'contrasena',
    autocomplete: firstRun ? 'new-password' : 'current-password'
  });
  const clave2 = input({ type: 'password', placeholder: 'repite la contrasena', autocomplete: 'new-password' });
  const nombre = input({ value: 'Administrador', placeholder: 'Nombre completo' });
  const llave = input({ type: 'password', placeholder: 'clave de instalacion', autocomplete: 'off' });
  const recordar = checkbox('Recordar mi usuario en este equipo', firstRun ? true : !!session.remembered);
  const errorBox = h('div', { class: 'error-note', hidden: true });
  const boton = h('button', {
    class: 'btn btn--primary btn--lg btn--block',
    text: firstRun ? 'Crear administrador y entrar' : 'Entrar'
  });

  const etiqueta = boton.textContent;
  const fail = (msg) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    boton.disabled = false;
    boton.textContent = etiqueta;
  };

  const submit = async () => {
    errorBox.hidden = true;
    boton.disabled = true;
    boton.textContent = firstRun ? 'Creando…' : 'Verificando…';
    const recordarme = recordar.querySelector('input').checked;

    try {
      if (firstRun) {
        if (SETUP_KEY_HASH && (await sha256(llave.value.trim())) !== SETUP_KEY_HASH) {
          return fail('La clave de instalacion no es correcta.');
        }
        if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(usuario.value.trim())) {
          return fail('El usuario admite de 3 a 40 letras, numeros, punto, guion o arroba.');
        }
        if (clave.value.length < 6) return fail('La contrasena necesita al menos 6 caracteres.');
        if (clave.value !== clave2.value) return fail('Las dos contrasenas no coinciden.');
        if (!nombre.value.trim()) return fail('Escribe el nombre que aparecera en los vales.');

        await createFirstAdmin({
          username: usuario.value.trim(),
          password: clave.value,
          fullName: nombre.value.trim(),
          remember: recordarme
        });
      } else {
        await login(usuario.value.trim(), clave.value, recordarme);
      }
      renderShell();
    } catch (err) {
      fail(translate(err));
      if (!firstRun) {
        clave.value = '';
        clave.focus();
      }
    }
  };

  boton.addEventListener('click', submit);
  for (const el of [usuario, clave, clave2, nombre, llave]) {
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
        h('div', { class: 'eyebrow', style: 'color:#7fc9a5', text: firstRun ? 'Primer arranque' : 'Cafeteria de empresa' }),
        firstRun
          ? h('div', { class: 'gate__mark' }, 'Instalar', h('span', null, 'la caja'))
          : h('div', { class: 'gate__mark' }, 'Caja y', h('span', null, 'credito')),
        h(
          'div',
          { class: 'gate__note' },
          firstRun
            ? 'Esta pantalla aparece una sola vez. La cuenta que crees aqui queda como administradora y podra dar de alta a los cajeros. Despues, esta puerta se cierra sola.'
            : 'Cobro en efectivo o cargo a la cuenta del trabajador. Cada consumo queda anotado y al cerrar el corte sale el archivo de descuentos para planilla.'
        )
      ),
      h(
        'div',
        { class: 'gate__panel' },
        h('h1', { text: firstRun ? 'Crear administrador' : 'Iniciar sesion' }),
        h('p', {
          class: 'lede',
          text: firstRun
            ? 'Escribe el usuario y la contrasena con los que vas a entrar de ahora en adelante.'
            : 'Escribe el usuario que te dio el administrador.'
        }),
        errorBox,
        field('Usuario', usuario, firstRun ? `Solo el usuario, sin correo. Se guarda como usuario@${LOGIN_DOMAIN}` : null),
        firstRun && SETUP_KEY_HASH ? field('Clave de instalacion', llave) : null,
        field('Contrasena', clave),
        firstRun ? field('Repetir contrasena', clave2) : null,
        firstRun ? field('Nombre completo', nombre, 'Aparece en los vales y en la bitacora') : null,
        recordar,
        boton,
        h('div', {
          class: 'hint',
          text: firstRun
            ? 'La contrasena la guarda Firebase Authentication. No queda en el codigo ni en Firestore.'
            : 'Si olvidaste tu contrasena, pidele al administrador que te envie el correo de restablecimiento.'
        })
      )
    )
  );

  (firstRun || !session.remembered ? usuario : clave).focus();
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
  if (code === 'auth/email-already-in-use') return 'Ese usuario ya tiene cuenta de acceso.';
  if (code === 'auth/weak-password') return 'La contrasena necesita al menos 6 caracteres.';
  if (code === 'auth/operation-not-allowed') {
    return 'Activa el proveedor Correo/contrasena en Firebase Authentication.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Agrega este dominio en Authentication → Settings → Authorized domains.';
  }
  if (code === 'permission-denied') {
    return 'Firestore rechazo la operacion. Revisa que las reglas esten publicadas y que no exista ya un administrador.';
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

let setupChecked = false;

async function gateOrSetup() {
  if (!setupChecked) {
    setupChecked = true;
    if (await needsSetup()) {
      renderGate(true);
      return;
    }
  }
  renderGate();
}

watchAuth(async (fbUser) => {
  if (!fbUser) {
    session.user = null;
    gateOrSetup();
    return;
  }
  if (session.user) return;
  try {
    await loadProfile(fbUser);
    renderShell();
  } catch (err) {
    await logout();
    await gateOrSetup();
    toast(err.message, 'error');
  }
});
