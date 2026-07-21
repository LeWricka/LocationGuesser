# Modelo económico del producto

## ¿Para qué sirve este documento?

Definir **cómo el producto crea, captura y entrega valor económico**. Esta es una pieza estratégica que va entre el diagnóstico y la política guía: una vez entendemos el mercado, la competencia y a los usuarios, decidimos cómo monetizamos.

Sin un modelo económico claro, todas las decisiones de producto se vuelven arbitrarias.

## Preguntas clave que debe responder

1. ¿**Quién paga**, cuánto, por qué y con qué frecuencia?
2. ¿Cuáles son los **drivers** principales de ingresos y costes?
3. ¿Qué **unit economics** queremos lograr?
4. ¿Cómo escala el modelo con el volumen?
5. ¿Qué **palancas** tenemos para mejorar márgenes?
6. ¿Qué **modelos descartamos** (y por qué)?

## Recomendación

- Empezar simple. Modelos complicados generalmente esconden problemas.
- Validar las suposiciones económicas igual de duro que las de producto.
- **Unit economics primero** — si no funcionan a pequeña escala, no van a funcionar a gran escala.

---

## Modelo elegido

> Una o dos frases que capturan cómo gana dinero el producto.

> TODO

### Tipo de modelo

> Marca el que aplica:

- [ ] **Suscripción** (recurrente: SaaS, membership)
- [ ] **Transaccional** (cobro por uso o compra puntual)
- [ ] **Freemium** (gratis con upgrade a pago)
- [ ] **Marketplace** (comisión sobre transacciones)
- [ ] **Publicidad** (monetizamos atención)
- [ ] **Licencia** (pago por instalación/usuario/año)
- [ ] **Servicios** (consultoría, implantación, soporte)
- [ ] **Hardware + recurrente** (consola + juegos, café + cápsulas)
- [ ] **B2B2C** (intermediario monetiza)
- [ ] **Híbrido**: > TODO especificar

---

## Quién paga y por qué

> Importante: **el usuario y quien paga no siempre son la misma persona** (especialmente en B2B y B2B2C).

**Pagador (customer):**
> TODO: ¿Quién pone el dinero? ¿Qué rol tiene? ¿Decisor, influencer, comprador?

**Usuario (user):**
> TODO: ¿Quién usa el producto día a día? ¿Cómo se relaciona con el pagador?

**Comprador vs decisor (si aplica):**
> TODO

**¿Por qué pagan?**
> TODO: La razón **emocional y racional** de por qué abren la cartera.

**¿Qué problema económico/operativo les estamos resolviendo?**
> TODO: Tiempo, dinero, riesgo, oportunidad perdida.

---

## Estructura de ingresos

### Fuentes de ingresos

| Fuente | Tipo | % esperado de ingresos | Notas |
|--------|------|------------------------|-------|
| > TODO | Suscripción/Transacción/Comisión | > TODO | > TODO |

### Pricing

**Estrategia de precio:**
> TODO: ¿Por valor, coste, competencia o penetración?

**Tiers / planes (si aplica):**

| Plan | Precio | Para quién | Qué incluye |
|------|--------|-----------|-------------|
| > TODO | > TODO | > TODO | > TODO |

**Frecuencia de pago:**
> TODO: Mensual, anual, por uso, único.

**Test de precio:**
> TODO: ¿Cómo validaremos el pricing? Van Westendorp, A/B, willingness to pay...

---

## Estructura de costes

> Los costes principales del negocio. No agotar — los más significativos.

### Costes variables (escalan con volumen)

| Coste | Driver | Estimación |
|-------|--------|------------|
| > TODO | Por usuario / transacción / GB | > TODO |

### Costes fijos

| Coste | Estimación mensual |
|-------|---------------------|
| Equipo | > TODO |
| Infraestructura base | > TODO |
| Herramientas | > TODO |
| Otros | > TODO |

### CAC esperado (Customer Acquisition Cost)

> ¿Cuánto cuesta adquirir un cliente?

> TODO: Estimación + canales asumidos.

---

## Unit economics

> La pregunta clave: ¿gana dinero **una unidad** (un cliente, una transacción, un usuario)?

### Por cliente (modelo suscripción)

| Métrica | Valor objetivo | Valor actual |
|---------|----------------|--------------|
| ARPU mensual | > TODO | > TODO |
| Coste variable/cliente/mes | > TODO | > TODO |
| **Margen bruto/cliente** | > TODO | > TODO |
| Churn mensual | > TODO | > TODO |
| LTV (Lifetime Value) | > TODO | > TODO |
| CAC | > TODO | > TODO |
| **LTV / CAC** | > 3x | > TODO |
| Payback period | < 12 meses | > TODO |

### Por transacción (modelo transaccional)

| Métrica | Valor objetivo |
|---------|----------------|
| Ticket medio | > TODO |
| Margen por transacción | > TODO |
| Transacciones/cliente/año | > TODO |
| Margen anual por cliente | > TODO |

**Adapta esta tabla al modelo que aplique. Si es híbrido, hacer las dos.**

---

## Escalabilidad

> ¿Cómo cambian los números con el volumen?

**¿Mejoran los márgenes con escala?**
> TODO: Sí/No/Cuándo. Por qué.

**¿Hay efectos de red o aprendizaje que mejoran el producto con uso?**
> TODO

**¿Hay límites de escalabilidad obvios?**
> TODO: Costes que escalan linealmente, capacidad de equipo, mercado, regulación.

---

## Comparativa con el mercado

> ¿Cómo se compara nuestro modelo con el de los competidores estudiados en `01-diagnostico/03-estudio-competencia/`?

| Aspecto | Nosotros | Competidor A | Competidor B |
|---------|----------|--------------|--------------|
| Pricing | > TODO | > TODO | > TODO |
| Modelo | > TODO | > TODO | > TODO |
| Quien paga | > TODO | > TODO | > TODO |

**¿Qué hacemos diferente y por qué?**
> TODO

---

## Hipótesis económicas a validar

> Como en el OST, el modelo económico es una **hipótesis** hasta que se valida. Lista lo que asumimos.

| # | Hipótesis | Cómo se valida | Riesgo si falla |
|---|-----------|----------------|-----------------|
| 1 | > TODO   | > TODO         | > TODO          |
| 2 | > TODO   | > TODO         | > TODO          |

---

## Modelos descartados (y por qué)

> Si se consideraron otros modelos (ej: freemium vs suscripción pura, comisión vs licencia), documentar la decisión.

| Modelo | Por qué se descartó |
|--------|---------------------|
| > TODO | > TODO |

---

## Implicaciones para el producto y la estrategia

> ¿Qué nos dice el modelo económico sobre cómo debe ser el producto?

- > TODO: Implicación + qué condiciona del producto
- > TODO

---

## Frameworks de referencia (lecturas sugeridas)

- **Business Model Canvas** (Osterwalder)
- **The Cost Structure Lens** (Reid Hoffman)
- **Lenny Rachitsky's Pricing playbook** (newsletter)
- **a16z SaaS metrics** (LTV/CAC, magic number)
