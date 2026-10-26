# 🛒 ChupChup Scrapers

Scrapers de supermercados españoles con integración directa a Supabase.  
Extraen nombre, precio, valores nutricionales, alérgenos e ingredientes de **Mercadona, Carrefour, Lidl, DIA, Consum, Eroski, Alcampo y El Corte Inglés**.

---

## ⚡ Inicio rápido (2 minutos)

### 1. Prerrequisitos
- Node.js 18+
- Una cuenta de [Supabase](https://supabase.com) con la tabla `supermarket_products` creada (ver esquema abajo)

### 2. Instalar dependencias

```bash
cd chupchup-scrapers
npm install
```

### 3. Configurar credenciales

```bash
cp .env.example .env
```

Abre `.env` y pega tu **Anon Key** de Supabase:
```
SUPABASE_KEY=eyJhbGci...   ← Project Settings → API → anon/public
```

### 4. Ejecutar scrapers

```bash
# Mercadona – modo rápido (solo precios y fotos, ~25 seg)
npm run scrape:mercadona:fast

# Mercadona – modo completo con nutrición (puede tardar 30-60 min)
npm run scrape:mercadona

# Resto de supermercados (Carrefour, Lidl, DIA, Consum…)
npm run scrape:others

# Todo de una vez
npm run scrape:all
```

> **Consejo:** La primera vez usa `scrape:mercadona:fast` para verificar que los ~4.500 productos de Mercadona aparecen en tu app. Después corre el modo completo para rellenar la nutrición.

---

## 🗂️ Estructura del proyecto

```
chupchup-scrapers/
├── .env.example                    ← Plantilla de credenciales (copia → .env)
├── .gitignore
├── package.json
├── README.md
│
├── lib/
│   ├── supabase.mjs                ← Cliente Supabase compartido
│   └── enrichment.mjs             ← Canonical ingredients, alérgenos, OpenFoodFacts
│
└── scrapers/
    ├── scrape-mercadona.mjs        ← Scraper de Mercadona (API pública + OpenFoodFacts)
    └── scrape-other-supermarkets.mjs  ← Carrefour, Lidl, DIA, Consum, Eroski…
```

---

## 🗄️ Esquema de Supabase requerido

Ejecuta esto en el **SQL Editor** de Supabase si aún no tienes las tablas:

```sql
-- Tabla de supermercados
create table if not exists supermarkets (
  id      text primary key,
  name    text not null,
  tagline text,
  badge   text,
  active  boolean default true
);

-- Tabla principal de productos
create table if not exists supermarket_products (
  id                    text primary key,
  "externalId"          text,
  ean                   text,
  "supermarketId"       text references supermarkets(id),
  "canonicalIngredientId" text,

  name                  text not null,
  brand                 text,
  category              text,
  subcategory           text,
  packaging             text,

  price                 numeric,
  "pricePerUnit"        numeric,
  "unitSize"            numeric,
  "unitMeasure"         text,
  "isOnSale"            boolean default false,
  "inStock"             boolean default true,

  "imageUrl"            text,
  "productUrl"          text,

  "kcal100g"            integer,
  "proteins100g"        numeric,
  "carbs100g"           numeric,
  "sugars100g"          numeric,
  "fat100g"             numeric,
  "saturatedFat100g"    numeric,
  "fiber100g"           numeric,
  "salt100g"            numeric,
  "nutriScore"          text,
  "novaGroup"           integer,
  "ingredientsText"     text,
  allergens             text[],
  "dietaryTags"         text[],

  "scrapedAt"           timestamptz default now(),
  "updatedAt"           timestamptz default now()
);

-- Índices útiles para la app
create index if not exists idx_products_supermarket on supermarket_products("supermarketId");
create index if not exists idx_products_canonical   on supermarket_products("canonicalIngredientId");
create index if not exists idx_products_ean         on supermarket_products(ean);
```

---

## 🔗 Cómo funciona la integración

```
Mercadona API  ──┐
                 ├─→  scraper  ─→  OpenFoodFacts API  ─→  Supabase (UPSERT)
OpenFoodFacts  ──┘                 (nutrición, EAN)         supermarket_products
```

1. **Mercadona**: La API pública (`tienda.mercadona.es/api`) devuelve el catálogo completo con precios, fotos y el código EAN en la ficha de detalle.  
2. **Enriquecimiento nutricional**: Con el EAN se consulta OpenFoodFacts para obtener kcal, proteínas, NutriScore, alérgenos e ingredientes.  
3. **Otros supermercados**: Se usa directamente la búsqueda por tienda de OpenFoodFacts España (ya incluye nutrición completa).  
4. **Canonical Ingredients**: El mapeador de `lib/enrichment.mjs` asigna automáticamente el `canonicalIngredientId` para que la calculadora de recetas funcione al instante.

---

## ➕ Añadir más ingredientes canónicos

Edita el array `CANONICAL_RULES` en `lib/enrichment.mjs`:

```js
{ id: 'ing_mi_ingrediente', regex: /nombre del producto/i },
```

---

## 📅 Automatización (opcional)

Para mantener los precios actualizados puedes programar los scrapers:

**Windows (Task Scheduler):**
```
Acción: node C:\ruta\chupchup-scrapers\scrapers\scrape-mercadona.mjs
Disparador: Semanal, lunes a las 6:00
```

**Linux/macOS (cron):**
```cron
0 6 * * 1 cd /ruta/chupchup-scrapers && node scrapers/scrape-mercadona.mjs
```

---

## ⚠️ Notas legales

- El scraper de Mercadona usa su **API pública** sin autenticación (términos de uso de Mercadona aplicables).  
- Los datos de otros supermercados provienen de **OpenFoodFacts**, base de datos abierta bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/).  
- Usa los datos exclusivamente para uso personal / tu aplicación ChupChup.
