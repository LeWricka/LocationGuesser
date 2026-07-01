# Validación de producto — Tabide (jul 2026)

> Ejercicio de validación **simulada**: un PM (agente) revisó la app y entrevistó a
> cuatro personas de cliente objetivo **role-play** (Marta, Javi, Nerea/Pablo, Rosa).
> No es user research real: sirve para estructurar hipótesis y detectar riesgos de
> bucle/fricción, **no** para confirmar demanda, disposición a pagar ni retención.
> Léase como "lo que predicen estos arquetipos", pendiente de contraste real (§7).

**Personas:** Marta (la que organiza el grupo) · Javi (participante que solo mira) ·
Nerea y Pablo (pareja que viaja) · Rosa (madre que sigue desde casa).

---

## 1. Diagnóstico (Rumelt): qué problema resuelve y para quién, y dónde falla el encaje hoy

**El problema real.** Los grupos que viajan (o siguen a los suyos desde casa) ya comparten el viaje, pero el canal —WhatsApp + álbum compartido— es un río donde las fotos se pierden, no hay recuerdo permanente ni mapa, y el "juego de adivinar dónde estoy" se arbitra a ojo. Polarsteps resuelve el diario bonito pero es **un monólogo en solitario** (Marta y Nerea): no hay grupo, no hay pique, no hay respuesta. El hueco de Tabide es la intersección: **diario visual colectivo sobre un mapa + capa de juego con respuesta objetiva**, envuelto en algo estéticamente digno de guardar.

**Para quién (la clave del diagnóstico).** El producto tiene **cuatro roles asimétricos**, no un usuario:
- **Marta (organizadora)** — pone el esfuerzo; punto único de fallo. Si no recibe reacción, abandona.
- **Javi (participante pasivo)** — reacciona, juega a ratos, no sube nada. **Hace o rompe el efecto red**: si él no entra, el bucle muere en 2-3 personas.
- **Nerea/Pablo (pareja curadora)** — donde Tabide compite de frente con Polarsteps y donde **más disposición a pagar** hay.
- **Rosa (audiencia desde casa)** — la más fiel y la menos técnica; quiere **ver**, no jugar.

**Dónde falla el encaje hoy:** el producto está diseñado alrededor del *creador* y del *juego*, pero **el valor que todos citan primero es el mapa-diario colectivo y el recap final, y el bucle vive o muere por los roles de bajo esfuerzo** (Javi y Rosa). Tres tensiones:

1. **El muro de login/email tapa la propuesta de valor antes de mostrarla.** Los cuatro lo señalan como barrera nº1. Pide el máximo esfuerzo a quien tiene el mínimo interés. Es el "pecado original" (Nerea).
2. **El juego está sobrevalorado en la narrativa y el diario infravalorado.** Incluso Marta dice que el corazón es el diario compartido y que adivinar "se gasta en tres retos" (Javi). El reto es la *chispa*, no el *plato*.
3. **La retención depende de un motor —notificaciones/pique— que aún no está entregado.** Push + reacciones es riesgo de bucle, no un extra.

**Política guía implícita:** ganar primero el **modo pasivo sin fricción** (ver el diario sin cuenta) y el **motor de retorno** (push + reacciones); el juego y la monetización vienen después, sobre una base que ya vuelve.

## 2. Qué FALTA (huecos priorizados)

