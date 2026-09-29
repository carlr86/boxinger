# Emails de Supabase Auth

Plantillas en español para **Supabase › Authentication › Emails › Templates**. En cada una pegá el *Subject* y reemplazá todo el *Body* por el contenido del archivo.

| Plantilla en Supabase | Subject | Archivo |
|---|---|---|
| Confirm signup | Confirmá tu email | `confirm-signup.html` |
| Reset password | Creá una nueva contraseña | `reset-password.html` |
| Magic link | Tu link para ingresar a Boxinger | `magic-link.html` |
| Change email address | Confirmá tu nuevo email | `change-email.html` |

Los links usan `token_hash` y pasan por `/app/auth/confirm`, así funcionan aunque el email se abra en otro dispositivo.
