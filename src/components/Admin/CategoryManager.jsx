import React, { useState, useEffect, useCallback } from 'react';
import adminApi from '../../api/adminApi';
import { invalidateCategoryCache } from '../../hooks/useCategories';

const FIELD_TYPES = ['text', 'number', 'select'];
const CONDITIONS  = ['New', 'Like New', 'Used', 'Thrift'];

// ── auto-dismiss message hook ─────────────────────────────────────────────────
function useMsg(delay = 4000) {
  const [msg, setMsg] = useState({ text: '', type: 'info' });
  const show = useCallback((text, type = 'info') => {
    if (!text) {
      setMsg({ text: '', type: 'info' });
      return;
    }
    const isError = type === 'error' || (typeof text === 'string' && (text.toLowerCase().includes('fail') || text.toLowerCase().includes('error') || text.toLowerCase().includes('required') || text.toLowerCase().includes('cannot')));
    setMsg({ text, type: isError ? 'error' : 'success' });
    setTimeout(() => setMsg({ text: '', type: 'info' }), delay);
  }, [delay]);
  return [msg, show];
}

// ── Seller form preview modal ─────────────────────────────────────────────────
function FieldPreviewModal({ category, subcategory, onClose }) {
  if (!category || !subcategory) return null;
  const fields = subcategory.custom_fields || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-100">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-orange-50/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{category.icon || '🏷️'}</span>
              <h3 className="text-lg font-bold text-gray-900">
                {category.label} › <span className="text-[#a37b3d]">{subcategory.label}</span>
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Live Seller Upload Form Preview</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-white text-gray-400 hover:text-gray-700 shadow-sm border border-gray-200 flex items-center justify-center text-lg transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-[#a37b3d] font-medium flex items-center gap-2">
            <span>ℹ️</span> This is how the upload form appears to sellers in this category
          </div>

          {/* Standard fields */}
          {[
            { label: 'Product Title *', placeholder: `e.g. Premium ${subcategory.label}`, type: 'text' },
            { label: 'Description *', placeholder: 'Describe fabric, color, embroidery, styling...', type: 'textarea' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea rows={2} placeholder={f.placeholder} disabled
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-400 resize-none" />
              ) : (
                <input type="text" placeholder={f.placeholder} disabled
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-400" />
              )}
            </div>
          ))}

          {/* Custom fields */}
          {fields.length > 0 && (
            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs font-bold text-[#a37b3d] uppercase tracking-wider mb-3">Custom Subcategory Fields</p>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(f => (
                  <div key={f.field_id}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.type === 'select' ? (
                      <select disabled className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-600">
                        <option>— Select {f.label} —</option>
                        {(f.options || []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        placeholder={f.type === 'number' ? '0' : `Enter ${f.label.toLowerCase()}`}
                        disabled
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-400"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price & Condition */}
          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Price (PKR) *
                {(subcategory.price_min || subcategory.price_max) && (
                  <span className="block text-[10px] text-amber-700 font-normal">
                    Allowed: PKR {subcategory.price_min?.toLocaleString()} – {subcategory.price_max?.toLocaleString()}
                  </span>
                )}
              </label>
              <input type="number" placeholder="25000" disabled
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Condition</label>
              <select disabled className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50">
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
            <input type="text" placeholder="Lahore / Karachi" disabled
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-400" />
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 bg-[#a37b3d] text-white rounded-xl text-xs font-bold hover:bg-[#8a6633] transition-all shadow-md mt-4"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CategoryManager() {
  const [cats, setCats]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [selectedSub, setSelectedSub]   = useState(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Forms
  const [newCat, setNewCat]             = useState({ category_id: '', label: '', icon: '👗', price_min: '', price_max: '', storefront: 'both' });
  const [placeholderFile, setPlaceholderFile] = useState(null);
  const [placeholderPreview, setPlaceholderPreview] = useState('');
  const [newSub, setNewSub]             = useState({ id: '', label: '' });
  const [newField, setNewField]         = useState({ field_id: '', label: '', type: 'text', options: '', required: false });
  const [subPriceEdit, setSubPriceEdit] = useState({ price_min: '', price_max: '' });

  // Messages
  const [catMsg, showCatMsg]     = useMsg();
  const [subMsg, showSubMsg]     = useMsg();
  const [fieldMsg, showFieldMsg] = useMsg();
  const [priceMsg, showPriceMsg] = useMsg();

  // Modals / confirmations
  const [preview, setPreview]                 = useState(null); // { category, subcategory }
  const [deleteSubConfirm, setDeleteSubConfirm] = useState(null); // { catId, sub }
  const [removeFieldConfirm, setRemoveFieldConfirm] = useState(null); // { field, catId, subId }

  const reload = async () => {
    try {
      const r = await adminApi.getAdminCategories();
      const fresh = r.categories || [];
      setCats(fresh);
      setLoading(false);
      invalidateCategoryCache();

      // Re-sync selection
      if (selected) {
        const freshCat = fresh.find(c => c.category_id === selected.category_id);
        setSelected(freshCat || null);
        if (selectedSub && freshCat) {
          setSelectedSub(freshCat.subcategories?.find(s => s.id === selectedSub.id) || null);
        }
      }
    } catch (err) {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (selectedSub) {
      setSubPriceEdit({ price_min: selectedSub.price_min ?? '', price_max: selectedSub.price_max ?? '' });
    }
  }, [selectedSub?.id, selectedSub?.price_min, selectedSub?.price_max]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const addCat = async () => {
    if (!newCat.category_id || !newCat.label) {
      showCatMsg('Category ID and Label are required.', 'error');
      return;
    }
    const payload = {
      ...newCat,
      price_min: Number(newCat.price_min) || 1000,
      price_max: Number(newCat.price_max) || 500000,
      storefront: newCat.storefront || 'both',
    };
    const r = await adminApi.addCategory(payload, placeholderFile);
    if (r.success) {
      showCatMsg(placeholderFile ? 'Category added with custom image!' : 'Category added successfully!');
      setNewCat({ category_id: '', label: '', icon: '👗', price_min: '', price_max: '', storefront: 'both' });
      setPlaceholderFile(null);
      setPlaceholderPreview('');
      await reload();
    } else {
      showCatMsg(r.error || 'Failed to add category', 'error');
    }
  };

  const removeCat = async (category_id) => {
    if (!window.confirm(`Deactivate category "${category_id}"? Existing items and plans will be preserved.`)) return;
    const r = await adminApi.deleteCategory(category_id);
    if (r.success) {
      showCatMsg('Category deactivated (soft-deleted).');
      if (selected?.category_id === category_id) {
        setSelected(null);
        setSelectedSub(null);
      }
      await reload();
    } else {
      showCatMsg(r.error || 'Delete failed', 'error');
    }
  };

  const addSub = async () => {
    if (!selected) { showSubMsg('Select a category first.', 'error'); return; }
    if (!newSub.id || !newSub.label) { showSubMsg('Subcategory ID and Label are required.', 'error'); return; }
    if (selected.category_id === 'bridal' || selectedSub?.id === 'bridal') {
      showSubMsg('Cannot add subcategories inside Bridal.', 'error');
      return;
    }
    const r = await adminApi.addSubcategory(selected.category_id, newSub);
    if (r.success) {
      showSubMsg('Subcategory added successfully!');
      setNewSub({ id: '', label: '' });
      await reload();
    } else {
      showSubMsg(r.error || 'Failed to add subcategory', 'error');
    }
  };

  const confirmDeleteSub = async () => {
    if (!deleteSubConfirm) return;
    const { catId, sub } = deleteSubConfirm;
    setDeleteSubConfirm(null);
    try {
      const r = await adminApi.deleteSubcategory(catId, sub.id);
      if (r.success) {
        showSubMsg(`Subcategory "${sub.label}" deleted successfully.`);
        if (selectedSub?.id === sub.id) setSelectedSub(null);
        await reload();
      } else {
        showSubMsg(r.error || 'Failed to delete subcategory', 'error');
      }
    } catch (e) {
      showSubMsg(e.message || 'Error deleting subcategory', 'error');
    }
  };

  const addField = async () => {
    if (!selected || !selectedSub) { showFieldMsg('Select a subcategory first.', 'error'); return; }
    if (!newField.field_id || !newField.label) { showFieldMsg('Field ID and Label are required.', 'error'); return; }
    const field = {
      ...newField,
      options: newField.type === 'select'
        ? newField.options.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    };
    const r = await adminApi.addCustomField(selected.category_id, selectedSub.id, field);
    if (r.success) {
      showFieldMsg('Field added!');
      setNewField({ field_id: '', label: '', type: 'text', options: '', required: false });
      await reload();
      const freshCat = r.category;
      const freshSub = freshCat?.subcategories?.find(s => s.id === selectedSub.id);
      setPreview({ category: freshCat || selected, subcategory: freshSub || selectedSub });
    } else {
      showFieldMsg(r.error || 'Failed to add field', 'error');
    }
  };

  const confirmRemoveField = async () => {
    if (!removeFieldConfirm) return;
    const { field, catId, subId } = removeFieldConfirm;
    setRemoveFieldConfirm(null);
    const r = await adminApi.removeCustomField(catId, subId, field.field_id);
    if (r.success) {
      showFieldMsg('Field removed.');
      await reload();
    } else {
      showFieldMsg(r.error || 'Remove failed.', 'error');
    }
  };

  const saveSubPrice = async () => {
    if (!selected || !selectedSub) return;
    const r = await adminApi.updateSubcategoryPrices(selected.category_id, selectedSub.id, {
      price_min: Number(subPriceEdit.price_min),
      price_max: Number(subPriceEdit.price_max),
    });
    if (r.success) {
      showPriceMsg('Price range saved!');
      await reload();
    } else {
      showPriceMsg(r.error || 'Save failed', 'error');
    }
  };

  const filteredCats = cats.filter(c => 
    c.label.toLowerCase().includes(searchFilter.toLowerCase()) || 
    c.category_id.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const totalSubcategories = cats.reduce((acc, c) => acc + (c.subcategories?.length || 0), 0);
  const bridalLocked = selected?.category_id === 'bridal' || selectedSub?.id === 'bridal';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 space-y-3">
        <div className="w-10 h-10 border-4 border-[#a37b3d] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-500">Loading category configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header & Stats ── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF8F0] border border-[#ECD4A8] flex items-center justify-center text-xl shadow-inner">
              🏷️
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Category & Catalog Manager</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Manage dress categories, subcategories, price bounds, and seller custom attributes
              </p>
            </div>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-3">
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl px-4 py-2 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a37b3d]">Categories</span>
            <p className="text-lg font-black text-gray-900">{cats.length}</p>
          </div>
          <div className="bg-orange-50/70 border border-orange-200/60 rounded-2xl px-4 py-2 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Subcategories</span>
            <p className="text-lg font-black text-gray-900">{totalSubcategories}</p>
          </div>
          <button
            onClick={reload}
            className="px-3.5 py-2.5 rounded-2xl border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white transition-all shadow-sm"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── 3-Column Manager Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── COLUMN 1: Categories List & Add Form ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <span>📁</span> Categories ({filteredCats.length})
              </h2>
              <span className="text-[11px] text-gray-400">Select to manage</span>
            </div>

            {/* Search filter */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search categories..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="w-full px-3.5 py-2 pl-9 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none transition-all"
              />
              <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
            </div>

            {/* Category Cards */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredCats.map(cat => {
                const isSel = selected?.category_id === cat.category_id;
                const isInactive = cat.is_active === false;

                return (
                  <div
                    key={cat.category_id}
                    className={`rounded-2xl border transition-all ${
                      isSel
                        ? 'border-[#a37b3d] bg-gradient-to-r from-[#FFF8F0] to-amber-50/30 shadow-sm ring-1 ring-[#a37b3d]/30'
                        : isInactive
                        ? 'border-rose-100 bg-rose-50/40 opacity-75'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { setSelected(cat); setSelectedSub(null); }}
                      className="w-full text-left p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        {(cat.placeholder_image || cat.placeholder_url) ? (
                          <img
                            src={cat.placeholder_url || cat.placeholder_image}
                            alt=""
                            className="w-10 h-10 rounded-xl object-cover border border-gray-200 shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shrink-0">
                            {cat.icon || '📦'}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-gray-900 truncate">{cat.label}</p>
                            {isInactive && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                Inactive
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500 font-medium">
                              {cat.subcategories?.length || 0} subcategories
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                              cat.storefront === 'thrift' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              cat.storefront === 'new' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                              'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}>
                              {cat.storefront === 'thrift' ? '♻️ Thrift' : cat.storefront === 'new' ? '🛍️ Retail' : '🔄 Both'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Footer action for category card */}
                    <div className="px-3.5 pb-2.5 pt-0 flex justify-between items-center text-[10px] border-t border-gray-100/60 mt-1">
                      <span className="text-gray-400 font-mono">id: {cat.category_id}</span>
                      {!isInactive ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeCat(cat.category_id); }}
                          className="font-bold text-rose-600 hover:text-rose-800 transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <span className="text-gray-400">Archived</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredCats.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-400">No matching categories found.</div>
              )}
            </div>
          </div>

          {/* Add Category Form Card */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
              <span>➕</span> Add New Category
            </h3>

            <div className="space-y-2">
              <input
                placeholder="Unique ID (e.g. bridal_wear)"
                value={newCat.category_id}
                onChange={e => setNewCat(p => ({ ...p, category_id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
              />
              <input
                placeholder="Display Label (e.g. Bridal Wear)"
                value={newCat.label}
                onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Emoji Icon (e.g. 👰)"
                  value={newCat.icon}
                  onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none text-center"
                />
                <div className="col-span-2">
                  <select
                    value={newCat.storefront}
                    onChange={e => setNewCat(p => ({ ...p, storefront: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                  >
                    <option value="both">🔄 Both Storefronts</option>
                    <option value="new">🛍️ Retail New Only</option>
                    <option value="thrift">♻️ Thrift Only</option>
                  </select>
                </div>
              </div>

              {/* Placeholder image upload */}
              <div>
                <label className="text-[10px] text-gray-500 font-semibold block mb-1">
                  Optional Placeholder Image
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setPlaceholderFile(f);
                    setPlaceholderPreview(f ? URL.createObjectURL(f) : '');
                  }}
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-amber-50 file:text-[#a37b3d] hover:file:bg-amber-100"
                />
                {placeholderPreview && (
                  <img src={placeholderPreview} alt="preview" className="mt-2 w-14 h-14 rounded-xl object-cover border border-amber-200 shadow-sm" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <input
                  type="number"
                  placeholder="Min Price (PKR)"
                  value={newCat.price_min}
                  onChange={e => setNewCat(p => ({ ...p, price_min: e.target.value }))}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                />
                <input
                  type="number"
                  placeholder="Max Price (PKR)"
                  value={newCat.price_max}
                  onChange={e => setNewCat(p => ({ ...p, price_max: e.target.value }))}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                />
              </div>

              <button
                onClick={addCat}
                className="w-full py-2.5 bg-[#a37b3d] text-white rounded-xl text-xs font-bold hover:bg-[#8a6633] transition-all shadow-sm"
              >
                + Create Category
              </button>

              {catMsg.text && (
                <div className={`p-2.5 rounded-xl text-xs font-medium ${
                  catMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {catMsg.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── COLUMN 2: Subcategories Panel & Add/Delete Subcategory ── */}
        <div className="space-y-4">
          {selected ? (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <span>{selected.icon || '📁'}</span>
                    <span>{selected.label}</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">Manage Subcategories</p>
                </div>
                <span className="text-xs px-2.5 py-1 bg-amber-50 text-[#a37b3d] font-bold rounded-full border border-amber-100">
                  {selected.subcategories?.length || 0} items
                </span>
              </div>

              {/* Subcategories list with DELETE button */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {(selected.subcategories || []).map(sub => {
                  const isSubSel = selectedSub?.id === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className={`group rounded-2xl border p-3 transition-all ${
                        isSubSel
                          ? 'border-[#a37b3d] bg-gradient-to-r from-[#FFF8F0] to-amber-50/20 shadow-sm ring-1 ring-[#a37b3d]/30'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSub(isSubSel ? null : sub)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#a37b3d]"></span>
                            <span className="text-xs font-bold text-gray-800 truncate">{sub.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1 ml-4">
                            <span>{sub.custom_fields?.length || 0} custom fields</span>
                            {sub.price_min && sub.price_max ? (
                              <span>• PKR {sub.price_min.toLocaleString()}–{sub.price_max.toLocaleString()}</span>
                            ) : null}
                          </div>
                        </button>

                        {/* DELETE Subcategory Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSubConfirm({ catId: selected.category_id, sub });
                          }}
                          className="w-7 h-7 rounded-xl bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 border border-transparent flex items-center justify-center text-xs transition-all shadow-none"
                          title={`Delete subcategory "${sub.label}"`}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}

                {(!selected.subcategories || selected.subcategories.length === 0) && (
                  <div className="py-8 text-center text-xs text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                    No subcategories added yet for this category.
                  </div>
                )}
              </div>

              {/* Add Subcategory Section */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">➕ Add Subcategory</p>
                <input
                  placeholder="Subcategory ID (e.g. lehenga_choli)"
                  value={newSub.id}
                  onChange={e => setNewSub(p => ({ ...p, id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                />
                <input
                  placeholder="Display Label (e.g. Lehenga Choli)"
                  value={newSub.label}
                  onChange={e => setNewSub(p => ({ ...p, label: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                />

                <button
                  onClick={addSub}
                  disabled={bridalLocked}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    bridalLocked
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-[#a37b3d] text-white hover:bg-[#8a6633]'
                  }`}
                >
                  {bridalLocked ? '🔒 Bridal is locked' : '+ Add Subcategory'}
                </button>

                {bridalLocked && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    Subcategories cannot be nested inside Bridal. Groom and other categories remain open.
                  </p>
                )}

                {subMsg.text && (
                  <div className={`p-2.5 rounded-xl text-xs font-medium ${
                    subMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    {subMsg.text}
                  </div>
                )}
              </div>

              {/* Price Range Editor for Selected Subcategory */}
              {selectedSub && (
                <div className="border-t border-gray-100 pt-4 space-y-3 bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-900">
                      💰 Price Bounds for <span className="text-[#a37b3d]">{selectedSub.label}</span>
                    </h4>
                    <span className="text-[10px] text-gray-500">PKR</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-600 block mb-1">Min Price</label>
                      <input
                        type="number"
                        value={subPriceEdit.price_min}
                        onChange={e => setSubPriceEdit(p => ({ ...p, price_min: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-600 block mb-1">Max Price</label>
                      <input
                        type="number"
                        value={subPriceEdit.price_max}
                        onChange={e => setSubPriceEdit(p => ({ ...p, price_max: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={saveSubPrice}
                    className="w-full py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Save Price Range
                  </button>

                  {priceMsg.text && (
                    <p className={`text-[11px] font-medium ${priceMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {priceMsg.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center h-80 space-y-2">
              <span className="text-3xl opacity-40">👈</span>
              <p className="text-xs font-bold text-gray-600">Select a category on the left</p>
              <p className="text-[11px] text-gray-400 max-w-xs">
                View, add, edit, or delete its subcategories and custom attributes.
              </p>
            </div>
          )}
        </div>

        {/* ── COLUMN 3: Custom Fields & Live Form Preview ── */}
        <div className="space-y-4">
          {selectedSub ? (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    🛠️ Custom Attributes
                  </h3>
                  <p className="text-[11px] text-gray-400">For {selectedSub.label}</p>
                </div>
                <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-md">
                  {selectedSub.custom_fields?.length || 0} / 5 fields
                </span>
              </div>

              {/* Existing Fields List */}
              <div className="space-y-1.5">
                {(selectedSub.custom_fields || []).map(f => (
                  <div key={f.field_id} className="flex items-center justify-between p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-xs font-bold text-gray-800">
                        {f.label}
                        {f.required && <span className="ml-1 text-[10px] text-orange-600 font-extrabold">*required</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Type: <span className="font-semibold text-gray-600">{f.type}</span>
                        {f.options?.length ? ` (${f.options.length} options)` : ''}
                      </p>
                    </div>

                    <button
                      onClick={() => setRemoveFieldConfirm({ field: f, catId: selected.category_id, subId: selectedSub.id })}
                      className="w-6 h-6 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-sm transition-colors"
                      title="Remove field"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {(!selectedSub.custom_fields || selectedSub.custom_fields.length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-100">
                    No custom fields added yet.
                  </p>
                )}
              </div>

              {/* Add Custom Field Form */}
              {(selectedSub.custom_fields?.length || 0) < 5 && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-bold text-gray-800">➕ Add Custom Field</p>
                  <input
                    placeholder="Field ID (e.g. fabric_type)"
                    value={newField.field_id}
                    onChange={e => setNewField(p => ({ ...p, field_id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                  />
                  <input
                    placeholder="Field Label (e.g. Fabric Material)"
                    value={newField.label}
                    onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                  />
                  <select
                    value={newField.type}
                    onChange={e => setNewField(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                  >
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()} Input</option>)}
                  </select>

                  {newField.type === 'select' && (
                    <input
                      placeholder="Dropdown options (comma separated, e.g. Silk, Velvet, Organza)"
                      value={newField.options}
                      onChange={e => setNewField(p => ({ ...p, options: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#a37b3d] outline-none"
                    />
                  )}

                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={newField.required}
                      onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))}
                      className="rounded text-[#a37b3d] focus:ring-[#a37b3d]"
                    />
                    <span>Mark as required for sellers</span>
                  </label>

                  <button
                    onClick={addField}
                    className="w-full py-2 bg-[#a37b3d] text-white rounded-xl text-xs font-bold hover:bg-[#8a6633] transition-all shadow-sm"
                  >
                    + Add Field
                  </button>

                  {fieldMsg.text && (
                    <div className={`p-2 rounded-xl text-xs font-medium ${
                      fieldMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                    }`}>
                      {fieldMsg.text}
                    </div>
                  )}
                </div>
              )}

              {/* Live Preview Button */}
              <button
                onClick={() => setPreview({ category: selected, subcategory: selectedSub })}
                className="w-full py-2.5 border border-[#ECD4A8] bg-[#FFF8F0] text-[#a37b3d] hover:bg-[#FBEED7] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <span>👁</span> Preview Seller Upload Form
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center h-80 space-y-2">
              <span className="text-3xl opacity-40">✨</span>
              <p className="text-xs font-bold text-gray-600">Select a subcategory</p>
              <p className="text-[11px] text-gray-400 max-w-xs">
                Configure seller custom upload inputs and live-preview the form modal.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Live Form Preview ── */}
      {preview && (
        <FieldPreviewModal
          category={preview.category}
          subcategory={preview.subcategory}
          onClose={() => setPreview(null)}
        />
      )}

      {/* ── Modal: Delete Subcategory Confirmation ── */}
      {deleteSubConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-2xl mx-auto mb-3">
              🗑️
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Delete Subcategory?</h3>
            <p className="text-xs text-gray-500 text-center mb-5">
              Are you sure you want to delete <strong className="text-gray-800">"{deleteSubConfirm.sub.label}"</strong>? This will remove it from category catalog options.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setDeleteSubConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSub}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Remove Field Confirmation ── */}
      {removeFieldConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-1">Remove Custom Field</h3>
            <p className="text-xs text-gray-600 mb-4">
              Remove attribute <strong>"{removeFieldConfirm.field.label}"</strong>? Existing listings will retain their values, but new uploads will not show this field.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setRemoveFieldConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveField}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
