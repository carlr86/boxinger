// Spanish and English from day one. t(key, params) with {placeholders}.
const es = {
  nav_ideas: 'Ideas', nav_finalists: 'Finalistas', nav_roadmap: 'Roadmap', nav_admin: 'Admin',
  login: 'Ingresar', logout: 'Salir', register: 'Crear cuenta', profile: 'Mi perfil', dev_mail: 'Buzón (dev)',
  admin_dashboard: 'Dashboard', admin_team: 'Ideas del equipo', admin_moderation: 'Moderación', admin_close: 'Cierre de ciclo',
  admin_prioritization: 'Priorización', admin_roadmap: 'Roadmap', admin_settings: 'Configuración',
  made_with: 'Hecho con Insight Backlog',
  // cycle
  cycle: 'Ciclo', cycle_closes: 'Cierra el {date}', cycle_starts: 'Empieza el {date}', cycle_scheduled: 'Próximo ciclo',
  no_cycle: 'Todavía no hay un ciclo activo.', days: 'días', hours: 'horas', minutes: 'min', seconds: 'seg',
  quarter: 'T{q} {y}', mensual: 'Mensual', trimestral: 'Trimestral',
  propose: 'Proponé una idea', live: 'En vivo',
  // tabs
  tab_community: 'Comunidad', tab_team: 'Del equipo', tab_nonfinalists: 'No finalistas',
  search: 'Buscar ideas…', all_categories: 'Todas las categorías', sort_ranking: 'Ranking', sort_recent: 'Más recientes',
  empty_community: 'Todavía no hay ideas en este ciclo. ¡Proponé la primera!',
  empty_team: 'El equipo no publicó ideas para este ciclo.', empty_nonfinalists: 'No hay ideas No finalistas.',
  // origin / types
  origin_equipo: 'Equipo', origin_comunidad: 'Comunidad',
  type_A: 'A validar', type_B: 'Confirmada', type_C: 'Comunidad',
  // statuses
  st_en_votacion: 'En votación', st_finalista: 'Finalista', st_no_finalista: 'No finalista', st_reclamada: 'Reclamada',
  st_validada: 'Validada', st_no_validada: 'No validada', st_aceptada: 'Aceptada', st_rechazada: 'No se hará',
  st_pospuesta: 'Pospuesta', st_en_roadmap: 'En roadmap', st_lanzada: 'Lanzada', st_archivada: 'Archivada',
  st_planificada: 'Planificada', st_en_desarrollo: 'En desarrollo', st_en_evaluacion: 'En evaluación', st_medida: 'Medida',
  // votes
  v_up: 'Me gusta', v_down: 'No me convence', v_importante: 'Importante', v_deseable: 'Deseable', v_no_importante: 'No importante',
  your_answer_private: 'Tu respuesta es privada: solo la ve el equipo.',
  counts_after_vote: 'Votá para ver los resultados', counts_private: 'Resultados privados',
  votes_frozen: 'Votación cerrada', own_idea: 'Es tu idea: no podés votarla',
  down_reason_title: '¿Qué te preocupa?', down_reason_hint: 'Opcional. Solo lo ve el equipo.',
  down_reason_ph: 'Contanos por qué no te convence…', vote_down: 'Votar 👎', cancel: 'Cancelar', save: 'Guardar',
  remove_vote: 'Quitar voto', responses: '{n} respuestas', importance: '{pct}% Importante',
  // nonfinalists
  claim: 'Reclamar', support: 'Apoyar', supported: 'Apoyaste', claimed_missing: 'Reclamada: faltan {n} apoyos',
  claimed_by: 'Reclamada por {name}', history_line: '{up} 👍 / {down} 👎 en {period}',
  claim_hint: 'Si llega a {n} apoyos vuelve a competir en el ciclo en curso, con votos en cero.',
  cycles_left: 'Se archiva tras {n} ciclos sin reclamo',
  // detail
  back: '← Volver', follow: 'Seguir', following: 'Siguiendo', report: 'Reportar', comments: 'Comentarios',
  comment_ph: 'Escribí un comentario…', comment_send: 'Comentar', comment_private: 'En ideas del equipo a validar, tu comentario solo lo ve el equipo.',
  official_reply: 'Respuesta oficial', official_hint: 'Como admin, tu comentario se publica como Respuesta oficial, visible para todos.',
  private_comment: 'Privado', no_comments: 'Todavía no hay comentarios.', history: 'Historial de ciclos',
  status_history: 'Cambios de estado', by: 'por {name}', rejected_reason: 'Motivo: {reason}',
  report_title: 'Reportar contenido', report_reason: 'Motivo', report_ph: 'Contanos qué pasa (spam, ofensivo, duplicado…)',
  report_sent: 'Gracias. El reporte llegó al equipo.', send: 'Enviar', merged_into: 'Esta idea se fusionó con otra.',
  position: 'Puesto', score: 'Score', result: 'Resultado', period: 'Período', won_in: 'Ganó en el ciclo #{n}',
  voters: 'Votantes (solo admin)', reasons_down: 'Motivos de 👎', no_voters: 'Sin votos todavía.',
  admin_tools: 'Herramientas de admin', hide: 'Ocultar', unhide: 'Mostrar', edit: 'Editar', delete: 'Eliminar', merge: 'Fusionar',
  hidden_badge: 'Oculta', validation: 'Validación', threshold: 'Umbral: ≥ {pct}% Importante y ≥ {min} respuestas',
  index: 'Índice', would_validate: 'Cumple el umbral', would_not_validate: 'Todavía no cumple el umbral',
  // propose
  propose_title: 'Proponé una idea', title: 'Título', title_ph: 'Ej.: Exportar reportes a Excel', description: 'Descripción',
  description_ph: '¿Qué problema resuelve? ¿Cómo lo usarías?', category: 'Categoría', none: 'Sin categoría',
  similar_title: 'Ideas parecidas: ¿ya está propuesta?', publish: 'Publicar idea', published: '¡Idea publicada!',
  propose_hint: 'Se publica al instante en el ciclo activo con el badge Comunidad.',
  // finalists
  finalists_title: 'Finalistas por ciclo', finalists_empty: 'Todavía no cerró ningún ciclo.',
  finalists_intro: 'Al cierre de cada ciclo, las ideas más votadas de la comunidad pasan a evaluación del equipo.',
  // roadmap
  roadmap_title: 'Roadmap', roadmap_intro: 'Qué vamos a hacer, con su origen visible.', all_origins: 'Todos los orígenes',
  all_statuses: 'Todos los estados', all_periods: 'Todos los períodos', roadmap_empty: 'Nada por acá todavía.',
  // auth
  email: 'Email', password: 'Contraseña', name: 'Nombre', login_title: 'Ingresá a {board}', register_title: 'Creá tu cuenta',
  magic_link: 'Enviarme un magic link', magic_sent: 'Te enviamos un link a {email}. Revisá tu correo.',
  or: 'o', no_account: '¿No tenés cuenta?', have_account: '¿Ya tenés cuenta?',
  register_hint: 'Vas a recibir un email para verificar tu cuenta. El voto cuenta solo con email verificado.',
  verify_banner: 'Verificá tu email para votar y publicar ideas.', resend: 'Reenviar email', resent: 'Email reenviado.',
  verifying: 'Verificando…', verified_ok: '¡Listo! Ya podés votar y proponer ideas.',
  login_needed: 'Ingresá para participar', login_needed_text: 'Para votar, proponer o comentar necesitás una cuenta con email verificado.',
  // profile
  profile_title: 'Mi perfil', language: 'Idioma', notifications: 'Notificaciones por email', my_ideas: 'Mis ideas',
  my_votes: 'Mis votos', saved: 'Guardado', none_yet: 'Nada todavía.',
  pref_comment_on_idea: 'Mi idea recibió un comentario', pref_official_reply: 'Respuesta oficial en una idea que sigo o voté',
  pref_cycle_result: 'Resultado de mi idea al cierre del ciclo', pref_cycle_summary: 'Resumen de Finalistas al cierre del ciclo',
  pref_status_change: 'Una idea que voté o sigo cambió de estado', pref_claim_back: 'Una idea que reclamé o apoyé vuelve a competir',
  pref_new_report: 'Nuevo reporte (admin)', pref_cycle_ending: 'Faltan 3 días para el cierre (admin)', pref_b_alert: 'Alerta de idea B con alto No importante (admin)',
  // admin
  days_left: 'Días restantes', new_ideas: 'Ideas nuevas', votes: 'Votos', participants: 'Participantes',
  participation: '{pct}% de {n} usuarios', top5: 'Top 5 de la comunidad', a_near: 'Ideas A y su umbral', b_alerts: 'Alertas de ideas B',
  reports_pending: 'Reportes pendientes', prio_pending: 'Pendientes de priorizar', no_alerts: 'Sin alertas.',
  near: 'Cerca', validated: 'Validada', go: 'Ver',
  new_team_idea: 'Nueva idea del equipo', type: 'Tipo', type_A_long: 'A · Equipo, a validar (Importante / Deseable / No importante)',
  type_B_long: 'B · Equipo, confirmada (Importante / No importante)', create: 'Publicar',
  team_results: 'Resultados privados', relaunch: 'Relanzar', archive: 'Archivar', alert_b: 'Alto No importante',
  reports: 'Bandeja de reportes', no_reports: 'No hay reportes.', resolve: 'Resolver', dismiss: 'Descartar',
  rep_pendiente: 'Pendiente', rep_resuelto: 'Resuelto', rep_descartado: 'Descartado',
  reported_by: 'Reportado por {name}', object_deleted: '(contenido eliminado)', all_ideas: 'Ideas del board', hidden_comments: 'Comentarios ocultos',
  merge_title: 'Fusionar idea duplicada', merge_into: 'Fusionar con…', merge_hint: 'Los votos se suman sin duplicar usuarios; los comentarios y seguidores pasan a la idea destino.',
  edit_idea: 'Editar idea', confirm_delete: '¿Eliminar definitivamente?', confirm_delete_text: 'Se borran la idea, sus votos y comentarios. No se puede deshacer.',
  close_title: 'Cierre del ciclo', close_preview: 'Vista previa del cierre', close_confirm: 'Cerrar ciclo ahora',
  close_auto: 'Si no hacés nada, el ciclo cierra automáticamente el {date} (zona horaria del board).',
  close_really: '¿Cerrar el ciclo #{n}?', close_really_text: 'Se congelan los votos, se asignan Finalistas / No finalistas / Validadas, se abre el ciclo siguiente y se envían los emails.',
  closed_ok: 'Ciclo cerrado. Ya está abierto el siguiente.', will_be_finalists: 'Pasan a Finalistas',
  will_be_nonfinalists: 'Quedan No finalistas', a_results: 'Ideas A', b_results: 'Ideas B (impacto esperado)',
  expiring_claims: 'Reclamos que vencen', to_archive: 'Se archivan', change_end: 'Cambiar fecha de cierre',
  prio_title: 'Tabla de priorización', table: 'Tabla', matrix: 'Matriz', impact: 'Impacto', effort: 'Esfuerzo', revenue: 'Revenue',
  criticality: 'Criticidad', suggested: 'sug. {v}', accept: 'Aceptar', reject: 'Rechazar', postpone: 'Posponer',
  prio_formula: 'Puntaje = (Impacto + Revenue + Criticidad) / Esfuerzo', prio_empty: 'No hay ideas para priorizar. Aparecen al cerrar un ciclo.',
  reject_title: 'Rechazar idea', reject_reason: 'Motivo (obligatorio y público)', accept_title: 'Aceptar al roadmap', decided: 'Decisiones recientes',
  q_quick: 'Quick wins', q_big: 'Grandes apuestas', q_fill: 'Relleno', q_discard: 'Descartar', low: 'bajo', high: 'alto',
  roadmap_admin_intro: 'Cada cambio de estado o período notifica al autor, votantes y seguidores.',
  settings_title: 'Configuración', board_section: 'Board', board_name: 'Nombre', logo_url: 'URL del logo', slug: 'Slug / URL',
  timezone: 'Zona horaria', cycle_section: 'Ciclos (aplica al próximo ciclo)', duration: 'Duración', top_n: 'Top N finalistas',
  supports_required: 'Apoyos para reclamar', cycles_to_archive: 'Ciclos sin reclamo antes de archivar',
  thresholds: 'Umbrales', a_threshold_pct: 'Ideas A: % Importante mínimo', a_min_responses: 'Ideas A: respuestas mínimas',
  b_alert_pct: 'Ideas B: alerta si No importante supera (%)', visibility: 'Visibilidad',
  c_show_after_vote: 'Ideas C: mostrar el conteo solo después de votar', b_public_counts: 'Ideas B: conteo público',
  categories: 'Categorías (una por línea)', product_button: 'Botón para tu producto',
  product_button_hint: 'Pegá este código en tu producto para llevar a tus usuarios a proponer ideas.',
  current_cycle: 'Ciclo en curso', ends_at: 'Cierra', starts_at: 'Empieza', copy: 'Copiar', copied: 'Copiado',
  // setup
  setup_title: 'Creá tu board', setup_intro: 'Configurá tu board de ideas y tu cuenta de admin.', org_name: 'Nombre de la organización',
  start_date: 'Fecha de inicio del primer ciclo', start_hint: 'Por defecto, el primer día del mes siguiente. Elegí hoy para empezar ya.',
  create_board: 'Crear board',
  // dev
  dev_title: 'Buzón de desarrollo', dev_intro: 'Sin SMTP configurado, los emails quedan acá. Configurá IB_SMTP_HOST para enviarlos de verdad.',
  filter_email: 'Filtrar por email', no_mail: 'No hay emails.',
  // errors
  err_login_required: 'Ingresá para continuar.', err_email_not_verified: 'Verificá tu email primero.',
  err_voting_closed: 'La votación de esta idea está cerrada.', err_cannot_vote_own_idea: 'No podés votar tu propia idea.',
  err_invalid_credentials: 'Email o contraseña incorrectos.', err_email_taken: 'Ya existe una cuenta con ese email.',
  err_invalid_email: 'Email inválido.', err_password_too_short: 'La contraseña debe tener al menos 8 caracteres.',
  err_invalid_name: 'Ingresá tu nombre.', err_invalid_token: 'El link no es válido o ya se usó.', err_token_expired: 'El link venció. Pedí uno nuevo.',
  err_rate_limited: 'Demasiados intentos. Probá en un rato.', err_invalid_title: 'El título debe tener entre 5 y 120 caracteres.',
  err_no_active_cycle: 'No hay un ciclo activo.', err_reason_required: 'El motivo es obligatorio.', err_already_supported: 'Ya apoyaste este reclamo.',
  err_cannot_claim: 'Esta idea no se puede reclamar ahora.', err_forbidden: 'No tenés permiso.', err_not_found: 'No encontrado.',
  err_invalid_reason: 'Contanos el motivo (mínimo 3 caracteres).', err_invalid_merge: 'Solo se pueden fusionar ideas del mismo tipo.',
  err_invalid_timezone: 'Zona horaria inválida.', err_invalid_date: 'Fecha inválida.', err_invalid_period: 'Período inválido (AAAA-MM o AAAA-Qn).',
  err_generic: 'Algo salió mal. Probá de nuevo.',
};

