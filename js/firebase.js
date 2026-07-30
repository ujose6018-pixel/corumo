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
  addDoc
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
 * Huella SHA-256 de la clave de instalacion. Se usa una sola vez, en el primer
 * arranque, para que un extrano no gane la carrera y se cree el administrador.
 * No es la contrasena del admin: esa la guarda Firebase Authentication.
 * Para cambiarla, en la consola del navegador:
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU CLAVE'))
 *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
 */
export const SETUP_KEY_HASH = '131ba158c3d7d9021c3ae05b9175feb99ce1d08789494af36325e4f06eeaaeb2';

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
