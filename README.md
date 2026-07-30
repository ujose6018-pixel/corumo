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

Authentication → **Sign-in method** → **Correo electronico/contrasena** →
activar. Deja apagado el enlace por correo (passwordless); no se usa.

El personal inicia sesion con un usuario corto, no con un correo. El dominio
interno se define en `LOGIN_DOMAIN` dentro de `js/firebase.js` y viene como
`corumo2.local`. Ese dominio no existe de verdad, y esa es la unica contra:
el correo de "olvide mi contrasena" no llega a ningun lado. Para reponer una
clave, el administrador entra a Usuarios del sistema y usa **Enviar
restablecimiento**, que solo sirve si esa persona esta dada de alta con un
correo real de la empresa.

Authentication → **Settings** → **Authorized domains** → agrega tu dominio de
GitHub Pages, por ejemplo `tuusuario.github.io`. Sin esto el login falla aunque
la contrasena sea correcta.

### 3. Primer administrador

No hay que crear nada a mano. Abre la plataforma y la pantalla de acceso te
recibe en modo instalacion: **el usuario y la contrasena que escribas ahi quedan
como la cuenta de administrador**, y con esas mismas credenciales entras de ahi
en adelante.

Escribes solo el usuario, sin correo. La plataforma lo guarda internamente como
`usuario@corumo2.local` porque Firebase Authentication trabaja con correos, pero
eso el personal nunca lo ve. Si prefieres correos reales de la empresa, tambien
los acepta: el campo reconoce cualquier texto con arroba y lo usa tal cual.

Al terminar se crea el documento `config/instalacion`, que las reglas no dejan
modificar ni borrar. Desde ese momento la pantalla vuelve a ser un login normal
y solo un administrador puede dar de alta usuarios.

> **Cierra la puerta pronto.** Entre que publicas el sitio y haces ese primer
> ingreso, cualquiera que abra la URL puede quedarse con la cuenta de
> administrador. Haz el primer login apenas termines de desplegar.
>
> Si necesitas mas margen, define una clave de instalacion: en `js/firebase.js`
> pon en `SETUP_KEY_HASH` la huella SHA-256 de una frase tuya. La pantalla de
> primer ingreso pedira esa frase ademas de las credenciales. Para generar la
> huella, en la consola del navegador:
>
> ```js
> crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU FRASE'))
>   .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
> ```
>
> La huella no es reversible, asi que quien lea el codigo no puede sacar la
> frase. Pero si eliges algo corto o previsible, se saca por fuerza bruta: usa
> una frase larga.

#### Si prefieres hacerlo a mano

La consola de Firebase no pasa por las reglas, asi que ahi puedes crear el
usuario en Authentication, copiar su UID, crear `usuarios/{UID}` con
`usuario`, `nombre`, `rol: "admin"` y `activo: true`, y ademas
`config/instalacion` con `completada: true` para cerrar el modo instalacion.

### 4. Arranque

Entra como administrador y ve a:

1. **Ajustes** → configura empresa, impuesto y limite sugerido. Si quieres
   probar rapido, usa **Cargar catalogo de ejemplo**.
2. **Ajustes** → **Ciclo de cobro**: semanal, quincenal o mensual. De esto
   dependen las fechas que se proponen en cada corte.
3. **Planilla** → **Abrir corte**. Las fechas vienen prellenadas segun el ciclo.
   Mientras no haya un corte abierto, el cajero no puede cargar consumos a cuenta.
4. **Usuarios del sistema** → crea las cuentas de los cajeros.

## Planillas grandes

La plataforma esta pensada para listas de miles de trabajadores.

**El codigo de empleado es el identificador del documento.** Es decir, el
trabajador `E-1001` vive en `trabajadores/E-1001`. Eso trae tres cosas:

- La caja lo consulta con una **lectura directa por clave**, sin pasar por
  ningun indice. Es lo mas barato y lo mas rapido que ofrece Firestore.
