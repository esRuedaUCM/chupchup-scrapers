// lib/enrichment.mjs
// Funciones compartidas de enriquecimiento nutricional, alérgenos e ingredientes canónicos.

// ============================================================
// MAPEADOR DE INGREDIENTES CANÓNICOS
// Extiende la lista para que coincida con todos tus canonical_ingredients de Supabase.
// ============================================================
export const CANONICAL_RULES = [
  // Carnes y aves
  { id: 'ing_pechuga_pollo',     regex: /pechuga de pollo|solomillo de pollo|filetes de pollo/i },
  { id: 'ing_muslo_pollo',       regex: /muslo de pollo|contramuslo|jamoncitos de pollo/i },
  { id: 'ing_ternera_picada',    regex: /carne picada de ternera|vacuno picado/i },
  { id: 'ing_cerdo_lomo',        regex: /lomo de cerdo|solomillo de cerdo/i },
  { id: 'ing_jamon_serrano',     regex: /jam[oó]n serrano|jam[oó]n curado/i },
  { id: 'ing_bacon',             regex: /bacon|panceta ahumada/i },

  // Pescados y mariscos
  { id: 'ing_salmon',            regex: /salm[oó]n/i },
  { id: 'ing_atun_lata',         regex: /at[uú]n en aceite|at[uú]n al natural/i },
  { id: 'ing_merluza',           regex: /merluza/i },
  { id: 'ing_gambas',            regex: /gamba|langostino/i },

  // Cereales y pastas
  { id: 'ing_arroz_redondo',     regex: /arroz redondo/i },
  { id: 'ing_arroz_basmati',     regex: /arroz basmati|arroz largo/i },
  { id: 'ing_pasta',             regex: /macarr[oó]n|espagueti|h[eé]lices|penne|tallarines|pasta corta|pasta larga/i },
  { id: 'ing_pan_molde',         regex: /pan de molde|pan sandwich/i },

  // Lácteos
  { id: 'ing_leche_entera',      regex: /leche entera/i },
  { id: 'ing_leche_semi',        regex: /leche semidesnatada/i },
  { id: 'ing_yogur_natural',     regex: /yogur natural|yogourt natural/i },
  { id: 'ing_queso_crema',       regex: /queso untar|queso crema|philadelphia/i },
  { id: 'ing_queso_rallado',     regex: /queso rallado|mozzarella rallada/i },
  { id: 'ing_mantequilla',       regex: /mantequilla/i },
  { id: 'ing_nata',              regex: /nata para cocinar|nata l[íi]quida/i },

  // Huevos
  { id: 'ing_huevos',            regex: /huevos? grande|huevos? medianos|docena de huevos/i },

  // Verduras y frutas
  { id: 'ing_espinacas',         regex: /espinaca/i },
  { id: 'ing_cebolla',           regex: /cebolla/i },
  { id: 'ing_ajo',               regex: /\bajo\b|cabeza de ajo|dientes de ajo/i },
  { id: 'ing_tomate',            regex: /tomate natural|tomate triturado|tomate frito/i },
  { id: 'ing_patata',            regex: /patata/i },
  { id: 'ing_zanahoria',         regex: /zanahoria/i },
  { id: 'ing_pimiento',          regex: /pimiento rojo|pimiento verde|pimiento morr[oó]n/i },
  { id: 'ing_calabacin',         regex: /calabac[íi]n/i },
  { id: 'ing_brocoli',           regex: /br[oó]coli/i },
  { id: 'ing_aguacate',          regex: /aguacate/i },
  { id: 'ing_platano',           regex: /pl[aá]tano/i },
  { id: 'ing_manzana',           regex: /manzana/i },

  // Legumbres
  { id: 'ing_garbanzos',         regex: /garbanzo/i },
  { id: 'ing_lentejas',          regex: /lenteja/i },
  { id: 'ing_alubias',           regex: /alubia|judía blanca|judia pinta/i },

  // Aceites y condimentos
  { id: 'ing_aceite_oliva',      regex: /aceite de oliva virgen/i },
  { id: 'ing_aceite_girasol',    regex: /aceite de girasol/i },
  { id: 'ing_sal',               regex: /\bsal\b(?! de)/i },
];

/**
 * Devuelve el ID canónico para un nombre de producto, o null si no hay coincidencia.
 * @param {string} name
 * @returns {string|null}
 */
export function matchCanonicalIngredient(name) {
  for (const rule of CANONICAL_RULES) {
    if (rule.regex.test(name)) return rule.id;
  }
  return null;
}

