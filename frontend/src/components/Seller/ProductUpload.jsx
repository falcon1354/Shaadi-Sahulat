import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Shirt, Sofa, Monitor, Utensils, Sparkles, Gift, Package } from 'lucide-react';
import sellerApi from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';

// ── Category tree (mirrors config.py SELLER_CATEGORY_TREE) ────────────────
const CATEGORY_TREE = [
  {
    id: 'wedding_dress', label: 'Wedding Dress', icon: <Shirt size={36} strokeWidth={1.5} className="text-primary-800" />,
    multipleImages: true,
    subcategories: [
      {
        id: 'bridal', label: 'Bridal',
        items: [
          { id: 'bridal_lehenga', label: 'Lehenga' },
          { id: 'bridal_sharara', label: 'Sharara' },
          { id: 'bridal_gharara', label: 'Gharara' },
          { id: 'bridal_gown',    label: 'Bridal Gown' },
        ],
      },
      {
        id: 'groom', label: 'Groom',
        items: [
          { id: 'groom_sherwani',        label: 'Sherwani' },
          { id: 'groom_shalwar_kameez',  label: 'Shalwar Kameez' },
          { id: 'groom_suit',            label: 'Suit' },
        ],
      },
    ],
  },
  {
    id: 'furniture', label: 'Furniture', icon: <Sofa size={36} strokeWidth={1.5} className="text-primary-800" />,
    multipleImages: false,
    subcategories: [
      { id: 'sofa_set',       label: 'Sofa Set',       items: null },
      { id: 'bed_set',        label: 'Bed Set',        items: null },
      { id: 'dressing_table', label: 'Dressing Table', items: null },
      { id: 'dining_table',   label: 'Dining Table',   items: null },
      { id: 'wardrobe',       label: 'Wardrobe',       items: null },
    ],
  },
  {
    id: 'electronics', label: 'Electronics', icon: <Monitor size={36} strokeWidth={1.5} className="text-blue-500" />,
    multipleImages: false,
    subcategories: [
      { id: 'led_tv',          label: 'LED TV',          items: null },
      { id: 'refrigerator',    label: 'Refrigerator',    items: null },
      { id: 'washing_machine', label: 'Washing Machine', items: null },
      { id: 'ac',              label: 'Air Conditioner', items: null },
    ],
  },
  {
    id: 'kitchen_items', label: 'Kitchen Items', icon: <Utensils size={36} strokeWidth={1.5} className="text-orange-500" />,
    multipleImages: false,
    subcategories: [
      {
        id: 'large_appliances', label: 'Large Appliances',
        items: [
          { id: 'microwave',       label: 'Microwave' },
          { id: 'juicer_blender',  label: 'Juicer / Blender Set' },
          { id: 'toaster',         label: 'Toaster' },
          { id: 'dishwasher',      label: 'Dishwasher' },
        ],
      },
      {
        id: 'general_kitchen', label: 'General Kitchen Items',
        items: [
          { id: 'crockery_set',    label: 'Crockery Set' },
          { id: 'cooking_set',     label: 'Cooking Set' },
          { id: 'pressure_cooker', label: 'Pressure Cooker' },
          { id: 'kettle_tea_set',  label: 'Kettle + Tea Set' },
          { id: 'casserole_set',   label: 'Casserole Set' },
        ],
      },
    ],
  },
  {
    id: 'decoration', label: 'Decoration', icon: <Sparkles size={36} strokeWidth={1.5} className="text-yellow-500" />,
    multipleImages: false,
    subcategories: [
      { id: 'lights',             label: 'Lights / Fairy Lights',  items: null },
      { id: 'artificial_flowers', label: 'Artificial Flowers',     items: null },
      { id: 'stage_setup',        label: 'Stage Setup Materials',  items: null },
      { id: 'wall_decor',         label: 'Wall Decor',             items: null },
      { id: 'table_centerpieces', label: 'Table Centerpieces',     items: null },
    ],
  },
  {
    id: 'miscellaneous', label: 'Miscellaneous', icon: <Gift size={36} strokeWidth={1.5} className="text-teal-500" />,
    multipleImages: false,
    subcategories: [
      {
        id: 'small_appliances', label: 'Small Appliances',
        items: [
          { id: 'iron',           label: 'Iron' },
          { id: 'vacuum_cleaner', label: 'Vacuum Cleaner' },
          { id: 'pedestal_fan',   label: 'Pedestal Fan' },
          { id: 'hair_dryer',     label: 'Hair Dryer' },
        ],
      },
      {
        id: 'wedding_services', label: 'Wedding Services',
        items: [
          { id: 'invitations',          label: 'Wedding Invitations' },
          { id: 'photography_packages', label: 'Photography Packages' },
          { id: 'favour_gift_items',    label: 'Favour / Gift Items' },
          { id: 'mehendi_supplies',     label: 'Mehendi Supplies' },
        ],
      },
    ],
  },
];