- **Firestore garantiza que no haya codigos repetidos.** No depende de que la
  aplicacion recuerde comprobarlo: dos documentos no pueden tener el mismo
  identificador, y las reglas exigen que el campo `codigo` coincida con el.
- Los movimientos y las ventas quedan colgando de un identificador legible, asi
  que la base se puede leer a ojo desde la consola de Firebase.

> **El codigo queda fijo.** Cambiarlo significaria mover al trabajador a otro
> documento y dejar su historial colgando del anterior. Por eso el campo no se
> puede editar: si alguien fue registrado con el codigo equivocado, se da de baja
> esa cuenta y se crea otra. Tenlo en cuenta al definir el formato antes de
> importar la planilla.

**En la caja no hay lista desplegable ni busqueda al teclear.** El cajero
escribe el codigo y confirma con Enter o con el boton. Mientras escribe no se
consulta nada.

Los trabajadores ya consultados quedan en memoria durante la sesion, asi que
alguien que vuelve a la caja en el mismo turno no cuesta ninguna lectura. Su
ficha se descarta en cuanto cambia su saldo, para que nunca se cobre contra un
saldo viejo.

Si el cajero no tiene el codigo a mano, hay un enlace para buscar por nombre.
Esa si es la consulta cara —tres consultas por prefijo y palabra— y por eso vive
en una ventana aparte: el camino normal es el codigo.

**Nunca se lee la coleccion completa.** La pantalla de Trabajadores pagina de
cincuenta en cincuenta. El total de la cartera se calcula con una agregacion en
el servidor, asi que da igual si hay diez cuentas o diez mil.

### Lo que cuesta cada cosa

| Accion | Lecturas |
|--------|----------|
| Abrir la caja | catalogo y categorias, nada de trabajadores |
| Cobrar en efectivo | ninguna consulta de trabajador |
| Cargar a cuenta con el codigo | 1 (lectura directa) |
| El mismo trabajador otra vez en el turno | 0 |
| Buscar por nombre | hasta 3 consultas de 20 documentos |
| Listar trabajadores | 50 por pagina |
| Cartera total | 1 agregacion |

### Limites de la busqueda

Firestore no tiene busqueda de texto completo, y conviene saber que significa:

- En caja el codigo se busca **exacto**: hay que escribirlo completo. Es lo que
  permite que cueste una sola lectura.
- En la busqueda por nombre, el codigo si acepta prefijo: `E-10` encuentra
  `E-1001` y `E-1010`.
- El nombre se busca por como empieza: `ANA LUCIA` encuentra a Ana Lucia
  Martinez, pero `LUCIA` sola no la encuentra por esa via.
- Para eso esta la busqueda por palabra: escribir `MARTINEZ` completo si la
  encuentra, porque cada nombre se guarda tambien partido en palabras.
- No hay tolerancia a errores de tecleo. `MARTINES` no encuentra a `MARTINEZ`.

Si algun dia necesitas busqueda difusa de verdad, eso se resuelve con un
servicio aparte como Algolia o Typesense, no con Firestore.

### Como se normaliza el codigo

Antes de usarlo como identificador se pasa a mayusculas, se le quitan acentos y
se cambian las barras por guiones, porque una barra en un identificador de
Firestore separa colecciones. Asi que `e-1001` y `E-1001` son el mismo
trabajador, y `E/1001` se guarda como `E-1001`.

Se rechazan los codigos vacios, los de mas de cien caracteres, `.`, `..` y los
que empiezan y terminan con dos guiones bajos, que Firestore reserva.

Un detalle menor: al quitar acentos, la ene se vuelve N. Si tus codigos son
alfanumericos, como suele ser, no te afecta.

### Cargar la planilla

En Trabajadores → **Importar lista** se pega el contenido de un CSV o se sube el
archivo. Una linea por persona:

```
E-1001;Ana Lucia Martinez;Produccion;1500
E-1002;Carlos Rene Fuentes;Bodega;1500
```

