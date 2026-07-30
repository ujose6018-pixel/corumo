# Cafeteria — caja y credito de planilla

Punto de venta para la cafeteria interna de una empresa. El trabajador consume,
el cajero cobra en efectivo o lo carga a su cuenta, y al cerrar la quincena sale
el archivo de descuentos para Recursos Humanos.

Sin paso de compilacion: son archivos estaticos y el SDK de Firebase se carga
por CDN. Se sube tal cual a GitHub Pages.

## Que hace

- **Caja.** Rejilla de productos por categoria, vale en pantalla, cobro en
  efectivo con calculo de cambio, o cargo a la cuenta del trabajador con
  validacion de limite de credito.
- **Inventario.** Refrescos y snacks descuentan existencias en la misma
  transaccion de la venta. Las comidas preparadas al momento no llevan
  existencias. Entradas, salidas, ajustes y kardex por producto.
- **Precios.** Catalogo con precio, costo y margen. Cada cambio de precio queda
  en la bitacora.
- **Trabajadores.** Cuentas de credito con limite, saldo y estado de cuenta.
  Abonos en efectivo y ajustes manuales.
- **Planilla.** Cortes **semanales, quincenales o mensuales** segun lo que
  configures. Al cerrar uno se aplica el descuento a cada trabajador, los saldos
  quedan en cero, se descarga el CSV y se abre solo el corte siguiente.
- **Abonos anticipados.** El trabajador puede pagar parte o todo su consumo en
  caja antes de que se liquide su planilla. El abono baja lo que se le descuenta
  en el corte y queda en su estado de cuenta.
- **Reportes.** Corte por rango de fechas, venta por hora y por categoria,
  lo mas vendido y productos por reponer.
- **Perfiles.** El cajero cobra, maneja inventario, precios y cuentas de
  trabajadores. El administrador ademas crea usuarios, anula ventas, hace
  ajustes de saldo y cierra la planilla.

## Puesta en marcha

### 1. Firestore

Consola de Firebase → Firestore → **Reglas** → pega el contenido de
`firestore.rules` → Publicar.

Los indices compuestos estan en `firestore.indexes.json`. La forma mas rapida es
usar la plataforma normalmente: cuando una consulta necesite un indice, la
consola de Firebase muestra un enlace directo para crearlo con un clic.

### 2. Authentication

Authentication → **Sign-in method** → activa **Correo electronico/contrasena**.

Authentication → **Settings** → **Authorized domains** → agrega tu dominio de
GitHub Pages, por ejemplo `tuusuario.github.io`. Sin esto el login falla aunque
la contrasena sea correcta.

### 3. Primer administrador

Al abrir la plataforma por primera vez aparece el asistente de instalacion. Pide
una **clave de instalacion** y con ella crea la cuenta de administrador.

La clave por defecto es `arranque-corumo-2026`. **Cambiala antes de publicar.**
En `js/firebase.js` solo esta guardada su huella SHA-256, no la clave: quien lea
el codigo no puede leerla de ahi.

Para poner la tuya, abre la consola del navegador y ejecuta:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU CLAVE'))
  .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
