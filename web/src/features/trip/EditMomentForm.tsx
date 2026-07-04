import { AppHeader, Button, DatePicker, Field, IconPin, Input, Stack } from '../../ui'
import { MapPicker } from '../create/MapPicker'
import { VoiceRecorder, type VoiceValue } from '../create/VoiceRecorder'
import { MomentGallery } from './MomentGallery'
import type { Moment } from '../../lib/trip'
import type { LatLng } from '../../lib/geo'
import styles from './EditMomentForm.module.css'

interface Props {
  /** Recuerdo que se está editando (siempre existe: solo se monta con editingMeta). */
  moment: Moment
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  /** Fecha en `YYYY-MM-DD` para el DatePicker. */
  date: string
  onDateChange: (value: string) => void
  /** Tope superior del calendario (mismo criterio que "Nuevo recuerdo", #565). */
  maxDate: string
  place: LatLng | null
  onPlaceChange: (place: LatLng | null) => void
  /** Nota de voz del recuerdo (≤60s, issue #648): existente, regrabada o ninguna. */
  voice: VoiceValue
  onVoiceChange: (value: VoiceValue) => void
  /**
   * ¿Se va a quitar el clip de vídeo al guardar? (issue #649). v1 SOLO permite
   * quitar un clip ya existente al editar — grabar/elegir uno nuevo se hace en
   * "Nuevo recuerdo" (`AddMoment`, con el picker de fotos+vídeo completo); un
   * segundo picker aquí es sobre-alcance para esta primera versión.
   */
  videoRemoved: boolean
  onRemoveVideo: () => void
  saving: boolean
  onCancel: () => void
  onSave: () => void
  /** Tras cambiar la galería (portada/añadir/quitar): refresca el viaje. */
  onGalleryChanged?: () => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

/**
 * EDITAR RECUERDO — formulario utilitario de PAPEL (issue #571). Antes, editar un
 * recuerdo heredaba el layout de ESCENA de su vista (foto/vacío negro a media
 * pantalla, título serif gigante, chip flotante): una TAREA (editar) disfrazada de
 * inmersión (ver). Regla de sistema: ESCENA = inmersivo (consumir), TAREA = papel
 * (crear/editar). Misma gramática que "Nuevo recuerdo" (`AddMoment`): cabecera con
 * título + atrás, y en flujo fotos → sitio → título → descripción → fecha → CTA.
 *
 * Vive como subcomponente PRESENTACIONAL: todo el estado (borrador de título/fecha/
 * lugar/descripción) y las llamadas a la capa de datos siguen en `MomentSheet`, que
 * ya las tenía antes de este fix — así el guardado combinado (título+descripción+
 * lugar+fecha en una sola escritura) y el resto de sub-flujos del dueño (convertir en
 * reto, borrar) no se tocan. Este componente solo decide CÓMO se ve la tarea.
 */
export function EditMomentForm({
  moment,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  date,
  onDateChange,
  maxDate,
  place,
  onPlaceChange,
  voice,
  onVoiceChange,
  videoRemoved,
  onRemoveVideo,
  saving,
  onCancel,
  onSave,
  onGalleryChanged,
}: Props) {
  const titleValid = title.trim().length > 0

  return (
    <div className={styles.form}>
      {/* Cabecera de tarea: "atrás" cancela la edición y vuelve a la vista del
          recuerdo (la hoja sigue abierta, no se cierra del todo). */}
      <AppHeader lead="back" onLead={onCancel} leadLabel="Cancelar" title="Editar recuerdo" />

      <Stack gap={5} className={`${styles.body} lg-stagger`}>
        {/* FOTOS — la tira/galería editable que ya existe para un recuerdo (portada,
            añadir, quitar), la misma que se ve en la vista. */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>Fotos</span>
          <MomentGallery
            challengeId={moment.challengeId}
            initialCoverUrl={moment.imageUrl}
            canEdit
            onChanged={onGalleryChanged}
          />
        </section>

        {/* CLIP DE VÍDEO (issue #649): solo si el recuerdo ya tenía uno y no se ha
            marcado para quitar. v1 no permite AÑADIR uno aquí (ver comentario de
            `videoRemoved` en las Props) — solo verlo y, si acaso, quitarlo. */}
        {moment.videoUrl && !videoRemoved && (
          <section className={styles.block}>
            <span className={styles.blockLabel}>Clip de vídeo</span>
            <div className={styles.videoRow}>
              <video
                className={styles.videoPreview}
                controls
                playsInline
                poster={moment.imageUrl ?? undefined}
                src={moment.videoUrl}
              />
              <button type="button" className={styles.removeVideo} onClick={onRemoveVideo}>
                Quitar clip
              </button>
            </div>
          </section>
        )}

        {/* SITIO — mismo MapPicker que ya usaba la edición; solo cambia el envoltorio. */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            <IconPin size={16} /> Sitio del recuerdo{' '}
            <span className={styles.optional}>opcional</span>
          </span>
          <Stack gap={3}>
            <MapPicker
              value={place}
              flyTo={place}
              center={place ?? SPAIN}
              zoom={place ? 12 : 4}
              onPick={onPlaceChange}
            />
            <div className={styles.placeRow}>
              <span className={styles.hint}>
                {place
                  ? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`
                  : 'Toca el mapa para situarlo.'}
              </span>
              {place && (
                <button
                  type="button"
                  className={styles.removePlace}
                  onClick={() => onPlaceChange(null)}
                >
                  Quitar lugar
                </button>
              )}
            </div>
          </Stack>
        </section>

        {/* TÍTULO + DESCRIPCIÓN + FECHA — Field normal, SIN previsualización
            gigante: el título se escribe una vez, en un input, como cualquier dato
            del formulario (no como una portada editorial en vivo). */}
        <section className={styles.block}>
          <Field label="Título" hint="Cómo lo recordarás de un vistazo." required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder="Atardecer en Santorini"
                value={title}
                maxLength={120}
                onChange={(e) => onTitleChange(e.target.value)}
              />
            )}
          </Field>

          <Field label="Descripción" hint="Lo que viviste ahí (opcional).">
            {(fieldProps) => (
              <textarea
                {...fieldProps}
                className={styles.textarea}
                placeholder="Cuenta el día: dónde fue, qué pasó…"
                rows={3}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
              />
            )}
          </Field>

          {/* NOTA DE VOZ — junto a la descripción (issue #648), mismo sitio que
              en "Nuevo recuerdo". `VoiceRecorder` es controlado: `existing` si el
              recuerdo ya tenía una, `draft` si se regrabó, `none` si se descartó. */}
          <div className={styles.voiceField}>
            <span className={styles.voiceLabel}>
              Nota de voz <span className={styles.optional}>opcional</span>
            </span>
            <VoiceRecorder value={voice} onChange={onVoiceChange} disabled={saving} />
          </div>

          <Field label="Fecha">
            {(fieldProps) => (
              <DatePicker
                {...fieldProps}
                value={date}
                max={maxDate}
                placeholder="Elige el día"
                onChange={(v) => onDateChange(v ?? '')}
              />
            )}
          </Field>
        </section>

        {/* CTA — guardar los cambios, al pie del flujo (misma gramática que
            "Guardar recuerdo" en AddMoment: no es un footer fijo, es el último
            paso del formulario). */}
        <Button size="lg" fullWidth loading={saving} disabled={!titleValid} onClick={onSave}>
          Guardar
        </Button>
        {!titleValid && !saving && (
          <span className={styles.hint}>Falta el título del recuerdo para poder guardarlo.</span>
        )}
      </Stack>
    </div>
  )
}
