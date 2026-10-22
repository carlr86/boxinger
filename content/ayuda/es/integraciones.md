---
title: Zapier, Make, Google Forms y Google Sheets
summary: Recibí ideas solas desde otras herramientas, sin copiarlas a mano.
section: datos
order: 2
plans: Pro, Team y Enterprise
roles: Admin
covers: integrations, api, review, google_sheets, apps_script
---
Con una conexión, las ideas que llegan por un formulario o por otra herramienta entran solas al buzón, para que el equipo las revise.

## Crear la conexión

1. Entrá a **Configuración del buzón › Integraciones**.
2. Tocá **Crear conexión**. Te damos una **dirección** y una **clave**.
3. Copiá la clave y guardala: por seguridad se muestra una sola vez.

## Conectar tu herramienta

En la misma pantalla hay una guía paso a paso para cada una:

- **Google Forms:** gratis, con un código listo para pegar.
- **Google Sheets:** gratis, con un código listo para pegar en la planilla (ver abajo).
- **Make:** funciona con la cuenta gratis.
- **Zapier:** con *Webhooks by Zapier*.
- **Otra herramienta:** cualquiera que pueda mandar un pedido web.

Solo el título es obligatorio. También se puede mandar la descripción, el nombre y el email de quien la pidió, la categoría y un identificador para no repetir ideas.

## Desde una planilla de Google Sheets

Sirve cuando las sugerencias se guardan en una pestaña de una planilla, aunque las escriba un formulario propio de tu web o una app hecha con Apps Script.

1. En la planilla, entrá a **Extensiones › Apps Script**. Si ya tiene un proyecto (por ejemplo, tu app), se abre ese: no hace falta tocar lo que tiene.
2. Creá un archivo nuevo llamado **Boxinger** y pegá el código de la guía. Cambiá el nombre de la pestaña donde se guardan las sugerencias.
3. Elegí la función **boxingerPreparar** y tocá **Ejecutar**. Aceptá el permiso que pide Google.

Desde ahí, cada 5 minutos revisa la pestaña y manda las filas nuevas. En cada fila anota en la columna **Boxinger** si quedó *Enviada* o qué error tuvo. La primera fila tiene que tener los títulos de las columnas (Título, Descripción, Nombre, Email o parecidos).

> **Tip:** Si la sugerencia la guarda tu propio código de Apps Script, podés mandarla al instante: sumá una línea con `boxingerEnviar` en la función que la guarda y publicá una versión nueva de la app. En ese caso no ejecutes boxingerPreparar, para no mandarla dos veces.

## Revisar lo que llega

Las ideas llegan **ocultas** con la etiqueta *Por integración* y se ven en el filtro **Por revisar** del Buzón. Desde ahí se publican, se rechazan o se archivan. Al Admin le llega un aviso en la campanita.

> **Importante:** Hasta 200 ideas por día por buzón. Si la clave se filtra, creá una nueva: la anterior deja de funcionar.
