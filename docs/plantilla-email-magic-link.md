# Plantilla del email — Magic Link

Texto del correo que recibe quien entra con enlace mágico. Se pega en el panel de
Supabase: **Authentication → Emails → Magic Link**.

- La variable `{{ .ConfirmationURL }}` la rellena Supabase con el enlace real (no la cambies).
- Hay dos campos: **Subject heading** (asunto) y **Message body** (cuerpo HTML).
- Idioma: español. Tono social y cercano (el contenedor es un **grupo**: viaje, despedida, finde, partida…).

---

## Asunto (Subject heading)

```
Tu enlace para entrar en LocationGuesser
```

---

## Cuerpo (Message body — HTML)

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1419;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#171f29;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 8px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#eaf0f6;">
              Location<span style="color:#36c5a8;">Guesser</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#eaf0f6;">
              Entra para jugar 🗺️
            </h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9fb0c0;">
              Pulsa el botón para entrar en tu cuenta y unirte a la partida. Sin contraseñas.
            </p>
            <a href="{{ .ConfirmationURL }}"
               style="display:inline-block;background:#36c5a8;color:#042018;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:12px;">
              Entrar en LocationGuesser
            </a>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6f8295;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="{{ .ConfirmationURL }}" style="color:#2aa0e0;word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px;border-top:1px solid #2b3947;margin-top:24px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6f8295;">
              El enlace caduca en una hora y solo sirve una vez. Si no has pedido entrar, ignora este correo.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```
