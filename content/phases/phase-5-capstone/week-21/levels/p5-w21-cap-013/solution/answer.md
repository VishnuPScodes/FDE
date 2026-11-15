# Deploy runbook

## Deploy

The service runs on a Render free web service connected to the main branch. To deploy, push to main with git and wait for the build to go green. Then open /health and check it returns 200.

## Environment Variables

WHATSAPP_TOKEN and SHEET_ID are set in the Render dashboard, never in the repo. PORT is set by the host. If a token changes, update it in the dashboard and redeploy the service.

## Rollback

If the new version breaks reminders, open the Render deploys list and redeploy the previous green deploy. Then fix the bug on a branch. Meena goes back to calling patients by hand until it is green again.

## Cost

Free. Rs 0 a month. The only limit is that the service sleeps when idle, so the morning job sends a keep-warm ping at 8:55.
