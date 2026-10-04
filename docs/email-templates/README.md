# Emails de Supabase Auth

Plantillas para **Supabase › Authentication › Emails › Templates**. En cada una pegá el *Subject* y reemplazá todo el *Body* por el contenido del archivo.

El texto sale en inglés cuando el usuario eligió ese idioma (`user_metadata.locale = 'en'`, que guardan el registro y `set_locale`); si no, en español. El asunto va en los dos idiomas.

| Plantilla en Supabase | Subject | Archivo |
|---|---|---|
| Confirm signup | Confirmá tu email · Confirm your email | `confirm-signup.html` |
| Reset password | Creá una nueva contraseña · Create a new password | `reset-password.html` |
| Magic link | Tu link para ingresar a Boxinger · Your Boxinger sign-in link | `magic-link.html` |
| Change email address | Confirmá tu nuevo email · Confirm your new email | `change-email.html` |

Los links usan `token_hash` y pasan por `/app/auth/confirm`, así funcionan aunque el email se abra en otro dispositivo.
