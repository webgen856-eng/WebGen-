WEBGEN LG PRO — SUPABASE CONECTADO
==================================

ESTADO ACTUAL
- Project URL de Supabase: configurada.
- Publishable key: configurada.
- Registro e inicio de sesión por correo/contraseña: implementado.
- Sesión persistente: activada.
- Proyectos separados por cuenta: implementado.
- Copia local por usuario: implementada.
- Proyectos creados como invitado: se vinculan a la cuenta al iniciar sesión.
- RLS: preparada para que cada usuario solo modifique sus propios proyectos.
- Páginas publicadas: lectura pública por slug.

PASO QUE DEBES HACER EN SUPABASE
1. Entra a tu proyecto de Supabase.
2. Abre SQL Editor.
3. Crea una nueva consulta.
4. Copia TODO el contenido de supabase-schema.sql.
5. Presiona Run.

AUTENTICACIÓN POR CORREO
En Supabase > Authentication > Providers > Email deja habilitado Email.
Si Confirm email está activado, el usuario deberá confirmar su correo antes de iniciar sesión.
Para desarrollo local, configura en Authentication > URL Configuration el Site URL y los Redirect URLs correspondientes al servidor local que uses (por ejemplo Live Server).

PROBAR
1. Abre esta carpeta en VS Code.
2. Usa Live Server sobre index.html. No abras el archivo solo con file://.
3. Ve a Mi cuenta.
4. Crea una cuenta con correo y contraseña.
5. Confirma el correo si Supabase lo solicita.
6. Inicia sesión.
7. Crea o edita una página.
8. Recarga: debe conservarse bajo esa cuenta.
9. Publica el proyecto.
10. Abre public.html?site=tu-slug desde el mismo servidor/web publicada.

SEGURIDAD
config.js contiene únicamente una publishable key de Supabase, que está diseñada para usarse en aplicaciones del navegador junto con RLS.
NUNCA pongas una service_role key, contraseña de base de datos u otra clave privada dentro del HTML/JS del navegador.

ARCHIVOS
- index.html: panel/editor.
- style.css: estilos.
- script.js: lógica, auth, guardado y sincronización.
- config.js: URL y publishable key.
- public.html: renderizador de páginas publicadas.
- supabase-schema.sql: tabla, permisos, índices y políticas RLS.