Se acepta punto y coma, coma o tabulacion. El departamento y el limite pueden ir
vacios. La escritura va en lotes de cuatrocientos, y la comprobacion de cuales
ya existen se hace de treinta en treinta, no uno por uno.

Al terminar avisa cuantos se crearon, cuantos ya existian y cuantas lineas se
descartaron por no traer codigo o nombre.

> **Si ya cargaste trabajadores antes de este cambio**, esos documentos tienen
> identificadores automaticos y la caja no los va a encontrar por codigo. Estando
> todavia en pruebas, lo limpio es borrar la coleccion `trabajadores` desde la
> consola de Firebase y volver a importarla. Si ya tienes consumos registrados
> contra esas cuentas, no la borres: hay que migrar tambien los movimientos.

### Si ya tenias trabajadores cargados

Los registros creados antes de esta version no tienen los campos que usa el
buscador. En **Ajustes → Mantenimiento** hay un boton que los completa. Se corre
una sola vez, se puede repetir sin riesgo, y avisa si algun registro quedo fuera.

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

## Aplicacion instalable

La plataforma es una PWA: se instala como aplicacion en el telefono, la tableta
o la computadora, y abre en su propia ventana sin barra del navegador.

- **Android / Chrome / Edge:** aparece un boton de descarga en la barra superior
  cuando el navegador la considera instalable. Tambien esta en el menu del
  navegador, como *Instalar aplicacion*.
- **iPhone / iPad:** Safari no muestra ese boton. Hay que usar Compartir →
  *Agregar a pantalla de inicio*.
- **Escritorio:** el mismo boton, o el icono de instalar en la barra de
  direcciones.

Requisitos: la PWA solo se instala sobre **HTTPS**. GitHub Pages ya lo da.

### Que funciona sin conexion y que no

El armazon de la aplicacion se guarda en cache, y Firestore mantiene una copia
local en IndexedDB. Con eso la caja **abre y deja consultar** catalogo, precios,
cuentas y ventas recientes aunque se caiga el wifi.

**Cobrar si necesita conexion.** Cada venta corre como transaccion contra el
servidor: es la unica forma de garantizar que no se venda el mismo refresco dos
veces ni se pase un trabajador de su limite. Una transaccion no se puede resolver
contra la cache local, asi que sin red la venta no se cierra. La plataforma avisa
en cuanto se pierde la conexion.

Si la cafeteria tiene wifi malo, la salida sensata es un telefono con datos
moviles para la caja, no dejar que el cobro se guarde a ciegas.

### Actualizaciones

Cuando subes cambios al repositorio, el service worker descarga la version nueva
por detras y avisa. **La version nueva entra al cerrar y volver a abrir la
aplicacion**, no de golpe: una recarga a media venta borraria el vale que el
cajero tiene en pantalla.

Si cambias archivos y quieres forzar la renovacion en todos los dispositivos,
sube el numero de `VERSION` al inicio de `sw.js`.

## En el telefono

La interfaz se reacomoda sola:

- El panel lateral se vuelve un cajon que se abre con el boton de la barra
  superior y se cierra tocando fuera o con Escape.
- En la caja, el vale sube desde abajo. Siempre queda visible una barra con el
  total y el numero de articulos, para no perder de vista lo que se esta
  cobrando.
- Las tablas dejan de tener scroll horizontal: cada fila se apila como tarjeta
  con sus etiquetas.
- Los formularios usan letra de 16 px, que es lo que evita que iOS haga zoom al
  tocar un campo.
- Se respetan las areas seguras del notch y de la barra inferior.

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
manifest.webmanifest       datos de la aplicacion instalable
sw.js                      cache del armazon para abrir sin conexion
icons/                     iconos de la aplicacion
js/
  firebase.js              configuracion, sesion, bitacora
  store.js                 acceso a Firestore y transacciones
  ui.js                    helpers de interfaz
  main.js                  acceso, panel lateral y ruteo
  views/                   una pantalla por archivo
firestore.rules
firestore.indexes.json
```
