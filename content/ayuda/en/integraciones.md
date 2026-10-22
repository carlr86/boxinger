---
title: Zapier, Make, Google Forms and Google Sheets
summary: Get ideas on their own from other tools, without copying them by hand.
section: datos
order: 2
plans: Pro, Team and Enterprise
roles: Admin
covers: integrations, api, review, google_sheets, apps_script
---
With a connection, ideas arriving through a form or another tool come into the board on their own, for the team to review.

## Create the connection

1. Go to **Board settings › Integrations**.
2. Tap **Create connection**. We give you an **address** and a **key**.
3. Copy the key and keep it: for security it's shown only once.

## Connect your tool

The same screen has a step-by-step guide for each:

- **Google Forms:** free, with code ready to paste.
- **Google Sheets:** free, with code ready to paste into the sheet (see below).
- **Make:** works with the free account.
- **Zapier:** with *Webhooks by Zapier*.
- **Another tool:** any that can send a web request.

Only the title is required. You can also send the description, the requester's name and email, the category and an identifier to avoid duplicates.

## From a Google Sheets spreadsheet

Useful when suggestions are saved in a tab of a spreadsheet, even when your own web form or an Apps Script app writes them.

1. In the sheet, go to **Extensions › Apps Script**. If it already has a project (for example, your app), that one opens: no need to touch what's in it.
2. Create a new file called **Boxinger** and paste the code from the guide. Change the name of the tab where suggestions are saved.
3. Pick the **boxingerPreparar** function and tap **Run**. Accept the permission Google asks for.

From then on, every 5 minutes it checks the tab and sends the new rows. On each row, the **Boxinger** column says whether it was *Enviada* (sent) or what error it had. The first row must have the column titles (Title, Description, Name, Email or similar).

> **Tip:** If your own Apps Script code saves the suggestion, you can send it instantly: add a line with `boxingerEnviar` to the function that saves it and publish a new version of the app. In that case don't run boxingerPreparar, so it isn't sent twice.

## Review what comes in

Ideas arrive **hidden** with the *Via integration* tag and show in the board's **To review** filter. From there they're published, rejected or archived. The Admin gets a notice in the bell.

> **Important:** Up to 200 ideas per day per board. If the key leaks, create a new one: the old one stops working.