```

Pega el resultado en `SETUP_KEY_HASH` dentro de `js/firebase.js`.

El asistente aparece una sola vez. Al terminar crea el documento
`config/instalacion`, que no se puede modificar ni borrar, y desde ese momento
las reglas ya no permiten crear administradores sin ser administrador.

> **Lo que la huella si protege y lo que no.** Evita que alguien que encuentre la
> URL antes que tu se cree el administrador. No es cifrado: si eliges una clave
> corta o previsible, se puede sacar por fuerza bruta. Usa una frase larga y
> completa la instalacion apenas publiques el sitio.

#### Alternativa manual

Si prefieres no usar el asistente, la consola de Firebase no pasa por las reglas.

1. Authentication → Users → **Add user**. Correo: `admin@corumo2.local`,
   contrasena a tu gusto. Copia el **UID**.
2. Firestore → coleccion `usuarios` → documento con **ese UID exacto** como ID:

   | Campo    | Tipo    | Valor           |
   |----------|---------|-----------------|
   | `usuario`| string  | `admin`         |
   | `nombre` | string  | `Administrador` |
   | `rol`    | string  | `admin`         |
   | `activo` | boolean | `true`          |

3. Crea tambien el documento `config/instalacion` con `completada: true` para
   cerrar el asistente.
4. Entra escribiendo solo `admin` como usuario. La app le agrega el dominio
   `@corumo2.local` automaticamente.

> El dominio `.local` sirve para que el personal escriba usuarios cortos en vez
> de correos. La contra es que el correo de restablecimiento no llega a ninguna
> parte. Si quieres que el "olvide mi contrasena" funcione, da de alta a la gente
> con su correo real de la empresa: la pantalla de acceso acepta las dos formas.

### 4. Arranque

Entra como administrador y ve a:

1. **Ajustes** → configura empresa, impuesto y limite sugerido. Si quieres
   probar rapido, usa **Cargar catalogo de ejemplo**.
2. **Ajustes** → **Ciclo de cobro**: semanal, quincenal o mensual. De esto
   dependen las fechas que se proponen en cada corte.
3. **Planilla** → **Abrir corte**. Las fechas vienen prellenadas segun el ciclo.
   Mientras no haya un corte abierto, el cajero no puede cargar consumos a cuenta.
4. **Usuarios del sistema** → crea las cuentas de los cajeros.

## Ciclos de cobro y abonos

El ciclo se define en Ajustes y determina como se calcula cada corte:

| Ciclo      | Corte                                   |
|------------|-----------------------------------------|
| Semanal    | Lunes a domingo                         |
| Quincenal  | Del 1 al 15 y del 16 al fin de mes      |
| Mensual    | Del primero al ultimo dia del mes       |

Cambiar el ciclo no toca los cortes ya creados: afecta las fechas que se
proponen del siguiente en adelante. Si una quincena tuvo dias raros, puedes
editar las fechas a mano al abrir el corte.

Al cerrar un corte, la plataforma abre el siguiente sin que tengas que hacer
nada. Si prefieres abrirlos uno por uno, cambia esa opcion en Ajustes.

**Abono antes de la liquidacion.** En la caja, el cajero pone la forma de pago en
*A cuenta*, elige al trabajador y aparece **Abonar a la cuenta** con su saldo
pendiente. No hace falta que haya productos en el vale. Tambien esta en
Trabajadores → Estado de cuenta.

El abono no borra el consumo: entra como movimiento aparte con signo contrario.
En el reporte de planilla el trabajador aparece con sus cargos, sus abonos y la
diferencia, que es lo unico que se descuenta. Si abona todo, su fila desaparece
del reporte porque no queda nada por descontar.

## Subir a GitHub Pages

Sube el contenido de esta carpeta a la raiz del repositorio (o a `/docs`) y
activa Pages en Settings → Pages. El archivo `.nojekyll` evita que GitHub ignore
directorios; no lo borres.

La navegacion usa hash (`#caja`, `#ventas`), asi que no hace falta `404.html`
ni ninguna redireccion.

## Notas tecnicas

- **No hay contrasenas en el codigo.** Las contrasenas las guarda Firebase
  Authentication, con hash del lado del servidor. Nada de lo que se publique en
  el repositorio sirve para iniciar sesion. Cualquier cadena que se pusiera en el
  JS seria legible para quien abra las herramientas del navegador, por muy
  ofuscada que estuviera: en un cliente web no existe forma de esconder un
  secreto de verdad.
- **La `apiKey` no es un secreto.** Va publica en todo cliente web. La seguridad
  esta en las reglas de Firestore y en Authentication.
- **Ventas atomicas.** Cada venta corre en `runTransaction`: lee los productos y
  el trabajador, valida existencias y limite, y recien entonces escribe la venta,
  los movimientos de inventario y el cargo a la cuenta. Si dos cajas cobran el
  ultimo refresco al mismo tiempo, una de las dos falla y no queda stock negativo.
- **Libros de solo agregar.** `movimientos_cuenta` y `movimientos_stock` no se
  editan ni se borran, ni desde la app ni desde las reglas. Un error se corrige
  con un movimiento en contra, y por eso el descuento de planilla es auditable.
- **Ventas no se editan.** Corregir una venta es anularla, y anular es tarea del
  administrador. La anulacion devuelve existencias y revierte el cargo.
- **Los saldos son denormalizados.** El campo `saldo` del trabajador se mantiene
  dentro de la transaccion junto con el movimiento que lo modifica. Las reglas
  ademas impiden que el saldo pase del limite autorizado o quede negativo.
- **Lo que Firestore no puede validar.** Las reglas no pueden comprobar que el
  saldo sea exactamente la suma de los movimientos. Esa consistencia la da la
  transaccion del cliente. Si algun dia necesitas garantia absoluta, ese calculo
  se mueve a una Cloud Function.

## Estructura

```
index.html
app.css                    diseno completo, un solo archivo
js/
  firebase.js              configuracion, sesion, bitacora
  store.js                 acceso a Firestore y transacciones
  ui.js                    helpers de interfaz
  main.js                  acceso, panel lateral y ruteo
  views/                   una pantalla por archivo
firestore.rules
firestore.indexes.json
```
