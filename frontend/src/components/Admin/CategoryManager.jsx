import React, { useState, useEffect, useCallback } from 'react';
import adminApi from '../../api/adminApi';
import { invalidateCategoryCache } from '../../hooks/useCategories';

const FIELD_TYPES = ['text', 'number', 'select'];
const CONDITIONS  = ['New', 'Like New', 'Used', 'Thrift'];

// ── auto-dismiss message hook ─────────────────────────────────────────────────
function useMsg(delay = 5000) {
  const [msg, setMsg] = useState('');
  const show = useCallback((m) => {
    setMsg(m);
    if (m) setTimeout(() => setMsg(''), delay);
  }, [delay]);
  return [msg, show];
}

// ── Seller form preview modal ─────────────────────────────────────────────────
function FieldPreviewModal({ category, subcategory, onClose }) {
  if (!category || !subcategory) return null;
  const fields = subcategory.custom_fields || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Preview — Seller Upload Form</p>
            <h3 className="text-lg font-bold text-gray-800">
              {category.icon} {category.label} › {subcategory.label}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide bg-purple-50 px-3 py-2 rounded-lg">
            This is how the seller sees the upload form for this subcategory
          </p>

          {/* Standard fields always present */}
          {[
            { label: 'Title *',       placeholder: `e.g. Premium ${subcategory.label}`, type: 'text' },
            { label: 'Description *', placeholder: 'Describe color, material, style…',  type: 'textarea' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.type === 'textarea'
                ? <textarea rows={2} placeholder={f.placeholder} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 resize-none" />
                : <input type="text" placeholder={f.placeholder} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400" />
              }
            </div>
          ))}

          {/* Custom fields from admin */}
          {fields.length > 0 && (
            <div className="border-t border-dashed border-purple-200 pt-4">
              <p className="text-xs font-semibold text-purple-600 mb-3">Custom Fields (added by admin)</p>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(f => (
                  <div key={f.field_id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.type === 'select' ? (
                      <select disabled className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm bg-purple-50">
                        <option>— Select —</option>
                        {(f.options || []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        placeholder={f.type === 'number' ? '0' : `Enter ${f.label.toLowerCase()}`}
                        disabled
                        className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm bg-purple-50 text-gray-400"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard price field */}
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (PKR) *
                  {(subcategory.price_min || subcategory.price_max) && (
                    <span className="ml-1 text-xs text-gray-400">
                      {subcategory.price_min?.toLocaleString()} – {subcategory.price_max?.toLocaleString()}
                    </span>
                  )}
                </label>
                <input type="number" placeholder="e.g. 25000" disabled
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50">
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" placeholder="e.g. Lahore" disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400" />
          </div>

          <div className="border border-purple-200 rounded-xl p-3 bg-purple-50 text-center text-xs text-purple-600">
            Upload Product Image (JPG/PNG, max 5 MB)
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
          >
            OK — Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CategoryManager() {
  const [cats, setCats]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);

  // Forms
  const [newCat,   setNewCat]   = useState({ category_id: '', label: '', icon: '📦', price_min: '', price_max: '' });
  const [newSub,   setNewSub]   = useState({ id: '', label: '' });
  const [newField, setNewField] = useState({ field_id: '', label: '', type: 'text', options: '', required: false });
  const [subPriceEdit, setSubPriceEdit] = useState({ price_min: '', price_max: '' });

  // Auto-dismiss messages
  const [catMsg,   showCatMsg]   = useMsg();
  const [subMsg,   showSubMsg]   = useMsg();
  const [fieldMsg, showFieldMsg] = useMsg();
  const [priceMsg, showPriceMsg] = useMsg();

  // Field preview
  const [preview, setPreview] = useState(null); // { category, subcategory }

  // Confirm remove field
  const [removeConfirm, setRemoveConfirm] = useState(null); // { field, catId, subId }

  const reload = async () => {
    const r = await adminApi.getAdminCategories();
    const fresh = r.categories || [];
    setCats(fresh);
    setLoading(false);
    invalidateCategoryCache();
    // Re-sync selected/selectedSub from fresh data
    if (selected) {
      const freshCat = fresh.find(c => c.category_id === selected.category_id);
      setSelected(freshCat || null);
      if (selectedSub && freshCat) {
        setSelectedSub(freshCat.subcategories?.find(s => s.id === selectedSub.id) || null);
      }
    }
  };

  useEffect(() => { reload(); }, []);

  // Sync subcategory price edit when subcategory changes
  useEffect(() => {
    if (selectedSub) {
      setSubPriceEdit({ price_min: selectedSub.price_min ?? '', price_max: selectedSub.price_max ?? '' });
    }
  }, [selectedSub?.id, selectedSub?.price_min, selectedSub?.price_max]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const addCat = async () => {
    if (!newCat.category_id || !newCat.label) { showCatMsg('ID and Label are required.'); return; }
    const r = await adminApi.addCategory({
      ...newCat,
      price_min: Number(newCat.price_min) || 1000,
      price_max: Number(newCat.price_max) || 500000,
    });
    if (r.success) {
      showCatMsg('Category added!');
      setNewCat({ category_id: '', label: '', icon: '📦', price_min: '', price_max: '' });
      await reload();
    } else {
      showCatMsg(r.error);
    }
  };

  const addSub = async () => {
    if (!selected) { showSubMsg('Select a category first.'); return; }
    if (!newSub.id || !newSub.label) { showSubMsg('ID and Label required.'); return; }
    const r = await adminApi.addSubcategory(selected.category_id, newSub);
    if (r.success) {
      showSubMsg('Subcategory added!');
      setNewSub({ id: '', label: '' });
      await reload();
    } else {
      showSubMsg(r.error);
    }
  };

  const addField = async () => {
    if (!selected || !selectedSub) { showFieldMsg('Select a category and subcategory first.'); return; }
    if (!newField.field_id || !newField.label) { showFieldMsg('Field ID and Label required.'); return; }
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
      // Show preview of the seller form
      const freshCat = (r.category);
      const freshSub = freshCat?.subcategories?.find(s => s.id === selectedSub.id);
      setPreview({ category: freshCat || selected, subcategory: freshSub || selectedSub });
    } else {
      showFieldMsg(r.error);
    }
  };

  const confirmRemoveField = async () => {
    if (!removeConfirm) return;
    const { field, catId, subId } = removeConfirm;
    setRemoveConfirm(null);
    const r = await adminApi.removeCustomField(catId, subId, field.field_id);
    if (r.success) {
      showFieldMsg('Field removed.');
      await reload();
    } else {
      showFieldMsg(r.error || 'Remove failed.');
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
      showPriceMsg(r.error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading categories…</div>;

  const currentSubs = selected?.subcategories || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Category Manager</h1>
        <p className="text-sm text-gray-500 mt-1">Add categories, subcategories, custom fields, and price ranges</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: category list ───────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Categories</p>
          {cats.map(cat => (
            <button
              key={cat.category_id}
              onClick={() => { setSelected(cat); setSelectedSub(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                selected?.category_id === cat.category_id
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{cat.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{cat.label}</p>
                  <p className="text-xs text-gray-400">{cat.subcategories?.length || 0} subcategories</p>
                </div>
              </div>
            </button>
          ))}

          {/* ── Add new category ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Add New Category</p>
            <input placeholder="ID (e.g. jewelry)" value={newCat.category_id}
              onChange={e => setNewCat(p => ({ ...p, category_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            />
            <input placeholder="Label (e.g. Jewelry)" value={newCat.label}
              onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            />
            <input placeholder="Icon emoji (e.g. 💍)" value={newCat.icon}
              onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Min Price" value={newCat.price_min}
                onChange={e => setNewCat(p => ({ ...p, price_min: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
              />
              <input type="number" placeholder="Max Price" value={newCat.price_max}
                onChange={e => setNewCat(p => ({ ...p, price_max: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
              />
            </div>
            <button onClick={addCat}
              className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
              + Add Category
            </button>
            {catMsg && (
              <p className={`text-xs mt-1 ${catMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>{catMsg}</p>
            )}
          </div>
        </div>

        {/* ── Middle: subcategory panel ─────────────────────────────────── */}
        <div className="space-y-4">
          {selected ? (
            <>
              {/* Subcategory list */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 mb-3">{selected.icon} {selected.label} — Subcategories</h3>
                <div className="space-y-2 mb-4">
                  {currentSubs.map(sub => (
                    <button key={sub.id} onClick={() => setSelectedSub(selectedSub?.id === sub.id ? null : sub)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        selectedSub?.id === sub.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-700">{sub.label}</span>
                        <div className="text-xs text-gray-400">
                          {sub.custom_fields?.length || 0} fields
                          {sub.price_min && sub.price_max
                            ? ` · PKR ${sub.price_min.toLocaleString()}–${sub.price_max.toLocaleString()}`
                            : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                  {currentSubs.length === 0 && <p className="text-xs text-gray-400">No subcategories yet.</p>}
                </div>

                {/* Add subcategory */}
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">Add Subcategory</p>
                  <input placeholder="ID (e.g. sofa_set)" value={newSub.id}
                    onChange={e => setNewSub(p => ({ ...p, id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <input placeholder="Label (e.g. Sofa Set)" value={newSub.label}
                    onChange={e => setNewSub(p => ({ ...p, label: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <button onClick={addSub}
                    className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                    + Add Subcategory
                  </button>
                  {subMsg && (
                    <p className={`text-xs ${subMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>{subMsg}</p>
                  )}
                </div>
              </div>

              {/* Subcategory price range (shown when a subcat is selected) */}
              {selectedSub && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">
                    Price Range — <span className="text-orange-600">{selectedSub.label}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-500 font-medium">Min (PKR)</label>
                      <input type="number" value={subPriceEdit.price_min}
                        onChange={e => setSubPriceEdit(p => ({ ...p, price_min: e.target.value }))}
                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 font-medium">Max (PKR)</label>
                      <input type="number" value={subPriceEdit.price_max}
                        onChange={e => setSubPriceEdit(p => ({ ...p, price_max: e.target.value }))}
                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                      />
                    </div>
                  </div>
                  <button onClick={saveSubPrice}
                    className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                    Save Price Range
                  </button>
                  {priceMsg && (
                    <p className={`text-xs mt-2 ${priceMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>{priceMsg}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm">
              Select a category
            </div>
          )}
        </div>

        {/* ── Right: custom fields for selected subcategory ─────────────── */}
        <div className="space-y-4">
          {selectedSub ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-1">{selectedSub.label} — Custom Fields</h3>
              <p className="text-xs text-gray-400 mb-3">Max 5 extra fields (besides Price, Description, Photos)</p>

              {/* Existing fields */}
              <div className="space-y-1 mb-3">
                {selectedSub.custom_fields?.map(f => (
                  <div key={f.field_id} className="flex items-center justify-between text-xs bg-gray-50 px-3 py-2 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-700">{f.label}</span>
                      <span className="text-gray-400 ml-2">{f.type}{f.options?.length ? ` (${f.options.length} opts)` : ''}</span>
                      {f.required && <span className="ml-1 text-orange-500">*required</span>}
                    </div>
                    <button
                      onClick={() => setRemoveConfirm({ field: f, catId: selected.category_id, subId: selectedSub.id })}
                      className="text-red-400 hover:text-red-600 ml-2 text-base leading-none"
                      title="Remove field"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!selectedSub.custom_fields?.length && <p className="text-xs text-gray-400">No custom fields yet.</p>}
              </div>

              {/* Add field form */}
              {(selectedSub.custom_fields?.length || 0) < 5 && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">Add Field</p>
                  <input placeholder="Field ID (e.g. material)"
                    value={newField.field_id}
                    onChange={e => setNewField(p => ({ ...p, field_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <input placeholder="Label (e.g. Material)"
                    value={newField.label}
                    onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <select value={newField.type} onChange={e => setNewField(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none">
                    {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  {newField.type === 'select' && (
                    <input placeholder="Options (comma-separated, e.g. Gold,Silver)"
                      value={newField.options}
                      onChange={e => setNewField(p => ({ ...p, options: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={newField.required}
                      onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))} />
                    Required field
                  </label>
                  <button onClick={addField}
                    className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                    + Add Field
                  </button>
                  {fieldMsg && (
                    <p className={`text-xs ${fieldMsg.includes('!') || fieldMsg.includes('removed') ? 'text-green-600' : 'text-red-500'}`}>
                      {fieldMsg}
                    </p>
                  )}
                </div>
              )}

              {/* Preview button */}
              <button
                onClick={() => setPreview({ category: selected, subcategory: selectedSub })}
                className="w-full mt-3 py-2 border border-purple-300 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
              >
                👁 Preview Seller Form
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm">
              Select a subcategory
            </div>
          )}
        </div>
      </div>

      {/* ── Field preview modal ───────────────────────────────────────────── */}
      {preview && (
        <FieldPreviewModal
          category={preview.category}
          subcategory={preview.subcategory}
          onClose={() => setPreview(null)}
        />
      )}

      {/* ── Remove field confirm dialog ───────────────────────────────────── */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-800 mb-2">Remove Field</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove <strong>{removeConfirm.field.label}</strong>? Existing products won't lose data, but sellers won't see this field for new uploads.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRemoveConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm">
                Cancel
              </button>
              <button onClick={confirmRemoveField}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
