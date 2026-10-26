// scrapers/scrape-mercadona.mjs
// ============================================================
// Scraper de Mercadona → OpenFoodFacts → Supabase
// Uso:
//   node scrapers/scrape-mercadona.mjs          (con enriquecimiento nutricional)
//   node scrapers/scrape-mercadona.mjs --fast   (solo precios y fotos, ~25 seg)
//   npm run scrape:mercadona
//   npm run scrape:mercadona:fast
// ============================================================

import fs from 'fs/promises';
import { supabase, sleep } from '../lib/supabase.mjs';
import {
  matchCanonicalIngredient,
  detectAllergensAndTags,
  fetchNutritionByEan,
} from '../lib/enrichment.mjs';

const WAREHOUSE = process.env.MERCADONA_WAREHOUSE || 'mad1';
const FAST_MODE = process.argv.includes('--fast');
const BASE_URL  = `https://tienda.mercadona.es/api`;

// ──────────────────────────────────────────────────────────────
// HELPERS DE MERCADONA
// ──────────────────────────────────────────────────────────────
async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) {
        console.warn(`\n⚠️  Rate limit (429). Esperando 5 s...`);
        await sleep(5000);
      }
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * attempt);
    }
  }
  return null;
}

async function fetchProductDetail(productId) {
  const data = await fetchJson(
    `${BASE_URL}/products/${productId}/?lang=es&wh=${WAREHOUSE}`
  );
  return data;
}

// ──────────────────────────────────────────────────────────────
// CONVERSIÓN DE PRODUCTO MERCADONA → FILA DE SUPABASE
// ──────────────────────────────────────────────────────────────
function buildProductRow(p, mainCatName, subCatName) {
  const pi = p.price_instructions || {};
  const name = p.display_name || '';

  return {
    id:                   `prod_mercadona_${p.id}`,
    externalId:           String(p.id),
    ean:                  null,
    supermarketId:        'Mercadona',
    canonicalIngredientId: matchCanonicalIngredient(name),
    name,
    brand:                'Hacendado / Mercadona',
    category:             mainCatName,
    subcategory:          subCatName,
    packaging:            p.packaging || 'Unidad',
    price:                Number(pi.unit_price || 0),
    pricePerUnit:         Number(pi.reference_price || pi.unit_price || 0),
    unitSize:             Number(pi.unit_size || 1),
    unitMeasure:          pi.size_format || 'ud',
    isOnSale:             Boolean(pi.price_decreased),
    inStock:              true,
    imageUrl:             p.thumbnail || null,
    productUrl:           p.share_url || `https://tienda.mercadona.es/product/${p.id}`,
    // Nutricionales (se rellenan en la fase de enriquecimiento)
    kcal100g:             null,
    proteins100g:         null,
    carbs100g:            null,
    sugars100g:           null,
    fat100g:              null,
    saturatedFat100g:     null,
    fiber100g:            null,
    salt100g:             null,
    nutriScore:           null,
    novaGroup:            null,
    ingredientsText:      null,
    allergens:            [],
    dietaryTags:          [],
    scrapedAt:            new Date().toISOString(),
    updatedAt:            new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────
// SUBIDA POR LOTES A SUPABASE
// ──────────────────────────────────────────────────────────────
async function upsertBatch(products, batchSize = 400) {
  let uploaded = 0;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const { error } = await supabase
      .from('supermarket_products')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`\n❌ Error subiendo lote [${i}–${i + batch.length}]:`, error.message);
    } else {
      uploaded += batch.length;
      process.stdout.write(
        `\r☁️  Subidos ${Math.min(i + batchSize, products.length)} / ${products.length} a Supabase`
      );
    }
  }
  return uploaded;
}