const FABRICS        = ['Chiffon', 'Silk', 'Velvet', 'Net', 'Cotton', 'Other'];
const EMBROIDERY     = ['Heavy', 'Medium', 'Light', 'None'];
const SIZES          = ['S', 'M', 'L', 'XL', 'Custom'];
const CONDITIONS     = ['New', 'Like New', 'Used', 'Thrift'];
const FURNITURE_MATS = ['Wood', 'MDF', 'Metal', 'Glass', 'Fabric', 'Leather', 'Other'];

// §4.2 price ranges per subcategory / item_type
const PRICE_RANGES = {
  // Furniture
  sofa_set:           { min: 25000,  max: 400000 },
  bed_set:            { min: 30000,  max: 350000 },
  dressing_table:     { min: 8000,   max: 80000  },
  dining_table:       { min: 20000,  max: 250000 },
  wardrobe:           { min: 15000,  max: 200000 },
  // Electronics
  led_tv:             { min: 30000,  max: 450000 },
  refrigerator:       { min: 45000,  max: 400000 },
  washing_machine:    { min: 25000,  max: 200000 },
  ac:                 { min: 50000,  max: 350000 },
  // Kitchen large appliances
  microwave:          { min: 8000,   max: 60000  },
  juicer_blender:     { min: 3000,   max: 25000  },
  toaster:            { min: 2000,   max: 10000  },
  dishwasher:         { min: 40000,  max: 150000 },
  // Kitchen general
  crockery_set:       { min: 5000,   max: 80000  },
  cooking_set:        { min: 3000,   max: 40000  },
  pressure_cooker:    { min: 2000,   max: 15000  },
  kettle_tea_set:     { min: 1500,   max: 12000  },
  casserole_set:      { min: 1000,   max: 8000   },
  // Decoration
  lights:             { min: 500,    max: 15000  },
  artificial_flowers: { min: 500,    max: 20000  },
  stage_setup:        { min: 5000,   max: 150000 },
  wall_decor:         { min: 1000,   max: 30000  },
  table_centerpieces: { min: 500,    max: 10000  },
  // Miscellaneous small appliances
  iron:               { min: 2000,   max: 15000  },
  vacuum_cleaner:     { min: 5000,   max: 80000  },
  pedestal_fan:       { min: 3000,   max: 25000  },
  hair_dryer:         { min: 1500,   max: 12000  },
};

function getWeddingDressRange(subcategory, condition) {
  const isThrift = ['Thrift', 'Like New', 'Used'].includes(condition);
  if (subcategory === 'bridal') return { min: 1000,  max: isThrift ? 50000  : 150000 };
  if (subcategory === 'groom')  return { min: 1000,  max: isThrift ? 40000  : 100000 };
  return null;
}

const EMPTY = {
  title: '', description: '', subcategory: '', item_type: '',
  color: '', fabric: '', embroidery_type: '', size: '',
  material: '', brand: '', condition: 'New', city: '',
  price: '', discount_pct: '', stock_quantity: '1',
};

