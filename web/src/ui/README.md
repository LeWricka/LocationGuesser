# UI kit — LocationGuesser

Sistema de diseño del proyecto: **design tokens** + un conjunto pequeño de
componentes React (CSS Modules, sin librerías externas). Tema oscuro,
mobile-first. Todo se importa desde el barril:

```tsx
import { Button, Card, Field, Input, Stack, Row, useToast } from '../ui'
```

## Tokens

`tokens.css` define todas las variables CSS (color, tipografía, espaciado,
radios, sombras, z-index, breakpoints). Se importa una vez desde
`src/index.css`. **Regla:** los componentes consumen tokens (`var(--...)`),
nunca valores hardcodeados.

- Color: superficies (`--color-bg/surface/surface-raised`), texto
  (`--color-text/muted/faint`), acento de marca (`--color-accent…`),
  secundario (`--color-accent-2`), semánticos (success/warning/danger).
- Tipografía: `--font-size-xs … 2xl`, pesos, line-heights.
- Espaciado: `--space-1 … 8` (escala de 4px).
- Radios, sombras, `--tap-target` (44px), `--container-max`, z-index.

## Componentes

| Componente                     | Para qué                                 | Props clave                                                                                            |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Button`                       | Acciones                                 | `variant` (`primary`/`secondary`/`ghost`), `size` (`sm`/`md`/`lg`), `loading`, `fullWidth`, `disabled` |
| `Input`                        | Campo de texto                           | `invalid`, todo lo de `<input>`                                                                        |
| `Field`                        | Label + control + ayuda/error accesibles | `label`, `error`, `hint`, `hideLabel`, `children` (render prop)                                        |
| `Card`                         | Superficie/contenedor                    | `as`, `padding` (`none`/`sm`/`md`/`lg`), `raised`                                                      |
| `Modal`                        | Diálogo (full-screen en móvil)           | `open`, `onClose`, `title`, `footer`                                                                   |
| `Badge`                        | Estado compacto                          | `tone` (`neutral`/`accent`/`success`/`warning`/`danger`/`live`), `dot`                                 |
| `Spinner`                      | Carga                                    | `size`, `color`, `label`                                                                               |
| `Stack`                        | Layout vertical                          | `as`, `gap` (1–8), `align`                                                                             |
| `Row`                          | Layout horizontal                        | `as`, `gap`, `align`, `justify`, `wrap`                                                                |
| `ToastProvider` + `useToast()` | Avisos efímeros                          | `show(msg, { tone, duration })`, `dismiss(id)`                                                         |

## Convenciones

- Un componente por fichero. Interfaz de props **siempre llamada `Props`**.
- Estilos en `Componente.module.css` consumiendo tokens.
- Accesibilidad: roles/aria correctos, foco visible, objetivos táctiles ≥44px.

## Ejemplos

```tsx
// Formulario con validación accesible
<Field label="Nombre" error={error}>
  {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
</Field>

// Botón cargando
<Button loading={busy} onClick={save}>Guardar</Button>

// Toast (requiere <ToastProvider> en la raíz, ya montado en main.tsx)
const toast = useToast()
toast.show('Enlace copiado', { tone: 'success' })

// Modal a pantalla completa en móvil
<Modal open={open} onClose={close} title="Empezar reto" footer={<Button>Empezar</Button>}>
  Tienes 2 minutos para adivinar.
</Modal>
```
