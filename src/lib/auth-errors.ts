export function authError(msg: string | undefined): string {
  const m = msg || '';
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese email. Ingresá o recuperá tu contraseña.';
  if (/Email not confirmed/i.test(m)) return 'Todavía no verificaste tu email. Revisá tu casilla o pedí un nuevo link.';
  if (/rate limit|too many|Too Many/i.test(m)) return 'Demasiados intentos. Esperá unos minutos y volvé a probar.';
  if (/Password should|weak password/i.test(m)) return 'La contraseña necesita mínimo 8 caracteres, con al menos 1 letra y 1 número.';
  if (/same.*password|different from the old/i.test(m)) return 'La nueva contraseña tiene que ser distinta de la anterior.';
  if (/expired|invalid.*(token|otp|link)/i.test(m)) return 'El link venció o ya se usó. Pedí uno nuevo.';
  if (/Signups not allowed/i.test(m)) return 'El registro está deshabilitado por el momento.';
  return m || 'Algo salió mal. Probá de nuevo.';
}

export const passwordError = (p: string) =>
  p.length < 8 || !/[a-zA-Z]/.test(p) || !/\d/.test(p) ? 'Mínimo 8 caracteres, con al menos 1 letra y 1 número' : '';