// ──────────────────────────────────────────────────────────────
// FLUJO PRINCIPAL
// ──────────────────────────────────────────────────────────────
async function runMercadonaScraper() {
  console.log(`\n🛒  ChupChup – Scraper de Mercadona`);
  console.log(`    Almacén: ${WAREHOUSE} | Modo: ${FAST_MODE ? 'RÁPIDO (sin nutrición)' : 'COMPLETO'}\n`);

  // 1. Asegurar fila en tabla supermarkets
  await supabase.from('supermarkets').upsert({
    id:      'Mercadona',
    name:    'Mercadona',
    tagline: 'Precios bajos siempre · Marca Hacendado',
    badge:   'Más popular',
    active:  true,
  });

  // 2. Descargar árbol de categorías
  console.log('📥 Descargando árbol de categorías...');
  const catData = await fetchJson(`${BASE_URL}/categories/?lang=es&wh=${WAREHOUSE}`);
  const subCategories = [];
  for (const main of catData?.results ?? []) {
    for (const sub of main.categories ?? []) {
      subCategories.push({ id: sub.id, mainName: main.name, subName: sub.name });
    }
  }
  console.log(`🔎 ${subCategories.length} subcategorías encontradas.\n`);

  // 3. Extraer productos de cada subcategoría
  const allProducts = new Map();
  for (const [idx, sub] of subCategories.entries()) {
    try {
      const data = await fetchJson(`${BASE_URL}/categories/${sub.id}/?lang=es&wh=${WAREHOUSE}`);
      for (const aisle of data?.categories ?? []) {
        for (const p of aisle.products ?? []) {
          const row = buildProductRow(p, sub.mainName, sub.subName);
          allProducts.set(row.id, row);
        }
      }
    } catch (err) {
      console.error(`\nError en subcategoría ${sub.id}: ${err.message}`);
    }
    process.stdout.write(
      `\r📦 Categorías: ${idx + 1}/${subCategories.length} | Productos únicos: ${allProducts.size}`
    );
    await sleep(120);
  }

  const products = [...allProducts.values()];
  console.log(`\n\n✅ Catálogo base: ${products.length} productos.\n`);

  // 4. Enriquecimiento nutricional (omitido en --fast)
  if (!FAST_MODE) {
    console.log('🔬 Enriqueciendo con EAN, Ingredientes y Valores Nutricionales...');
    for (let i = 0; i < products.length; i++) {
      const item = products[i];

      // Ficha de detalle de Mercadona (EAN, marca exacta, ingredientes HTML)
      const detail = await fetchProductDetail(item.externalId);
      if (detail) {
        item.ean   = detail.ean || null;
        item.brand = detail.brand || item.brand;

        const nutritionInfo = detail.nutrition_information || {};
        const rawIngredients = nutritionInfo.ingredients || '';
        const rawAllergens   = nutritionInfo.allergens   || '';

        // Nutrición vía OpenFoodFacts si hay EAN
        const offData = await fetchNutritionByEan(item.ean);
        if (offData) {
          Object.assign(item, offData);
        }

        // Ingredientes del HTML de Mercadona como fallback
        if (rawIngredients && !item.ingredientsText) {
          item.ingredientsText = rawIngredients.replace(/<[^>]*>/g, '').trim();
        }

        // Alérgenos y etiquetas dietéticas
        const { allergens, dietaryTags } = detectAllergensAndTags(
          item.name,
          `${item.ingredientsText || ''} ${rawAllergens}`
        );
        item.allergens   = allergens;
        item.dietaryTags = dietaryTags;
      }

      if (i % 50 === 0 || i === products.length - 1) {
        process.stdout.write(`\r🧬 Enriquecidos: ${i + 1}/${products.length}`);
      }
      await sleep(80);
    }
    console.log('\n');
  }

  // 5. Copia de seguridad local
  const backupFile = `mercadona_backup_${Date.now()}.json`;
  await fs.writeFile(backupFile, JSON.stringify(products, null, 2));
  console.log(`💾 Backup guardado en: ${backupFile}`);

  // 6. Upsert en Supabase
  console.log('\n☁️  Subiendo a Supabase (tabla: supermarket_products)...');
  const uploaded = await upsertBatch(products);
  console.log(`\n\n🎉 ¡Mercadona sincronizado! ${uploaded} productos en Supabase.`);
}

runMercadonaScraper().catch((err) => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
