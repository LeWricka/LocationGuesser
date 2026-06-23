import { useState } from 'react'
import { newGroupCode } from '../../lib/group'
import { supabase } from '../../lib/supabase'
import { joinGroupAsOwner } from '../../lib/membership'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { Button, Field, Input, Row, Spinner, Stack, useToast } from '../../ui'
import styles from './CreateGroup.module.css'

interface Props {
  onBack: () => void
}

// Crear un grupo (flujo grupo-primero). El grupo es el contenedor social del
// plan: un viaje, una despedida, un finde, una partida… No se crea ningún reto
// aquí; eso se hace luego dentro de la página del grupo. Quien crea queda como
// dueño (`created_by` + fila 'owner' en group_members) y navegamos a #g=<código>.
export function CreateGroup({ onBack }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { user } = useSession()

  async function create() {
    if (!user) {
      toast.show('Inicia sesión para crear un grupo.', { tone: 'danger' })
      return
    }
    setBusy(true)
    try {
      const groupId = newGroupCode()
      const trimmed = name.trim()
      // El creador es el dueño: `created_by` lo marca y el RLS de groups deja
      // editar/borrar solo a `created_by = auth.uid()`.
      const { error } = await supabase
        .from('groups')
        .insert({ id: groupId, name: trimmed || null, created_by: user.id })
      if (error) throw new Error(error.message)
      // Membresía 'owner' para que el grupo aparezca en "Tus grupos" (la home se
      // nutre de group_members). La fila propia la permite el RLS de inserción.
      await joinGroupAsOwner(groupId, user.id)
      track('group_created', { group_id: groupId })
      // Navegar a la página del grupo. El listener de hashchange de App.tsx
      // recoge el cambio y renderiza GroupPage.
      location.hash = `#g=${groupId}`
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // "Failed to fetch" suele ser la red del usuario (VPN, DNS, bloqueador),
      // no la app.
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo crear el grupo: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  return (
    <main className="lg-page">
      <Stack gap={4} className="lg-stagger">
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Crear un grupo</h1>
        </Row>

        <p className={styles.intro}>
          El grupo es el contenedor de tu plan: un viaje, una despedida, un finde, una partida…
          Dentro añadiréis retos y la clasificación se irá acumulando entre todos.
        </p>

        <Field label="Nombre del grupo" hint="Para que el grupo lo reconozca de un vistazo.">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="Despedida de Javi · Finde en Madrid · Viaje a Japón"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void create()
                }
              }}
            />
          )}
        </Field>

        <Button size="lg" fullWidth loading={busy} onClick={() => void create()}>
          Crear grupo
        </Button>

        {busy && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>Creando el grupo…</span>
          </Row>
        )}
      </Stack>
    </main>
  )
}
