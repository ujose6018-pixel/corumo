import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as qLimit,
  runTransaction,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

import { dbf, session, log, createLoginAccount, sendReset, changeOwnPassword } from './firebase.js';

export { session, log, sendReset, changeOwnPassword };

const C = {
  usuarios: collection(dbf, 'usuarios'),
  config: collection(dbf, 'config'),
  categorias: collection(dbf, 'categorias'),
  productos: collection(dbf, 'productos'),
  trabajadores: collection(dbf, 'trabajadores'),
  ventas: collection(dbf, 'ventas'),
  movCuenta: collection(dbf, 'movimientos_cuenta'),
  movStock: collection(dbf, 'movimientos_stock'),
  periodos: collection(dbf, 'periodos'),
  bitacora: collection(dbf, 'bitacora')
};

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowISO = () => new Date().toISOString();
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Traduce el mensaje tecnico de Firebase a algo que sirva en la caja. */
function friendly(err) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return new Error('Tu perfil no tiene permiso para esta accion, o el dato no paso las reglas de Firestore.');
  }
  if (code === 'unavailable' || code === 'failed-precondition') {
    return new Error('Sin conexion con Firestore. Revisa la red e intenta de nuevo.');
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return new Error('Usuario o contrasena incorrectos.');
  }
  if (code === 'auth/too-many-requests') {
    return new Error('Demasiados intentos. Espera un momento antes de volver a probar.');
  }
  if (code === 'auth/email-already-in-use') {
    return new Error('Ese nombre de usuario ya tiene cuenta de acceso.');
  }
  if (code === 'auth/weak-password') {
    return new Error('La contrasena necesita al menos 6 caracteres.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

const guard = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    throw friendly(err);
  }
};

/* ================= traductores ================= */
// Firestore guarda en espanol porque las reglas de seguridad validan esos campos.
// Las vistas trabajan con esta forma normalizada.

let catCache = [];

const mapCategory = (d) => ({ id: d.id, name: d.nombre, kind: d.tipo, sort: d.orden ?? 100, active: d.activo !== false });

function mapProduct(d) {
  const cat = catCache.find((c) => c.id === d.categoriaId);
  return {
    id: d.id,
    sku: d.sku || '',
    name: d.nombre,
    category_id: d.categoriaId,
    category: cat?.name || 'Sin categoria',
    kind: cat?.kind || '',
    price: round(d.precio),
    cost: round(d.costo),
    track_stock: d.controlaStock ? 1 : 0,
    stock: round(d.stock),
    min_stock: round(d.minimo),
    active: d.activo !== false ? 1 : 0
  };
}

const mapEmployee = (d) => ({
  id: d.id,
  code: d.codigo,
  full_name: d.nombre,
  department: d.depto || '',
  credit_limit: round(d.limite),
  balance: round(d.saldo),
  active: d.activo !== false ? 1 : 0
});

const mapSale = (d) => ({
  id: d.id,
  folio: d.folio,
  method: d.metodo,
  meal: d.tiempo || '',
  status: d.estado,
  created_at: d.fecha,
  employee_id: d.trabajadorId || null,
  employee: d.trabajadorNombre || '',
  employee_code: d.trabajadorCodigo || '',
  cashier: d.cajero || '',
  subtotal: round(d.subtotal),
  tax: round(d.isv),
  total: round(d.total),
  received: round(d.recibido),
  change_due: round(d.cambio),
  note: d.nota || '',
  items: (d.items || []).map((i) => ({
    product_id: i.productoId,
    name: i.nombre,
    unit_price: round(i.precio),
    qty: round(i.cantidad),
    line_total: round(i.importe)
  }))
});

const mapAccountMove = (d) => ({
  id: d.id,
  type: d.tipo,
  amount: round(d.monto),
  balance_after: round(d.saldoDespues),
  note: d.nota || '',
  user: d.usuario || '',
  created_at: d.fecha,
  folio: d.folio || null,
  period_id: d.periodoId || null,
  employee_id: d.trabajadorId
});

const mapStockMove = (d) => ({
  id: d.id,
  product: d.producto,
  product_id: d.productoId,
  type: d.tipo,
  qty: round(d.cantidad),
  stock_after: round(d.stockDespues),
  note: d.nota || '',
  user: d.usuario || '',
  created_at: d.fecha
});

const mapPeriod = (d) => ({
  id: d.id,
  name: d.nombre,
  start_date: d.inicio,
  end_date: d.fin,
  status: d.estado,
  closed_at: d.cerrado || null
});

const mapUser = (d) => ({
  id: d.id,
  username: d.usuario || '',
  full_name: d.nombre,
  role: d.rol,
  active: d.activo !== false ? 1 : 0,
  last_login_at: d.ultimoIngreso || null
});