const en = {
  nav_ideas: 'Ideas', nav_finalists: 'Finalists', nav_roadmap: 'Roadmap', nav_admin: 'Admin',
  login: 'Sign in', logout: 'Sign out', register: 'Sign up', profile: 'My profile', dev_mail: 'Mailbox (dev)',
  admin_dashboard: 'Dashboard', admin_team: 'Team ideas', admin_moderation: 'Moderation', admin_close: 'Cycle close',
  admin_prioritization: 'Prioritization', admin_roadmap: 'Roadmap', admin_settings: 'Settings',
  made_with: 'Made with Insight Backlog',
  cycle: 'Cycle', cycle_closes: 'Closes on {date}', cycle_starts: 'Starts on {date}', cycle_scheduled: 'Next cycle',
  no_cycle: 'There is no active cycle yet.', days: 'days', hours: 'hours', minutes: 'min', seconds: 'sec',
  quarter: 'Q{q} {y}', mensual: 'Monthly', trimestral: 'Quarterly',
  propose: 'Propose an idea', live: 'Live',
  tab_community: 'Community', tab_team: 'From the team', tab_nonfinalists: 'Non-finalists',
  search: 'Search ideas…', all_categories: 'All categories', sort_ranking: 'Ranking', sort_recent: 'Most recent',
  empty_community: 'No ideas in this cycle yet. Propose the first one!',
  empty_team: 'The team hasn\'t published ideas for this cycle.', empty_nonfinalists: 'No non-finalist ideas.',
  origin_equipo: 'Team', origin_comunidad: 'Community',
  type_A: 'To validate', type_B: 'Confirmed', type_C: 'Community',
  st_en_votacion: 'Voting', st_finalista: 'Finalist', st_no_finalista: 'Non-finalist', st_reclamada: 'Claimed',
  st_validada: 'Validated', st_no_validada: 'Not validated', st_aceptada: 'Accepted', st_rechazada: 'Won\'t do',
  st_pospuesta: 'Postponed', st_en_roadmap: 'On roadmap', st_lanzada: 'Launched', st_archivada: 'Archived',
  st_planificada: 'Planned', st_en_desarrollo: 'In progress', st_en_evaluacion: 'Under review', st_medida: 'Measured',
  v_up: 'I like it', v_down: 'Not convinced', v_importante: 'Important', v_deseable: 'Nice to have', v_no_importante: 'Not important',
  your_answer_private: 'Your answer is private: only the team sees it.',
  counts_after_vote: 'Vote to see results', counts_private: 'Private results',
  votes_frozen: 'Voting closed', own_idea: 'It\'s your idea: you can\'t vote on it',
  down_reason_title: 'What worries you?', down_reason_hint: 'Optional. Only the team sees it.',
  down_reason_ph: 'Tell us why you\'re not convinced…', vote_down: 'Vote 👎', cancel: 'Cancel', save: 'Save',
  remove_vote: 'Remove vote', responses: '{n} responses', importance: '{pct}% Important',
  claim: 'Claim', support: 'Support', supported: 'Supported', claimed_missing: 'Claimed: {n} supports to go',
  claimed_by: 'Claimed by {name}', history_line: '{up} 👍 / {down} 👎 in {period}',
  claim_hint: 'At {n} supports it competes again in the current cycle, with votes reset to zero.',
  cycles_left: 'Archived after {n} cycles without a claim',
  back: '← Back', follow: 'Follow', following: 'Following', report: 'Report', comments: 'Comments',
  comment_ph: 'Write a comment…', comment_send: 'Comment', comment_private: 'On team ideas to validate, your comment is only visible to the team.',
  official_reply: 'Official reply', official_hint: 'As an admin, your comment is posted as an Official reply, visible to everyone.',
  private_comment: 'Private', no_comments: 'No comments yet.', history: 'Cycle history',
  status_history: 'Status changes', by: 'by {name}', rejected_reason: 'Reason: {reason}',
  report_title: 'Report content', report_reason: 'Reason', report_ph: 'Tell us what\'s wrong (spam, offensive, duplicate…)',
  report_sent: 'Thanks. The team got your report.', send: 'Send', merged_into: 'This idea was merged into another one.',
  position: 'Rank', score: 'Score', result: 'Result', period: 'Period', won_in: 'Won in cycle #{n}',
  voters: 'Voters (admin only)', reasons_down: '👎 reasons', no_voters: 'No votes yet.',
  admin_tools: 'Admin tools', hide: 'Hide', unhide: 'Unhide', edit: 'Edit', delete: 'Delete', merge: 'Merge',
  hidden_badge: 'Hidden', validation: 'Validation', threshold: 'Threshold: ≥ {pct}% Important and ≥ {min} responses',
  index: 'Index', would_validate: 'Meets the threshold', would_not_validate: 'Doesn\'t meet the threshold yet',
  propose_title: 'Propose an idea', title: 'Title', title_ph: 'E.g.: Export reports to Excel', description: 'Description',
  description_ph: 'What problem does it solve? How would you use it?', category: 'Category', none: 'No category',
  similar_title: 'Similar ideas: is it already proposed?', publish: 'Publish idea', published: 'Idea published!',
  propose_hint: 'It\'s published instantly in the active cycle with the Community badge.',
  finalists_title: 'Finalists by cycle', finalists_empty: 'No cycle has closed yet.',
  finalists_intro: 'When each cycle closes, the community\'s top ideas move on to team review.',
  roadmap_title: 'Roadmap', roadmap_intro: 'What we\'re going to build, with its origin in plain sight.', all_origins: 'All origins',
  all_statuses: 'All statuses', all_periods: 'All periods', roadmap_empty: 'Nothing here yet.',
  email: 'Email', password: 'Password', name: 'Name', login_title: 'Sign in to {board}', register_title: 'Create your account',
  magic_link: 'Email me a magic link', magic_sent: 'We sent a link to {email}. Check your inbox.',
  or: 'or', no_account: 'No account?', have_account: 'Already have an account?',
  register_hint: 'You\'ll get an email to verify your account. Votes only count with a verified email.',
  verify_banner: 'Verify your email to vote and publish ideas.', resend: 'Resend email', resent: 'Email resent.',
  verifying: 'Verifying…', verified_ok: 'Done! You can now vote and propose ideas.',
  login_needed: 'Sign in to take part', login_needed_text: 'You need an account with a verified email to vote, propose or comment.',
  profile_title: 'My profile', language: 'Language', notifications: 'Email notifications', my_ideas: 'My ideas',
  my_votes: 'My votes', saved: 'Saved', none_yet: 'Nothing yet.',
  pref_comment_on_idea: 'My idea got a comment', pref_official_reply: 'Official reply on an idea I follow or voted',
  pref_cycle_result: 'My idea\'s result when the cycle closes', pref_cycle_summary: 'Finalists summary when the cycle closes',
  pref_status_change: 'An idea I voted or follow changed status', pref_claim_back: 'An idea I claimed or supported competes again',
  pref_new_report: 'New report (admin)', pref_cycle_ending: '3 days left in the cycle (admin)', pref_b_alert: 'B idea with high Not important (admin)',
  days_left: 'Days left', new_ideas: 'New ideas', votes: 'Votes', participants: 'Participants',
  participation: '{pct}% of {n} users', top5: 'Community top 5', a_near: 'A ideas vs threshold', b_alerts: 'B idea alerts',
  reports_pending: 'Pending reports', prio_pending: 'Pending prioritization', no_alerts: 'No alerts.',
  near: 'Close', validated: 'Validated', go: 'View',
  new_team_idea: 'New team idea', type: 'Type', type_A_long: 'A · Team, to validate (Important / Nice to have / Not important)',
  type_B_long: 'B · Team, confirmed (Important / Not important)', create: 'Publish',
  team_results: 'Private results', relaunch: 'Relaunch', archive: 'Archive', alert_b: 'High Not important',
  reports: 'Report inbox', no_reports: 'No reports.', resolve: 'Resolve', dismiss: 'Dismiss',
  rep_pendiente: 'Pending', rep_resuelto: 'Resolved', rep_descartado: 'Dismissed',
  reported_by: 'Reported by {name}', object_deleted: '(content deleted)', all_ideas: 'Board ideas', hidden_comments: 'Hidden comments',
  merge_title: 'Merge duplicate idea', merge_into: 'Merge into…', merge_hint: 'Votes are added without double-counting users; comments and followers move to the target idea.',
  edit_idea: 'Edit idea', confirm_delete: 'Delete permanently?', confirm_delete_text: 'The idea, its votes and comments will be deleted. This can\'t be undone.',
  close_title: 'Cycle close', close_preview: 'Closing preview', close_confirm: 'Close cycle now',
  close_auto: 'If you do nothing, the cycle closes automatically on {date} (board timezone).',
  close_really: 'Close cycle #{n}?', close_really_text: 'Votes freeze, Finalists / Non-finalists / Validated are assigned, the next cycle opens and emails go out.',
  closed_ok: 'Cycle closed. The next one is open.', will_be_finalists: 'Become Finalists',
  will_be_nonfinalists: 'Become Non-finalists', a_results: 'A ideas', b_results: 'B ideas (expected impact)',
  expiring_claims: 'Claims expiring', to_archive: 'Will be archived', change_end: 'Change close date',
  prio_title: 'Prioritization table', table: 'Table', matrix: 'Matrix', impact: 'Impact', effort: 'Effort', revenue: 'Revenue',
  criticality: 'Criticality', suggested: 'sugg. {v}', accept: 'Accept', reject: 'Reject', postpone: 'Postpone',
  prio_formula: 'Score = (Impact + Revenue + Criticality) / Effort', prio_empty: 'Nothing to prioritize. Ideas show up when a cycle closes.',
  reject_title: 'Reject idea', reject_reason: 'Reason (required and public)', accept_title: 'Accept to roadmap', decided: 'Recent decisions',
  q_quick: 'Quick wins', q_big: 'Big bets', q_fill: 'Fillers', q_discard: 'Discard', low: 'low', high: 'high',
  roadmap_admin_intro: 'Every status or period change notifies the author, voters and followers.',
  settings_title: 'Settings', board_section: 'Board', board_name: 'Name', logo_url: 'Logo URL', slug: 'Slug / URL',
  timezone: 'Timezone', cycle_section: 'Cycles (applies to the next cycle)', duration: 'Duration', top_n: 'Top N finalists',
  supports_required: 'Supports to claim', cycles_to_archive: 'Cycles without claim before archiving',
  thresholds: 'Thresholds', a_threshold_pct: 'A ideas: minimum % Important', a_min_responses: 'A ideas: minimum responses',
  b_alert_pct: 'B ideas: alert if Not important exceeds (%)', visibility: 'Visibility',
  c_show_after_vote: 'C ideas: show counts only after voting', b_public_counts: 'B ideas: public counts',
  categories: 'Categories (one per line)', product_button: 'Button for your product',
  product_button_hint: 'Paste this snippet in your product to send users to propose ideas.',
  current_cycle: 'Current cycle', ends_at: 'Closes', starts_at: 'Starts', copy: 'Copy', copied: 'Copied',
  setup_title: 'Create your board', setup_intro: 'Set up your ideas board and your admin account.', org_name: 'Organization name',
  start_date: 'First cycle start date', start_hint: 'Defaults to the first day of next month. Pick today to start now.',
  create_board: 'Create board',
  dev_title: 'Development mailbox', dev_intro: 'Without SMTP, emails land here. Set IB_SMTP_HOST to really send them.',
  filter_email: 'Filter by email', no_mail: 'No emails.',
  err_login_required: 'Sign in to continue.', err_email_not_verified: 'Verify your email first.',
  err_voting_closed: 'Voting on this idea is closed.', err_cannot_vote_own_idea: 'You can\'t vote on your own idea.',
  err_invalid_credentials: 'Wrong email or password.', err_email_taken: 'An account with that email already exists.',
  err_invalid_email: 'Invalid email.', err_password_too_short: 'Password must be at least 8 characters.',
  err_invalid_name: 'Enter your name.', err_invalid_token: 'The link is invalid or was already used.', err_token_expired: 'The link expired. Request a new one.',
  err_rate_limited: 'Too many attempts. Try again later.', err_invalid_title: 'Title must be 5 to 120 characters.',
  err_no_active_cycle: 'There is no active cycle.', err_reason_required: 'A reason is required.', err_already_supported: 'You already supported this claim.',
  err_cannot_claim: 'This idea can\'t be claimed right now.', err_forbidden: 'You don\'t have permission.', err_not_found: 'Not found.',
  err_invalid_reason: 'Tell us the reason (at least 3 characters).', err_invalid_merge: 'Only ideas of the same type can be merged.',
  err_invalid_timezone: 'Invalid timezone.', err_invalid_date: 'Invalid date.', err_invalid_period: 'Invalid period (YYYY-MM or YYYY-Qn).',
  err_generic: 'Something went wrong. Try again.',
};