export default function ProductUpload({ sellerId, sellerCity = '', onUploaded }) {
  const { categories: dbCategories } = useCategories();
  const [majorCat,   setMajorCat]   = useState(null);
  const [form,       setForm]       = useState({ ...EMPTY, city: sellerCity });
  const [images,     setImages]     = useState([]);
  const [previews,   setPreviews]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [showDiscount,    setShowDiscount]    = useState(false);
  const [priceSuggestion, setPriceSuggestion] = useState(null);
  const fileRef = useRef(null);

  // Merge DB categories with static CATEGORY_TREE (keeps nested item types for wedding_dress, etc.)
  const effectiveCatTree = useMemo(() => {
    if (!dbCategories.length) return CATEGORY_TREE;
    return dbCategories.map(dbCat => {
      const staticDef = CATEGORY_TREE.find(c => c.id === dbCat.category_id);
      const subs = dbCat.subcategories?.length
        ? dbCat.subcategories.map(sub => {
            const staticSub = staticDef?.subcategories?.find(s => s.id === sub.id);
            return { ...sub, items: staticSub?.items || null };
          })
        : (staticDef?.subcategories || []);
      return {
        id:             dbCat.category_id,
        label:          dbCat.label,
        icon:           staticDef?.icon || <Package size={36} strokeWidth={1.5} className="text-gray-400" />,
        multipleImages: dbCat.category_id === 'wedding_dress',
        subcategories:  subs,
      };
    });
  }, [dbCategories]);

  const catDef      = effectiveCatTree.find(c => c.id === majorCat);
  const maxImages   = catDef?.multipleImages ? 5 : 1;

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // When major category changes, reset subcategory/item
  const selectMajorCat = (id) => {
    setMajorCat(id);
    setForm({ ...EMPTY, city: sellerCity });
    setImages([]);
    setPreviews([]);
    setResult(null);
    setError('');
    setShowDiscount(false);
    setPriceSuggestion(null);
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files).slice(0, maxImages);
    setImages(files);
    setPreviews(files.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    setImages(imgs => imgs.filter((_, i) => i !== idx));
    setPreviews(ps  => ps.filter((_, i) => i !== idx));
  };

  // §11.3 — fetch price suggestion whenever key fields change
  // Falls back to static PRICE_RANGES when API returns zeros (no products in DB yet)
  useEffect(() => {
    if (!majorCat || !form.subcategory) { setPriceSuggestion(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = await sellerApi.getPriceSuggestion({
          major_category: majorCat,
          subcategory:    form.subcategory,
          item_type:      form.item_type  || '',
          color:          form.color      || '',
          condition:      form.condition  || '',
        });
        if (!cancelled && data.success) {
          // If API returns zeros, fall back to static PRICE_RANGES
          const lo = data.range_low  || 0;
          const hi = data.range_high || 0;
          if (lo === 0 && hi === 0) {
            // Build a fallback suggestion from static ranges
            const key = form.item_type || form.subcategory;
            const staticRange = PRICE_RANGES[key];
            if (staticRange) {
              setPriceSuggestion({ ...data, range_low: staticRange.min, range_high: staticRange.max, band_pct: 30 });
            } else if (majorCat === 'wedding_dress') {
              const wdRange = getWeddingDressRange(form.subcategory, form.condition);
              if (wdRange) setPriceSuggestion({ ...data, range_low: wdRange.min, range_high: wdRange.max, band_pct: 30 });
              else setPriceSuggestion(null);
            } else {
              setPriceSuggestion(null);
            }
          } else {
            setPriceSuggestion(data);
          }
        } else if (!cancelled) {
          setPriceSuggestion(null);
        }
      } catch { if (!cancelled) setPriceSuggestion(null); }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [majorCat, form.subcategory, form.item_type, form.color, form.condition]);

  // §4.2 — compute allowed price range: DB subcategory prices take priority over hardcoded ranges
  const priceRange = majorCat === 'wedding_dress'
    ? getWeddingDressRange(form.subcategory, form.condition)
    : (() => {
        const dbSub = catDef?.subcategories?.find(s => s.id === form.subcategory);
        if (dbSub?.price_min && dbSub?.price_max) return { min: dbSub.price_min, max: dbSub.price_max };
        return (form.item_type ? PRICE_RANGES[form.item_type] : PRICE_RANGES[form.subcategory]) || null;
      })();

  const priceNum   = form.price ? Number(form.price) : null;
  const priceError = priceRange && priceNum !== null && priceNum > 0
    ? (priceNum < priceRange.min
        ? `Minimum price for this category is PKR ${priceRange.min.toLocaleString()}`
        : priceNum > priceRange.max
        ? `Maximum price for this category is PKR ${priceRange.max.toLocaleString()}`
        : null)
    : null;

  // Sub-category options for the selected major category
  const subcatOptions = catDef?.subcategories ?? [];

  // Item type options if selected subcategory has items
  const selectedSubcat = subcatOptions.find(s => s.id === form.subcategory);
  const itemOptions = selectedSubcat?.items ?? null;

  // Wedding dress type is derived from the selected subcategory
  const wedding_dress_type = majorCat === 'wedding_dress'
    ? (form.subcategory === 'bridal' ? 'bridal' : form.subcategory === 'groom' ? 'groom' : '')
    : '';

  // Computed discount price
  const discountPrice = showDiscount && form.discount_pct && form.price
    ? Math.round(parseFloat(form.price) * (1 - parseFloat(form.discount_pct) / 100))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!sellerId)            { setError('Please register or log in first.'); return; }
    if (!majorCat)            { setError('Select a major category.'); return; }
    if (!form.subcategory)    { setError('Select a subcategory.'); return; }
    if (itemOptions && !form.item_type) { setError('Select an item type.'); return; }
    if (!form.title.trim())   { setError('Title is required.'); return; }
    if (!form.description.trim()) { setError('Description is required.'); return; }
    if (!form.price || isNaN(Number(form.price))) { setError('Valid price is required.'); return; }
    if (priceError) { setError(priceError); return; }
    if (images.length === 0)  { setError('Upload at least one image.'); return; }

    setLoading(true);
    try {
      // Collect custom field values if any
      const customFieldValues = {};
      if (selectedSubcat?.custom_fields?.length) {
        for (const cf of selectedSubcat.custom_fields) {
          const val = form[`cf_${cf.field_id}`];
          if (val !== undefined && val !== '') customFieldValues[cf.field_id] = val;
        }
      }

      const fields = {
        seller_id:            sellerId,
        major_category:       majorCat,
        subcategory:          form.subcategory,
        item_type:            form.item_type || '',
        wedding_dress_type,
        title:                form.title,
        description:          form.description,
        color:                form.color,
        fabric:               form.fabric,
        embroidery_type:      form.embroidery_type,
        size:                 form.size,
        material:             form.material,
        brand:                form.brand,
        condition:            form.condition,
        city:                 form.city,
        price:                form.price,
        discount_pct:         showDiscount && form.discount_pct ? form.discount_pct : '',
        stock_quantity:       form.stock_quantity,
        custom_field_values:  Object.keys(customFieldValues).length ? JSON.stringify(customFieldValues) : '',
      };

      const data = await sellerApi.uploadProduct(fields, images);
      if (data.success) {
        setResult(data);
        setForm({ ...EMPTY, city: sellerCity });
        setImages([]);
        setPreviews([]);
        setMajorCat(null);
        setShowDiscount(false);
        if (fileRef.current) fileRef.current.value = '';
        if (onUploaded) onUploaded(data);
      } else {
        setError(data.error || 'Upload failed.');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1 — Pick major category ─────────────────────────────────────────
  if (!majorCat) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-primary-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Upload New Product</h2>
        <p className="text-sm text-gray-500 mb-5">Select a category to continue</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {effectiveCatTree.map(cat => (
            <button
              key={cat.id}
              onClick={() => selectMajorCat(cat.id)}
              className="flex flex-col items-center gap-3 p-6 glass-card border border-gray-100 rounded-[1.5rem]
                         hover:border-primary-400 hover:bg-primary-50/50 hover-lift transition-all text-center"
            >
              <div className="p-3 bg-white rounded-full shadow-sm">
                {cat.icon}
              </div>
              <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 2 — Product form ─────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-primary-200 p-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setMajorCat(null)}
          className="text-sm text-gray-400 hover:text-primary-950 transition-colors flex items-center gap-1">
          ← Back
        </button>
        <span className="text-lg">{catDef.icon}</span>
        <h2 className="text-xl font-bold text-gray-800">Upload {catDef.label}</h2>
      </div>

      {result && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Product uploaded! ID: <span className="font-mono font-semibold">{result.product_id}</span>
          {' '}— {result.images_saved} image(s) saved
          {result.embeddings_extracted > 0 && `, ${result.embeddings_extracted} embedding(s) extracted`}.
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Subcategory ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {majorCat === 'wedding_dress' ? 'Dress Type *' : 'Subcategory *'}
            </label>
            <select value={form.subcategory} onChange={(e) => setForm(f => ({ ...f, subcategory: e.target.value, item_type: '' }))} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">— Select —</option>
              {subcatOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {/* Item type — only when subcategory has nested items */}
          {itemOptions && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {majorCat === 'wedding_dress' ? 'Style *' : 'Item Type *'}
              </label>
              <select value={form.item_type} onChange={set('item_type')} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                {itemOptions.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── Title + Description ──────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input type="text" value={form.title} onChange={set('title')} required
            placeholder={majorCat === 'wedding_dress' ? 'e.g. Royal Red Bridal Lehenga' : 'e.g. Elegant 6-seater Sofa Set'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description *
            <span className="ml-1 text-xs text-gray-400 font-normal">
              (Detailed description helps buyers find your product)
            </span>
          </label>
          <textarea value={form.description} onChange={set('description')} required rows={3}
            placeholder="Describe color, material, style, condition and any special features…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
        </div>

        {/* ── Wedding dress specific fields ────────────────────────────── */}
        {majorCat === 'wedding_dress' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input type="text" value={form.color} onChange={set('color')} placeholder="e.g. Deep Red"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fabric</label>
              <select value={form.fabric} onChange={set('fabric')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                {FABRICS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Embroidery</label>
              <select value={form.embroidery_type} onChange={set('embroidery_type')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                {EMBROIDERY.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
              <select value={form.size} onChange={set('size')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Furniture specific ───────────────────────────────────────── */}
        {majorCat === 'furniture' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input type="text" value={form.color} onChange={set('color')} placeholder="e.g. Walnut Brown"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
              <select value={form.material} onChange={set('material')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                {FURNITURE_MATS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Electronics specific ─────────────────────────────────────── */}
        {majorCat === 'electronics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input type="text" value={form.brand} onChange={set('brand')} placeholder="e.g. Samsung, Haier, Dawlance"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Kitchen Items specific ────────────────────────────────────── */}
        {majorCat === 'kitchen_items' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input type="text" value={form.brand} onChange={set('brand')} placeholder="e.g. National, Dawlance"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
              <input type="text" value={form.material} onChange={set('material')} placeholder="e.g. Steel, Bone China"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Decoration specific ────────────────────────────────────────── */}
        {(majorCat === 'decoration' || majorCat === 'miscellaneous') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input type="text" value={form.color} onChange={set('color')} placeholder="e.g. Warm White, Gold"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Custom fields from admin ──────────────────────────────────── */}
        {(selectedSubcat?.custom_fields?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedSubcat.custom_fields.map(cf => (
                <div key={cf.field_id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {cf.label}{cf.required ? ' *' : ''}
                  </label>
                  {cf.type === 'select' ? (
                    <select
                      value={form[`cf_${cf.field_id}`] || ''}
                      onChange={e => setForm(f => ({ ...f, [`cf_${cf.field_id}`]: e.target.value }))}
                      required={cf.required}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">— Select —</option>
                      {(cf.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={cf.type === 'number' ? 'number' : 'text'}
                      value={form[`cf_${cf.field_id}`] || ''}
                      onChange={e => setForm(f => ({ ...f, [`cf_${cf.field_id}`]: e.target.value }))}
                      required={cf.required}
                      placeholder={cf.type === 'number' ? '0' : `Enter ${cf.label.toLowerCase()}`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  )}
                </div>
              ))}
          </div>
        )}

        {/* ── City ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" value={form.city} onChange={set('city')} placeholder="e.g. Lahore"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Qty</label>
            <input type="number" value={form.stock_quantity} onChange={set('stock_quantity')} min="1" placeholder="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>

        {/* ── Price + Discount ─────────────────────────────────────────────── */}
        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (PKR) *
                {priceRange && (
                  <span className="ml-1 text-xs text-gray-400 font-normal">
                    Range: PKR {priceRange.min.toLocaleString()} – {priceRange.max.toLocaleString()}
                  </span>
                )}
              </label>
              <input
                type="number" value={form.price} onChange={set('price')} required
                min={priceRange?.min || 0} max={priceRange?.max}
                placeholder={priceRange ? `${priceRange.min.toLocaleString()} – ${priceRange.max.toLocaleString()}` : 'e.g. 25000'}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${
                  priceError
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-gray-200 focus:ring-primary-500'
                }`}
              />
              {priceError && (
                <p className="mt-1 text-xs text-red-600 font-medium">{priceError}</p>
              )}

              {/* §11.3 Inline price suggestion — shown below price field */}
              {priceSuggestion && (() => {
                const lo  = priceSuggestion.range_low  || 0;
                const hi  = priceSuggestion.range_high || 0;
                if (lo === 0 && hi === 0) return null;
                const avg = Math.round((lo + hi) / 2);
                const pct = priceSuggestion.band_pct || 30;
                const isBelow = priceNum > 0 && priceNum < lo;
                const isAbove = priceNum > 0 && hi > 0 && priceNum > hi;
                const isInRange = priceNum > 0 && !isBelow && !isAbove;
                return (
                  <div className="mt-1.5">
                    <p className="text-[11px] text-blue-600 font-medium">
                      Suggested: PKR {lo.toLocaleString()} – {hi.toLocaleString()}
                      {' '}(avg PKR {avg.toLocaleString()}, ±{pct}%)
                    </p>
                    {isInRange && (
                      <p className="text-[11px] text-green-600 mt-0.5">✓ Within suggested range</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowDiscount(v => !v); setForm(f => ({ ...f, discount_pct: '' })); }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    showDiscount
                      ? 'bg-green-100 text-green-700 border-green-300'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:border-[#FBEFF1]'
                  }`}
                >
                  {showDiscount ? '✓ Discount ON' : '+ Add Discount'}
                </button>
                {showDiscount && (
                  <div className="flex items-center gap-1 flex-1">
                    <input type="number" value={form.discount_pct} onChange={set('discount_pct')}
                      min="1" max="50" placeholder="e.g. 15"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white" />
                    <span className="text-sm text-gray-500 flex-shrink-0">%</span>
                  </div>
                )}
              </div>
              {discountPrice !== null && (
                <p className="mt-1 text-xs text-green-600 font-semibold">
                  Sale price: PKR {discountPrice.toLocaleString()} ({form.discount_pct}% off)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Image upload ─────────────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {maxImages === 1 ? 'Product Image *' : `Images * (up to ${maxImages})`}
            <span className="ml-2 text-xs text-gray-400 font-normal">JPG/PNG/WebP, max 5 MB</span>
          </label>
          <div
            className="border-2 border-dashed border-primary-300 rounded-xl p-4 text-center cursor-pointer hover:border-primary-500 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-sm text-gray-500">
              {maxImages === 1
                ? 'Click to upload 1 product photo'
                : 'Click to select images or drag & drop'}
            </p>
            <input
              ref={fileRef} type="file" multiple={maxImages > 1}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFiles}
            />
          </div>

          {previews.length > 0 && (
            <div className="mt-3 flex gap-3 flex-wrap">
              {previews.map((src, idx) => (
                <div key={idx} className="relative">
                  <img src={src} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                  {idx === 0 && maxImages > 1 && (
                    <span className="absolute -top-1 -left-1 bg-primary-900 text-white text-xs px-1 rounded">Primary</span>
                  )}
                  <button type="button" onClick={() => removeImage(idx)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-800 text-white font-semibold rounded-xl
                     hover:from-primary-600 hover:to-primary-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {majorCat === 'wedding_dress' ? 'Uploading & Extracting Embeddings…' : 'Uploading…'}
              </span>
            : `Upload ${catDef.label}`}
        </button>
      </form>
    </div>
  );
}