function folioFor(date) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${String(date.getFullYear()).slice(2)}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const time = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `V${stamp}-${time}`;
}

/* ================= api ================= */

export const api = {
  /* ---------- categorias ---------- */

  categories: guard(async () => {
    catCache = rows(await getDocs(C.categorias)).map(mapCategory).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    return catCache;
  }),

  createCategory: guard(async (data) => {
    const ref = await addDoc(C.categorias, {
      nombre: data.name.trim(),
      tipo: data.kind,
      orden: Number(data.sort) || 100,
      activo: true
    });
    log('crear_categoria', 'categorias', ref.id, data.name);
    return { id: ref.id };
  }),

  updateCategory: guard(async (id, data) => {
    const patch = {};
    if (data.name !== undefined) patch.nombre = data.name.trim();
    if (data.kind !== undefined) patch.tipo = data.kind;
    if (data.sort !== undefined) patch.orden = Number(data.sort);
    if (data.active !== undefined) patch.activo = !!data.active;
    // Las reglas exigen nombre y tipo tambien al editar.
    const snap = await getDoc(doc(dbf, 'categorias', id));
    await updateDoc(doc(dbf, 'categorias', id), { nombre: snap.data().nombre, tipo: snap.data().tipo, ...patch });
    return { id };
  }),

  /* ---------- productos ---------- */

  products: guard(async (params = {}) => {
    if (!catCache.length) await api.categories();
    let list = rows(await getDocs(C.productos)).map(mapProduct);

    if (params.active !== 'all') list = list.filter((p) => p.active);
    if (params.category) list = list.filter((p) => p.category_id === params.category);
    if (params.low === '1') list = list.filter((p) => p.track_stock && p.stock <= p.min_stock);
    if (params.q) {
      const q = String(params.q).toLowerCase();
      list = list.filter((p) => (p.name + ' ' + p.sku).toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const ca = catCache.find((c) => c.id === a.category_id)?.sort ?? 999;
      const cb = catCache.find((c) => c.id === b.category_id)?.sort ?? 999;
      return ca - cb || a.name.localeCompare(b.name);
    });
  }),

  createProduct: guard(async (data) => {
    const stock = data.track_stock ? round(data.stock) : 0;
    const ref = await addDoc(C.productos, {
      sku: (data.sku || '').trim().toUpperCase(),
      nombre: data.name.trim(),
      categoriaId: data.category_id,
      precio: round(data.price),
      costo: round(data.cost),
      controlaStock: !!data.track_stock,
      stock,
      minimo: round(data.min_stock),
      activo: data.active !== false,
      creado: nowISO()
    });
    if (stock > 0) {
      await addDoc(C.movStock, {
        productoId: ref.id,
        producto: data.name.trim(),
        tipo: 'entrada',
        cantidad: stock,
        stockDespues: stock,
        costoUnitario: round(data.cost),
        nota: 'Existencia inicial',
        uid: session.user.id,
        usuario: session.user.full_name,
        fecha: nowISO()
      });
    }
    log('crear_producto', 'productos', ref.id, data.name);
    return { id: ref.id };
  }),

  updateProduct: guard(async (id, data) => {
    const ref = doc(dbf, 'productos', id);
    const prev = (await getDoc(ref)).data();
    await updateDoc(ref, {
      sku: (data.sku || '').trim().toUpperCase(),
      nombre: data.name.trim(),
      categoriaId: data.category_id,
      precio: round(data.price),
      costo: round(data.cost),
      controlaStock: !!data.track_stock,
      stock: round(prev.stock),
      minimo: round(data.min_stock),
      activo: data.active !== false,
      actualizado: nowISO()
    });
    if (round(prev.precio) !== round(data.price)) {
      log('cambio_precio', 'productos', id, `${prev.precio} -> ${round(data.price)}`);
    }
    return { id };
  }),

  removeProduct: guard(async (id) => {
    const ref = doc(dbf, 'productos', id);
    const prev = (await getDoc(ref)).data();
    await updateDoc(ref, { ...prev, activo: false, actualizado: nowISO() });
    log('desactivar_producto', 'productos', id);
    return { ok: true };
  }),

  /* ---------- inventario ---------- */

  moveStock: guard(async (id, data) => {
    const ref = doc(dbf, 'productos', id);
    const result = await runTransaction(dbf, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('El producto ya no existe.');
      const p = snap.data();
      if (!p.controlaStock) throw new Error('Este producto se prepara al momento, no lleva existencias.');

      const qty = Number(data.qty);
      if (!Number.isFinite(qty)) throw new Error('Escribe una cantidad valida.');

      let delta;
      if (data.type === 'entrada') delta = Math.abs(qty);
      else if (data.type === 'salida') delta = -Math.abs(qty);
      else delta = round(qty - p.stock);

      const after = round(p.stock + delta);
      if (after < 0) throw new Error(`Solo hay ${p.stock} en existencia.`);

      tx.update(ref, { ...p, stock: after, actualizado: nowISO() });
      tx.set(doc(C.movStock), {
        productoId: id,
        producto: p.nombre,
        tipo: data.type,
        cantidad: delta,
        stockDespues: after,
        costoUnitario: data.unit_cost ? round(data.unit_cost) : null,
        nota: data.note || null,
        uid: session.user.id,
        usuario: session.user.full_name,
        fecha: nowISO()
      });
      return { delta, after };
    });
    log(`inventario_${data.type}`, 'productos', id, `${result.delta} -> ${result.after}`);
    return result;
  }),

  stockMovements: guard(async (params = {}) => {
    const clauses = [];
    if (params.product_id) clauses.push(where('productoId', '==', params.product_id));
    clauses.push(orderBy('fecha', 'desc'), qLimit(Number(params.limit) || 200));
    return rows(await getDocs(query(C.movStock, ...clauses))).map(mapStockMove);
  }),

  /* ---------- trabajadores ---------- */

  employees: guard(async (params = {}) => {
    let list = rows(await getDocs(C.trabajadores)).map(mapEmployee);
    if (params.active !== 'all') list = list.filter((e) => e.active);
    if (params.debt === '1') list = list.filter((e) => e.balance > 0.009);
    if (params.q) {
      const q = String(params.q).toLowerCase();
      list = list.filter((e) => (e.code + ' ' + e.full_name + ' ' + e.department).toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }),

  createEmployee: guard(async (data) => {
    const dup = rows(await getDocs(query(C.trabajadores, where('codigo', '==', data.code.trim().toUpperCase()))));
    if (dup.length) throw new Error('Ese codigo de empleado ya esta registrado.');
    const ref = await addDoc(C.trabajadores, {
      codigo: data.code.trim().toUpperCase(),
      nombre: data.full_name.trim(),
      depto: data.department?.trim() || null,
      limite: round(data.credit_limit),
      saldo: 0,
      activo: data.active !== false,
      creado: nowISO(),
      creadoPor: session.user.id
    });
    log('crear_trabajador', 'trabajadores', ref.id, `${data.code} ${data.full_name}`);
    return { id: ref.id };
  }),

  updateEmployee: guard(async (id, data) => {
    const ref = doc(dbf, 'trabajadores', id);
    const prev = (await getDoc(ref)).data();
    await updateDoc(ref, {
      codigo: (data.code ?? prev.codigo).trim().toUpperCase(),
      nombre: (data.full_name ?? prev.nombre).trim(),
      depto: data.department !== undefined ? data.department.trim() || null : prev.depto ?? null,
      limite: data.credit_limit !== undefined ? round(data.credit_limit) : round(prev.limite),
      saldo: round(prev.saldo),
      activo: data.active !== undefined ? !!data.active : prev.activo !== false
    });
    log('editar_trabajador', 'trabajadores', id);
    return { id };
  }),

  statement: guard(async (id, params = {}) => {
    const snap = await getDoc(doc(dbf, 'trabajadores', id));
    const employee = mapEmployee({ id: snap.id, ...snap.data() });
    const movements = rows(
      await getDocs(
        query(C.movCuenta, where('trabajadorId', '==', id), orderBy('fecha', 'desc'), qLimit(Number(params.limit) || 100))
      )
    ).map(mapAccountMove);

    const period = await api.openPeriod();
    const period_total = period
      ? round(
          movements
            .filter((m) => m.period_id === period.id && ['cargo', 'abono'].includes(m.type))
            .reduce((a, b) => a + b.amount, 0)
        )
      : 0;

    return { employee, movements, period: period || { name: 'Sin periodo abierto', id: null }, period_total };
  }),

  addPayment: guard(async (id, data) => {
    const amount = round(data.amount);
    if (!(amount > 0)) throw new Error('El abono debe ser mayor que cero.');
    const period = await api.openPeriod();
    const ref = doc(dbf, 'trabajadores', id);

    return runTransaction(dbf, async (tx) => {
      const snap = await tx.get(ref);
      const e = snap.data();
      if (amount > round(e.saldo)) throw new Error(`El saldo pendiente es L ${round(e.saldo).toFixed(2)}.`);
      const balance = round(e.saldo - amount);

      tx.update(ref, { ...e, saldo: balance });
      tx.set(doc(C.movCuenta), {
        trabajadorId: id,
        periodoId: period?.id || null,
        tipo: 'abono',
        monto: -amount,
        saldoDespues: balance,
        nota: data.note || 'Abono en efectivo',
        uid: session.user.id,
        usuario: session.user.full_name,
        fecha: nowISO()
      });
      log('abono', 'trabajadores', id, String(amount));
      return { ok: true, balance };
    });
  }),

  addAdjustment: guard(async (id, data) => {
    const amount = round(data.amount);
    if (!amount) throw new Error('El ajuste no puede ser cero.');
    if (!data.note?.trim()) throw new Error('Explica el motivo del ajuste.');
    const period = await api.openPeriod();
    const ref = doc(dbf, 'trabajadores', id);

    return runTransaction(dbf, async (tx) => {
      const snap = await tx.get(ref);
      const e = snap.data();
      const balance = round(e.saldo + amount);
      if (balance < 0) throw new Error('El ajuste dejaria el saldo en negativo.');

      tx.update(ref, { ...e, saldo: balance });
      tx.set(doc(C.movCuenta), {
        trabajadorId: id,
        periodoId: period?.id || null,
        tipo: 'ajuste',
        monto: amount,
        saldoDespues: balance,
        nota: data.note.trim(),
        uid: session.user.id,
        usuario: session.user.full_name,
        fecha: nowISO()
      });
      log('ajuste_saldo', 'trabajadores', id, `${amount} / ${data.note}`);
      return { ok: true, balance };
    });
  }),

  /* ---------- ventas ---------- */

  sales: guard(async (params = {}) => {
    const clauses = [];
    if (params.from) clauses.push(where('fecha', '>=', `${params.from}T00:00:00.000Z`));
    if (params.to) clauses.push(where('fecha', '<=', `${params.to}T23:59:59.999Z`));
    clauses.push(orderBy('fecha', 'desc'), qLimit(Number(params.limit) || 200));

    let list = rows(await getDocs(query(C.ventas, ...clauses))).map(mapSale);
    if (params.method) list = list.filter((s) => s.method === params.method);
    if (params.employee_id) list = list.filter((s) => s.employee_id === params.employee_id);
    if (params.q) {
      const q = String(params.q).toLowerCase();
      list = list.filter((s) => (s.folio + ' ' + s.employee).toLowerCase().includes(q));
    }
    return list;
  }),

  sale: guard(async (id) => {
    const snap = await getDoc(doc(dbf, 'ventas', id));
    if (!snap.exists()) throw new Error('Venta no encontrada.');
    return mapSale({ id: snap.id, ...snap.data() });
  }),

  /**
   * Cobro y cargo a cuenta en una sola transaccion: descuenta existencias,
   * sube el saldo del trabajador y deja el rastro en los dos libros.
   */
  createSale: guard(async (payload) => {
    if (!payload.items?.length) throw new Error('Agrega al menos un producto.');

    const settings = await api.settings();
    const taxRate = Number(settings.isv_rate) || 0;
    const included = settings.prices_include_tax !== '0';

    let period = null;
    if (payload.method === 'credito') {
      period = await api.openPeriod();
      if (!period) {
        throw new Error('No hay periodo de planilla abierto. Pidele al administrador que abra uno antes de cargar a cuenta.');
      }
    }

    const saleRef = doc(C.ventas);
    const date = new Date();

    const sale = await runTransaction(dbf, async (tx) => {
      const productRefs = payload.items.map((i) => doc(dbf, 'productos', i.product_id));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
      const empRef = payload.employee_id ? doc(dbf, 'trabajadores', payload.employee_id) : null;
      const empSnap = empRef ? await tx.get(empRef) : null;

      const lines = [];
      let subtotal = 0;

      productSnaps.forEach((snap, idx) => {
        if (!snap.exists()) throw new Error('Un producto del vale ya no existe.');
        const p = snap.data();
        if (p.activo === false) throw new Error(`${p.nombre} esta fuera de venta.`);
        const qty = round(payload.items[idx].qty);
        if (!(qty > 0)) throw new Error('Cantidad invalida en el detalle.');
        if (p.controlaStock && round(p.stock) < qty) {
          throw new Error(`${p.nombre}: solo hay ${round(p.stock)} en existencia.`);
        }
        const importe = round(p.precio * qty);
        subtotal = round(subtotal + importe);
        lines.push({ ref: productRefs[idx], data: p, qty, importe });
      });

      const isv = taxRate ? round(included ? subtotal - subtotal / (1 + taxRate) : subtotal * taxRate) : 0;
      const total = round(included || !taxRate ? subtotal : subtotal + isv);
      const base = round(included ? subtotal - isv : subtotal);

      let recibido = 0;
      let cambio = 0;
      let employee = null;
      let newBalance = 0;

      if (payload.method === 'efectivo') {
        recibido = payload.received === undefined ? total : round(payload.received);
        if (recibido < total) throw new Error('El efectivo recibido es menor que el total.');
        cambio = round(recibido - total);
      } else {
        if (!empSnap?.exists()) throw new Error('Trabajador no encontrado.');
        employee = empSnap.data();
        if (employee.activo === false) throw new Error('La cuenta de este trabajador esta inhabilitada.');
        newBalance = round(employee.saldo + total);
        const lim = round(employee.limite);
        if (lim > 0 && newBalance > lim) {
          throw new Error(
            `${employee.nombre} llegaria a L ${newBalance.toFixed(2)} y su limite es L ${lim.toFixed(2)}.`
          );
        }
      }

      const record = {
        folio: folioFor(date),
        fecha: date.toISOString(),
        metodo: payload.method,
        estado: 'completada',
        tiempo: payload.meal || null,
        trabajadorId: payload.method === 'credito' ? payload.employee_id : null,
        trabajadorNombre: employee?.nombre || null,
        trabajadorCodigo: employee?.codigo || null,
        uid: session.user.id,
        cajero: session.user.full_name,
        subtotal: base,
        isv,
        total,
        recibido,
        cambio,
        nota: payload.note?.trim() || null,
        items: lines.map((l) => ({
          productoId: l.ref.id,
          nombre: l.data.nombre,
          precio: round(l.data.precio),
          cantidad: l.qty,
          importe: l.importe
        }))
      };

      tx.set(saleRef, record);

      for (const l of lines) {
        if (!l.data.controlaStock) continue;
        const after = round(l.data.stock - l.qty);
        tx.update(l.ref, { ...l.data, stock: after });
        tx.set(doc(C.movStock), {
          productoId: l.ref.id,
          producto: l.data.nombre,
          tipo: 'venta',
          cantidad: -l.qty,
          stockDespues: after,
          ventaId: saleRef.id,
          nota: record.folio,
          uid: session.user.id,
          usuario: session.user.full_name,
          fecha: record.fecha
        });
      }

      if (payload.method === 'credito') {
        tx.update(empRef, { ...employee, saldo: newBalance });
        tx.set(doc(C.movCuenta), {
          trabajadorId: payload.employee_id,
          periodoId: period.id,
          ventaId: saleRef.id,
          folio: record.folio,
          tipo: 'cargo',
          monto: total,
          saldoDespues: newBalance,
          nota: `Consumo ${record.folio}`,
          uid: session.user.id,
          usuario: session.user.full_name,
          fecha: record.fecha
        });
      }

      return mapSale({ id: saleRef.id, ...record });
    });

    log('venta', 'ventas', sale.id, `${sale.method} ${sale.total}`);
    return sale;
  }),

  voidSale: guard(async (id, reason) => {
    if (!reason?.trim()) throw new Error('Escribe el motivo de la anulacion.');
    const saleRef = doc(dbf, 'ventas', id);
    const period = await api.openPeriod();

    await runTransaction(dbf, async (tx) => {
      const snap = await tx.get(saleRef);
      if (!snap.exists()) throw new Error('Venta no encontrada.');
      const v = snap.data();
      if (v.estado === 'anulada') throw new Error('Esta venta ya esta anulada.');

      const refs = (v.items || []).map((i) => doc(dbf, 'productos', i.productoId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const empRef = v.trabajadorId ? doc(dbf, 'trabajadores', v.trabajadorId) : null;
      const empSnap = empRef ? await tx.get(empRef) : null;

      snaps.forEach((ps, idx) => {
        if (!ps.exists()) return;
        const p = ps.data();
        if (!p.controlaStock) return;
        const after = round(p.stock + v.items[idx].cantidad);
        tx.update(refs[idx], { ...p, stock: after });
        tx.set(doc(C.movStock), {
          productoId: refs[idx].id,
          producto: p.nombre,
          tipo: 'devolucion',
          cantidad: round(v.items[idx].cantidad),
          stockDespues: after,
          ventaId: id,
          nota: `Anulacion ${v.folio}`,
          uid: session.user.id,
          usuario: session.user.full_name,
          fecha: nowISO()
        });
      });

      if (v.metodo === 'credito' && empSnap?.exists()) {
        const e = empSnap.data();
        const balance = round(e.saldo - v.total);
        tx.update(empRef, { ...e, saldo: Math.max(0, balance) });
        tx.set(doc(C.movCuenta), {
          trabajadorId: v.trabajadorId,
          periodoId: period?.id || null,
          ventaId: id,
          folio: v.folio,
          tipo: 'ajuste',
          monto: -round(v.total),
          saldoDespues: Math.max(0, balance),
          nota: `Anulacion ${v.folio}: ${reason.trim()}`,
          uid: session.user.id,
          usuario: session.user.full_name,
          fecha: nowISO()
        });
      }

      tx.update(saleRef, {
        ...v,
        estado: 'anulada',
        anulada: nowISO(),
        anuladaPor: session.user.id,
        motivoAnulacion: reason.trim()
      });
    });

    log('anular_venta', 'ventas', id, reason);
    return api.sale(id);
  }),

  /* ---------- planilla ---------- */

  openPeriod: guard(async () => {
    const list = rows(await getDocs(query(C.periodos, where('estado', '==', 'abierto'), qLimit(1))));
    return list.length ? mapPeriod(list[0]) : null;
  }),

  periods: guard(async () => {
    const list = rows(await getDocs(C.periodos)).map(mapPeriod);
    return list.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  }),

  createPeriod: guard(async (data) => {
    if (!data.name?.trim() || !data.start_date || !data.end_date) {
      throw new Error('Completa nombre, inicio y cierre.');
    }
    if (data.end_date < data.start_date) throw new Error('La fecha de cierre es anterior al inicio.');
    if (await api.openPeriod()) throw new Error('Cierra el periodo abierto antes de crear otro.');

    const ref = await addDoc(C.periodos, {
      nombre: data.name.trim(),
      inicio: data.start_date,
      fin: data.end_date,
      estado: 'abierto',
      creado: nowISO()
    });
    log('crear_periodo', 'periodos', ref.id, data.name);
    return { id: ref.id };
  }),

  period: guard(async (id) => {
    const snap = await getDoc(doc(dbf, 'periodos', id));
    if (!snap.exists()) throw new Error('Periodo no encontrado.');
    const period = mapPeriod({ id: snap.id, ...snap.data() });

    const moves = rows(await getDocs(query(C.movCuenta, where('periodoId', '==', id)))).map(mapAccountMove);
    const employees = await api.employees({ active: 'all' });

    const grouped = new Map();
    for (const m of moves) {
      if (!['cargo', 'abono', 'ajuste'].includes(m.type)) continue;
      const emp = employees.find((e) => e.id === m.employee_id);
      if (!emp) continue;
      const acc =
        grouped.get(emp.id) ||
        { id: emp.id, code: emp.code, full_name: emp.full_name, department: emp.department, cargos: 0, abonos: 0, ajustes: 0, consumos: 0 };
      if (m.type === 'cargo') {
        acc.cargos = round(acc.cargos + m.amount);
        acc.consumos += 1;
      } else if (m.type === 'abono') acc.abonos = round(acc.abonos - m.amount);
      else acc.ajustes = round(acc.ajustes + m.amount);
      grouped.set(emp.id, acc);
    }

    const list = [...grouped.values()]
      .map((r) => ({ ...r, total: round(r.cargos - r.abonos + r.ajustes) }))
      .filter((r) => Math.abs(r.total) > 0.009)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    return {
      period,
      rows: list,
      totals: {
        empleados: list.length,
        cargos: round(list.reduce((a, b) => a + b.cargos, 0)),
        abonos: round(list.reduce((a, b) => a + b.abonos, 0)),
        descuento: round(list.reduce((a, b) => a + b.total, 0))
      }
    };
  }),

  closePeriod: guard(async (id) => {
    const data = await api.period(id);
    if (data.period.status === 'cerrado') throw new Error('Este periodo ya esta cerrado.');

    const pending = data.rows.filter((r) => r.total > 0);
    let batch = writeBatch(dbf);
    let ops = 0;

    for (const row of pending) {
      const ref = doc(dbf, 'trabajadores', row.id);
      const snap = await getDoc(ref);
      const e = snap.data();
      const balance = round(Math.max(0, round(e.saldo) - row.total));

      batch.update(ref, { ...e, saldo: balance });
      batch.set(doc(C.movCuenta), {
        trabajadorId: row.id,
        periodoId: id,
        tipo: 'descuento',
        monto: -row.total,
        saldoDespues: balance,
        nota: `Descuento aplicado en ${data.period.name}`,
        uid: session.user.id,
        usuario: session.user.full_name,
        fecha: nowISO()
      });
      ops += 2;
      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(dbf);
        ops = 0;
      }
    }

    const pRef = doc(dbf, 'periodos', id);
    const pSnap = await getDoc(pRef);
    batch.update(pRef, {
      ...pSnap.data(),
      estado: 'cerrado',
      cerrado: nowISO(),
      cerradoPor: session.user.id
    });
    await batch.commit();

    log('cerrar_periodo', 'periodos', id, `${pending.length} trabajadores`);
    return { ok: true, aplicados: pending.length };
  }),

  /* ---------- reportes ---------- */

  dashboard: guard(async (params = {}) => {
    const sales = (await api.sales({ from: params.from, to: params.to, limit: 1000 })).filter(
      (s) => s.status === 'completada'
    );
    const employees = await api.employees();
    const products = await api.products();

    const cash = sales.filter((s) => s.method === 'efectivo');
    const credit = sales.filter((s) => s.method === 'credito');
    const sum = (list) => round(list.reduce((a, b) => a + b.total, 0));

    const byHour = new Map();
    const byProduct = new Map();
    const byCategory = new Map();

    for (const s of sales) {
      const hour = new Date(s.created_at).getHours().toString().padStart(2, '0');
      byHour.set(hour, round((byHour.get(hour) || 0) + s.total));
      for (const i of s.items) {
        const p = byProduct.get(i.name) || { name: i.name, qty: 0, total: 0 };
        p.qty = round(p.qty + i.qty);
        p.total = round(p.total + i.line_total);
        byProduct.set(i.name, p);
      }
    }
    for (const s of sales) {
      for (const i of s.items) {
        const prod = products.find((p) => p.id === i.product_id);
        const key = prod?.category || 'Sin categoria';
        byCategory.set(key, round((byCategory.get(key) || 0) + i.line_total));
      }
    }

    return {
      from: params.from,
      to: params.to,
      efectivo: { n: cash.length, total: sum(cash) },
      credito: { n: credit.length, total: sum(credit) },
      ventas: { n: sales.length, total: sum(sales) },
      cartera: round(employees.reduce((a, b) => a + b.balance, 0)),
      deudores: employees.filter((e) => e.balance > 0.009).length,
      por_hora: [...byHour.entries()].sort().map(([hour, total]) => ({ hour, total })),
      top: [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
      por_categoria: [...byCategory.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
      bajo_minimo: products.filter((p) => p.track_stock && p.stock <= p.min_stock),
      periodo: await api.openPeriod()
    };
  }),

  inventoryValue: guard(async () => {
    const products = (await api.products()).filter((p) => p.track_stock);
    const list = products.map((p) => ({ ...p, valor: round(p.stock * p.cost) }));
    return { rows: list, total: round(list.reduce((a, b) => a + b.valor, 0)) };
  }),

  auditLog: guard(async (params = {}) => {
    const list = rows(await getDocs(query(C.bitacora, orderBy('fecha', 'desc'), qLimit(Number(params.limit) || 150))));
    return list.map((a) => ({
      id: a.id,
      user: a.usuario,
      action: a.accion,
      entity: a.entidad,
      entity_id: a.entidadId,
      detail: a.detalle,
      created_at: a.fecha
    }));
  }),

  /* ---------- usuarios del sistema ---------- */

  users: guard(async () => rows(await getDocs(C.usuarios)).map(mapUser).sort((a, b) => a.full_name.localeCompare(b.full_name))),

  createUser: guard(async (data) => {
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(data.username || '')) {
      throw new Error('El usuario admite de 3 a 24 letras, numeros, punto, guion o guion bajo.');
    }
    if (!data.full_name?.trim()) throw new Error('Escribe el nombre completo.');
    if ((data.password || '').length < 6) throw new Error('La contrasena necesita al menos 6 caracteres.');

    const uid = await createLoginAccount(data.username, data.password);
    await setDoc(doc(dbf, 'usuarios', uid), {
      usuario: data.username.trim(),
      nombre: data.full_name.trim(),
      rol: data.role,
      activo: data.active !== false,
      creado: nowISO()
    });
    log('crear_usuario', 'usuarios', uid, `${data.username} (${data.role})`);
    return { id: uid };
  }),

  updateUser: guard(async (id, data) => {
    const ref = doc(dbf, 'usuarios', id);
    const prev = (await getDoc(ref)).data();
    await updateDoc(ref, {
      ...prev,
      nombre: (data.full_name ?? prev.nombre).trim(),
      rol: data.role ?? prev.rol,
      activo: data.active !== undefined ? !!data.active : prev.activo !== false
    });
    log('editar_usuario', 'usuarios', id);
    return { id };
  }),

  /* ---------- ajustes ---------- */

  settings: guard(async () => {
    const snap = await getDoc(doc(dbf, 'config', 'general'));
    const d = snap.exists() ? snap.data() : {};
    return {
      company_name: d.empresa || '',
      cafeteria_name: d.cafeteria || 'Cafeteria interna',
      isv_rate: d.isv ?? '0',
      prices_include_tax: d.preciosIncluyenIsv === false ? '0' : '1',
      default_credit_limit: d.limitePorDefecto ?? '1500',
      receipt_footer: d.pieVale || ''
    };
  }),

  saveSettings: guard(async (data) => {
    await setDoc(
      doc(dbf, 'config', 'general'),
      {
        empresa: data.company_name || '',
        cafeteria: data.cafeteria_name || '',
        isv: String(data.isv_rate ?? '0'),
        preciosIncluyenIsv: data.prices_include_tax !== '0',
        limitePorDefecto: String(data.default_credit_limit ?? '1500'),
        pieVale: data.receipt_footer || ''
      },
      { merge: true }
    );
    log('editar_ajustes', 'config', 'general');
    return api.settings();
  }),

  /** Catalogo de arranque para probar la plataforma. */
  loadSampleData: guard(async () => {
    const cats = [
      { nombre: 'Refrescos', tipo: 'bebida', orden: 10 },
      { nombre: 'Cafe y bebidas calientes', tipo: 'bebida', orden: 20 },
      { nombre: 'Snacks', tipo: 'snack', orden: 30 },
      { nombre: 'Desayunos', tipo: 'comida', orden: 40 },
      { nombre: 'Almuerzos', tipo: 'comida', orden: 50 },
      { nombre: 'Cenas', tipo: 'comida', orden: 60 }
    ];
    const ids = {};
    for (const c of cats) {
      const ref = await addDoc(C.categorias, { ...c, activo: true });
      ids[c.nombre] = ref.id;
    }

    const stocked = [
      ['REF-001', 'Agua purificada 600 ml', 'Refrescos', 12, 7, 48, 12],
      ['REF-002', 'Gaseosa lata 355 ml', 'Refrescos', 20, 13, 60, 18],
      ['REF-003', 'Jugo de naranja 500 ml', 'Refrescos', 25, 16, 30, 10],
      ['REF-004', 'Refresco natural del dia 12 oz', 'Refrescos', 15, 6, 40, 10],
      ['CAF-001', 'Cafe negro 8 oz', 'Cafe y bebidas calientes', 10, 3, 100, 20],
      ['CAF-002', 'Cafe con leche 12 oz', 'Cafe y bebidas calientes', 18, 7, 60, 15],
      ['SNK-001', 'Tostadas de maiz', 'Snacks', 15, 10, 36, 12],
      ['SNK-002', 'Galleta de avena', 'Snacks', 12, 7, 40, 12],
      ['SNK-003', 'Pan dulce', 'Snacks', 10, 5, 24, 8],
      ['SNK-004', 'Sandwich de jamon y queso', 'Snacks', 40, 24, 12, 6]
    ];
    for (const [sku, nombre, cat, precio, costo, stock, minimo] of stocked) {
      await addDoc(C.productos, {
        sku,
        nombre,
        categoriaId: ids[cat],
        precio,
        costo,
        controlaStock: true,
        stock,
        minimo,
        activo: true,
        creado: nowISO()
      });
    }

    const prepared = [
      ['DES-001', 'Desayuno tipico', 'Desayunos', 55],
      ['DES-002', 'Baleadas sencillas (2)', 'Desayunos', 35],
      ['ALM-001', 'Almuerzo del dia', 'Almuerzos', 75],
      ['ALM-002', 'Almuerzo ejecutivo', 'Almuerzos', 95],
      ['ALM-003', 'Sopa del dia', 'Almuerzos', 50],
      ['CEN-001', 'Cena del dia', 'Cenas', 70]
    ];
    for (const [sku, nombre, cat, precio] of prepared) {
      await addDoc(C.productos, {
        sku,
        nombre,
        categoriaId: ids[cat],
        precio,
        costo: 0,
        controlaStock: false,
        stock: 0,
        minimo: 0,
        activo: true,
        creado: nowISO()
      });
    }

    const emps = [
      ['E-1001', 'Ana Lucia Martinez', 'Produccion', 1500],
      ['E-1002', 'Carlos Rene Fuentes', 'Bodega', 1500],
      ['E-1003', 'Gloria Estela Ramos', 'Administracion', 2000],
      ['E-1004', 'Jorge Alberto Nunez', 'Mantenimiento', 1200]
    ];
    for (const [codigo, nombre, depto, limite] of emps) {
      await addDoc(C.trabajadores, {
        codigo,
        nombre,
        depto,
        limite,
        saldo: 0,
        activo: true,
        creado: nowISO(),
        creadoPor: session.user.id
      });
    }

    catCache = [];
    log('cargar_datos_ejemplo', 'config', 'general');
    return { ok: true };
  })
};

/** Genera el archivo de descuentos para Recursos Humanos sin salir del navegador. */
export function downloadCSV(filename, headers, records) {
  const esc = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [headers, ...records].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
