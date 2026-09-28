"""Email notifications. Every email is stored in `notifications` (the outbox).
With IB_SMTP_HOST set, a background thread delivers them over SMTP; otherwise
they stay in the dev mailbox (/#/dev/mail)."""
import json
import os
import smtplib
import time
from email.message import EmailMessage

from .db import q, q1, ex, transaction

BASE_URL = os.environ.get("IB_BASE_URL", "http://localhost:8000").rstrip("/")
SMTP_HOST = os.environ.get("IB_SMTP_HOST")
SMTP_PORT = int(os.environ.get("IB_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("IB_SMTP_USER")
SMTP_PASS = os.environ.get("IB_SMTP_PASS")
SMTP_FROM = os.environ.get("IB_SMTP_FROM", "Insight Backlog <no-reply@insightbacklog.local>")

# Notification types a user can switch off from the profile.
PREF_TYPES = [
    "comment_on_idea", "official_reply", "cycle_result", "cycle_summary",
    "status_change", "claim_back", "new_report", "cycle_ending", "b_alert",
]
# Transactional emails that are always sent.
ALWAYS = {"verify", "magic"}

STATUS_LABELS = {
    "es": {
        "en_votacion": "En votación", "finalista": "Finalista", "no_finalista": "No finalista",
        "reclamada": "Reclamada", "validada": "Validada", "no_validada": "No validada",
        "aceptada": "Aceptada", "rechazada": "No se hará", "pospuesta": "Pospuesta",
        "en_roadmap": "En roadmap", "lanzada": "Lanzada", "archivada": "Archivada",
        "planificada": "Planificada", "en_desarrollo": "En desarrollo",
    },
    "en": {
        "en_votacion": "Voting", "finalista": "Finalist", "no_finalista": "Non-finalist",
        "reclamada": "Claimed", "validada": "Validated", "no_validada": "Not validated",
        "aceptada": "Accepted", "rechazada": "Won't do", "pospuesta": "Postponed",
        "en_roadmap": "On roadmap", "lanzada": "Launched", "archivada": "Archived",
        "planificada": "Planned", "en_desarrollo": "In progress",
    },
}

T = {
    "verify": {
        "es": ("Verificá tu email en {board}",
               "Hola {name}:\n\nConfirmá tu email para votar y proponer ideas en {board}.\n\n{link}\n\nEl link vence en 24 horas."),
        "en": ("Verify your email for {board}",
               "Hi {name},\n\nConfirm your email to vote and propose ideas on {board}.\n\n{link}\n\nThe link expires in 24 hours."),
    },
    "magic": {
        "es": ("Tu link para entrar a {board}",
               "Hola {name}:\n\nUsá este link para entrar a {board}:\n\n{link}\n\nVence en 30 minutos. Si no lo pediste, ignorá este email."),
        "en": ("Your sign-in link for {board}",
               "Hi {name},\n\nUse this link to sign in to {board}:\n\n{link}\n\nIt expires in 30 minutes. If you didn't request it, ignore this email."),
    },
    "comment_on_idea": {
        "es": ("Nuevo comentario en \"{title}\"", "{actor} comentó tu idea \"{title}\":\n\n{text}\n\nVer idea: {link}"),
        "en": ("New comment on \"{title}\"", "{actor} commented on your idea \"{title}\":\n\n{text}\n\nView idea: {link}"),
    },
    "official_reply": {
        "es": ("Respuesta oficial en \"{title}\"", "El equipo respondió en \"{title}\":\n\n{text}\n\nVer idea: {link}"),
        "en": ("Official reply on \"{title}\"", "The team replied on \"{title}\":\n\n{text}\n\nView idea: {link}"),
    },
    "cycle_result_finalist": {
        "es": ("¡Tu idea es Finalista! 🎉", "Cerró el ciclo #{n} y tu idea \"{title}\" quedó en el puesto {position} con score {score}.\nAhora pasa a evaluación del equipo.\n\nVer finalistas: {link}"),
        "en": ("Your idea is a Finalist! 🎉", "Cycle #{n} closed and your idea \"{title}\" finished #{position} with a score of {score}.\nIt now moves to team evaluation.\n\nSee finalists: {link}"),
    },
    "cycle_result_nonfinalist": {
        "es": ("Tu idea quedó No finalista", "Cerró el ciclo #{n} y tu idea \"{title}\" no entró en el top.\nQueda congelada, pero cualquier usuario puede reclamarla para que vuelva a competir.\n\nVer idea: {link}"),
        "en": ("Your idea didn't make the finals", "Cycle #{n} closed and your idea \"{title}\" didn't make the top.\nIt's frozen, but anyone can claim it to make it compete again.\n\nView idea: {link}"),
    },
    "cycle_summary": {
        "es": ("Cerró el ciclo #{n}: estas son las Finalistas", "Gracias por participar. Las Finalistas del ciclo #{n} son:\n\n{list}\n\nVer finalistas: {link}"),
        "en": ("Cycle #{n} closed: here are the Finalists", "Thanks for taking part. The Finalists of cycle #{n} are:\n\n{list}\n\nSee finalists: {link}"),
    },
    "status_change": {
        "es": ("\"{title}\" ahora está: {status}", "La idea \"{title}\" cambió de estado a {status}.{extra}\n\nVer idea: {link}"),
        "en": ("\"{title}\" is now: {status}", "The idea \"{title}\" changed status to {status}.{extra}\n\nView idea: {link}"),
    },
    "claim_back": {
        "es": ("\"{title}\" vuelve a competir", "El reclamo llegó a los apoyos necesarios: \"{title}\" vuelve a votación en el ciclo en curso.\n\nVotala: {link}"),
        "en": ("\"{title}\" is competing again", "The claim reached the supports needed: \"{title}\" is back in voting for the current cycle.\n\nVote: {link}"),
    },
    "new_report": {
        "es": ("Nuevo reporte en {board}", "{actor} reportó un(a) {object}: \"{text}\"\nMotivo: {reason}\n\nBandeja de moderación: {link}"),
        "en": ("New report on {board}", "{actor} reported a(n) {object}: \"{text}\"\nReason: {reason}\n\nModeration inbox: {link}"),
    },
    "cycle_ending": {
        "es": ("Faltan 3 días para el cierre del ciclo #{n}", "El ciclo #{n} cierra el {date}. Revisá la vista previa del cierre: {link}"),
        "en": ("3 days left in cycle #{n}", "Cycle #{n} closes on {date}. Review the closing preview: {link}"),
    },
    "b_alert": {
        "es": ("Alerta: \"{title}\" tiene alto No importante", "El {pct}% de las respuestas en la idea confirmada \"{title}\" son No importante ({n} respuestas).\n\nVer resultados: {link}"),
        "en": ("Alert: \"{title}\" has a high Not important rate", "{pct}% of responses on the confirmed idea \"{title}\" are Not important ({n} responses).\n\nSee results: {link}"),
    },
}


def link(path):
    return BASE_URL + "/#" + path


def status_label(status, lang):
    return STATUS_LABELS.get(lang, STATUS_LABELS["es"]).get(status, status)


def _prefs(user):
    try:
        return json.loads(user["notif_prefs"] or "{}")
    except ValueError:
        return {}


def notify(user_ids, kind, idea_id=None, pref=None, exclude=(), **params):
    """Render and queue an email for each user. `pref` is the preference key
    that can silence it (defaults to `kind`). Params may be callables of lang."""
    pref = pref or kind
    seen = set()
    for uid in user_ids:
        if uid is None or uid in seen or uid in exclude:
            continue
        seen.add(uid)
        user = q1("SELECT * FROM users WHERE id=?", uid)
        if not user:
            continue
        if kind not in ALWAYS and _prefs(user).get(pref) is False:
            continue
        lang = user["lang"] if user["lang"] in ("es", "en") else "es"
        values = {k: (v(lang) if callable(v) else v) for k, v in params.items()}
        values.setdefault("name", user["name"])
        subject, body = T[kind][lang]
        ex("INSERT INTO notifications (user_id, email, type, idea_id, subject, body, created_at, sent_at) VALUES (?,?,?,?,?,?,?,?)",
           uid, user["email"], kind, idea_id, subject.format(**values), body.format(**values), time.time(),
           None if SMTP_HOST else time.time())


def smtp_worker(stop_event):
    """Deliver queued emails when SMTP is configured."""
    if not SMTP_HOST:
        return
    while not stop_event.wait(5):
        with transaction():
            pending = [dict(r) for r in q("SELECT * FROM notifications WHERE sent_at IS NULL ORDER BY id LIMIT 20")]
        for n in pending:
            try:
                msg = EmailMessage()
                msg["From"], msg["To"], msg["Subject"] = SMTP_FROM, n["email"], n["subject"]
                msg.set_content(n["body"])
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                    s.starttls()
                    if SMTP_USER:
                        s.login(SMTP_USER, SMTP_PASS or "")
                    s.send_message(msg)
                with transaction():
                    ex("UPDATE notifications SET sent_at=? WHERE id=?", time.time(), n["id"])
            except Exception as e:  # keep trying on the next pass
                print("[smtp] error sending #%s: %s" % (n["id"], e))