| Hueco | Evidencia | Impacto | Apetito |
|---|---|---|---|
| **Ver el viaje SIN cuenta (invitado)** — enlace → mapa+fotos ya; cuenta solo para jugar/comentar | Los 4 | **Muy alto** — desbloquea el efecto red | **Alto** |
| **Push/notificaciones reales** | Marta, Javi, Rosa | **Muy alto** — sin esto no hay retorno | **Medio** (PWA en curso) |
| **Reacciones / comentarios dentro** | Javi, Nerea, Rosa | **Alto** — evita fuga a WhatsApp | **Medio** |
| **Recap/álbum final descargable y compartible fuera** | Marta, Nerea, Rosa | **Alto** — principal driver de pago | **Alto/Medio** |
| **Autodetección del lugar por GPS de la foto** | Marta, Nerea | **Alto** — baja el esfuerzo del creador | **Medio** |
| **Foto + reto en un solo paso** | Nerea, Marta | **Medio-alto** | **Alto** |
| **Coautoría del mismo viaje** | Nerea | **Medio** | **Medio** |
| **Ejemplos in-situ de "¿Adivinas?"** | Nerea, Javi | **Medio** | **Alto** |
| **Accesibilidad (letra grande, web, no store)** | Rosa | **Medio** | **Medio** |
| **Sincronizar con el carrete / sugerir fotos del día** | Nerea | **Medio** | **Bajo** |
| **Offline / mala cobertura** | Nerea | **Bajo-medio** | **Bajo** |
| **Diario más rico (fechas, notas, gastos)** | Nerea | **Bajo** | **Bajo** |

## 3. Fricciones — foco en el MURO DE LOGIN/EMAIL

Es, con diferencia, la fricción dominante: el **único punto que mencionan los cuatro** y el único que varios cuantifican como pérdida de red.

- **Marta:** *"Si a mi cuñado le mando esto y lo primero es 'mete tu email y espera el código', la mitad no pasa de ahí."* (~3-4 de 8 el primer día).
- **Javi:** *"Entro por el enlace esperando ver las fotos como en Instagram, y me piden email + OTP. Ahí abandono medio grupo."*
- **Nerea:** *"El problema es que mi familia tenga que crear cuenta y salir al correo antes de ver una sola foto. La mitad se me cae ahí y acabo duplicando en WhatsApp."*
- **Rosa:** *"Si para ver la primera foto me piden cuenta, llamo a mi hijo… y si no coge, lo dejo, y 'luego' a veces no llega."*

**Por qué pesa:** cobra el máximo esfuerzo a los roles de mínimo interés (Javi, Rosa) —justo los que necesitas para pasar de 3 a 15— y **rompe el momento en caliente** (salir → correo → OTP → volver). El avatar/nombre obligatorio es un **segundo peaje**.

**Opciones para bajarlo** (de menor a mayor coste): (1) **vista de invitado por enlace** (ver en solo-lectura sin cuenta; cuenta solo al primer acto de participar); (2) **viaje demo público** enlazable; (3) **login diferido y ligero** (OTP autofill, sin avatar/nombre hasta que aporte); (4) **deep link que preserve el contexto** (aterrizar en el reto que venías a ver).

**Fricción secundaria:** el eslogan *"Comparte tus momentos de una forma diferente"* es vago (Marta) — la primera pantalla debe **mostrar el mapa con fotos clavadas**, no explicarlo. **Terciaria:** sin comentarios/reacciones nativos la conversación se fuga a WhatsApp y Tabide queda muerto.

## 4. Negocio y disposición a pagar

- **Se paga por PERMANENCIA + RECAP, no por el juego** (unánime). Cobrar por jugar o por ver mataría el bucle.
- **El vídeo/álbum final es el principal driver de pago**, con condición: **descargable/compartible fuera** y **de calidad**.

| Segmento | Quién paga | Modelo y rango |
|---|---|---|
| **Grupo de amigos** | La organizadora (el reparto entre amigos **fracasa** — Javi) | 5-10 €/viaje o 15-20 €/año |
| **Pareja / viaje grande** (mejor LTV) | Nerea sola, sin repartir | **15-25 €/viaje** o **30-40 €/año** |
| **Familia desde casa** | Ayuda a pagar el álbum, no suscripción | ~15-20 € por álbum |

**Lecturas:** mejor cliente = **pareja/viaje-grande**; peor encaje = **suscripción mensual** (los cuatro la rechazan). Modelo natural = **pago por evento** (cobrar **al cerrar**, cuando el valor ya existe) + anual opcional; freemium con techo generoso (foto+diario+mapa+jugar gratis; **permanencia larga + recap = de pago**).

