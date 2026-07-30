import {
  dbf,
  auth,
  toEmail,
  loadProfile,
  SETUP_KEY_HASH
} from './firebase.js';
import {
  doc,
  getDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { h, field, input } from './ui.js';

const INSTALL_DOC = () => doc(dbf, 'config', 'instalacion');

/**
 * La instalacion se marca con un documento centinela. Mientras no exista, las
 * reglas permiten crear un unico administrador; despues esa puerta queda cerrada
 * para siempre porque el documento no se puede modificar ni borrar.
 */
export async function needsSetup() {
  try {
    const snap = await getDoc(INSTALL_DOC());
    return !snap.exists();
  } catch {
    // Si ni siquiera se puede leer, asumimos que ya hay instalacion y que el
    // problema es de reglas o de red. El login normal dara el mensaje correcto.
    return false;
  }
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function renderSetup(root, onReady) {
  const clave = input({ type: 'password', placeholder: 'clave de instalacion', autocomplete: 'off' });
  const usuario = input({ value: 'admin', placeholder: 'admin', autocomplete: 'off' });
  const nombre = input({ value: 'Administrador', placeholder: 'Nombre completo' });
  const pass = input({ type: 'password', placeholder: 'minimo 6 caracteres', autocomplete: 'new-password' });
  const pass2 = input({ type: 'password', placeholder: 'repite la contrasena', autocomplete: 'new-password' });
  const errorBox = h('div', { class: 'error-note', hidden: true });
  const boton = h('button', { class: 'btn btn--primary btn--lg btn--block', text: 'Crear administrador' });

  const fail = (msg) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Crear administrador';
  };

  boton.addEventListener('click', async () => {
    errorBox.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Creando…';

    if ((await sha256(clave.value.trim())) !== SETUP_KEY_HASH) {
      return fail('La clave de instalacion no es correcta.');
    }
    if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(usuario.value.trim())) {
      return fail('El usuario admite de 3 a 40 letras, numeros, punto, guion o arroba.');
    }
    if (!nombre.value.trim()) return fail('Escribe el nombre completo.');
    if (pass.value.length < 6) return fail('La contrasena necesita al menos 6 caracteres.');
    if (pass.value !== pass2.value) return fail('Las dos contrasenas no coinciden.');

    const email = toEmail(usuario.value.trim());

    try {
      await setPersistence(auth, browserLocalPersistence);

      // Si la cuenta de acceso ya existe (por un intento anterior), se reutiliza.
      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass.value);
        uid = cred.user.uid;
      } catch (err) {
        if (err.code !== 'auth/email-already-in-use') throw err;
        const cred = await signInWithEmailAndPassword(auth, email, pass.value);
        uid = cred.user.uid;
      }

      // Perfil y centinela en una sola escritura: las reglas exigen que vayan juntos.
      const batch = writeBatch(dbf);
      batch.set(doc(dbf, 'usuarios', uid), {
        usuario: usuario.value.trim(),
        nombre: nombre.value.trim(),
        rol: 'admin',
        activo: true,
        creado: new Date().toISOString()
      });
      batch.set(INSTALL_DOC(), {
        completada: true,
        fecha: new Date().toISOString(),
        porUid: uid
      });
      await batch.commit();

      localStorage.setItem('cafeteria.usuario', usuario.value.trim());
      await loadProfile(auth.currentUser);
      onReady();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'permission-denied') {
        return fail('Firestore rechazo la instalacion. Puede que ya exista un administrador, o que falten las reglas publicadas.');
      }
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        return fail('Ese usuario ya tiene cuenta de acceso con otra contrasena. Usa la que le corresponde u otro nombre de usuario.');
      }
      if (code === 'auth/operation-not-allowed') {
        return fail('Activa el proveedor Correo/contrasena en Firebase Authentication.');
      }
      if (code === 'auth/unauthorized-domain') {
        return fail('Agrega este dominio en Authentication → Settings → Authorized domains.');
      }
      return fail(err.message || 'No se pudo completar la instalacion.');
    }
  });

  for (const el of [clave, usuario, nombre, pass, pass2]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') boton.click();
    });
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'gate' },
      h(
        'div',
        { class: 'gate__art' },
        h('div', { class: 'eyebrow', style: 'color:#7fc9a5', text: 'Primer arranque' }),
        h('div', { class: 'gate__mark' }, 'Instalar', h('span', null, 'la caja')),
        h(
          'div',
          { class: 'gate__note' },
          'Esta pantalla aparece una sola vez, mientras la base no tenga administrador. ',
          'Al terminar, la puerta se cierra sola y nadie mas puede volver a usarla.'
        )
      ),
      h(
        'div',
        { class: 'gate__panel' },
        h('h1', { text: 'Crear administrador' }),
        h('p', { class: 'lede', text: 'Esta cuenta va a poder crear cajeros, cerrar planilla y anular ventas.' }),
        errorBox,
        field('Clave de instalacion', clave, 'La que definiste en js/firebase.js'),
        h('div', { class: 'form-grid' }, field('Usuario', usuario), field('Nombre completo', nombre)),
        h('div', { class: 'form-grid' }, field('Contrasena', pass), field('Repetir contrasena', pass2)),
        boton,
        h('div', {
          class: 'hint',
          text: 'La contrasena la guarda Firebase Authentication, nunca queda en el codigo ni en Firestore.'
        })
      )
    )
  );

  clave.focus();
}
