// Carga y compone los datos de la home a partir de la membresía (lib/membership)
// y los mapea a la forma que consume el UI kit (HomeGroup). La home es presentación:
// aquí solo orquestamos helpers de lib/ y traducimos tipos; no hay lógica de datos
// nueva (esa vive en lib/).
//
// Fase "nuevo enfoque": el home vende recuerdos + compartir. Ya NO calculamos "tus
// números" ni la sección "te toca jugar" (eso vivía en el dashboard viejo); el estado
// "en juego"/"te toca" baja al indicador de cada tarjeta de viaje vía group.status.

import { useCallback, useEffect, useState } from 'react'
import type { HomeGroup } from '../../ui'
import { myGroups } from '../../lib/membership'
import type { MyGroup } from '../../lib/membership'

interface HomeData {
  groups: HomeGroup[]
}

interface State {
  loading: boolean
  error: boolean
  data: HomeData
}

const EMPTY: HomeData = { groups: [] }

// El estado de membresía es 'live' | 'your-turn' | 'idle'; el GroupCard del kit
// usa 'live' | 'toplay' | 'idle'. Solo cambia el nombre del caso "te toca".
function toUiStatus(status: MyGroup['status']): HomeGroup['status'] {
  return status === 'your-turn' ? 'toplay' : status
}

function toHomeGroup(group: MyGroup): HomeGroup {
  return {
    id: group.id,
    name: group.name ?? group.id, // sin nombre aún → mostramos el código del grupo
    status: toUiStatus(group.status),
    owned: group.isOwner,
  }
}

async function loadHomeData(userId: string): Promise<HomeData> {
  const groups = await myGroups(userId)
  return { groups: groups.map(toHomeGroup) }
}

/**
 * Hook de datos de la home. Recarga al montar y expone `reload` (lo usa el
 * realtime de HomePage). Mientras carga, `loading=true` para que la pantalla
 * muestre skeletons; ante error, `error=true` y un aviso (sin romper la app).
 */
export function useHomeData(userId: string | undefined) {
  const [state, setState] = useState<State>({ loading: true, error: false, data: EMPTY })

  const reload = useCallback(async () => {
    if (!userId) {
      setState({ loading: false, error: false, data: EMPTY })
      return
    }
    try {
      const data = await loadHomeData(userId)
      setState({ loading: false, error: false, data })
    } catch {
      setState({ loading: false, error: true, data: EMPTY })
    }
  }, [userId])

  useEffect(() => {
    // reload es async: el setState corre tras los fetch, no síncrono en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async, no síncrona
    void reload()
  }, [reload])

  return { ...state, reload }
}