## 5. Diferenciación (DHM)

- **Delight:** el **mapa satélite con las fotos del grupo clavadas** (favorito de los cuatro) + el **recap final** + el pique con respuesta objetiva (delight secundario y perecedero).
- **Hard-to-copy:** la **combinación** diario colectivo + mapa + juego objetivo + estética "recuerdo bonito" no la tiene nadie de una pieza (Polarsteps = solitario; WhatsApp = sin mapa/permanencia/juego; BeReal = sin diario/mapa; GeoGuessr = con desconocidos, sin tu vida). El **foso real es el efecto red del grupo + el recuerdo acumulado**, aún frágiles porque el bucle no cierra. La estética es copiable.
- **Margin:** stack sin backend propio → coste marginal bajo; el gasto variable es **Storage + render del recap**. Margen sano si el recap se genera eficiente (plantillas, render bajo demanda al cerrar) y el vídeo no se regala caro.

## 6. Propuestas priorizadas (impacto × apetito) — top 8

1. **Vista de invitado por enlace (ver sin cuenta).** Fricción nº1 de los cuatro. Desbloquea el efecto red. **M.**
2. **Push/notificaciones que funcionen** ("hay reto", "te han adelantado", "tu hija subió algo"), controlables. Sin retorno no hay retención. **M.**
3. **Reacciones y comentarios nativos por momento.** Retorno emocional del creador; freno a la fuga a WhatsApp. **S-M.**
4. **Recap/álbum final descargable y compartible fuera.** Principal driver de pago. **L** (álbum estático **M**; vídeo pulido **L/XL**).
5. **Foto + reto en un solo paso.** Reduce el curro del creador. **S.**
6. **Autodetección del lugar por GPS (EXIF controlado).** Cuidado: el GPS es la respuesta del reto — separar "clavar en diario" de "revelar en reto". **M.**
7. **Ejemplos in-situ de "¿Adivinas?" + demo pública.** Mostrar en vez de explicar. **S.**
8. **Coautoría del viaje + onboarding accesible (mayores, web, letra grande).** **M** / **S.**

*(1-3 = núcleo del bucle social, primero; 4 = núcleo de monetización; 5-7 bajan fricción; 8 amplía roles.)*

## 7. Hipótesis a validar con usuarios REALES

Esto viene de arquetipos role-play, sesgados a confirmar la tesis. A validar de verdad:

1. **Magnitud real del daño del login-gate** (las cifras "3-4 de 8" son inventadas por el arquetipo) → A/B invitado vs muro.
2. **¿La vista de invitado sube activación o solo el vistazo?** → conversión invitado→primer pin/comentario.
3. **Retención real con push** → cohortes D1/D7; ¿el reto "se gasta en tres"?
4. **Adopción del grupo entero** (vive de 12-15, no 3) → % de miembros con ≥1 acción por viaje.
5. **Disposición a pagar real** → test de precio (pre-venta del recap, paywall al cerrar); validar pago-por-evento > suscripción y que el reparto entre amigos fracasa.
6. **Que el recap justifique el pago** → enseñar recaps reales y medir compra; ¿basta álbum o exige vídeo?
7. **WhatsApp como competidor de retención** → dónde ocurre la cháchara en viajes reales.
8. **Segmento de mayor valor** (hipótesis: pareja/viaje-grande > grupo de amigos).
9. **Fatiga del reto** → frecuencia óptima por día.
10. **La audiencia-desde-casa (Rosa) como vector de adquisición** → conversión espectador→organizador.

**Secuencia recomendada:** piloto con **un grupo de viaje real** (el caso origen) instrumentado, midiendo % de adopción del grupo y retorno con push; en paralelo, **test de paywall del recap** con parejas. Ataca las dos hipótesis que más pueden hundir el negocio: **el bucle no cierra más allá de 2-3 personas** y **nadie paga lo que dice que pagaría**.