// ============================================================
// DETECTOR DE ALÉRGENOS Y ETIQUETAS DIETÉTICAS
// ============================================================
/**
 * @param {string} name
 * @param {string} ingredientsText
 * @returns {{ allergens: string[], dietaryTags: string[] }}
 */
export function detectAllergensAndTags(name = '', ingredientsText = '') {
  const src = `${name} ${ingredientsText}`.toLowerCase();
  const allergens = new Set();
  const dietaryTags = new Set();

  // Etiquetas "sin" (positivas)
  if (/sin gluten/i.test(src))   dietaryTags.add('Sin Gluten');
  if (/sin lactosa/i.test(src))  dietaryTags.add('Sin Lactosa');
  if (/vegano|vegan/i.test(src)) dietaryTags.add('Vegano');
  if (/vegetariano/i.test(src))  dietaryTags.add('Vegetariano');
  if (/\+prote[ií]nas|alto en prote[ií]na|high protein/i.test(src)) dietaryTags.add('Alto en Proteína');
  if (/ecol[oó]gico|org[aá]nico|bio\b/i.test(src)) dietaryTags.add('Ecológico');

  // Alérgenos (14 de la UE)
  if (!dietaryTags.has('Sin Gluten') &&
      /trigo|cebada|centeno|avena|esp[eé]lta|kamut|gluten|pasta|pan|s[eé]mola/i.test(src))
    allergens.add('Gluten');
  if (!dietaryTags.has('Sin Lactosa') &&
      /leche|queso|nata|mantequilla|yogur|lactosa|suero l[aá]cteo|cuajada/i.test(src))
    allergens.add('Lácteos');
  if (/huevo|albumina|mayonesa/i.test(src))   allergens.add('Huevo');
  if (/cacahuete/i.test(src))                 allergens.add('Cacahuetes');
  if (/almendra|nuez|avellana|anacardo|pistacho|macadamia|pecana|frutos de c[aá]scara/i.test(src))
    allergens.add('Frutos Secos');
  if (/gamba|langostino|crust[aá]ceo|marisco|centollo|bogavante/i.test(src))
    allergens.add('Crustáceos');
  if (/at[uú]n|salm[oó]n|merluza|bacalao|anchoa|pescado/i.test(src))
    allergens.add('Pescado');
  if (/molusco|mejill[oó]n|almeja|pulpo|calamar/i.test(src))
    allergens.add('Moluscos');
  if (/soja|lecitina de soja/i.test(src))     allergens.add('Soja');
  if (/apio/i.test(src))                       allergens.add('Apio');
  if (/mostaza/i.test(src))                    allergens.add('Mostaza');
  if (/s[eé]samo|tahini/i.test(src))          allergens.add('Sésamo');
  if (/altramuces?|lupino/i.test(src))         allergens.add('Altramuces');
  if (/anhídrido sulfuroso|sulfitos?|so2/i.test(src)) allergens.add('Sulfitos');

  return {
    allergens: [...allergens],
    dietaryTags: [...dietaryTags],
  };
}

// ============================================================
// ENRIQUECEDOR NUTRICIONAL VÍA OPENFOODFACTS
// ============================================================
/**
 * Consulta OpenFoodFacts por EAN y devuelve valores nutricionales + NutriScore.
 * @param {string|null} ean
 * @returns {Promise<object|null>}
 */
export async function fetchNutritionByEan(ean) {
  if (!ean) return null;
  try {
    const url =
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json` +
      `?fields=nutriments,nutriscore_grade,nova_group,ingredients_text_es,allergens_tags`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChupChupApp/1.0 (https://chupchup.app)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const n = data.product.nutriments || {};
    const num = (v, dec = 2) => (v != null ? Number(Number(v).toFixed(dec)) : null);

    return {
      kcal100g:        n['energy-kcal_100g'] ? Math.round(Number(n['energy-kcal_100g'])) : null,
      proteins100g:    num(n.proteins_100g),
      carbs100g:       num(n.carbohydrates_100g),
      sugars100g:      num(n.sugars_100g),
      fat100g:         num(n.fat_100g),
      saturatedFat100g: num(n['saturated-fat_100g']),
      fiber100g:       num(n.fiber_100g),
      salt100g:        num(n.salt_100g, 3),
      nutriScore:      data.product.nutriscore_grade?.toUpperCase() ?? null,
      novaGroup:       data.product.nova_group ? Number(data.product.nova_group) : null,
      ingredientsText: data.product.ingredients_text_es ?? null,
    };
  } catch {
    return null;
  }
}
