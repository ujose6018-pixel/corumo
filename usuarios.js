import { api, session, sendReset } from '../store.js';
import { h, field, input, select, checkbox, table, card, tag, toast, modal, dateTime } from '../ui.js';

export const meta = { title: 'Usuarios del sistema', subtitle: 'Quien puede entrar y con que permisos' };

export async function render(host) {
  const body = h('div');
  const bitacora = h('div');

  host.append(
    card('Cuentas de acceso', h('button', { class: 'btn btn--primary btn--sm', text: 'Nuevo usuario', onClick: () => edit(null) }), body, true),
    card('Bitacora', h('button', { class: 'btn btn--ghost btn--sm', text: 'Actualizar', onClick: loadAudit }), bitacora, true)
  );

  await load();
  await loadAudit();

  async function load() {
    const rows = await api.users();
    body.replaceChildren(
      table(
        ['Usuario', 'Nombre', 'Perfil', 'Ultimo ingreso', 'Estado', ''],
        rows.map((u) =>
          h(
            'tr',
            null,
            h('td', null, h('span', { class: 'mono', text: u.username })),
            h('td', { text: u.full_name }),
            h('td', null, u.role === 'admin' ? tag('administrador', 'sello') : tag('cajero', 'verde')),
            h('td', { text: u.last_login_at ? dateTime(u.last_login_at) : 'nunca' }),
            h('td', null, u.active ? tag('activa', 'verde') : tag('inhabilitada', 'ambar')),
            h('td', { class: 'actions' }, h('button', { class: 'btn btn--ghost btn--sm', text: 'Editar', onClick: () => edit(u) }))
          )
        )
      )
    );
  }

  async function loadAudit() {
    const rows = await api.auditLog({ limit: 120 });
    bitacora.replaceChildren(
      table(
        ['Fecha', 'Usuario', 'Accion', 'Sobre', 'Detalle'],
        rows.map((a) =>
          h(
            'tr',
            null,
            h('td', { text: dateTime(a.created_at) }),
            h('td', { text: a.user || '—' }),
            h('td', null, tag(a.action.replace(/_/g, ' '))),
            h('td', { text: a.entity ? `${a.entity} ${a.entity_id ?? ''}`.trim() : '—' }),
            h('td', { text: a.detail || '—' })
          )
        ),
        'Sin actividad registrada.'
      )
    );
  }

  function edit(user) {
    const isNew = !user;
    const username = input({ value: user?.username || '', placeholder: 'caja2', disabled: !isNew });
    const name = input({ value: user?.full_name || '', placeholder: 'Nombre completo' });
    const role = select(
      [
        { value: 'cajero', label: 'Cajero', selected: user?.role === 'cajero' },
        { value: 'admin', label: 'Administrador', selected: user?.role === 'admin' }
      ],
      {}
    );
    const password = input({ type: 'password', placeholder: 'Minimo 6 caracteres' });
    const active = checkbox('Puede iniciar sesion', user ? !!user.active : true);

    const dialog = modal({
      title: isNew ? 'Nuevo usuario' : user.username,
      body: h(
        'div',
        { class: 'form-grid' },
        field('Usuario', username, isNew ? 'Letras, numeros, punto o guion' : 'El usuario no se puede cambiar'),
        field('Perfil', role, 'El cajero cobra, gestiona inventario, precios y cuentas'),
        h('div', { class: 'span-2' }, field('Nombre completo', name)),
        isNew
          ? h('div', { class: 'span-2' }, field('Contrasena', password, 'El usuario la puede cambiar despues en Ajustes'))
          : h('div', { class: 'span-2 hint' }, 'Las contrasenas las administra Firebase Authentication. Para reponer una, envia el correo de restablecimiento.'),
        h('div', { class: 'span-2' }, active)
      ),
      wide: true,
      footer: [
        !isNew
          ? h('button', {
              class: 'btn btn--ghost',
              text: 'Enviar restablecimiento',
              onClick: async () => {
                try {
                  await sendReset(user.username);
                  toast(`Correo de restablecimiento enviado a ${user.username}`);
                } catch (err) {
                  toast(err.message, 'error');
                }
              }
            })
          : null,
        h('button', { class: 'btn btn--ghost', text: 'Cancelar', onClick: () => dialog.close() }),
        h('button', {
          class: 'btn btn--primary',
          text: isNew ? 'Crear usuario' : 'Guardar cambios',
          onClick: async () => {
            const payload = {
              full_name: name.value.trim(),
              role: role.value,
              active: active.querySelector('input').checked
            };
            try {
              if (isNew) await api.createUser({ ...payload, username: username.value.trim(), password: password.value });
              else await api.updateUser(user.id, payload);
              dialog.close();
              toast(isNew ? 'Usuario creado' : 'Cambios guardados');
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
