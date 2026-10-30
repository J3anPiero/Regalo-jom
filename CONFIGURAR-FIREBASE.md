# Guardar en la nube y editar los dos en tiempo real

Netlify y GitHub Pages solo publican los archivos: no guardan nada. Para que
historias, fotos, textos, fecha, puntuaciones y lugares se guarden para siempre
y se vean al instante en los dos teléfonos, la página usa **Firebase** (de
Google, plan gratuito, sin tarjeta).

Mientras no lo configures, la página funciona igual pero guarda solo en el
navegador donde editas.

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear proyecto** → ponle un nombre (ej. `nuestro-viaje`). Google Analytics
   no hace falta.

## 2. Crear la base de datos

1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Elige una ubicación cercana (ej. `southamerica-east1`) y **modo producción**.
3. En la pestaña **Reglas**, borra todo, pega esto y pulsa **Publicar**
   (cambia los dos correos por los vuestros):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // Cualquiera con el enlace puede ver la página
      allow read: if true;
      // Solo vosotros dos podéis editar
      allow write: if request.auth != null
        && request.auth.token.email in ['correo1@gmail.com', 'correo2@gmail.com'];
    }
  }
}
```

## 3. Crear vuestras cuentas para editar

1. Menú **Compilación → Authentication → Comenzar**.
2. En **Método de acceso**, activa **Correo electrónico/contraseña**.
3. En **Usuarios → Agregar usuario**, crea una cuenta para cada uno
   (los mismos correos que pusiste en las reglas) con su contraseña.
4. En **Configuración → Dominios autorizados**, añade el dominio donde
   publiques (ej. `nuestro-viaje.netlify.app` o `tuusuario.github.io`).

## 4. Conectar la página

1. En la portada del proyecto pulsa el icono **Web `</>`**, ponle un nombre y
   registra la app (no hace falta Firebase Hosting).
2. Copia el objeto `firebaseConfig` que aparece.
3. Ábrelo en `assets/js/firebase-config.js` y reemplaza `null`:

```js
window.FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "nuestro-viaje.firebaseapp.com",
    projectId: "nuestro-viaje",
    storageBucket: "nuestro-viaje.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
```

La `apiKey` de Firebase no es secreta: puede ir en la página publicada. Lo que
protege los datos son las reglas del paso 2.

## 5. Publicar y usar

- Sube la carpeta a Netlify o GitHub Pages (la carpeta `dist/` y
  `leaflet.zip` no hacen falta).
- En el menú lateral verás **☁️ Guardado en la nube**.
- Pulsa **✏️ Modo edición** (o cualquier botón de agregar/puntuar): os pedirá
  correo y contraseña. Después, todo lo que cambie uno aparece al instante en
  la pantalla del otro.
- Quien abra el enlace sin iniciar sesión puede verlo todo pero no editar.
- La primera vez que uno de los dos inicie sesión se guardará Chilokos en el
  mapa.

## Límites del plan gratuito

Muy por encima de lo que usaréis: 1 GB de datos, 50.000 lecturas y 20.000
escrituras al día. Las fotos se reducen a ~1000 px antes de guardarse para que
cada una ocupe poco (máximo 1 MB por historia o foto).
