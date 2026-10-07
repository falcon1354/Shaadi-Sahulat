import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Shirt, Sofa, Monitor, Utensils, Sparkles, Gift, Package, ArrowLeft, CheckCircle2, UploadCloud, Plus } from 'lucide-react';
import sellerApi from '../../api/sellerApi';
import { useCategories } from '../../hooks/useCategories';
import { isRetiredCategory } from '../../lib/dowryDisplay';
import SellerPageHero from '../Common/SellerPageHero';
import heroImg from '../../assets/hero/Hero_Retail.jpeg';

// ── Category tree (mirrors config.py SELLER_CATEGORY_TREE) ────────────────
const CATEGORY_TREE = [
  {
    id: 'wedding_dress', label: 'Wedding Dress', icon: <Shirt size={36} strokeWidth={1.5} className="text-primary-800" />,
    multipleImages: true,
    storefront: 'both',
    subcategories: [
      {
        id: 'bridal', label: 'Bridal',
        items: [
          { id: 'bridal_lehenga', label: 'Lehenga' },
          { id: 'bridal_sharara', label: 'Sharara' },
          { id: 'bridal_saree',   label: 'Saree' },
          { id: 'bridal_gharara', label: 'Gharara' },
          { id: 'bridal_gown',    label: 'Bridal Gown' },
          { id: 'bridal_maxi',    label: 'Maxi' },
        ],
      },
      {
        id: 'groom', label: 'Groom',
        items: [
          { id: 'groom_sherwani',        label: 'Sherwani' },
          { id: 'groom_shalwar_kameez',  label: 'Shalwar Kameez' },
          { id: 'groom_prince_coat',     label: 'Prince Coat' },
        ],
      },
    ],
  },
  {
    id: 'furniture', label: 'Furniture', icon: <Sofa size={36} strokeWidth={1.5} className="text-primary-800" />,
    multipleImages: true,
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
    multipleImages: true,
    subcategories: [
      { id: 'led_tv',          label: 'LED TV',          items: null },
      { id: 'refrigerator',    label: 'Refrigerator',    items: null },
      { id: 'washing_machine', label: 'Washing Machine', items: null },
      { id: 'ac',              label: 'Air Conditioner', items: null },
    ],
  },
  {
    id: 'kitchen_items', label: 'Kitchen Items', icon: <Utensils size={36} strokeWidth={1.5} className="text-orange-500" />,
    multipleImages: true,
    subcategories: [
      {
        id: 'large_appliances', label: 'Large Appliances',
        items: [
          { id: 'microwave',            label: 'Microwave' },
          { id: 'juicer_blender',       label: 'Juicer / Blender Set' },
          { id: 'toaster',              label: 'Toaster' },
          { id: 'breakfast_beverages',  label: 'Breakfast / Beverages' },
          { id: 'built_in_hob',         label: 'Built-in Hob' },
          { id: 'dishwasher',           label: 'Dishwasher' },
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
    multipleImages: true,
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
    multipleImages: true,
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
  breakfast_beverages:{ min: 2000,   max: 25000  },
  built_in_hob:       { min: 15000,  max: 120000 },
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
  marketplace_type: 'new', original_price: '',
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
  const [listingType,     setListingType]     = useState('new'); // 'new' or 'thrift'
  const fileRef = useRef(null);

  // Merge DB categories with static CATEGORY_TREE (keeps nested item types for wedding_dress, etc.)
  const effectiveCatTree = useMemo(() => {
    if (!dbCategories.length) return CATEGORY_TREE;
    return dbCategories.filter(dbCat => !isRetiredCategory(dbCat.category_id, dbCat.label)).map(dbCat => {
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
        multipleImages: true,
        storefront:     dbCat.storefront || staticDef?.storefront || 'both',
        subcategories:  subs,
      };
    });
  }, [dbCategories]);

  const catDef      = effectiveCatTree.find(c => c.id === majorCat);
  const maxImages   = catDef?.multipleImages ? 5 : 1;

  // Force-set listingType when category doesn't allow thrift (storefront === 'new')
  useEffect(() => {
    if (!catDef) return;
    const sf = catDef.storefront || 'both';
    if (sf === 'new' && listingType !== 'new') {
      setListingType('new');
      setForm(f => ({ ...f, marketplace_type: 'new', condition: 'New' }));
    } else if (sf === 'thrift' && listingType !== 'thrift') {
      setListingType('thrift');
      setForm(f => ({ ...f, marketplace_type: 'thrift', condition: 'Thrift', stock_quantity: '1' }));
    }
  }, [catDef]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // When major category changes, reset subcategory/item
  const selectMajorCat = (id) => {
    setMajorCat(id);
    setForm({ ...EMPTY, city: sellerCity, marketplace_type: listingType });
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
    if (listingType === 'thrift') {
      if (!form.original_price || isNaN(Number(form.original_price))) {
        setError('Original price is required for thrift items.'); return;
      }
      if (Number(form.price) >= Number(form.original_price)) {
        setError('Discounted price must be less than original price.'); return;
      }
    }
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
        marketplace_type:     listingType,
        original_price:       listingType === 'thrift' && form.original_price ? form.original_price : '',
        city:                 form.city,
        price:                form.price,
        discount_pct:         showDiscount && form.discount_pct ? form.discount_pct : '',
        stock_quantity:       listingType === 'thrift' ? '1' : form.stock_quantity,
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
      <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
        <SellerPageHero
          badge={<><Package size={12} /> Merchant Studio</>}
          title="List New Wedding Inventory"
          subtitle="Choose the department and category for your new bridal gown, groom ensemble, furniture set, or appliances."
          image={heroImg}
          imageAlt="Luxury bridal catalog inventory studio"
        />

        <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-serif font-bold text-stone-900">Select Department Category</h2>
            <p className="text-xs text-stone-500 mt-1">Choose a category to open custom attributes and pricing intelligence</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {effectiveCatTree.map(cat => (
              <button
                key={cat.id}
                onClick={() => selectMajorCat(cat.id)}
                className="flex flex-col items-center gap-3.5 p-6 rounded-3xl border border-[#EFEAE4] bg-[#FAF7F2]/40 hover:bg-[#FAF7F2] hover:border-[#ECD4A8] hover:shadow-luxury transition-all text-center group cursor-pointer hover:-translate-y-1 duration-300"
              >
                <div className="p-4 bg-white rounded-2xl shadow-xs border border-[#EADBCC]/60 text-[#9B7036] group-hover:bg-[#9B7036] group-hover:text-white transition-colors duration-300">
                  {cat.icon}
                </div>
                <div>
                  <span className="text-sm font-serif font-bold text-stone-900 group-hover:text-[#9B7036] transition-colors block">{cat.label}</span>
                  <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5 block">
                    {cat.subcategories?.length || 1} subcategories
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2 — Product form ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">
      <SellerPageHero
        badge={<><Package size={12} /> Step 2: Listing Details</>}
        title={`Upload ${catDef?.label || 'Product'}`}
        subtitle="Fill in detailed specifications, pricing structure, and upload high-resolution boutique imagery."
        image={heroImg}
        imageAlt="ShaadiSahulat Product Studio"
        rightSlot={
          <button
            onClick={() => setMajorCat(null)}
            className="px-4 py-2 rounded-2xl bg-white border border-[#EADBCC] text-stone-700 hover:text-stone-900 hover:bg-[#FAF7F2] text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={14} /> Switch Category
          </button>
        }
      />

      <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-6 sm:p-8 space-y-6">
        {result && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
            <div>
              <p className="font-bold">Product successfully listed in catalog!</p>
              <p className="text-emerald-700 mt-0.5">
                Product ID: <span className="font-mono font-bold">{result.product_id}</span> — {result.images_saved} image(s) saved
                {result.embeddings_extracted > 0 && ` (${result.embeddings_extracted} AI dress embeddings extracted)`}.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* New / Thrift Toggle */}
          {(() => {
            const sf = catDef?.storefront || 'both';
            if (sf === 'new' || sf === 'thrift') return null;
            return (
              <div className="bg-[#FAF7F2] rounded-2xl border border-[#EADBCC] p-4">
                <p className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">Listing Channel</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setListingType('new'); setForm(f => ({ ...f, marketplace_type: 'new', condition: 'New' })); }}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border-2 cursor-pointer ${
                      listingType === 'new'
                        ? 'border-[#9B7036] bg-white text-[#9B7036] shadow-xs'
                        : 'border-transparent bg-white/60 text-stone-500 hover:bg-white'
                    }`}
                  >
                    🛍️ Brand New Boutique Retail
                  </button>
                  <button
                    type="button"
                    onClick={() => { setListingType('thrift'); setForm(f => ({ ...f, marketplace_type: 'thrift', condition: 'Thrift', stock_quantity: '1' })); }}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border-2 cursor-pointer ${
                      listingType === 'thrift'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-800 shadow-xs'
                        : 'border-transparent bg-white/60 text-stone-500 hover:bg-white'
                    }`}
                  >
                    ♻️ Pre-Loved Thrift Listing
                  </button>
                </div>
                {listingType === 'thrift' && (
                  <p className="text-[11px] text-emerald-700 mt-2 font-medium">
                    Thrift items: quantity locked to 1, go live immediately, final sale.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Subcategory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                {majorCat === 'wedding_dress' ? 'Dress Type *' : 'Subcategory *'}
              </label>
              <select value={form.subcategory} onChange={(e) => setForm(f => ({ ...f, subcategory: e.target.value, item_type: '' }))} required
                className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                <option value="">— Select Subcategory —</option>
                {subcatOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {itemOptions && (
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  {majorCat === 'wedding_dress' ? 'Style *' : 'Item Type *'}
                </label>
                <select value={form.item_type} onChange={set('item_type')} required
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                  <option value="">— Select Style —</option>
                  {itemOptions.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Title + Description */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Product Title *</label>
            <input type="text" value={form.title} onChange={set('title')} required
              placeholder={majorCat === 'wedding_dress' ? 'e.g. Royal Red Hand-Embroidered Bridal Lehenga' : 'e.g. Luxury 6-Seater Velvet Dining Set'}
              className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
              Description *
              <span className="ml-1 text-[11px] text-stone-400 font-normal lowercase">
                (Detailed attributes help visual search and buyer inquiries)
              </span>
            </label>
            <textarea value={form.description} onChange={set('description')} required rows={3}
              placeholder="Describe color hues, fabric texture, embroidery intricacy, condition, and included accessories…"
              className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white resize-none" />
          </div>

          {/* Wedding dress specific fields */}
          {majorCat === 'wedding_dress' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Primary Color</label>
                <input type="text" value={form.color} onChange={set('color')} placeholder="e.g. Maroon & Gold"
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Fabric</label>
                <select value={form.fabric} onChange={set('fabric')}
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                  <option value="">— Select —</option>
                  {FABRICS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Embroidery</label>
                <select value={form.embroidery_type} onChange={set('embroidery_type')}
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                  <option value="">— Select —</option>
                  {EMBROIDERY.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Size</label>
                <select value={form.size} onChange={set('size')}
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                  <option value="">— Select —</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Furniture specific */}
          {majorCat === 'furniture' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Finish / Color</label>
                <input type="text" value={form.color} onChange={set('color')} placeholder="e.g. Teak Wood Brown"
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Primary Material</label>
                <select value={form.material} onChange={set('material')}
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white">
                  <option value="">— Select Material —</option>
                  {FURNITURE_MATS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Electronics & Kitchen items */}
          {(majorCat === 'electronics' || majorCat === 'kitchen_items') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Brand Name</label>
                <input type="text" value={form.brand} onChange={set('brand')} placeholder="e.g. Samsung, Haier, Dawlance"
                  className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
              </div>
              {majorCat === 'kitchen_items' && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Material</label>
                  <input type="text" value={form.material} onChange={set('material')} placeholder="e.g. Stainless Steel, Bone China"
                    className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
                </div>
              )}
            </div>
          )}

          {/* City + Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Merchant City</label>
              <input type="text" value={form.city} onChange={set('city')} placeholder="e.g. Lahore"
                className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Available Stock Qty</label>
              <input type="number" value={listingType === 'thrift' ? '1' : form.stock_quantity}
                onChange={set('stock_quantity')} min="1" placeholder="1"
                disabled={listingType === 'thrift'}
                className="w-full border border-[#EADBCC] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white disabled:bg-stone-100 disabled:text-stone-400" />
            </div>
          </div>

          {/* Thrift Specific Prices */}
          {listingType === 'thrift' && (
            <div className="p-5 bg-emerald-50/70 rounded-3xl border border-emerald-200 space-y-3">
              <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">♻️ Thrift Pre-Loved Pricing</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Original Retail Price (PKR) *</label>
                  <input type="number" value={form.original_price} onChange={set('original_price')} required
                    min="0" placeholder="e.g. 80000"
                    className="w-full border border-emerald-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Discounted Selling Price (PKR) *</label>
                  <input type="number" value={form.price} onChange={set('price')} required
                    min="0" placeholder="e.g. 45000"
                    className="w-full border border-emerald-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                </div>
              </div>
            </div>
          )}

          {/* Retail Pricing + Discount */}
          {listingType !== 'thrift' && (
            <div className="p-5 bg-[#FAF7F2] rounded-3xl border border-[#EADBCC] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Price (PKR) *
                  </label>
                  <input
                    type="number" value={form.price} onChange={set('price')} required
                    placeholder="e.g. 65000"
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white ${
                      priceError ? 'border-rose-400 focus:ring-rose-400' : 'border-[#EADBCC] focus:ring-[#9B7036]'
                    }`}
                  />
                  {priceSuggestion && (() => {
                    const lo = priceSuggestion.range_low || 0;
                    const hi = priceSuggestion.range_high || 0;
                    if (lo === 0 && hi === 0) return null;
                    return (
                      <p className="text-[11px] text-[#9B7036] font-bold mt-1.5">
                        Market Range: PKR {lo.toLocaleString()} – {hi.toLocaleString()}
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">Promotional Discount</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowDiscount(v => !v); setForm(f => ({ ...f, discount_pct: '' })); }}
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        showDiscount
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-white text-stone-600 border-[#EADBCC] hover:bg-stone-50'
                      }`}
                    >
                      {showDiscount ? '✓ Discount Active' : '+ Add Sale %'}
                    </button>
                    {showDiscount && (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input type="number" value={form.discount_pct} onChange={set('discount_pct')}
                          min="1" max="50" placeholder="e.g. 15"
                          className="w-full border border-[#EADBCC] rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#9B7036] bg-white" />
                        <span className="text-xs text-stone-500 font-bold">%</span>
                      </div>
                    )}
                  </div>
                  {discountPrice !== null && (
                    <p className="mt-1.5 text-xs text-emerald-700 font-bold">
                      Customer Sale Price: PKR {discountPrice.toLocaleString()} ({form.discount_pct}% off)
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Image Upload Zone */}
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
              {maxImages === 1 ? 'Product Image *' : `Product Images * (up to ${maxImages})`}
              <span className="ml-2 text-[11px] text-stone-400 font-normal lowercase">High resolution JPG/PNG/WebP</span>
            </label>
            <div
              className="border-2 border-dashed border-[#ECD4A8] bg-[#FAF7F2]/40 rounded-3xl p-6 text-center cursor-pointer hover:bg-[#FAF7F2] hover:border-[#9B7036] transition-all"
              onClick={() => fileRef.current?.click()}
            >
              <UploadCloud size={32} className="mx-auto text-[#9B7036] mb-2" />
              <p className="text-xs font-bold text-stone-800">Click to upload or drag & drop bridal imagery</p>
              <p className="text-[11px] text-stone-400 mt-0.5">Clear photos attract significantly higher engagement</p>
              <input
                ref={fileRef} type="file" multiple={maxImages > 1}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFiles}
              />
            </div>

            {previews.length > 0 && (
              <div className="mt-4 flex gap-3 flex-wrap">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-[#EADBCC] shadow-2xs group">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    {idx === 0 && maxImages > 1 && (
                      <span className="absolute bottom-1 left-1 bg-[#9B7036] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">Primary</span>
                    )}
                    <button type="button" onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 w-5 h-5 bg-rose-600 text-white rounded-full text-xs flex items-center justify-center cursor-pointer shadow-xs">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-[#9B7036] to-[#7E5724] text-white font-bold rounded-2xl shadow-luxury hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Publishing Listing to Catalog…</span>
              </>
            ) : (
              <>
                <Plus size={16} /> Publish {catDef?.label || 'Product'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

