// scrapers/scrape-other-supermarkets.mjs
// ============================================================
// Scraper multi-supermercado vía OpenFoodFacts España
// Cadenas: Carrefour, Lidl, DIA, Consum, Eroski, Alcampo, El Corte Inglés
//
// Uso:
//   node scrapers/scrape-other-supermarkets.mjs
//   npm run scrape:others
// ============================================================

import { supabase, sleep } from '../lib/supabase.mjs';
import { matchCanonicalIngredient, detectAllergensAndTags } from '../lib/enrichment.mjs';

// ──────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE CADENAS
// Añade o quita supermercados según tus necesidades.
// El `storeTag` debe coincidir con el tag de OpenFoodFacts.
// ──────────────────────────────────────────────────────────────
const SUPERMARKETS = [
  {
    id:       'Carrefour',
    storeTag: 'carrefour',
    tagline:  'Gran variedad y marcas líderes',
    badge:    'Hipermercado',
    maxPages: 8,
  },
  {
    id:       'Lidl',
    storeTag: 'lidl',
    tagline:  'Calidad al mejor precio',
    badge:    'Más barato',
    maxPages: 6,
  },
  {
    id:       'Dia',
    storeTag: 'dia',
    tagline:  'Cerca de ti cada día',
    badge:    'Proximidad',
    maxPages: 6,
  },
  {
    id:       'Consum',
    storeTag: 'consum',
    tagline:  'Frescos y cooperativismo valenciano',
    badge:    'Levante / Cat',
    maxPages: 4,
  },
  {
    id:       'Eroski',
    storeTag: 'eroski',
    tagline:  'Productos locales y frescos del norte',
    badge:    'Norte',
    maxPages: 4,
  },
  {
    id:       'Alcampo',
    storeTag: 'alcampo',
    tagline:  'Precio y variedad',
    badge:    'Gran superficie',
    maxPages: 4,
  },
  {
    id:       'El Corte Inglés',
    storeTag: 'el+corte+inglés',
    tagline:  'Calidad premium y marcas exclusivas',
    badge:    'Premium',
    maxPages: 3,
  },
];

// ──────────────────────────────────────────────────────────────
// DESCARGA PAGINADA DESDE OPENFOODFACTS
// ──────────────────────────────────────────────────────────────
async function fetchStoreProducts(supermarketId, storeTag, maxPages = 5) {
  const products = [];
  const storeTagEncoded = encodeURIComponent(storeTag);

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://es.openfoodfacts.org/cgi/search.pl?action=process` +
      `&tagtype_0=stores&tag_contains_0=contains&tag_0=${storeTagEncoded}` +
      `&page_size=100&page=${page}&json=1`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ChupChupApp/1.0 (https://chupchup.app)' },
      });
      if (!res.ok) break;

      const data = await res.json();
      if (!data.products?.length) break;

      for (const p of data.products) {
        const name = (p.product_name_es || p.product_name || '').trim();
        if (!name) continue;

        const ean = p.code ? String(p.code) : null;
        const n   = p.nutriments || {};
        const num = (v, dec = 2) => (v != null ? Number(Number(v).toFixed(dec)) : null);

        const { allergens, dietaryTags } = detectAllergensAndTags(
          name,
          p.ingredients_text_es || p.ingredients_text || ''
        );

        products.push({
          id:                   `prod_${storeTag.replace(/\+| /g, '_')}_${ean || name.slice(0, 20).replace(/\s/g, '_')}`,
          externalId:           ean,
          ean,
          supermarketId,
          canonicalIngredientId: matchCanonicalIngredient(name),
          name,
          brand:               (p.brands || supermarketId).split(',')[0].trim(),
          category:            (p.categories_tags?.[0] || 'Despensa')
                                  .replace(/^(en:|es:)/, ''),
          subcategory:         null,
          packaging:           p.quantity || '1 ud',
          // Precio estimado: se actualiza cuando se cruza con APIs de precio reales
          price:               null,
          pricePerUnit:        null,
          unitSize:            1,
          unitMeasure:         'ud',
          isOnSale:            false,
          inStock:             true,
          imageUrl:            p.image_front_small_url || p.image_url || null,
          productUrl:          `https://es.openfoodfacts.org/product/${ean}`,
          kcal100g:            n['energy-kcal_100g'] ? Math.round(Number(n['energy-kcal_100g'])) : null,
          proteins100g:        num(n.proteins_100g),
          carbs100g:           num(n.carbohydrates_100g),
          sugars100g:          num(n.sugars_100g),
          fat100g:             num(n.fat_100g),
          saturatedFat100g:    num(n['saturated-fat_100g']),
          fiber100g:           num(n.fiber_100g),
          salt100g:            num(n.salt_100g, 3),
          nutriScore:          p.nutriscore_grade?.toUpperCase() ?? null,
          novaGroup:           p.nova_group ? Number(p.nova_group) : null,
          ingredientsText:     p.ingredients_text_es || p.ingredients_text || null,
          allergens,
          dietaryTags,
          scrapedAt:           new Date().toISOString(),
          updatedAt:           new Date().toISOString(),
        });
      }

      process.stdout.write(
        `\r📦 [${supermarketId}] Pág ${page}/${maxPages} | ${products.length} productos`
      );
      await sleep(300); // cortesía hacia la API de OFF
    } catch (err) {
      console.error(`\n❌ Error en ${supermarketId} pág ${page}: ${err.message}`);
    }
  }
  return products;
}

// ──────────────────────────────────────────────────────────────
// SUBIDA POR LOTES A SUPABASE
// ──────────────────────────────────────────────────────────────
async function upsertBatch(products, supermarketId, batchSize = 300) {
  let uploaded = 0;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const { error } = await supabase
      .from('supermarket_products')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`\n❌ [${supermarketId}] Error subiendo lote ${i}: ${error.message}`);
    } else {
      uploaded += batch.length;
    }
  }
  return uploaded;
}

// ──────────────────────────────────────────────────────────────
// FLUJO PRINCIPAL
// ──────────────────────────────────────────────────────────────
async function runAllSupermarkets() {
  console.log('\n🛒  ChupChup – Scraper Multi-Supermercado (vía OpenFoodFacts)\n');

  // 1. Registrar todas las cadenas en la tabla supermarkets
  await supabase.from('supermarkets').upsert(
    SUPERMARKETS.map(({ id, tagline, badge }) => ({
      id, name: id, tagline, badge, active: true,
    }))
  );

  // 2. Procesar cada cadena
  let totalUploaded = 0;
  for (const sm of SUPERMARKETS) {
    console.log(`\n🚀 Procesando ${sm.id}...`);
    const products = await fetchStoreProducts(sm.id, sm.storeTag, sm.maxPages);
    console.log(`\n   ↳ ${products.length} productos descargados.`);

    if (products.length > 0) {
      const uploaded = await upsertBatch(products, sm.id);
      totalUploaded += uploaded;
      console.log(`   ✅ ${uploaded} de ${products.length} subidos a Supabase.`);
    }
  }

  console.log(`\n🎉 ¡Multi-supermercado completado! ${totalUploaded} productos en Supabase.\n`);
}

runAllSupermarkets().catch((err) => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