const DICTS = { es, en };
let lang = 'es';
let zone;

export function setLang(l) { lang = DICTS[l] ? l : 'es'; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function setZone(z) { zone = z; }

export function t(key, params) {
  let s = (DICTS[lang] && DICTS[lang][key]) ?? es[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(v);
  return s;
}

export function errText(code) {
  const k = 'err_' + code;
  return (DICTS[lang][k] || es[k]) ? t(k) : t('err_generic');
}

const locale = () => (lang === 'en' ? 'en-US' : 'es-AR');

export function fmtDate(ts, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  try { return new Intl.DateTimeFormat(locale(), { ...opts, timeZone: zone }).format(new Date(ts * 1000)); }
  catch { return new Date(ts * 1000).toLocaleDateString(); }
}
export const fmtDateTime = (ts) => fmtDate(ts, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function monthYear(ts) { return fmtDate(ts, { month: 'long', year: 'numeric' }); }
export function monthName(ts) { return fmtDate(ts, { month: 'long' }); }

function zoneParts(ts) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric' }).formatToParts(new Date(ts * 1000));
  return { y: +parts.find(p => p.type === 'year').value, m: +parts.find(p => p.type === 'month').value };
}

export function cycleLabel(c) {
  if (!c) return '';
  if (c.kind === 'trimestral') {
    const { y, m } = zoneParts(c.starts_at);
    return `${t('cycle')} #${c.number} · ${t('quarter', { q: Math.floor((m - 1) / 3) + 1, y })}`;
  }
  return `${t('cycle')} #${c.number} · ${monthYear(c.starts_at)}`;
}

export function periodLabel(p) {
  if (!p) return '';
  const m = /^(\d{4})-(Q[1-4]|\d{2})$/.exec(p);
  if (!m) return p;
  if (m[2].startsWith('Q')) return t('quarter', { q: m[2][1], y: m[1] });
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, 15));
  return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function relTime(ts) {
  const diff = ts - Date.now() / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(ts);
}
