-- 0006_group_prizes — "qué se juega" del grupo a nivel de la clasificación general.
-- Texto libre, editable solo por el dueño. No hay pagos ni automatismos: solo la
-- descripción del premio; el reparto lo hace el grupo en la vida real. Nullable:
-- los grupos existentes y los recién creados no lo tienen hasta que el dueño lo escribe.
-- La seguridad ya la da la policy "groups_update_owner" (0004): UPDATE solo si
-- created_by = auth.uid(), así que un miembro no puede cambiar el premio.
alter table public.groups add column if not exists prizes text;
