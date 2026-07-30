import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCeAxwABNlmLHByZWsE6-_XBNrkFpSf2pQ',
  authDomain: 'corumo2.firebaseapp.com',
  projectId: 'corumo2',
  storageBucket: 'corumo2.firebasestorage.app',
  messagingSenderId: '905516372088',
  appId: '1:905516372088:web:c2f8eb8c4a001e35431d8d'
};

/**
 * Clave opcional para el primer ingreso. Vacia significa que la primera persona
 * que entre queda como administradora con el usuario y la contrasena que escriba.
 *
 * Si prefieres una puerta con llave, pon aqui la huella SHA-256 de una frase.
 * En la consola del navegador:
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU FRASE'))
 *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
 * La huella no es reversible: quien lea el codigo no puede sacar la frase.
 */
export const SETUP_KEY_HASH = '';

/** Dominio interno para que el personal escriba solo su usuario, no un correo largo. */
export const LOGIN_DOMAIN = 'corumo2.local';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbf = getFirestore(app);

const REMEMBER_KEY = 'cafeteria.usuario';

export const toEmail = (value) => {
  const v = String(value || '').trim();
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`;
};

export const fromEmail = (email) => String(email || '').replace(`@${LOGIN_DOMAIN}`, '');

/** Perfil cargado una vez por sesion: rol, nombre y estado. */
export const session = {
  user: null,
  get remembered() {
    return localStorage.getItem(REMEMBER_KEY) || '';
  },
  is(...roles) {
    return !!this.user && roles.includes(this.user.role);
  }
};

export async function loadProfile(fbUser) {
  const snap = await getDoc(doc(dbf, 'usuarios', fbUser.uid));
  if (!snap.exists()) {
    throw new Error('Tu cuenta existe pero no tiene perfil asignado. Pidele al administrador que la registre.');
  }
  const data = snap.data();
  if (data.activo !== true) throw new Error('Esta cuenta esta inhabilitada.');

  session.user = {
    id: fbUser.uid,
    email: fbUser.email,
    username: data.usuario || fromEmail(fbUser.email),
    full_name: data.nombre || fromEmail(fbUser.email),
    role: data.rol
  };
  return session.user;
}

export async function login(username, password, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
  const profile = await loadProfile(cred.user);

  if (remember) localStorage.setItem(REMEMBER_KEY, String(username).trim());
  else localStorage.removeItem(REMEMBER_KEY);

  updateDoc(doc(dbf, 'usuarios', cred.user.uid), { ultimoIngreso: new Date().toISOString() }).catch(() => {});
  log('login', 'usuarios', cred.user.uid);
  return profile;
}

/** Mientras no exista el centinela, la base todavia no tiene administrador. */
export async function needsSetup() {
  try {
    const snap = await getDoc(doc(dbf, 'config', 'instalacion'));
    return !snap.exists();
  } catch {
    // Si ni leerlo se puede, el problema es de reglas o de red: que siga el login normal.
    return false;
  }
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Primer ingreso: crea la cuenta de acceso con las credenciales escritas y la
 * deja como administradora. El perfil y el centinela se escriben en un solo
 * lote porque las reglas exigen que vayan juntos; despues de eso la puerta
 * queda cerrada y solo un administrador puede crear usuarios.
 */
export async function createFirstAdmin({ username, password, fullName, remember }) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const email = toEmail(username);

  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
  } catch (err) {
    // Si la cuenta quedo a medias en un intento anterior, se reutiliza.
    if (err.code !== 'auth/email-already-in-use') throw err;
    const cred = await signInWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
  }

  const batch = writeBatch(dbf);
  batch.set(doc(dbf, 'usuarios', uid), {
    usuario: username.trim(),
    nombre: fullName.trim(),
    rol: 'admin',
    activo: true,
    creado: new Date().toISOString()
  });
  batch.set(doc(dbf, 'config', 'instalacion'), {
    completada: true,
    fecha: new Date().toISOString(),
    porUid: uid
  });
  await batch.commit();

  if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
  return loadProfile(auth.currentUser);
}

export async function logout() {
  session.user = null;
  await signOut(auth);
}

export const watchAuth = (fn) => onAuthStateChanged(auth, fn);

export async function changeOwnPassword(current, next) {
  const cred = EmailAuthProvider.credential(auth.currentUser.email, current);
  await reauthenticateWithCredential(auth.currentUser, cred);
  await updatePassword(auth.currentUser, next);
  log('cambio_password', 'usuarios', auth.currentUser.uid);
}

export const sendReset = (username) => sendPasswordResetEmail(auth, toEmail(username));

/**
 * Crea la cuenta de acceso en una instancia aparte de Firebase para no
 * cerrar la sesion del administrador que la esta dando de alta.
 */
export async function createLoginAccount(username, password) {
  const secondary = initializeApp(firebaseConfig, `alta-${Date.now()}`);
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, toEmail(username), password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    // La instancia queda huerfana pero sin sesion activa; el navegador la descarta.
  }
}

export function log(accion, entidad, entidadId, detalle) {
  if (!session.user) return Promise.resolve();
  return addDoc(collection(dbf, 'bitacora'), {
    uid: session.user.id,
    usuario: session.user.full_name,
    accion,
    entidad: entidad || null,
    entidadId: entidadId ? String(entidadId) : null,
    detalle: detalle || null,
    fecha: new Date().toISOString()
  }).catch(() => {});
}

export { doc, getDoc, setDoc, updateDoc, collection, addDoc };
