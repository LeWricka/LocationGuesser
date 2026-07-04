// Invitación de CO-DUEÑO (issue #707): "separar las invitaciones: ver vs
// administrador". El enlace normal (`shareLinks.tripShareUrl`) da de alta como
// MIEMBRO; este enlace, de un solo uso, asciende directamente a co-dueño al
// canjearlo. Autoridad de servidor: el cliente solo pide el token
// (`createOwnerInvite`, respaldado por RLS `group_invites_insert_owner`,
// migración 0038) y lo canjea (`redeemOwnerInvite`, RPC SECURITY DEFINER); nunca
// decide en cliente quién puede ascender a quién.

import { supabase } from './supabase'
import { describeError } from './errors'

/**
 * Emite un enlace de co-dueño para `groupId`: inserta una fila en
 * `group_invites` (role='owner', expira a los 7 días — default en servidor) y
 * devuelve su token. `createdBy` es el uuid de la sesión actual (`user.id`,
 * mismo patrón que `createdBy` en `challenges.ts`). Solo un dueño del grupo
 * puede llamarla: la RLS `group_invites_insert_owner` (0038) exige ser dueño
 * (creador raíz o co-dueño) y que `created_by` sea uno mismo; un no-dueño
 * recibe un error de RLS, no 0 filas silenciosas (a diferencia de UPDATE/
 * DELETE, un INSERT sin match de policy falla explícito).
 */
export async function createOwnerInvite(groupId: string, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('group_invites')
    .insert({ group_id: groupId, role: 'owner', created_by: createdBy })
    .select('token')
    .single()
  if (error) throw new Error(describeError(error))
  return data.token
}

/**
 * Canjea un enlace de co-dueño a través de la RPC `redeem_owner_invite`
 * (SECURITY DEFINER, migración 0038): valida el token (existe, no usado, no
 * caducado) y asciende — o da de alta directamente — a la sesión actual como
 * 'owner' del grupo. Un solo uso: canjear el mismo token dos veces lanza en la
 * segunda ("ya se ha usado"). El llamante decide el fallback (alta normal de
 * miembro) si esto lanza — ver `useDeepLinkJoin`.
 */
export async function redeemOwnerInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_owner_invite', { invite_token: token })
  if (error) throw new Error(describeError(error))
  if (!data) throw new Error('El canje no devolvió el viaje')
  return data
}
